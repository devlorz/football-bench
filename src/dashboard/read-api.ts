import { argmaxOutcome, outcomeOf, type Probs } from "../fixture-result.js";
import { MATCH_PROMPT_VERSION } from "../predictions/openrouter-entrant.js";
import {
  BET_POINTS_QUALIFICATION, BET_POINTS_SEASON_TO_DATE_METRIC,
  GAP_RATE_SEASON_TO_DATE_METRIC, MATCH_POINTS_QUALIFICATION,
  MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC,
  RPS_SEASON_TO_DATE_METRIC, type BetLeg
} from "../predictions/score-match-gameweek.js";

/**
 * The minimum both runtimes satisfy: SQL and its parameters in, rows out.
 *
 * It exists because ADR-0027 puts `postgres.js` on the Worker and `pg`
 * everywhere else, and it is what lets one seam cover both. Nothing else in the
 * repo changes driver.
 */
export type Query = (
  sql: string,
  parameters?: readonly unknown[]
) => Promise<Array<Record<string, unknown>>>;

/**
 * How long each answer may be served for, chosen per endpoint because the three
 * do not change on the same clock (ADR-0028). The leaderboard and the Entrant
 * records both move when the daily scoring run writes, and share this one.
 *
 * Caching must also be enabled in the Worker's configuration: the header alone
 * does not cache a Worker's response.
 */
const SCORED_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

/**
 * Sixty seconds and no stale window: Predictions land at the main run, six
 * hours before the deadline, and again at the Fill two hours before, so an hour
 * of stale would show Gaps the Fill has already closed.
 */
const FIXTURES_CACHE = "public, s-maxage=60";

export interface LeaderboardEntrant {
  id: string;
  name: string;
  baseModelClass: string | null;
  /** Null until the Season has a scored Gameweek to read them from. */
  matchPoints: number | null;
  betPoints: number | null;
  /**
   * The Fixtures this Entrant settled a Prediction on. Its own count and not
   * the Season's: the two differ by exactly what the Entrant Gapped.
   */
  n: number | null;
}

/**
 * What `/api/leaderboard` answers with. Exported for the same reason
 * `FixturesBody` and `EntrantsBody` are: a body the tests describe for
 * themselves is a body they can go on describing after this one has changed.
 */
export interface LeaderboardBody {
  season: string;
  throughGw: number | null;
  nextLock: { gw: number; deadlineAt: string } | null;
  settledFixtures: number;
  matchPointsQualification: string | null;
  betPointsQualification: string | null;
  entrants: LeaderboardEntrant[];
}

/**
 * `numeric` reaches one driver as a string and the other as a number, and JSON
 * has one number. Null stays null, which is the pre-season state and not a zero.
 */
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const textOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/**
 * A figure off a scored Season, where an Entrant with no row of its own scored
 * a nought rather than being absent: the scorer writes no outcome-dependent row
 * for an Entrant that Gapped every Fixture, and reading that back as null would
 * put a Season-long Gap on the page in the one shape reserved for a Season that
 * has not started. Null belongs to `throughGw` alone, and both pages that gate
 * on it read it the same way.
 */
const scoredOrNull = (
  throughGw: number | null,
  value: unknown
): number | null => throughGw === null ? null : Number(value ?? 0);

/**
 * The Gameweek the Season has been *scored* through, which is not the last
 * Gameweek holding a `scores` row. Coherence, Gaps and Repairs are behavioural:
 * the scorer answers them the moment a Lock passes, so a Locked and unplayed
 * Gameweek carries rows of its own. Reading `max(gw)` over all of them would
 * call Gameweek 1 scored while its matches are still being played, and would
 * move a Season's ranking to a Gameweek that has no ranking — blanking the
 * fourteen Gameweeks that do.
 *
 * The per-Gameweek `rps` row is the fact that answers, because it is the one
 * the scorer writes for a Gameweek exactly when both halves of "scored" hold.
 * It is outcome-dependent, so it is written only over Fixtures that settled;
 * and the Reference Lines carry it whatever the Entrants did, so a Gameweek
 * every Entrant Gapped still has one — which the Match Points rows do not, and
 * a whole roster Gapping one Gameweek is an OpenRouter outage that ADR-0009
 * enters this roster knowing about.
 *
 * The cumulative counterpart would be wrong here: it is written over every
 * Gameweek up to its target, so it appears on a Gameweek that settled nothing
 * as soon as an earlier one settled something.
 *
 * Reading anything the scorer has written on the Gameweek would be wrong in the
 * other direction, and in two ways. Coherence, Gaps and Repairs are
 * behavioural — answerable the moment a Lock passes — so a Gameweek being
 * played would read as scored. Pairing those with a settled Fixture does not
 * save it either: results are ingested by a job of their own, hours before the
 * scoring run, and in that window both facts hold while nothing has been scored
 * at all.
 *
 * Every read of `scores` filters `track = 'match'`. A seat can hold both
 * tracks, and a read missing it lets an FPL demonstration figure be read as a
 * Match one — in a ranking, which is the one place ADR-0003 is careful never to
 * let the tracks meet.
 *
 * Null is the pre-season state, and it is what both pages that gate on it
 * switch their empty state on.
 */
async function scoredThrough(
  query: Query,
  season: string
): Promise<number | null> {
  const [scored] = await query(
    `select max(gw) as through_gw from scores
      where season = $1 and track = 'match' and metric = $2`,
    [season, RPS_METRIC]
  );
  return numberOrNull(scored?.through_gw);
}

/**
 * The nine Entrants ranked Season-to-date, both qualifications, and the
 * evidence the ranking rests on.
 *
 * The qualifications are read out of the stored rows, because the claim being
 * made is that what the scorer stored reaches a reader intact, and restating
 * the constant would answer that question with itself. The scorer's exported
 * constant is imported all the same, for the one documented exception below: a
 * scored Season with no ranking row anywhere, which has no stored string to
 * read and a visible ranking of noughts to caveat.
 */
async function leaderboard(query: Query, season: string): Promise<Response> {
  const throughGw = await scoredThrough(query, season);

  // What the pre-season page is waiting on, and read only there: a Season with
  // a table to show has no use for a deadline, and the Fixtures page answers
  // its own Lock from its own body.
  //
  // The earliest Gameweek rather than the earliest deadline still ahead of
  // `now`. Pre-season is a Season with nothing scored, which the seed writes as
  // the roster and Gameweek 1 alone -- the state has one Lock in it, and asking
  // a clock would answer a Season whose first deadline has passed and whose
  // scoring run has not yet landed with no date at all.
  const [lock] = throughGw === null
    ? await query(
      `select gw, deadline_at from gameweeks
        where season = $1 order by gw limit 1`,
      [season]
    )
    : [];

  // Not any Entrant's `n`: the figure the whole ranking is presented against is
  // counted from the Fixtures a Lock owns that have a result, without reference
  // to any Entrant, so one Entrant's Gap cannot move it.
  const [settled] = await query(
    `select count(*) as settled from fixtures
      where season = $1 and locked_in_gw is not null and result is not null`,
    [season]
  );

  // `role = 'entrant'` selects both tracks' seats, so the roster is the Season
  // Roster as CONTEXT.md defines it: the role and the track's Prompt Version.
  //
  // Left joins rather than an inner one, so the pre-season Season returns its
  // nine entered Entrants with nothing beside them instead of returning
  // nothing. `gw = $4` is null before the first Gameweek is scored and matches
  // no row, which is the same branch.
  const rows = await query(
    `select m.id, m.name, m.config ->> 'baseModelClass' as base_model_class,
            points.value as match_points, points.n as n,
            points.detail ->> 'qualification' as match_qualification,
            bets.value as bet_points,
            bets.detail ->> 'qualification' as bet_qualification
       from models m
       left join scores points
         on points.model_id = m.id and points.season = $1
        and points.track = 'match' and points.gw = $4
        and points.metric = $2
       left join scores bets
         on bets.model_id = m.id and bets.season = $1
        and bets.track = 'match' and bets.gw = $4
        and bets.metric = $3
      where m.role = 'entrant' and m.prompt_version = $5
      order by m.id`,
    [
      season,
      MATCH_POINTS_SEASON_TO_DATE_METRIC,
      BET_POINTS_SEASON_TO_DATE_METRIC,
      throughGw,
      MATCH_PROMPT_VERSION
    ]
  );

  const entrants: LeaderboardEntrant[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    baseModelClass: textOrNull(row.base_model_class),
    matchPoints: scoredOrNull(throughGw, row.match_points),
    betPoints: scoredOrNull(throughGw, row.bet_points),
    n: scoredOrNull(throughGw, row.n)
  }));

  // One string per ranking rather than one per row: the scorer writes the same
  // sentence into every row a ranking can be read off, and the page shows it
  // once under the table.
  //
  // Taken from whichever Entrant has one rather than from the first row. The
  // first row is the alphabetically first Entrant, which has a qualification
  // only if it scored — so an Entrant that Gapped a whole Season would strip
  // the caveat off eight Entrants' rankings, which is the one failure spec 0011
  // exists to prevent.
  //
  // The scorer's own constant is the fallback, and it is a stated compromise
  // rather than the design. It is reached only when a scored Season holds no
  // ranking row at all — which needs no Entrant to have settled a single
  // Prediction all Season, so an outage over the first settled Gameweek and
  // nothing later. That state still ranks nine Entrants at nought on the page,
  // and a ranking a reader can see is a ranking that carries its caveat; with
  // no row written there is no third source to read one from.
  //
  // What it costs: in that one branch the string is not proved to have survived
  // storage, because there is no stored string. The alternative is a scorer
  // that writes a zero-valued ranking row when the whole roster Gaps, which
  // spec 0011 puts out of scope and which is a decision to take in the open.
  //
  // Which branch applies is decided once, by whether any ranking row was found
  // at all, and never per string. A fallback asked per qualification would
  // answer a missing Bet Points caveat on a Season full of ranking rows with
  // the constant — silently, and looking exactly like the intended exception,
  // which is how a storage fault becomes invisible. Where ranking rows exist
  // the stored string is the only answer, and its absence is a fault: it fails
  // closed, and the page's error line is the state a reader is left in, rather
  // than a ranking that lost its caveat on the way out of the database.
  const hasRankingRows = rows.some(
    (row) => row.match_points != null || row.bet_points != null
  );

  const qualification = (column: string, canonical: string): string | null => {
    if (throughGw === null) {
      return null;
    }
    if (!hasRankingRows) {
      return canonical;
    }
    const stored =
      textOrNull(rows.map((row) => row[column]).find((each) => each != null));
    if (stored === null) {
      throw new Error(
        `The Season's ranking rows carry no ${column}, and a ranking cannot be `
        + "published without it"
      );
    }
    return stored;
  };

  const body: LeaderboardBody = {
    season,
    throughGw,
    nextLock: lock
      ? {
        gw: Number(lock.gw),
        // One driver hands back a `Date` and the other a string; JSON has one
        // instant, and the page formats it.
        deadlineAt: new Date(lock.deadline_at as string | Date).toISOString()
      }
      : null,
    settledFixtures: Number(settled?.settled ?? 0),
    matchPointsQualification:
      qualification("match_qualification", MATCH_POINTS_QUALIFICATION),
    betPointsQualification:
      qualification("bet_qualification", BET_POINTS_QUALIFICATION),
    entrants
  };

  return json(body, SCORED_CACHE);
}

export interface SlotPrediction {
  probs: Probs;
  predHome: number;
  predAway: number;
  /** Derived here from the Prediction alone; see below. */
  coherent: boolean;
  rationale: string | null;
  contextHash: string;
  /** `predictions.attempts_used`, which is 0 for a Prediction valid first time. */
  repairs: number;
}

/** A Gap is a slot with nothing in it, and never a missing entry. */
export interface FixtureSlot {
  entrant: { id: string; name: string };
  prediction: SlotPrediction | null;
}

export interface FixtureView {
  fplId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  slots: FixtureSlot[];
}

/**
 * What `/api/fixtures` answers with. Exported because the tests assert on it,
 * and a body they describe for themselves is a body they can go on describing
 * after this one has changed.
 */
export interface FixturesBody {
  season: string;
  gw: number | null;
  deadlineAt: string | null;
  lockPassed: boolean;
  fixtures: FixtureView[];
}

/**
 * The Gameweek in front of the reader, its Fixtures, and what all nine Entrants
 * committed before the Lock.
 *
 * The page never reads `throughGw` and this body does not carry it.
 * `throughGw` moves when the scorer runs; Predictions exist from the main run
 * six hours before the deadline, so for the whole of a played-but-unscored
 * Gameweek 1 a page gating on it would call committed Predictions pre-season
 * and hide the very thing it exists to show.
 */
async function fixtures(
  query: Query,
  season: string,
  now: Date
): Promise<Response> {
  // The rule, in one statement: the earliest Gameweek owning a Fixture that is
  // not deferred and has no result, and the last Gameweek by number when every
  // such Fixture has settled.
  //
  // Ownership is `coalesce(locked_in_gw, gw)` — what the predict path already
  // selects due work by, and the write path's reading of ADR-0015. A Fixture
  // belongs to its Locked Gameweek once it has one and to its scheduled
  // Gameweek until then, so a rule reading `locked_in_gw` alone would find
  // nothing at all before the first Prediction run.
  //
  // The fallback is taken over the Fixtures rather than over `gameweeks`: a
  // Season's schedule can hold a Gameweek no Fixture has reached yet, and
  // holding on that one would answer a finished Season with an empty page.
  //
  // It counts only Fixtures the listing below would show, which is the same
  // predicate and not merely `not deferred`. A Gameweek whose every Fixture the
  // page drops is a Gameweek the page cannot render, so selecting it lands a
  // finished Season on the empty state this fallback exists to prevent.
  //
  // `deferred` in the first branch keeps a Fixture that will never gain a
  // result from pinning the page to its Gameweek for the rest of the Season.
  const [current] = await query(
    `with current as (
       select coalesce(
         (select min(coalesce(locked_in_gw, gw)) from fixtures
           where season = $1 and not deferred and result is null),
         (select max(coalesce(locked_in_gw, gw)) from fixtures
           where season = $1 and (not deferred or locked_in_gw is not null))
       ) as gw
     )
     select current.gw, gameweeks.deadline_at
       from current
       left join gameweeks
         on gameweeks.season = $1 and gameweeks.gw = current.gw`,
    [season]
  );
  const gw = numberOrNull(current?.gw);
  const deadline = current?.deadline_at == null
    ? null
    : new Date(current.deadline_at as string | Date);

  // A deferred Fixture that was Locked stays on the page: its Predictions were
  // committed under this Gameweek's Lock and are what a reader came for. One
  // that left the schedule before any run reached it is not in the Gameweek at
  // all, and would read as nine Gaps.
  const rows = await query(
    `select fpl_id, home_team, away_team, kickoff_at from fixtures
      where season = $1 and coalesce(locked_in_gw, gw) = $2
        and (not deferred or locked_in_gw is not null)
      order by kickoff_at, fpl_id`,
    [season, gw]
  );

  // The same nine in the same order on every Fixture, which is what makes a
  // Gap a slot rather than a shorter list.
  const roster = await query(
    `select id, name from models
      where role = 'entrant' and prompt_version = $1 order by id`,
    [MATCH_PROMPT_VERSION]
  );

  const predictions = await query(
    `select p.fpl_id, p.model_id, p.probs, p.pred_home, p.pred_away,
            p.rationale, p.attempts_used as repairs, c.hash as context_hash
       from predictions p
       join contexts c on c.id = p.context_id
       join fixtures f on f.season = p.season and f.fpl_id = p.fpl_id
      where p.season = $1 and coalesce(f.locked_in_gw, f.gw) = $2`,
    [season, gw]
  );

  const byFixtureAndEntrant = new Map<string, SlotPrediction>();
  for (const row of predictions) {
    const probs = row.probs as Probs;
    byFixtureAndEntrant.set(`${row.fpl_id}:${row.model_id}`, {
      probs,
      predHome: Number(row.pred_home),
      predAway: Number(row.pred_away),
      // The Coherence metric is a share over an Entrant's Predictions; the page
      // needs the flag for one. Derived from the Prediction alone, reading no
      // result, and by the same comparison the scorer makes, so the page and
      // the metric cannot disagree.
      coherent: argmaxOutcome(probs)
        === outcomeOf(Number(row.pred_home), Number(row.pred_away)),
      rationale: textOrNull(row.rationale),
      contextHash: String(row.context_hash),
      repairs: Number(row.repairs)
    });
  }

  const body: FixturesBody = {
    season,
    gw,
    deadlineAt: deadline?.toISOString() ?? null,
    // The one thing the instant is used for: it separates the pre-lock banner
    // from the committed view and never selects the Gameweek.
    lockPassed: deadline !== null && now >= deadline,
    fixtures: rows.map((row) => ({
      fplId: Number(row.fpl_id),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      kickoffAt: new Date(row.kickoff_at as string | Date).toISOString(),
      slots: roster.map((entrant) => ({
        entrant: { id: String(entrant.id), name: String(entrant.name) },
        // Null and not missing: an Entrant that did not answer must not be
        // indistinguishable from one that answered badly.
        prediction:
          byFixtureAndEntrant.get(`${row.fpl_id}:${entrant.id}`) ?? null
      }))
    }))
  };
  return json(body, FIXTURES_CACHE);
}

/** One row of the per-Gameweek table, and one point of the cumulative chart. */
export interface EntrantGameweek {
  gw: number;
  /** The Fixtures this Gameweek's Lock owned, not the ones the Entrant answered. */
  fixtures: number;
  /**
   * The Fixtures this Entrant settled a Prediction on, which is the denominator
   * the counts beside it were taken over. It is `fixtures` less what the
   * Entrant Gapped and less what has not settled, and the two must not be read
   * as one: three correct Outcomes out of nine Fixtures the Entrant answered
   * eight of is a share of a denominator it was never measured against.
   */
  settled: number;
  matchPoints: number;
  betPoints: number;
  /** Exact scorelines, which are the Fixtures that scored 5. */
  exact: number;
  /** Correct Outcomes, which is everything from 2 up. */
  outcome: number;
  /** Null on a Gameweek the Entrant settled nothing in: a mean over none. */
  rps: number | null;
  gaps: number;
}

/** One leg of the Bet Slip over the Season, with both sides of its fraction. */
export interface MarketHits {
  market: string;
  hits: number;
  n: number;
}

/** One of the 5 / 3 / 2 / 0 tiers, counted rather than recovered from a share. */
export interface TierCount {
  points: number;
  count: number;
}

export interface EntrantRecord {
  id: string;
  name: string;
  /** Null on a Season with nothing scored, as the leaderboard's are. */
  matchPoints: number | null;
  betPoints: number | null;
  rps: number | null;
  gaps: number | null;
  n: number | null;
  tiers: TierCount[];
  markets: MarketHits[];
  gameweeks: EntrantGameweek[];
}

/**
 * What `/api/entrants` answers with. Exported for the tests, so a body they
 * describe for themselves is not a body they can go on describing after this
 * one has changed.
 */
export interface EntrantsBody {
  season: string;
  throughGw: number | null;
  entrants: EntrantRecord[];
}

/** The Match Points tiers, in the order the design's stacked bar stacks them. */
const TIERS = [5, 3, 2, 0];

/**
 * A cumulative row's detail is `{ gameweeks: [{ gw, n, ... }] }` where a
 * per-Gameweek row's is flat. Reading a cumulative row as if it were flat finds
 * no `fixtures` key and counts nothing, silently, which is the one mistake spec
 * 0011 names for this endpoint.
 */
const perGameweek = <T extends { gw: number }>(detail: unknown): T[] =>
  (detail as { gameweeks?: T[] } | null)?.gameweeks ?? [];

/** One metric's entry for one Gameweek, or nothing where it wrote none. */
const at = <T extends { gw: number }>(
  from: T[],
  gw: number
): T | undefined => from.find((each) => each.gw === gw);

interface PointsGameweek {
  gw: number;
  points: number;
  fixtures: { points: number }[];
}

interface BetGameweek {
  gw: number;
  points: number;
  fixtures: { slip: BetLeg[] }[];
}

/** `n` is the Fixtures the Lock owned, which is the denominator of the rate. */
interface GapGameweek {
  gw: number;
  n: number;
  gaps: unknown[];
}

/**
 * All nine Entrants with their complete per-Gameweek series, so selecting one
 * is a re-render and not a fetch — the cumulative chart draws nine lines at
 * once, and a page that fetched per Entrant could not draw the field.
 *
 * Every count here is counted over the flattened detail. `score_pct` and
 * `outcome_pct` are shares beside these rows and are not read: multiplying a
 * float share by `n` to recover an integer is a rounding bug waiting for the
 * Gameweek that makes it visible.
 */
async function entrants(query: Query, season: string): Promise<Response> {
  const throughGw = await scoredThrough(query, season);

  // The cumulative rows at the scored Gameweek carry the whole Season each, so
  // the series is four rows per Entrant rather than four per Gameweek.
  //
  // Left joins for the same reason the leaderboard uses them: pre-season
  // returns the nine entered Entrants with nothing beside them, and `gw = $6`
  // is null there and matches no row.
  const rows = await query(
    `select m.id, m.name,
            points.value as match_points, points.n as n,
            points.detail as points_detail,
            bets.value as bet_points, bets.detail as bets_detail,
            rps.value as rps, rps.detail as rps_detail,
            gaps.detail as gaps_detail
       from models m
       left join scores points
         on points.model_id = m.id and points.season = $1
        and points.track = 'match' and points.gw = $6
        and points.metric = $2
       left join scores bets
         on bets.model_id = m.id and bets.season = $1
        and bets.track = 'match' and bets.gw = $6 and bets.metric = $3
       left join scores rps
         on rps.model_id = m.id and rps.season = $1
        and rps.track = 'match' and rps.gw = $6 and rps.metric = $4
       left join scores gaps
         on gaps.model_id = m.id and gaps.season = $1
        and gaps.track = 'match' and gaps.gw = $6 and gaps.metric = $5
      where m.role = 'entrant' and m.prompt_version = $7
      order by m.id`,
    [
      season,
      MATCH_POINTS_SEASON_TO_DATE_METRIC,
      BET_POINTS_SEASON_TO_DATE_METRIC,
      RPS_SEASON_TO_DATE_METRIC,
      GAP_RATE_SEASON_TO_DATE_METRIC,
      throughGw,
      MATCH_PROMPT_VERSION
    ]
  );

  const legsOf = (bets: BetGameweek[]): BetLeg[] =>
    bets.flatMap(({ fixtures }) => fixtures).flatMap(({ slip }) => slip);

  const records = rows.map((row) => ({
    row,
    points: perGameweek<PointsGameweek>(row.points_detail),
    bets: perGameweek<BetGameweek>(row.bets_detail),
    rps: perGameweek<{ gw: number; mean: number }>(row.rps_detail),
    // The Gap rate is the one row written for every Entrant of the roster
    // whether it answered or not, so it is the spine the series is hung on: a
    // Gameweek an Entrant Gapped entirely stays a row rather than closing over,
    // and all nine lines share one x-domain.
    gaps: perGameweek<GapGameweek>(row.gaps_detail)
  }));

  // The markets the Season's slips actually state, in the order a slip states
  // them, and taken across the whole field rather than per Entrant. An Entrant
  // that settled nothing has no leg of its own, and story 32 asks for the
  // breakdown by market whatever that Entrant did — so its five rows read nought
  // out of nought instead of vanishing.
  const markets = [
    ...new Set(records.flatMap(({ bets }) => legsOf(bets)).map((leg) => leg.market))
  ];

  const body: EntrantsBody = {
    season,
    throughGw,
    entrants: records.map(({ row, points, bets, rps, gaps }) => {
      const settled = points.flatMap(({ fixtures }) => fixtures);
      const legs = legsOf(bets);

      return {
        id: String(row.id),
        name: String(row.name),
        matchPoints: scoredOrNull(throughGw, row.match_points),
        betPoints: scoredOrNull(throughGw, row.bet_points),
        // A mean over no settled Fixture is not zero, which is why an Entrant
        // that settled nothing keeps a null here where its points read 0.
        rps: numberOrNull(row.rps),
        gaps: throughGw === null
          ? null
          : gaps.reduce((total, week) => total + week.gaps.length, 0),
        n: scoredOrNull(throughGw, row.n),
        tiers: throughGw === null
          ? []
          : TIERS.map((tier) => ({
            points: tier,
            count: settled.filter((fixture) => fixture.points === tier).length
          })),
        markets: markets.map((market) => {
          const own = legs.filter((leg) => leg.market === market);
          return {
            market,
            hits: own.filter(({ won }) => won).length,
            n: own.length
          };
        }),
        gameweeks: gaps.map((week) => {
          const own = at(points, week.gw);
          const scored = own?.fixtures ?? [];
          return {
            gw: week.gw,
            fixtures: week.n,
            settled: scored.length,
            matchPoints: own?.points ?? 0,
            betPoints: at(bets, week.gw)?.points ?? 0,
            exact: scored.filter((fixture) => fixture.points === 5).length,
            outcome: scored.filter((fixture) => fixture.points > 0).length,
            rps: at(rps, week.gw)?.mean ?? null,
            gaps: week.gaps.length
          };
        })
      };
    })
  };
  return json(body, SCORED_CACHE);
}

function json(body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl
    }
  });
}

/**
 * The whole of the dashboard's read API: routing, the bodies, `404`, and the
 * cache header, so a change to any of them has exactly one place that fails.
 *
 * The Season and the instant are parameters rather than ambient, following
 * `run-scheduled-predictions`, which already takes both. Every table is
 * Season-scoped, and a test that cannot pin the instant cannot assert the
 * difference between before a Lock and after one.
 */
export async function handleDashboardRequest(
  request: Request,
  query: Query,
  season: string,
  /**
   * Unread by the leaderboard, which is answerable from stored rows alone. It
   * is here because `/api/fixtures` separates the pre-lock banner from the
   * committed view by it, and the seam is one function.
   */
  now: Date
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/leaderboard") {
    return await leaderboard(query, season);
  }
  if (pathname === "/api/fixtures") {
    return await fixtures(query, season, now);
  }
  if (pathname === "/api/entrants") {
    return await entrants(query, season);
  }
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

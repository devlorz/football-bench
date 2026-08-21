import { FPL_PROMPT_VERSION } from "../context/build-fpl-track-context.js";
import { EXHIBITION_CAVEAT } from "../exhibition/recall-caveat.js";
import { argmaxOutcome, outcomeOf, type Probs } from "../fixture-result.js";
import {
  chipsRemaining, sellingPrice, VIOLATION_KINDS, type Chip, type ChipsUsed,
  type Position, type SquadEnvelope, type TeamSheet,
  type ViolationKind
} from "../fpl/apply-gameweek-action.js";
import {
  FPL_POINTS_METRIC, FPL_POINTS_SEASON_TO_DATE_METRIC
} from "../fpl/demonstration-record.js";
import type { ScoreDetail } from "../fpl/score-team-sheet.js";
import {
  MATCH_PROMPT_COMPETITIONS, matchPromptOf, RETIRED_GAMEWEEK_CAVEAT,
  retiredGameweekOf, type RetiredGameweek
} from "../predictions/openrouter-entrant.js";
import {
  BET_POINTS_METRIC, BET_POINTS_QUALIFICATION,
  BET_POINTS_SEASON_TO_DATE_METRIC, GAP_RATE_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_METRIC, MATCH_POINTS_QUALIFICATION,
  MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC,
  RPS_SEASON_TO_DATE_METRIC, type BetLeg
} from "../predictions/score-match-gameweek.js";
import { MAX_REPAIRS } from "../repairs.js";

/**
 * Every query below that filters by Season also filters by Competition. The
 * three Match track endpoints take it from the path (ADR-0039), and the two FPL
 * endpoints keep theirs for good — the FPL track is the Premier League by
 * nature.
 *
 * A ranking spans one Competition and never two (ADR-0035), and once a second
 * league writes rows, a query that named only the Season would rank the two
 * leagues' Entrants against each other by silently unioning them -- so the
 * filter has to exist before those rows do. Both tracks carry it, not the Match
 * track alone: the FPL track's tables gained the column because the Gameweek
 * deadline triggers made `(season, gw)` ambiguous, and a read of theirs that
 * named only the Season would be exactly as unionable as a Match one, whatever
 * currently writes them.
 *
 * The literals were written to be replaced -- one greppable string rather than
 * one place -- and ADR-0039 is the decision that replaced them, endpoint by
 * endpoint. Every one still standing is an FPL track read, where the Premier
 * League is not a default but the track's definition.
 */

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
 * The edge caches; the browser does not. Two headers rather than one, because
 * the two want opposite things.
 *
 * `cloudflare-cdn-cache-control` is the edge's lifetime, and it takes
 * precedence over `cache-control` at Cloudflare before being stripped from
 * whatever reaches a reader. It carries `max-age` and never `s-maxage`: a
 * response carrying `s-maxage`, `must-revalidate` or `proxy-revalidate` has
 * stale-serving disabled outright (RFC 9111 4.2.4), so the
 * `stale-while-revalidate` that used to sit beside an `s-maxage` was a
 * directive that never took effect once. Caching must also be enabled in the
 * Worker's configuration -- the header alone does not cache a Worker's
 * response.
 *
 * `stale-if-error=0` is there because dropping `s-maxage` switched the default
 * on. Cloudflare serves stale on a Worker error *indefinitely* unless the
 * response carries `s-maxage`, `must-revalidate` or `proxy-revalidate` -- and
 * this one deliberately carries none of the three. Without the zero, a Worker
 * that has lost its database keeps answering 200 from a cache entry that never
 * expires, which is the failure this dashboard is least able to notice: the
 * numbers look right and are simply old. Nought seconds of it, so an error is
 * an error.
 *
 * `cache-control: no-cache` is what the browser gets. It does not forbid
 * storing the response -- that would be `no-store` -- it forbids reusing one
 * without asking first, which is the property wanted here. A browser handed
 * `s-maxage` and no `max-age` may reuse freely on a heuristic, and it did:
 * three separate walks rendered a cached body and no error line with the API
 * dead behind it. Now every load asks, the ask is answered by the edge copy,
 * and the lifetime above is still what protects the database.
 */
const BROWSER_CACHE = "no-cache";

/**
 * How long each answer may be served for at the edge, chosen per endpoint
 * because the endpoints do not all change on the same clock (ADR-0028). Both
 * leaderboards, the Entrant records and every FPL answer move when a scoring
 * run writes, and share this one; the Fixtures page is the one that does not.
 */
const SCORED_CACHE = "max-age=300, stale-while-revalidate=3600, stale-if-error=0";

/**
 * Sixty seconds and no stale window: Predictions land at the main run, six
 * hours before the deadline, and again at the Fill two hours before, so an hour
 * of stale would show Gaps the Fill has already closed.
 */
const FIXTURES_CACHE = "max-age=60, stale-if-error=0";

/**
 * One ranked row, which is not the same thing as one Entrant. The Season Roster
 * is ten of them and an Exhibition Run that has replayed is another, ranked in
 * the same table by ADR-0032 and told apart by `exhibition` alone. The type is
 * one shape because the row is one shape; what a row *is* is a field on it and
 * not a second body for a reader to join.
 */
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
  /**
   * Null for the Season Roster, and the Gameweek the run answered after for an
   * Exhibition Run. A per-row fact, because two Exhibition Runs joining the
   * record in different weeks ran after different Gameweeks — unlike the caveat
   * beside them, which is one sentence about the kind of thing they are.
   */
  exhibition: { ranAfterGw: number } | null;
}

/**
 * What `/api/{code}/leaderboard` answers with, for one Competition and never
 * two (ADR-0035). Exported for the same reason `FixturesBody` and
 * `EntrantsBody` are: a body the tests describe for themselves is a body they
 * can go on describing after this one has changed.
 */
export interface LeaderboardBody {
  season: string;
  /**
   * Whether the Season lists this Competition at all. False is a league whose
   * Prompt Version is frozen — so it is served, and a 404 would be a lie — and
   * which nobody has opened, so no seat was entered for it and no Gameweek
   * will be scored. It is a state of its own and not a thin pre-season: every
   * other field below is empty in both, and only this one tells them apart.
   */
  active: boolean;
  throughGw: number | null;
  nextLock: { gw: number; deadlineAt: string } | null;
  settledFixtures: number;
  matchPointsQualification: string | null;
  betPointsQualification: string | null;
  /**
   * Null on a table holding no Exhibition Run, which must not carry a caveat
   * about somebody absent from it. Beside the two qualifications because it is
   * the same kind of thing — one sentence a figure may not be published
   * without — and unlike them it qualifies a row rather than a ranking, so the
   * row carries the `exhibition` label that says which row it is about.
   */
  exhibitionCaveat: string | null;
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
 * The first Gameweek a Competition's ranking may read.
 *
 * One for every Competition that has run one question all Season, and one past
 * the retired Gameweek on a Competition that restarted: ADR-0042 keeps that
 * Gameweek whole under its own label and says Season scoring starts fresh at
 * the restarted versions, so a ranking that read it would be the merge the ADR
 * forbids, arriving through the back door.
 *
 * It is needed because neither read below names a Prompt Version. The seat
 * joins do — the retired seats left every roster the moment the constant moved
 * — but a Gameweek is scored, and Fixtures settle, whoever answered them: the
 * retired version's own `scores` rows would date the Season at its Gameweek and
 * rank the restarted seats as ten noughts against it, and its settled Fixtures
 * would be counted into the `n` the whole ranking is presented against. Story
 * 28 asks for that accidental read to be impossible; this is where it is made
 * so, because this is where a Gameweek is read without a version beside it.
 */
const rankedFrom = (competition: string): number =>
  (retiredGameweekOf(competition)?.gw ?? 0) + 1;

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
  season: string,
  competition: string
): Promise<number | null> {
  const [scored] = await query(
    `select max(gw) as through_gw from scores
      where competition = $3 and season = $1
        and track = 'match' and metric = $2 and gw >= $4`,
    [season, RPS_METRIC, competition, rankedFrom(competition)]
  );
  return numberOrNull(scored?.through_gw);
}

/**
 * Every ranked row Season-to-date — the ten Entrants and any Exhibition Run
 * that has replayed — both qualifications, the Exhibition caveat, and the
 * evidence the ranking rests on.
 *
 * The qualifications are read out of the stored rows, because the claim being
 * made is that what the scorer stored reaches a reader intact, and restating
 * the constant would answer that question with itself. The scorer's exported
 * constant is imported all the same, for the one documented exception below: a
 * scored Season with no ranking row anywhere, which has no stored string to
 * read and a visible ranking of noughts to caveat.
 */
async function leaderboard(
  query: Query,
  season: string,
  competition: string
): Promise<Response> {
  // Served and not open. The routes are the frozen Prompt Versions and the
  // Season's leagues are `competitions` rows, so the two lists differ for as
  // long as it takes to open a league someone has frozen a Prompt Version
  // for — and in that window this path answers.
  //
  // A successful response and not a status: every status the page can read is
  // its failure line, which tells a reader something is broken and that
  // nothing is being retried. Nothing is broken here.
  //
  // Returned before the reads below rather than beside them. They would all
  // answer with nothing, and nothing is exactly what pre-season looks like — a
  // body carrying `throughGw: null` and an empty roster is one the page draws
  // as a table about to fill, promising a reader a Season nobody has opened.
  const [open] = await query(
    "select 1 from competitions where competition = $2 and season = $1",
    [season, competition]
  );
  if (!open) {
    const unopened: LeaderboardBody = {
      season,
      active: false,
      throughGw: null,
      nextLock: null,
      settledFixtures: 0,
      matchPointsQualification: null,
      betPointsQualification: null,
      exhibitionCaveat: null,
      entrants: []
    };
    return json(unopened, SCORED_CACHE);
  }

  const throughGw = await scoredThrough(query, season, competition);

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
        where competition = $2 and season = $1 and gw >= $3
        order by gw limit 1`,
      [season, competition, rankedFrom(competition)]
    )
    : [];

  // Not any Entrant's `n`: the figure the whole ranking is presented against is
  // counted from the Fixtures a Lock owns that have a result, without reference
  // to any Entrant, so one Entrant's Gap cannot move it.
  // `locked_in_gw >= $3` is also the "has been Locked at all" test the count
  // has always made: an unlocked Fixture's null compares to nothing and drops
  // out, exactly as `is not null` dropped it.
  const [settled] = await query(
    `select count(*) as settled from fixtures
      where competition = $2 and season = $1
        and locked_in_gw >= $3 and result is not null`,
    [season, competition, rankedFrom(competition)]
  );

  // `role = 'entrant'` selects both tracks' seats, so the roster is the Season
  // Roster as CONTEXT.md defines it: the role and the track's Prompt Version.
  //
  // The readable table is the one place an Exhibition Run joins that roster,
  // which is what ADR-0032 asks for and the only relaxation of the filter
  // anywhere: every statistical figure the dashboard publishes is read
  // elsewhere and still selects `role = 'entrant'` alone.
  //
  // An Exhibition Run appears where there is a ranking for it to be ranked in,
  // which is why `$4` — the scored Gameweek — is a condition of admitting one.
  // The same array is what the page draws its pre-season "Entered for" list
  // from, and that list is the seats entered for the Season; an Exhibition Run
  // joined after the fact and is not one of them (CONTEXT.md), so on a Season
  // with nothing scored it belongs to no list this body carries.
  //
  // An Exhibition Run appears once its label can be derived and not before. The
  // Gameweek it ran after is the last one whose deadline its *latest*
  // Prediction post-dates, which is the honesty ADR-0032 rests on read
  // forwards: a row an operator has entered but not yet replayed has no
  // derivable label, and would otherwise rank as a Base Model that scored
  // nought. The two laterals are the derivation and that condition at once —
  // the second is empty exactly when the first is null.
  //
  // The latest and not the earliest, because a replay is resumable and its
  // figures are one Season-to-date total over every answer in it. A run
  // interrupted and resumed a week later holds answers from either side of a
  // deadline, and labelling that total by its first answer would understate
  // what its Base Model had had the chance to read by the time it gave its
  // last. The label is a ceiling on what the run could know, so it is taken
  // from the answer that could know the most.
  //
  // Left joins rather than an inner one, so the pre-season Season returns its
  // ten entered Entrants with nothing beside them instead of returning
  // nothing. `gw = $4` is null before the first Gameweek is scored and matches
  // no row, which is the same branch.
  const rows = await query(
    `-- roster: the match track's, per Competition (ADR-0038).
     select m.id, m.name, m.role,
            m.config ->> 'baseModelClass' as base_model_class,
            ran_after.gw as ran_after_gw,
            points.value as match_points, points.n as n,
            points.detail ->> 'qualification' as match_qualification,
            bets.value as bet_points,
            bets.detail ->> 'qualification' as bet_qualification
       from models m
       left join lateral (
         select max(predicted_at) as at from predictions
          where model_id = m.id and competition = $6 and season = $1
       ) last_prediction on true
       left join lateral (
         select max(gw) as gw from gameweeks
          where competition = $6 and season = $1
            and deadline_at < last_prediction.at
       ) ran_after on true
       left join scores points
         on points.model_id = m.id and points.competition = $6
        and points.season = $1
        and points.track = 'match' and points.gw = $4
        and points.metric = $2
       left join scores bets
         on bets.model_id = m.id and bets.competition = $6
        and bets.season = $1
        and bets.track = 'match' and bets.gw = $4
        and bets.metric = $3
      where m.prompt_version = $5
        and (m.role = 'entrant'
             or (m.role = 'exhibition'
                 and ran_after.gw is not null and $4 is not null))
      order by m.id`,
    [
      season,
      MATCH_POINTS_SEASON_TO_DATE_METRIC,
      BET_POINTS_SEASON_TO_DATE_METRIC,
      throughGw,
      // The Competition's own frozen Prompt Version, and not the Premier
      // League's: each Competition seats its own ten under one of its own
      // (ADR-0038), so a constant here would answer every league with the
      // Premier League's roster and none of its own.
      matchPromptOf(competition).version,
      competition
    ]
  );

  const entrants: LeaderboardEntrant[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    baseModelClass: textOrNull(row.base_model_class),
    matchPoints: scoredOrNull(throughGw, row.match_points),
    betPoints: scoredOrNull(throughGw, row.bet_points),
    n: scoredOrNull(throughGw, row.n),
    exhibition: row.role === "exhibition"
      ? { ranAfterGw: Number(row.ran_after_gw) }
      : null
  }));

  // The roster's own rows, because both qualifications qualify the Entrants'
  // ranking. An Exhibition Run holds a stored copy of each — the scorer writes
  // the same sentence for any model holding Predictions — and letting that copy
  // answer would put the roster's caveat on the page on the strength of a row
  // that is not the roster's, in exactly the state the fallback below exists
  // for. The two strings are identical today, so nothing a reader sees turns on
  // this; what turns on it is that the reasoning below says `Entrant` and is
  // then true.
  const rosterRows = rows.filter((row) => row.role !== "exhibition");

  // One string per ranking rather than one per row: the scorer writes the same
  // sentence into every row a ranking can be read off, and the page shows it
  // once under the table.
  //
  // Taken from whichever Entrant has one rather than from the first row. The
  // first row is the alphabetically first Entrant, which has a qualification
  // only if it scored — so an Entrant that Gapped a whole Season would strip
  // the caveat off every other Entrant's ranking, which is the one failure
  // spec 0011 exists to prevent.
  //
  // The scorer's own constant is the fallback, and it is a stated compromise
  // rather than the design. It is reached only when a scored Season holds no
  // ranking row at all — which needs no Entrant to have settled a single
  // Prediction all Season, so an outage over the first settled Gameweek and
  // nothing later. That state still ranks ten Entrants at nought on the page,
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
  const hasRankingRows = rosterRows.some(
    (row) => row.match_points != null || row.bet_points != null
  );

  const qualification = (column: string, canonical: string): string | null => {
    if (throughGw === null) {
      return null;
    }
    if (!hasRankingRows) {
      return canonical;
    }
    const stored = textOrNull(
      rosterRows.map((row) => row[column]).find((each) => each != null)
    );
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
    active: true,
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
    // Read off the rows that were returned rather than asked of the database
    // again: the caveat is owed exactly when a reader can see an Exhibition Run,
    // and the rows in hand are what a reader can see.
    exhibitionCaveat: entrants.some(({ exhibition }) => exhibition !== null)
      ? EXHIBITION_CAVEAT
      : null,
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
 * What `/api/{code}/fixtures` answers with, for one Competition and never two.
 * Exported because the tests assert on it, and a body they describe for
 * themselves is a body they can go on describing after this one has changed.
 */
export interface FixturesBody {
  season: string;
  gw: number | null;
  deadlineAt: string | null;
  lockPassed: boolean;
  fixtures: FixtureView[];
}

/**
 * The Gameweek in front of the reader, its Fixtures, and what all ten Entrants
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
  competition: string,
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
           where competition = $2 and season = $1
             and not deferred and result is null),
         (select max(coalesce(locked_in_gw, gw)) from fixtures
           where competition = $2 and season = $1
             and (not deferred or locked_in_gw is not null))
       ) as gw
     )
     select current.gw, gameweeks.deadline_at
       from current
       left join gameweeks
         on gameweeks.competition = $2 and gameweeks.season = $1
        and gameweeks.gw = current.gw`,
    [season, competition]
  );
  const gw = numberOrNull(current?.gw);
  const deadline = current?.deadline_at == null
    ? null
    : new Date(current.deadline_at as string | Date);

  // A deferred Fixture that was Locked stays on the page: its Predictions were
  // committed under this Gameweek's Lock and are what a reader came for. One
  // that left the schedule before any run reached it is not in the Gameweek at
  // all, and would read as ten Gaps.
  const rows = await query(
    `select fixture_id, home_team, away_team, kickoff_at from fixtures
      where competition = $3 and season = $1
        and coalesce(locked_in_gw, gw) = $2
        and (not deferred or locked_in_gw is not null)
      order by kickoff_at, fixture_id`,
    [season, gw, competition]
  );

  // The same ten in the same order on every Fixture, which is what makes a
  // Gap a slot rather than a shorter list.
  // The Competition's own frozen Prompt Version, for the reason the
  // leaderboard's roster join reads one: each Competition seats its own ten
  // under one of its own (ADR-0038), so the constant would list every league's
  // Fixtures against the Premier League's Entrants.
  const roster = await query(
    `-- roster: the match track's, per Competition (ADR-0038).
     select id, name from models
      where role = 'entrant' and prompt_version = $1 order by id`,
    [matchPromptOf(competition).version]
  );

  const predictions = await query(
    `select p.fixture_id, p.model_id, p.probs, p.pred_home, p.pred_away,
            p.rationale, p.attempts_used as repairs, c.hash as context_hash
       from predictions p
       join contexts c on c.id = p.context_id
       join fixtures f
         on f.competition = p.competition and f.season = p.season
        and f.fixture_id = p.fixture_id
      where p.competition = $3 and p.season = $1
        and coalesce(f.locked_in_gw, f.gw) = $2`,
    [season, gw, competition]
  );

  const byFixtureAndEntrant = new Map<string, SlotPrediction>();
  for (const row of predictions) {
    const probs = row.probs as Probs;
    byFixtureAndEntrant.set(`${row.fixture_id}:${row.model_id}`, {
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
      // `fplId` where the column is now `fixture_id`: this is the published
      // shape a deployed dashboard build reads, and renaming a field in a JSON
      // body is a change to the contract between two things that ship
      // separately, not a rename. ADR-0035 renamed the column and left the
      // dashboard's Competition shape to its own ADR; the field goes with that.
      fplId: Number(row.fixture_id),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      kickoffAt: new Date(row.kickoff_at as string | Date).toISOString(),
      slots: roster.map((entrant) => ({
        entrant: { id: String(entrant.id), name: String(entrant.name) },
        // Null and not missing: an Entrant that did not answer must not be
        // indistinguishable from one that answered badly.
        prediction:
          byFixtureAndEntrant.get(`${row.fixture_id}:${entrant.id}`) ?? null
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
 * What `/api/{code}/entrants` answers with. Exported for the tests, so a body they
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
 * All ten Entrants with their complete per-Gameweek series, so selecting one
 * is a re-render and not a fetch — the cumulative chart draws ten lines at
 * once, and a page that fetched per Entrant could not draw the field.
 *
 * Every count here is counted over the flattened detail. `score_pct` and
 * `outcome_pct` are shares beside these rows and are not read: multiplying a
 * float share by `n` to recover an integer is a rounding bug waiting for the
 * Gameweek that makes it visible.
 */
async function entrants(
  query: Query,
  season: string,
  competition: string
): Promise<Response> {
  const throughGw = await scoredThrough(query, season, competition);

  // The cumulative rows at the scored Gameweek carry the whole Season each, so
  // the series is four rows per Entrant rather than four per Gameweek.
  //
  // Left joins for the same reason the leaderboard uses them: pre-season
  // returns the ten entered Entrants with nothing beside them, and `gw = $6`
  // is null there and matches no row.
  const rows = await query(
    `-- roster: the match track's, per Competition (ADR-0038).
     select m.id, m.name,
            points.value as match_points, points.n as n,
            points.detail as points_detail,
            bets.value as bet_points, bets.detail as bets_detail,
            rps.value as rps, rps.detail as rps_detail,
            gaps.detail as gaps_detail
       from models m
       left join scores points
         on points.model_id = m.id and points.competition = $8
        and points.season = $1
        and points.track = 'match' and points.gw = $6
        and points.metric = $2
       left join scores bets
         on bets.model_id = m.id and bets.competition = $8
        and bets.season = $1
        and bets.track = 'match' and bets.gw = $6 and bets.metric = $3
       left join scores rps
         on rps.model_id = m.id and rps.competition = $8
        and rps.season = $1
        and rps.track = 'match' and rps.gw = $6 and rps.metric = $4
       left join scores gaps
         on gaps.model_id = m.id and gaps.competition = $8
        and gaps.season = $1
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
      // This Competition's own frozen Prompt Version and never the constant:
      // each league seats its own ten under its own (ADR-0038), and the
      // constant would seat the Premier League's from every league.
      matchPromptOf(competition).version,
      competition
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
    // and all ten lines share one x-domain.
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

/** One row of the FPL points ranking, and one line of the Race chart. */
export interface FplLeaderboardEntrant {
  id: string;
  name: string;
  /** The OpenRouter Base Model id the design prints beneath the name. */
  baseModel: string;
  /**
   * Null before the first Settled Gameweek, as every figure beside it is: ten
   * Entrants with nothing scored are a field entered, not a ranking, and a page
   * handed ranks 1 to 10 there would publish an order nothing produced.
   *
   * Ties share a rank rather than being separated by id. Ten Entrants opening
   * on the same fifteen players can arrive at the same total, and an order
   * invented for two equal rows would show one of them climbing when neither
   * moved.
   */
  rank: number | null;
  /**
   * Places climbed since the previous scored Gameweek's cumulative snapshot,
   * negative for places lost. Null at the first Settled Gameweek of the record:
   * there is no snapshot behind it, and nought would read as "held its place".
   */
  movement: number | null;
  /**
   * The scored Gameweek's own points. Null rather than the Match track's
   * nought-for-a-missing-row: there, an Entrant that Gapped every Fixture
   * legitimately has no row and scored nothing, while here a scored Gameweek
   * has a row for all ten or for none (ADR-0011) — so an absent one is a
   * broken record, and publishing it as a nought would hide that.
   */
  gwPoints: number | null;
  /** Net of Hits, which is what the scorer stored and what the ranking orders by. */
  totalPoints: number | null;
  /**
   * What the Squad is worth to the Entrant: every owned player at his Selling
   * Price, which is the price paid plus half of any rise and the whole of any
   * fall (CONTEXT.md). In tenths, as every price in the track is.
   */
  squadValueTenths: number | null;
  /** Chips the Entrant can still play; see `chipsRemaining`. */
  chipsRemaining: number | null;
  /**
   * Cumulative points through every scored Gameweek, which is the Race
   * variant's whole line. Read from the stored cumulative rows rather than
   * summed here: the running total is a figure the scorer wrote, and adding the
   * Gameweeks up again would be a second answer to it.
   */
  cumulative: Array<{ gw: number; points: number }>;
}

/**
 * What `/api/fpl/leaderboard` answers with. Exported for the same reason the
 * Match track's bodies are: a body the tests describe for themselves is one
 * they can go on describing after this has changed.
 */
export interface FplLeaderboardBody {
  season: string;
  /** The Gameweek the record starts at, and the one it runs through. */
  fromGw: number | null;
  throughGw: number | null;
  /**
   * The Gameweeks inside that span the record holds nothing for, in order. A
   * hole is announced and never smoothed over (spec 0014): every Entrant's
   * series skips the same Gameweek, and a page that was not told would draw the
   * skip as a Gameweek in which nobody scored.
   */
  missingGws: number[];
  qualification: string | null;
  entrants: FplLeaderboardEntrant[];
}

/**
 * The Gameweek the FPL track has been scored through, which is the same
 * question `scoredThrough` answers for the Match track and a simpler one.
 *
 * A Gameweek settles for the whole roster or for none of it: a Gameweek any
 * Entrant stored no Manager State in is removed from every Season path
 * (ADR-0011), so the scorer writes its eight rows for ten Entrants or writes
 * nothing at all. The Gameweek's own points row is therefore the fact, and
 * there is no behavioural row that runs ahead of it the way the Match track's
 * do.
 *
 * Every read below filters `track = 'fpl'` for the reason the Match track's
 * reads filter `'match'`: one seat can hold both tracks, and ADR-0003 is
 * careful never to let the two rankings meet.
 */
async function fplScoredThrough(
  query: Query,
  season: string
): Promise<number | null> {
  const [scored] = await query(
    `select max(gw) as through_gw from scores
      where competition = 'PL' and season = $1
        and track = 'fpl' and metric = $2`,
    [season, FPL_POINTS_METRIC]
  );
  return numberOrNull(scored?.through_gw);
}

/**
 * The Gameweeks of a span that `present` holds nothing for, announced rather
 * than skipped: a Gameweek any Entrant stored no Manager State in is removed
 * from every Season path (ADR-0011), so it is absent from every series and
 * every total. A reader given a series that jumps from 3 to 5 with nothing said
 * would read the jump as a Gameweek nobody scored in.
 *
 * The span is passed rather than taken from `present`, because the two
 * questions asked of this differ in exactly that: the record's own holes are
 * the span's Gameweeks missing from the record, and one Entrant's Gaps are the
 * *same* span's Gameweeks missing from that Entrant's Manager States — a span
 * it may itself begin after. Reading the span off the list would answer the
 * second by starting at the Entrant's first Gameweek and calling every Gap
 * before it nothing.
 *
 * Empty span, empty answer: before the first Settled Gameweek there is no
 * record to hold a hole.
 */
function holesIn(
  from: number | undefined,
  throughGw: number | null,
  present: number[]
): number[] {
  return from === undefined || throughGw === null ? [] : Array.from(
    { length: throughGw - from + 1 },
    (_, offset) => from + offset
  ).filter((gw) => !present.includes(gw));
}

/**
 * The Demonstration qualification stored in the cumulative rows a total was
 * read off, which is the rows at the scored Gameweek and no earlier one. A
 * ranking a reader can see without it is the failure ADR-0003 asks for it
 * against, and on this track there is no row it could be missing from that is
 * not a fault: the scorer writes it into every cumulative row it writes, so a
 * Gameweek's rows carry it ten times or the record is broken.
 *
 * One distinct value across those rows rather than the first one found. Reading
 * the first would answer a Gameweek whose own rows lost the sentence with a
 * copy from an earlier Gameweek — publishing a ranking on the strength of a row
 * it was not read from, which is the one thing failing closed here exists to
 * prevent — and would let two rows disagreeing about a sentence frozen for the
 * Season pass unnoticed.
 *
 * Both FPL endpoints that serve a Season total read it through here. The
 * Entrant record's ten totals are a ranking a reader can order for themselves,
 * so spec 0014's story 33 binds it exactly as it binds the leaderboard.
 */
function qualificationAt(
  totals: Array<Record<string, unknown>>,
  throughGw: number | null
): string | null {
  const stored = new Set(
    totals
      .filter((row) => Number(row.gw) === throughGw)
      .map((row) => textOrNull(row.qualification))
  );
  const [qualification = null] = stored;
  if (throughGw !== null && (stored.size !== 1 || qualification === null)) {
    throw new Error(
      `The Season's FPL ranking rows at Gameweek ${throughGw} carry no one `
      + "qualification, and a ranking cannot be published without it"
    );
  }
  return qualification;
}

/** A player as the Season last listed him, which is how a page renders one. */
interface ListedPlayer {
  name: string;
  club: string;
  /**
   * The club's own three-letter code, or null for a listing taken before the
   * Lock recorded one (migration 0029). Null and not the first three letters of
   * the name: a code is read from the source that authors it or it is not
   * reported, and a page shows the club's name where there is none.
   */
  clubCode: string | null;
  position: Position;
  priceTenths: number;
}

/**
 * Every player the Season has listed through the Gameweek, by id, and a lookup
 * that fails on one it has not.
 *
 * At or before the Gameweek rather than at it: a Gameweek whose pre-Lock
 * snapshot was missed must not blank every Squad on the page, and a listing
 * holds until the next snapshot moves it.
 *
 * One read for both FPL endpoints, because both ask the same question of it —
 * the ranking wants the price that is the other half of Selling Price and the
 * Squads page wants that and the name beside it — and an Entrant owning a
 * player the Season never listed is the same fault to both.
 */
interface ListedPool {
  /** The listing a player is rendered from, or a failure if he has none. */
  player: (fplId: number) => ListedPlayer;
  /**
   * What he was listed at in an earlier Gameweek of the same Season, which is
   * the other half of the Selling Price a Squad had *then*. Pricing a Gameweek
   * 1 Squad at Gameweek 5's list would draw a value series that moves because
   * the prices moved rather than because the Squad did.
   *
   * Only the price and not the whole listing: a name, a club and a position are
   * facts about the player that a page prints the current spelling of, and the
   * price is the one column a series is drawn from.
   */
  priceAt: (fplId: number, gw: number) => number;
  /**
   * A club's own code, for a club no listed player is owned from — the
   * opponent on a plate is a club like any other and the field may own nobody
   * who plays for it. Null where the record holds no code (migration 0029).
   */
  clubCode: (club: string) => string | null;
}

/**
 * Every listing through the Gameweek rather than the standing one alone,
 * because the Entrant record draws a Squad value per Gameweek and needs the
 * list each of them was priced against. The rule that picks one — the latest
 * listing at or before a Gameweek — is applied here for both questions rather
 * than by `distinct on` for one and in JavaScript for the other, which would be
 * two spellings of it to drift apart.
 *
 * ponytail: the whole Season's listings in one read, which at Gameweek 38 of a
 * production bootstrap is around 26,000 narrow rows for the three endpoints
 * that share it. Narrow the read to the Gameweeks a caller asks for if it ever
 * measures.
 */
async function listedPool(
  query: Query,
  season: string,
  gw: number | null
): Promise<ListedPool> {
  const rows = gw === null ? [] : await query(
    `select fpl_id, gw, web_name, team_name, short_name, position, price_tenths
       from fpl_players
      where competition = 'PL' and season = $1 and gw <= $2
      order by fpl_id, gw`,
    [season, gw]
  );

  const listings = new Map<number, Array<ListedPlayer & { gw: number }>>();
  for (const row of rows) {
    const fplId = Number(row.fpl_id);
    listings.set(fplId, [...listings.get(fplId) ?? [], {
      gw: Number(row.gw),
      name: String(row.web_name),
      club: String(row.team_name),
      clubCode: row.short_name === null ? null : String(row.short_name),
      position: String(row.position) as Position,
      priceTenths: Number(row.price_tenths)
    }]);
  }

  // The listing that stood at a Gameweek, which is the last one written at or
  // before it. At or before rather than at: a Gameweek whose pre-Lock snapshot
  // was missed must not blank every Squad on the page, and a listing holds
  // until the next snapshot moves it.
  const standingAt = (
    fplId: number,
    at: number
  ): (ListedPlayer & { gw: number }) | undefined =>
    (listings.get(fplId) ?? []).filter((each) => each.gw <= at).at(-1);

  const refuse = (fplId: number, at: number): never => {
    throw new Error(
      `The Season lists no player ${fplId} at or before Gameweek ${at}, so a `
      + "Squad holding him cannot be read"
    );
  };

  // Off the same rows and not a second read of the same table: the code is a
  // fact about the club, every club with a listing has one on every row of it,
  // and a second query would restate this one's filter and its "latest listing
  // wins" rule in a second place for them to drift apart.
  const codes = new Map(
    [...listings.values()].flatMap((each) => each.at(-1) ?? [])
      .map(({ club, clubCode }) => [club, clubCode])
  );

  return {
    player: (fplId: number): ListedPlayer =>
      standingAt(fplId, gw ?? 0) ?? refuse(fplId, gw ?? 0),
    priceAt: (fplId: number, at: number): number =>
      (standingAt(fplId, at) ?? refuse(fplId, at)).priceTenths,
    clubCode: (club: string): string | null => codes.get(club) ?? null
  };
}

/**
 * What the Squad is worth to the Entrant at one Gameweek: every owned player at
 * his Selling Price, which is the price paid plus half of any rise and the whole
 * of any fall (CONTEXT.md). In tenths, as every price in the track is.
 *
 * The Squad it is fielding, which during a Free Hit is the week's borrowed
 * fifteen and not the permanent Squad waiting in `free_hit_stash`. That is the
 * value the Gameweek was played at and the one the Team Sheet beside it belongs
 * to; the permanent Squad returns as `active` next Gameweek, and reading the
 * stash instead would price a Squad nobody played.
 *
 * The Gameweek is passed because the ranking asks it of one and the Entrant
 * record asks it of every Gameweek of a Season — the same sum against a
 * different list. The squads endpoint does not call this: it has already priced
 * the fifteen one by one for the page to print, and adding them up from a second
 * reading of the same Squad would be a second answer to what it is showing.
 */
function squadValueAt(
  squad: SquadEnvelope,
  pool: ListedPool,
  gw: number
): number {
  return squad.active.reduce(
    (total, { fplId, purchasePriceTenths }) =>
      total + sellingPrice(purchasePriceTenths, pool.priceAt(fplId, gw)),
    0
  );
}

/**
 * The order both Entrant-scoped pages list the field in, which is the ranking's.
 *
 * Ties keep the entered order rather than sharing a place: a picker is a list of
 * buttons, and the shared rank a tie deserves is the leaderboard's answer to a
 * question neither page asks. One comparator and not two, because the squads
 * page and the Entrant record carry one selection between them (spec 0014,
 * story 22) — and an invariant about two pages agreeing cannot be held by two
 * copies of an expression three hundred lines apart.
 */
const byTotalPoints = (
  a: { totalPoints: number | null },
  b: { totalPoints: number | null }
): number => (b.totalPoints ?? 0) - (a.totalPoints ?? 0);

/**
 * The ten Entrants ranked by cumulative FPL points through the latest Settled
 * Gameweek, with the Race variant's whole series beside them — the three
 * variants are one page, and switching them must not fetch.
 *
 * The qualification is read out of the stored rows the ranking was read off,
 * because the claim being made is that what the scorer stored reaches a reader
 * intact; restating the constant would answer that with itself. Unlike the
 * Match track's there is no fallback to the constant, and none is possible: a
 * scored Gameweek has a cumulative row for every Entrant, so a ranking with no
 * stored sentence anywhere is a fault and fails closed.
 */
async function fplLeaderboard(query: Query, season: string): Promise<Response> {
  const throughGw = await fplScoredThrough(query, season);

  // Every scored Gameweek's cumulative row in one read. It is the series the
  // Race chart draws, the total the ranking is ordered by, and the snapshot the
  // movement is measured against, all three being the same stored figure at
  // different Gameweeks.
  const totals = throughGw === null ? [] : await query(
    `select s.model_id, s.gw, s.value,
            s.detail ->> 'qualification' as qualification
       from scores s
       join models m on m.id = s.model_id
      where s.competition = 'PL' and s.season = $1
        and s.track = 'fpl' and s.metric = $2 and s.gw <= $3
        -- The roster as it stands, joined here and not only on the seat read
        -- below (ADR-0047). These rows are what the ranks are counted from --
        -- a place is one more than the seats above it -- so a withdrawn seat
        -- left in them ranks the standing six as 1, 2, 5, 6, 7, 9 and prints a
        -- ranking with holes where three Base Models used to be. The Race
        -- chart draws off the same rows and would have drawn their lines.
        and m.withdrawn_at is null
      order by s.gw`,
    [season, FPL_POINTS_SEASON_TO_DATE_METRIC, throughGw]
  );

  // The standing Manager State rather than the Gameweek's own. A Gameweek can
  // store none — a Roll Over stores what stood, a Gap stores nothing at all —
  // and the Squad a reader is being shown is the one the Entrant holds, which
  // is the last one it wrote.
  //
  // Left joins for the reason the Match track's leaderboard uses them:
  // pre-Season returns the ten entered seats with nothing beside them, and
  // `$2` is null there and matches no row.
  const rows = await query(
    `select m.id, m.name, m.base_model,
            points.value as gw_points,
            state.squad, state.chips_used
       from models m
       left join scores points
         on points.model_id = m.id and points.competition = 'PL'
        and points.season = $1
        and points.track = 'fpl' and points.gw = $2 and points.metric = $3
       left join lateral (
         select squad, chips_used from manager_states
          where model_id = m.id and competition = 'PL'
            and season = $1 and gw <= $2
          order by gw desc limit 1
       ) state on true
      -- The FPL track's roster as it stands, not every seat that ever held
      -- one (ADR-0047). A withdrawn seat holds no Season path, and a page that
      -- listed it would show a Base Model on nought points as though it had
      -- played and lost. Its rows stay in the record; this is a page, not the
      -- record. The match track's reads carry no such filter, and the same Base
      -- Model appears there because it did not leave that track.
      where m.role = 'entrant' and m.prompt_version = $4
        and m.withdrawn_at is null
      order by m.id`,
    [season, throughGw, FPL_POINTS_METRIC, FPL_PROMPT_VERSION]
  );

  // The other half of Selling Price: what each player was last listed at
  // through the scored Gameweek.
  const pool = await listedPool(query, season, throughGw);

  // One rank per Entrant at one Gameweek, ties sharing a place. Used twice —
  // once for the ranking and once for the snapshot the movement is measured
  // against — so the two cannot disagree about what a tie means.
  const ranksAt = (gameweek: number): Map<string, number> => {
    const scored = totals
      .filter((row) => Number(row.gw) === gameweek)
      .map((row) => ({ id: String(row.model_id), points: Number(row.value) }));
    return new Map(scored.map(({ id, points }) => [
      id,
      1 + scored.filter((other) => other.points > points).length
    ]));
  };

  const gameweeks = [...new Set(totals.map((row) => Number(row.gw)))];
  const previousGw = gameweeks.filter((gw) => gw < (throughGw ?? 0)).at(-1);
  const unranked = new Map<string, number>();
  const ranks = throughGw === null ? unranked : ranksAt(throughGw);
  const before = previousGw === undefined ? unranked : ranksAt(previousGw);

  const entrants: FplLeaderboardEntrant[] = rows.map((row) => {
    const id = String(row.id);
    const rank = ranks.get(id) ?? null;
    const previousRank = before.get(id);
    const squad = row.squad as SquadEnvelope | null;
    // Ordered by Gameweek, so the last point is the row at the scored Gameweek
    // and the total the ranking is ordered by — the same stored figure, read
    // once rather than looked up a second time.
    const cumulative = totals
      .filter((each) => each.model_id === id)
      .map((each) => ({ gw: Number(each.gw), points: Number(each.value) }));
    return {
      id,
      name: String(row.name),
      baseModel: String(row.base_model),
      rank,
      movement: rank === null || previousRank === undefined
        ? null
        : previousRank - rank,
      gwPoints: numberOrNull(row.gw_points),
      totalPoints: cumulative.at(-1)?.points ?? null,
      squadValueTenths: squad === null || throughGw === null
        ? null
        : squadValueAt(squad, pool, throughGw),
      // Counted for the Gameweek after the one being read, which is the next
      // one the Entrant can play a Chip in. The Gameweek on the page has
      // settled, so its deadline is behind the Entrant — and reading a Settled
      // Gameweek 19 as though the first-half set were still reachable would
      // leave four expired Chips on the page for the rest of the Season.
      chipsRemaining: row.chips_used === null || throughGw === null
        ? null
        : chipsRemaining(row.chips_used as ChipsUsed, throughGw + 1),
      cumulative
    };
  });

  const body: FplLeaderboardBody = {
    season,
    fromGw: gameweeks[0] ?? null,
    throughGw,
    missingGws: holesIn(gameweeks[0], throughGw, gameweeks),
    qualification: qualificationAt(totals, throughGw),
    // Ranked order, and the entered order before there is a ranking to take.
    entrants: throughGw === null
      ? entrants
      : [...entrants].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  };
  return json(body, SCORED_CACHE);
}

/** One of the fifteen an Entrant owned, as the design's list view reads it. */
export interface FplSquadPlayer {
  fplId: number;
  name: string;
  club: string;
  /** The club's own code, or null where the record holds none. */
  clubCode: string | null;
  /**
   * Who his club played in the Gameweek, which the design prints on his plate.
   *
   * A list and not one Fixture, because the record answers with the Fixtures
   * there were: a club with a blank Gameweek has none, and a club with a double
   * has two. The design drew a single Fixture per plate, which is the ordinary
   * week and not the rule.
   */
  opponents: FplOpponent[];
  position: Position;
  /** What the Gameweek's Lock listed him at, in tenths, as every price is. */
  priceTenths: number;
  /**
   * What the Entrant would receive for him: what it paid plus half of any rise
   * and the whole of any fall (`sellingPrice`). The purchase price it is
   * derived from is the Manager State's, which is the system of record — the
   * listed price above is only the other half of the sum.
   */
  sellingPriceTenths: number;
  /**
   * The Gameweek's points, before any armband, or null while the Gameweek is
   * locked and not yet settled (ADR-0048).
   *
   * It read `number` and said "never null", which held while this page waited
   * for settlement to show anything at all. The page now shows a Sheet from the
   * moment its Lock stores it, and a Squad is readable — the fifteen, the
   * armband, the formation, the money — before a single point exists. Null is
   * that state and not a missing row: a settled Gameweek still refuses a player
   * without points.
   */
  points: number | null;
}

/**
 * A Fixture as a name plate on the pitch reads it: who the club plays and which
 * ground it is at.
 */
export interface FplOpponent {
  club: string;
  /**
   * The opponent's three-letter code, which is what the plate prints, or null
   * for a club the record holds no code for (migration 0029). Never derived
   * from the name: `AVL` and `NFO` are not slices of "Aston Villa" and
   * "Nottingham Forest", and a page showing the club's name says less than the
   * design asked for rather than something the record never said.
   *
   * Spelled as `FplSquadPlayer` spells the same pair, so the one function that
   * turns a club into three letters reads both: a player's club and the club he
   * faced are one thing said twice, and two spellings of it are two places for
   * the fallback to be written.
   */
  clubCode: string | null;
  home: boolean;
}

/**
 * What one Gameweek changed, read by diffing the Squad it fielded against the
 * one the Entrant last stood on — the replay ADR-0003 allows, and the only
 * record there is: a Manager State stores the Squad it arrived at and not the
 * moves that got it there.
 *
 * What was held before a Free Hit is the Squad in `free_hit_stash` and not the
 * week's borrowed fifteen: the Chip lends a Squad for one Gameweek and takes it
 * back (`restoreFromFreeHit`), so the Gameweek after one would otherwise report
 * fifteen Transfers for a restoration nobody made. The Gameweek's own side
 * stays `active`, because a Free Hit's changes are that Gameweek's Transfers —
 * spec 0003 says the Chip changes a Gameweek's Transfers and the reducer
 * carries them out — and they are what the Sheet beside them was built from.
 *
 * Nothing at the Gameweek the Entrant opened in, which has nothing behind it:
 * fifteen players arriving is a Squad being bought rather than fifteen
 * Transfers. One function for both FPL endpoints that publish Transfers,
 * because the Entrant record's history is the squads page's one Gameweek
 * repeated and two readings of it could disagree about a Free Hit.
 */
function transfersBetween(
  previous: SquadEnvelope | null,
  squad: SquadEnvelope | null
): { out: number[]; in: number[] } {
  const fielded = new Set(squad?.active.map(({ fplId }) => fplId) ?? []);
  const held = new Set(
    previous === null
      ? []
      : (previous.free_hit_stash?.squad ?? previous.active)
        .map(({ fplId }) => fplId)
  );
  return previous === null
    ? { out: [], in: [] }
    : {
      out: [...held].filter((fplId) => !fielded.has(fplId)),
      in: [...fielded].filter((fplId) => !held.has(fplId))
    };
}

/**
 * A player the record names in passing rather than describes: the id it moved
 * and the name a page prints for it. A Transfer's two ends, and a captain pick
 * and its vice, are all this and nothing more — the Squad's own fifteen are
 * `FplSquadPlayer`, which carries the price, the club and the Gameweek points a
 * plate is drawn from.
 *
 * The name is the listing that stands at the record's last Gameweek, which is
 * how a page spells a player whatever week it is naming him in.
 */
export interface FplNamedPlayer {
  fplId: number;
  name: string;
}

/** One Entrant's Gameweek: the Sheet it locked and how it got there. */
export interface FplSquadsEntrant {
  id: string;
  name: string;
  baseModel: string;
  /**
   * The OpenRouter provider the seat is pinned to (ADR-0009), which the design
   * names beside the Base Model under a Team Sheet. A column of `models`, which
   * is the table this endpoint already reads the seat from — the Season Roster
   * records it because a served open-weight Base Model is a different Base
   * Model at a different provider, and a reader looking at a Squad is entitled
   * to the same identity the roster keeps.
   */
  provider: string;
  /** Every figure below is null before the first Settled Gameweek. */
  gwPoints: number | null;
  totalPoints: number | null;
  squadValueTenths: number | null;
  bankTenths: number | null;
  freeTransfers: number | null;
  chipActive: Chip | null;
  /**
   * The stored Sheet, spelled as it is stored: the eleven, the bench in the
   * order it would come on, and the two armbands. A Rolled Over Gameweek
   * carries the Sheet that was standing, because that is the Sheet it played.
   */
  teamSheet: TeamSheet | null;
  /** The fifteen owned, in Squad order; empty before the Season starts. */
  players: FplSquadPlayer[];
  /** What the Gameweek changed; see `transfersBetween`. */
  transfersOut: FplNamedPlayer[];
  transfersIn: FplNamedPlayer[];
  /**
   * The Gameweek the two lists above were read against, which is the last one
   * this Entrant stored a Manager State for. Ordinarily the Gameweek before,
   * and further back when the record holds a hole: a Gameweek an Entrant Gapped
   * stores nothing (ADR-0011), so its Squad is compared with the last one that
   * stood — and a reader told "Transfers into Gameweek 5" without being told
   * they are the changes since Gameweek 3 would read a hole as a quiet week.
   * Null at the Gameweek the Entrant opened in, which has nothing behind it.
   */
  transfersSinceGw: number | null;
  /**
   * Points this Gameweek's paid Transfers cost, which the scorer has already
   * deducted from `gwPoints`. Four per Transfer beyond the Free ones; which of
   * the Transfers above was the paid one is not recorded and is not invented
   * here.
   */
  hitPoints: number | null;
  /** Repairs the action cost before it was legal, or gave up at (ADR-0004). */
  repairs: number | null;
  /** Whether the Gameweek reached no legal action and carried the Sheet over. */
  rolledOver: boolean | null;
  /**
   * The last rule of the game the Entrant broke reaching this Gameweek's
   * action, or null if it broke none. Only the kinds a rule can produce count,
   * as the violation profile counts them: a provider that never answered broke
   * no rule of the game, and reporting it here would read as one.
   */
  lastViolation: ViolationKind | null;
}

/**
 * What `/api/fpl/squads` answers with: all ten Entrants at one Gameweek, so
 * the page's picker switches without fetching.
 */
export interface FplSquadsBody {
  season: string;
  /** The Settled Gameweek every Sheet below belongs to. */
  gw: number | null;
  /**
   * The deadline that Gameweek's Sheets answer, as an instant.
   *
   * The Lock is the deadline: a Team Sheet is what an Entrant was holding when
   * it passed, and a page showing a Sheet without it cannot say which of 38
   * deadlines it is a Sheet for (spec 0014, story 21). Null before the first
   * Settled Gameweek, and null for a Gameweek the record holds no deadline for
   * rather than the Season's first one standing in.
   *
   * An instant and not a formatted line: what a reader is shown is the page's
   * to spell, and a Worker deciding the wording would put the sentence where
   * nothing renders it.
   */
  deadlineAt: string | null;
  /**
   * How many Repairs an Entrant is allowed before the track stops asking
   * (ADR-0010), which is what the Repairs each of them used is read against.
   *
   * Served rather than spelled in the page, because the allowance is a fact
   * about the run: a page reading "1 of 3" against a track that now allows two
   * is wrong in the half a reader cannot check.
   */
  maxRepairs: number;
  entrants: FplSquadsEntrant[];
}

/**
 * The Gameweek whose Team Sheets are the latest ones locked, which is the
 * Gameweek this page shows (ADR-0048).
 *
 * `manager_states` and not `scores`: a Sheet is a fact the moment the Lock
 * stores it, and it was previously read at the latest *Settled* Gameweek, which
 * left the page empty for the days between a Lock and its settlement — the days
 * a reader most wants to see what was picked.
 *
 * No join to `models` and so no withdrawal filter, deliberately: a seat that
 * left the track has no Manager State to be the latest of. One withdrawn
 * mid-Season would keep the rows it wrote, and they name Gameweeks the standing
 * seats wrote rows for too, so the maximum is the same number either way.
 */
async function fplTeamSheetsThrough(
  query: Query,
  season: string
): Promise<number | null> {
  const [row] = await query(
    `select max(gw) as gw from manager_states
      where competition = 'PL' and season = $1`,
    [season]
  );
  const gw = row?.gw;
  return gw === null || gw === undefined ? null : Number(gw);
}

/**
 * Every Entrant's Team Sheet at the latest Gameweek one was locked for, with
 * the stat strip's figures, the Gameweek's Transfers and how cleanly the action
 * landed.
 *
 * The Manager State is read at that Gameweek exactly, where the leaderboard
 * takes the latest at or before it. The Repairs, the Roll Over and the
 * Transfers are facts about *this* Gameweek, so an earlier Gameweek's row
 * standing in for a missing one would report its Repairs as though they were
 * this Gameweek's.
 *
 * The points beside the Sheet are null until the Gameweek settles, which is
 * what ADR-0048 accepts to show the Sheet early: a Squad is a decision and
 * readable as one before anything has been scored, and the left joins below
 * already answer with nulls for a Gameweek `scores` holds no row for.
 */
async function fplSquads(query: Query, season: string): Promise<Response> {
  const gw = await fplTeamSheetsThrough(query, season);

  const rows = await query(
    `select m.id, m.name, m.base_model, m.provider,
            points.value as gw_points,
            totals.value as total_points,
            state.squad, state.team_sheet, state.bank, state.free_transfers,
            state.chip_active, state.hits, state.attempts_used,
            state.rolled_over,
            previous.gw as previous_gw, previous.squad as previous_squad,
            refused.error_kind as last_violation
       from models m
       left join scores points
         on points.model_id = m.id and points.competition = 'PL'
        and points.season = $1
        and points.track = 'fpl' and points.gw = $2 and points.metric = $3
       left join scores totals
         on totals.model_id = m.id and totals.competition = 'PL'
        and totals.season = $1
        and totals.track = 'fpl' and totals.gw = $2 and totals.metric = $4
       left join manager_states state
         on state.model_id = m.id and state.competition = 'PL'
        and state.season = $1 and state.gw = $2
       left join lateral (
         select gw, squad from manager_states
          where model_id = m.id and competition = 'PL'
            and season = $1 and gw < $2
          order by gw desc limit 1
       ) previous on true
       -- Ordered by the instant and not by the attempt number: a Gameweek can
       -- hold attempts from more than one run -- a provider failure leaves its
       -- rows and a later run over the same Gameweek leaves its own -- and the
       -- numbering restarts with each run, so the highest number can belong to
       -- the earlier one. The instant orders the runs; the number orders the
       -- conversation inside one.
       left join lateral (
         select error_kind from attempts
          where model_id = m.id and competition = 'PL'
            and season = $1 and gw = $2
            and track = 'fpl'
            and error_kind = any(string_to_array($6, ','))
          order by attempted_at desc, attempt_no desc limit 1
       ) refused on true
      -- The roster as it stands (ADR-0047), as the leaderboard reads it.
      where m.role = 'entrant' and m.prompt_version = $5
        and m.withdrawn_at is null
      order by m.id`,
    [
      season, gw, FPL_POINTS_METRIC, FPL_POINTS_SEASON_TO_DATE_METRIC,
      FPL_PROMPT_VERSION,
      // One text parameter split in Postgres rather than an array parameter,
      // because the two drivers do not agree on what a JavaScript array is:
      // `postgres.js` sends it as a bare comma-joined string and `any()`
      // refuses it as a malformed array literal, while `pg` sends an array.
      // The kinds themselves are the same closed tuple the violation profile
      // counts, so a kind can no more be missed here than there.
      VIOLATION_KINDS.join(",")
    ]
  );

  // Every name, club, position and price the fifteen are rendered with.
  const pool = await listedPool(query, season, gw);

  // Who each club played, by club.
  //
  // The join is the club's name and needs no alias table between the two
  // tables: a Lock writes both the player rows and the Fixture rows out of one
  // bootstrap's `teams[].name`, so the two spellings are one string by
  // construction.
  //
  // The Fixtures this Gameweek's Lock owns, which is the same set the Fixtures
  // endpoint publishes and the set the Team Sheet was chosen against. A Fixture
  // that left the schedule before any Lock reached it was never in the Gameweek;
  // one that moved carries the Lock that committed it.
  const opponents = new Map<string, FplOpponent[]>();
  const seatOpponent = (club: string, opponent: FplOpponent): void => {
    opponents.set(club, [...opponents.get(club) ?? [], opponent]);
  };
  for (const row of gw === null ? [] : await query(
    `select home_team, away_team from fixtures
      where competition = 'PL' and season = $1
        and coalesce(locked_in_gw, gw) = $2
        and (not deferred or locked_in_gw is not null)
      order by kickoff_at, fixture_id`,
    [season, gw]
  )) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    seatOpponent(home, {
      club: away, clubCode: pool.clubCode(away), home: true
    });
    seatOpponent(away, {
      club: home, clubCode: pool.clubCode(home), home: false
    });
  }

  const scored = new Map(
    (gw === null ? [] : await query(
      `select fpl_id, total_points from fpl_player_points
        where season = $1 and gw = $2`,
      [season, gw]
    )).map((row) => [Number(row.fpl_id), Number(row.total_points)])
  );

  /** A player as a Transfer names him: the id the record moved and his name. */
  const named = (fplId: number): FplNamedPlayer =>
    ({ fplId, name: pool.player(fplId).name });

  // The Squad being fielded, which during a Free Hit is the borrowed fifteen
  // and not the permanent Squad waiting in `free_hit_stash` — the Sheet beside
  // it belongs to the players it names.
  // Whether this Gameweek has been scored, read off the player points rather
  // than asked for separately: the scorer writes a row for every player on
  // every Sheet or none at all, so an empty map is a Gameweek that is locked
  // and not yet settled (ADR-0048).
  const settled = scored.size > 0;

  const playersOf = (squad: SquadEnvelope): FplSquadPlayer[] =>
    squad.active.map(({ fplId, purchasePriceTenths }) => {
      const { priceTenths, ...player } = pool.player(fplId);
      const points = scored.get(fplId);
      // A Gameweek settles for the whole Team Sheet or not at all: the scorer
      // refuses a Gameweek in which any player named on a Sheet has no settled
      // points, and a Squad's fifteen are exactly the eleven and the four. So
      // a player owned at a scored Gameweek with no points row is a record
      // that has been broken since, and this fails on it rather than showing
      // fourteen players who scored and one who is a blank.
      //
      // `settled` is what tells that from the Gameweek this page now also
      // shows: one that is locked and unscored, where nobody has points and
      // every Sheet is readable anyway (ADR-0048).
      if (settled && points === undefined) {
        throw new Error(
          `The Season records no settled points for player ${fplId} at `
          + `Gameweek ${gw}, so the Squad holding him cannot be read`
        );
      }
      return {
        fplId,
        ...player,
        opponents: opponents.get(player.club) ?? [],
        priceTenths,
        sellingPriceTenths: sellingPrice(purchasePriceTenths, priceTenths),
        points: points ?? null
      };
    });

  const entrants: FplSquadsEntrant[] = rows.map((row) => {
    const squad = row.squad as SquadEnvelope | null;
    const previous = row.previous_squad as SquadEnvelope | null;
    const { out, in: moved } = transfersBetween(previous, squad);
    // The fifteen, priced once: the Squad value is their Selling Prices added
    // up, and adding them up a second time from a second reading of the same
    // Squad would be a second answer to what the page is already being shown.
    const players = squad === null ? [] : playersOf(squad);
    return {
      id: String(row.id),
      name: String(row.name),
      baseModel: String(row.base_model),
      provider: String(row.provider),
      gwPoints: numberOrNull(row.gw_points),
      totalPoints: numberOrNull(row.total_points),
      squadValueTenths: squad === null ? null : players.reduce(
        (total, player) => total + player.sellingPriceTenths, 0
      ),
      bankTenths: numberOrNull(row.bank),
      freeTransfers: numberOrNull(row.free_transfers),
      chipActive: row.chip_active as Chip | null,
      teamSheet: row.team_sheet as TeamSheet | null,
      players,
      transfersOut: out.map(named),
      transfersIn: moved.map(named),
      transfersSinceGw: numberOrNull(row.previous_gw),
      hitPoints: numberOrNull(row.hits),
      repairs: numberOrNull(row.attempts_used),
      rolledOver: row.rolled_over === null ? null : Boolean(row.rolled_over),
      lastViolation: row.last_violation as ViolationKind | null
    };
  });

  // The deadline the Gameweek's Sheets answer. Read from `gameweeks`, which is
  // where a Lock's instant is recorded and what the Fixtures endpoint already
  // publishes for the Match track -- the same row, read by the same key.
  const [deadline] = gw === null ? [] : await query(
    `select deadline_at from gameweeks
      where competition = 'PL' and season = $1 and gw = $2`,
    [season, gw]
  );

  const body: FplSquadsBody = {
    season,
    gw,
    deadlineAt: deadline === undefined
      ? null
      : new Date(deadline.deadline_at as string | Date).toISOString(),
    maxRepairs: MAX_REPAIRS,
    entrants: entrants.sort(byTotalPoints)
  };
  return json(body, SCORED_CACHE);
}

/** One Settled Gameweek of one Entrant's record, as the design's charts read it. */
export interface FplEntrantGameweek {
  gw: number;
  /** Net of Hits, which is the figure the scorer stored and the bars draw. */
  points: number;
  /**
   * The fifteen at their Selling Prices, taken against the list that stood at
   * *this* Gameweek. Pricing every Gameweek's Squad at the latest list would
   * draw a series that moves because the market moved rather than because the
   * Squad did.
   */
  squadValueTenths: number;
  bankTenths: number;
  /** The Chip this Gameweek played, or null. */
  chip: Chip | null;
  /** Who the Team Sheet nominated, which is not always who wore the armband. */
  captain: FplNamedPlayer;
  viceCaptain: FplNamedPlayer;
  /**
   * Who actually wore it: the captain, or the vice where the captain did not
   * play at all, or nobody where neither did. Served rather than left to the
   * page to infer, because the return beside it belongs to whoever wore it —
   * and printing a vice-captain's doubled score under the captain's name is a
   * misattribution a reader has no way to catch.
   */
  armband: FplNamedPlayer | null;
  /**
   * What the armband returned — the wearer's points already multiplied, so a
   * Triple Captain reads as the three times it was worth. Null where nobody
   * wore it, which is not a nought: a captain who played and scored nothing
   * doubled nothing, and that is a nought.
   */
  captainPoints: number | null;
  transfersOut: FplNamedPlayer[];
  transfersIn: FplNamedPlayer[];
  /**
   * The Gameweek the two lists above were read against, spelled as the squads
   * endpoint spells it and for the same reason: ordinarily the Gameweek before,
   * and further back where the record holds a hole. Null at the Gameweek the
   * Entrant opened in.
   */
  transfersSinceGw: number | null;
  /**
   * What this Gameweek's paid Transfers cost, which the scorer has already
   * deducted from `points`. Which of the Transfers above was the paid one is
   * not recorded and is not invented here.
   */
  hitPoints: number;
  repairs: number;
  rolledOver: boolean;
}

/** A Chip and the Gameweek it was spent in, which is what the strip colours. */
export interface FplChipPlayed {
  chip: Chip;
  gw: number;
}

/** One Entrant's whole Season, sporting record and operator record together. */
export interface FplEntrantRecord {
  id: string;
  name: string;
  baseModel: string;
  /** Null before the first Settled Gameweek, as every total beside it is. */
  totalPoints: number | null;
  /**
   * The Chips spent and when, read from the Manager States rather than counted
   * out of `chips_used`: the set says which are gone and the states say which
   * Gameweek took them, and the strip cannot be drawn without the second.
   */
  chipsPlayed: FplChipPlayed[];
  /** Chips still playable in the Gameweek after the record's last; see `chipsRemaining`. */
  chipsRemaining: number | null;
  /** Repairs spent across the Season, added up rather than recovered from the stored mean. */
  repairs: number | null;
  rollOvers: number | null;
  /**
   * Points paid for Transfers across the Season, which is what the design's
   * `Hits taken` block stands over — a points figure and not a count of Hits.
   *
   * The record stores a Gameweek's cost and never which Transfer paid it, so
   * the only count available is this divided by the game's four. That division
   * is a rule of the game restated at a boundary that cannot check it: the game
   * changed the Free Transfer allowance for 2026/27 and could change the price
   * of a Transfer next, and a footer quietly dividing by a stale four would
   * report a wrong count with nothing beside it to disagree. The cost is what
   * was recorded, so the cost is what is served, and the page's label says
   * points.
   */
  hitPoints: number | null;
  /**
   * Gameweeks inside the record's span this Entrant stored no Manager State
   * for, which is what a Gap is on this track: an Entrant that never reached a
   * legal action stores nothing at all, where one that reached none it liked
   * Rolled Over and stored what stood. A Gap is reported, never back-filled
   * (CONTEXT.md), and it is the reason a Gameweek can be missing from `gameweeks`.
   */
  gaps: number | null;
  /** Every Settled Gameweek, in order; empty before the first one. */
  gameweeks: FplEntrantGameweek[];
}

/**
 * What `/api/fpl/entrants` answers with: all ten Entrants' full histories in
 * one body, so the page's picker switches without fetching — the same bargain
 * the squads endpoint makes, for the same picker.
 */
export interface FplEntrantsBody {
  season: string;
  fromGw: number | null;
  throughGw: number | null;
  missingGws: number[];
  /**
   * The Prompt Version the seats were entered under, which the operator footer
   * prints. One Season fact and not ten: it is the column this endpoint already
   * filters the roster by, so a per-Entrant copy would be the same string ten
   * times with ten chances to disagree.
   */
  promptVersion: string;
  qualification: string | null;
  entrants: FplEntrantRecord[];
}

/**
 * Every Entrant's Season replayed from what the record stores: the points the
 * scorer wrote, and the Squad value, bank, Chips, captains and Transfers read
 * back off the Manager States themselves.
 *
 * Only Settled Gameweeks reach `gameweeks`, and the span's holes are announced
 * beside it. The Manager States are read past those holes all the same: a
 * Gameweek that never settled still stored a Squad, and the Transfers of the
 * next Settled Gameweek are the changes since the last Squad that stood —
 * which is what `transfersSinceGw` says, exactly as the squads endpoint says it.
 */
async function fplEntrants(query: Query, season: string): Promise<Response> {
  const throughGw = await fplScoredThrough(query, season);

  // The Gameweek's own points and the whole of what made them: the armband, the
  // contributions it multiplied, and the Chip. One row per Entrant per Settled
  // Gameweek, which is also the set of Settled Gameweeks — a Gameweek settles
  // for all ten or for none (ADR-0011), so the Gameweeks these rows name are
  // the record's span with its holes already removed.
  const scored = throughGw === null ? [] : await query(
    `select model_id, gw, value, detail
       from scores
      where competition = 'PL' and season = $1
        and track = 'fpl' and metric = $2 and gw <= $3
      order by gw`,
    [season, FPL_POINTS_METRIC, throughGw]
  );

  // The Season totals and the sentence they may not be published without, read
  // off the cumulative rows at the scored Gameweek exactly as the leaderboard
  // reads its ranking's.
  const totals = throughGw === null ? [] : await query(
    `select model_id, gw, value, detail ->> 'qualification' as qualification
       from scores
      where competition = 'PL' and season = $1
        and track = 'fpl' and metric = $2 and gw = $3`,
    [season, FPL_POINTS_SEASON_TO_DATE_METRIC, throughGw]
  );

  // Every Manager State through the scored Gameweek, in Gameweek order, which
  // is the replay everything below is read out of. Joined to `models` rather
  // than filtered by a list of ids, so the roster this answers for is the one
  // the seat table says it is.
  const states = throughGw === null ? [] : await query(
    `select s.model_id, s.gw, s.squad, s.team_sheet, s.bank, s.chips_used,
            s.chip_active, s.hits, s.attempts_used, s.rolled_over
       from manager_states s
       join models m on m.id = s.model_id
      where s.competition = 'PL' and s.season = $1 and s.gw <= $2
        and m.role = 'entrant' and m.prompt_version = $3
        -- The roster as it stands (ADR-0047).
        and m.withdrawn_at is null
      order by s.model_id, s.gw`,
    [season, throughGw, FPL_PROMPT_VERSION]
  );

  const rows = await query(
    `select id, name, base_model from models
      where role = 'entrant' and prompt_version = $1
        -- The roster as it stands (ADR-0047), as the replay above reads it: the
        -- two must agree or an Entrant is named with no path or walks a path
        -- with no name.
        and withdrawn_at is null
      order by id`,
    [FPL_PROMPT_VERSION]
  );

  // Every price the value series is drawn against, and the names the captain
  // picks and the Transfer history print.
  const pool = await listedPool(query, season, throughGw);

  const gameweeks = [...new Set(scored.map((row) => Number(row.gw)))];
  const settled = new Set(gameweeks);

  const named = (fplId: number): FplNamedPlayer =>
    ({ fplId, name: pool.player(fplId).name });

  const entrants: FplEntrantRecord[] = rows.map((row) => {
    const id = String(row.id);
    const own = states.filter((state) => String(state.model_id) === id);
    const points = new Map(
      scored
        .filter((each) => String(each.model_id) === id)
        .map((each) => [Number(each.gw), each])
    );

    const played = own.flatMap((state, index) => {
      const gw = Number(state.gw);
      const row = points.get(gw);
      if (!settled.has(gw) || row === undefined) {
        return [];
      }
      const squad = state.squad as SquadEnvelope;
      const sheet = state.team_sheet as TeamSheet;
      const detail = row.detail as ScoreDetail;
      const before = own[index - 1];
      const previous = (before?.squad ?? null) as SquadEnvelope | null;
      const { out, in: moved } = transfersBetween(previous, squad);
      // The wearer's own contribution, which already carries the multiplier the
      // armband applied — two ordinarily and three under a Triple Captain — so
      // the figure is what the armband returned rather than what the player
      // scored. `detail.captain` is null when neither of the two played.
      const wore = detail.captain === null
        ? undefined
        : detail.players.find(({ fplId }) => fplId === detail.captain);

      const gameweek: FplEntrantGameweek = {
        gw,
        points: Number(row.value),
        squadValueTenths: squadValueAt(squad, pool, gw),
        bankTenths: Number(state.bank),
        chip: state.chip_active as Chip | null,
        captain: named(sheet.captain),
        viceCaptain: named(sheet.viceCaptain),
        armband: wore === undefined ? null : named(wore.fplId),
        captainPoints: wore === undefined
          ? null
          : wore.points * wore.multiplier,
        transfersOut: out.map(named),
        transfersIn: moved.map(named),
        transfersSinceGw: before === undefined ? null : Number(before.gw),
        hitPoints: Number(state.hits),
        repairs: Number(state.attempts_used),
        rolledOver: Boolean(state.rolled_over)
      };
      return [gameweek];
    });

    // The Chip strip's colours come from every stored state and not from the
    // Settled ones alone: a Chip spent in a Gameweek that never settled is
    // still spent — `chipsRemaining` below counts it gone — and a strip that
    // left its cell blank would offer a Chip the Entrant no longer holds.
    const chipsPlayed = own.flatMap((state) => state.chip_active === null
      ? []
      : [{ chip: state.chip_active as Chip, gw: Number(state.gw) }]);

    const total = totals.find((each) => String(each.model_id) === id);
    const standing = own.at(-1);

    return {
      id,
      name: String(row.name),
      baseModel: String(row.base_model),
      totalPoints: numberOrNull(total?.value),
      chipsPlayed,
      // Counted for the Gameweek after the record's last, which is the next one
      // a Chip could be played in — the same reading the leaderboard takes, and
      // for the same reason: the Gameweek on the page has settled, so its
      // deadline is behind the Entrant.
      chipsRemaining: standing === undefined || throughGw === null
        ? null
        : chipsRemaining(standing.chips_used as ChipsUsed, throughGw + 1),
      // The three below are taken over the Settled Gameweeks alone, which is a
      // narrower span than the two around them, and the three scopes are three
      // different questions rather than an inconsistency:
      //
      // A Repair, a Roll Over and a Hit are things that happened *in a
      // Gameweek*, and the footer stands under a record that shows Settled
      // Gameweeks and nothing else (spec 0014, story 30). A figure counting a
      // Gameweek the reader cannot see would be a total nothing on the page
      // adds up to.
      //
      // `chipsPlayed` above runs over every stored state because a Chip is not
      // a Gameweek's event but a Season's resource: it is spent whether or not
      // the Gameweek that spent it settled, `chipsRemaining` beside it counts
      // it gone, and a strip that left the cell blank would offer a Chip the
      // Entrant no longer holds.
      //
      // `gaps` below runs over the whole span because a Gap is precisely what
      // stops a Gameweek settling — counting Gaps over the Settled Gameweeks
      // would report every Gap as nought.
      //
      // The visible cost: a Repair or a Roll Over spent in a Gameweek that
      // never settled is absent from this footer while a Chip spent in the same
      // Gameweek is reported. That is the scopes doing what each is for, and it
      // is the reading to revisit first if a reader ever asks why a Roll Over
      // they were told about is not counted here.
      //
      // Added up rather than taken from the stored `repairs_season_to_date`,
      // which is a mean: multiplying a float mean by its count to recover an
      // integer is a rounding bug waiting for the Gameweek that makes it
      // visible, which is the mistake the Match track's record endpoint names
      // for itself.
      repairs: throughGw === null
        ? null
        : played.reduce((sum, week) => sum + week.repairs, 0),
      rollOvers: throughGw === null
        ? null
        : played.filter((week) => week.rolledOver).length,
      hitPoints: throughGw === null
        ? null
        : played.reduce((sum, week) => sum + week.hitPoints, 0),
      // The Gameweeks of the record's span this Entrant stored nothing for; the
      // span it is taken over is argued with the three above.
      gaps: throughGw === null ? null : holesIn(
        gameweeks[0], throughGw, own.map((state) => Number(state.gw))
      ).length,
      gameweeks: played
    };
  });

  const body: FplEntrantsBody = {
    season,
    fromGw: gameweeks[0] ?? null,
    throughGw,
    missingGws: holesIn(gameweeks[0], throughGw, gameweeks),
    promptVersion: FPL_PROMPT_VERSION,
    qualification: qualificationAt(totals, throughGw),
    entrants: entrants.sort(byTotalPoints)
  };
  return json(body, SCORED_CACHE);
}

/**
 * One retired seat's Gameweek, which is three figures and nothing derived from
 * them. Null is the state where slice 1's scoring run never landed, and it
 * reaches the page as null so the page can say so: a nought here would report a
 * Gameweek nobody scored as a Gameweek everybody lost.
 */
export interface RetiredGameweekEntrant {
  id: string;
  name: string;
  matchPoints: number | null;
  betPoints: number | null;
  rps: number | null;
}

/**
 * What `/api/{code}/retired` answers with: the one Gameweek a restarted
 * Competition played under the version it retired (ADR-0042), read by that
 * version's name.
 *
 * It is the only read anywhere that names a retired version. Every other
 * roster-shaped endpoint filters by `matchPromptOf(competition).version`, so
 * the retired seats left those bodies the moment the constant moved and this
 * one is what keeps their Gameweek readable.
 *
 * No interval, no Comparison Anchor and no Season total, because one Gameweek
 * supports none of them and a field here is what a merge would look like.
 */
export interface RetiredGameweekBody {
  season: string;
  /** The retired version itself, which the block's label names. */
  promptVersion: string;
  gw: number;
  /**
   * The three sentences the figures below may not reach a reader without
   * (ADR-0012). The first two are the scorer's own, read out of the rows this
   * body is built from exactly as the leaderboard reads its ranking's — the
   * per-Gameweek rows carry them, so the block needs no plumbing of its own.
   * The third is the evidential layer's, which has no stored sentence because
   * ADR-0042 refuses this block the interval that would be its claim.
   *
   * All three are null in the one state where nothing is published: no stored
   * scores at all, which the block says outright.
   */
  matchPointsQualification: string | null;
  betPointsQualification: string | null;
  evidenceCaveat: string | null;
  /**
   * The Fixtures that Gameweek's Lock owned, which is the attribution the
   * record has (ADR-0013) and not the count the calendar scheduled into it. A
   * reader comparing this block against a Fixtures list must be able to read
   * the difference as Fixtures asked in a later Gameweek under the restarted
   * version, rather than as Fixtures the record lost.
   */
  fixtures: number;
  entrants: RetiredGameweekEntrant[];
}

/**
 * The retired Gameweek whole: every seat entered under the retired version,
 * with the three per-Gameweek figures the scorer wrote for it before the flip.
 *
 * Left joins, so a seat with nothing stored is a listed seat with three nulls
 * rather than a seat that vanished. The absent state is the alarm and the page
 * prints it as one.
 */
async function retiredGameweek(
  query: Query,
  season: string,
  competition: string,
  retired: RetiredGameweek
): Promise<Response> {
  const rows = await query(
    `-- roster: a retired match version's block (ADR-0042).
     select m.id, m.name,
            points.value as match_points,
            points.detail ->> 'qualification' as match_qualification,
            bets.value as bet_points,
            bets.detail ->> 'qualification' as bet_qualification,
            rps.value as rps
       from models m
       left join scores points
         on points.model_id = m.id and points.competition = $7
        and points.season = $1
        and points.track = 'match' and points.gw = $2
        and points.metric = $3
       left join scores bets
         on bets.model_id = m.id and bets.competition = $7
        and bets.season = $1
        and bets.track = 'match' and bets.gw = $2 and bets.metric = $4
       left join scores rps
         on rps.model_id = m.id and rps.competition = $7
        and rps.season = $1
        and rps.track = 'match' and rps.gw = $2 and rps.metric = $5
      where m.role = 'entrant' and m.prompt_version = $6
      order by m.id`,
    [
      season, retired.gw, MATCH_POINTS_METRIC, BET_POINTS_METRIC, RPS_METRIC,
      retired.version, competition
    ]
  );

  // `locked_in_gw` and not `gw`: the Gameweek a Fixture was scheduled into is
  // the source's, and the Gameweek whose Lock owned it is the record's
  // (ADR-0013, ADR-0015). The four Fixtures the calendar moved out of this one
  // were scheduled here and belong to a later Lock, so they are counted there.
  const [owned] = await query(
    `select count(*) as owned from fixtures
      where competition = $3 and season = $1 and locked_in_gw = $2`,
    [season, retired.gw, competition]
  );

  const entrants: RetiredGameweekEntrant[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    matchPoints: numberOrNull(row.match_points),
    betPoints: numberOrNull(row.bet_points),
    rps: numberOrNull(row.rps)
  }));

  // Whether anything is published at all, asked of all three figures and not of
  // the Match Points alone: a seat holding a Bet Points row and no Match Points
  // one publishes a number, and a block that decided on one column would print
  // it under a sentence saying nothing is stored.
  const published = entrants.some(
    ({ matchPoints, betPoints, rps }) =>
      matchPoints !== null || betPoints !== null || rps !== null
  );

  // Read off the rows rather than restated from the scorer's constants, for the
  // reason the leaderboard reads its own: the claim is that what the scorer
  // stored reaches a reader intact, and restating it would answer that question
  // with itself. Taken from whichever row has one, because a seat that settled
  // nothing has no row and therefore no sentence.
  //
  // It fails closed. The leaderboard's one documented fallback is a scored
  // Season with no ranking row anywhere; this block has no such state — a
  // figure here comes from a row, and a row carries the sentence — so a figure
  // published without one is a storage fault, and a reader is left with the
  // page's failure line rather than a number stripped of what it means.
  const qualification = (column: string): string | null => {
    if (!published) {
      return null;
    }
    const stored = textOrNull(
      rows.map((row) => row[column]).find((each) => each != null)
    );
    if (stored === null) {
      throw new Error(
        `The retired Gameweek's rows carry no ${column}, and a figure cannot `
        + "be published without it"
      );
    }
    return stored;
  };

  const body: RetiredGameweekBody = {
    season,
    promptVersion: retired.version,
    gw: retired.gw,
    matchPointsQualification: qualification("match_qualification"),
    betPointsQualification: qualification("bet_qualification"),
    evidenceCaveat: published ? RETIRED_GAMEWEEK_CAVEAT : null,
    fixtures: Number(owned?.owned ?? 0),
    entrants
  };
  return json(body, SCORED_CACHE);
}

function json(body: unknown, edgeCache: string): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cloudflare-cdn-cache-control": edgeCache,
      "cache-control": BROWSER_CACHE
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
   * is here because the Fixtures endpoint separates the pre-lock banner from
   * the committed view by it, and the seam is one function.
   */
  now: Date
): Promise<Response> {
  const { pathname } = new URL(request.url);

  // The Match track's three endpoints under `/api/{code}/` (ADR-0039), served
  // for the codes in `MATCH_PROMPT_COMPETITIONS` and nothing else -- the same
  // list the build generates its pages from, so a route and its endpoint cannot
  // disagree about which leagues exist. One segment answers all three, so a
  // Competition cannot be served by one of them and 404 on another.
  //
  // The lower-case spelling and no other. Matching case-insensitively would
  // serve one resource at four URLs, and the edge caches by URL: `/api/PL/` and
  // `/api/pl/` would hold separate entries of the lifetime spec 0017 states it
  // moves none of. A reader gets one spelling, and the other three are the 404
  // any other typo gets.
  //
  // Read before the FPL paths and unable to collide with them: `fpl` is not a
  // Competition code and never will be, the FPL track being the Premier League
  // by nature.
  const [, api, segment, endpoint, ...rest] = pathname.split("/");
  const competition = MATCH_PROMPT_COMPETITIONS
    .find((code) => code.toLowerCase() === segment);
  if (api === "api" && competition !== undefined && rest.length === 0) {
    if (endpoint === "leaderboard") {
      return await leaderboard(query, season, competition);
    }
    if (endpoint === "fixtures") {
      return await fixtures(query, season, competition, now);
    }
    if (endpoint === "entrants") {
      return await entrants(query, season, competition);
    }
    // Served only where there is a retired Gameweek to serve. A Competition
    // that never restarted has no block on its page and no body for one to be
    // built from, and an empty body would be a claim that something was retired
    // and scored nought — so it falls through to the 404 every other unserved
    // path gets.
    if (endpoint === "retired") {
      const retired = retiredGameweekOf(competition);
      if (retired !== null) {
        return await retiredGameweek(query, season, competition, retired);
      }
    }
  }

  if (pathname === "/api/fpl/leaderboard") {
    return await fplLeaderboard(query, season);
  }
  if (pathname === "/api/fpl/squads") {
    return await fplSquads(query, season);
  }
  if (pathname === "/api/fpl/entrants") {
    return await fplEntrants(query, season);
  }
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

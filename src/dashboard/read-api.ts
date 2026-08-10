import { MATCH_PROMPT_VERSION } from "../predictions/openrouter-entrant.js";
import {
  BET_POINTS_QUALIFICATION, BET_POINTS_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_QUALIFICATION, MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC
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
 * do not change on the same clock (ADR-0028). The leaderboard moves when the
 * daily scoring run writes.
 *
 * Caching must also be enabled in the Worker's configuration: the header alone
 * does not cache a Worker's response.
 */
const LEADERBOARD_CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

interface LeaderboardEntrant {
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
 * `numeric` reaches one driver as a string and the other as a number, and JSON
 * has one number. Null stays null, which is the pre-season state and not a zero.
 */
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const textOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

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
  // The Gameweek the Season has been *scored* through, which is not the last
  // Gameweek holding a `scores` row. Coherence, Gaps and Repairs are
  // behavioural: the scorer answers them the moment a Lock passes, so a Locked
  // and unplayed Gameweek carries rows of its own. Reading `max(gw)` over all
  // of them would call Gameweek 1 scored while its matches are still being
  // played, and would move a Season's ranking to a Gameweek that has no
  // ranking — blanking the fourteen Gameweeks that do.
  //
  // The per-Gameweek `rps` row is the fact that answers, because it is the one
  // the scorer writes for a Gameweek exactly when both halves of "scored" hold.
  // It is outcome-dependent, so it is written only over Fixtures that settled;
  // and the Reference Lines carry it whatever the Entrants did, so a Gameweek
  // every Entrant Gapped still has one — which the Match Points rows do not,
  // and a whole roster Gapping one Gameweek is an OpenRouter outage that
  // ADR-0009 enters this roster knowing about.
  //
  // The cumulative counterpart would be wrong here: it is written over every
  // Gameweek up to its target, so it appears on a Gameweek that settled nothing
  // as soon as an earlier one settled something.
  //
  // Reading anything the scorer has written on the Gameweek would be wrong in
  // the other direction, and in two ways. Coherence, Gaps and Repairs are
  // behavioural — answerable the moment a Lock passes — so a Gameweek being
  // played would read as scored. Pairing those with a settled Fixture does not
  // save it either: results are ingested by a job of their own, hours before
  // the scoring run, and in that window both facts hold while nothing has been
  // scored at all.
  //
  // Every read of `scores` filters `track = 'match'`. A seat can hold both
  // tracks, and a read missing it lets an FPL demonstration figure be read as a
  // Match one — in a ranking, which is the one place ADR-0003 is careful never
  // to let the tracks meet.
  const [scored] = await query(
    `select max(gw) as through_gw from scores
      where season = $1 and track = 'match' and metric = $2`,
    [season, RPS_METRIC]
  );
  const throughGw = numberOrNull(scored?.through_gw);

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

  // An Entrant with no row on a Season that has been scored settled nothing,
  // which is a nought and not an absence: the scorer writes no
  // outcome-dependent row for an Entrant that Gapped every Fixture, and reading
  // that back as null would put a Season-long Gap on the page in the one shape
  // reserved for a Season that has not started. Null is the pre-season state
  // and belongs to `throughGw` alone.
  const scoredOrNull = (value: unknown): number | null =>
    throughGw === null ? null : Number(value ?? 0);

  const entrants: LeaderboardEntrant[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    baseModelClass: textOrNull(row.base_model_class),
    matchPoints: scoredOrNull(row.match_points),
    betPoints: scoredOrNull(row.bet_points),
    n: scoredOrNull(row.n)
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

  return json({
    season,
    throughGw,
    settledFixtures: Number(settled?.settled ?? 0),
    matchPointsQualification:
      qualification("match_qualification", MATCH_POINTS_QUALIFICATION),
    betPointsQualification:
      qualification("bet_qualification", BET_POINTS_QUALIFICATION),
    entrants
  }, LEADERBOARD_CACHE);
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
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

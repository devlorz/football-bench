import { MATCH_PROMPT_VERSION } from "../predictions/openrouter-entrant.js";
import {
  BET_POINTS_SEASON_TO_DATE_METRIC, MATCH_POINTS_SEASON_TO_DATE_METRIC
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
 * The qualifications are read out of the rows rather than imported from the
 * scorer, because the claim being made is that what the scorer stored reaches a
 * reader intact. Restating the constant here would answer that question with
 * itself.
 */
async function leaderboard(query: Query, season: string): Promise<Response> {
  // Every read of `scores` filters `track = 'match'`. A seat can hold both
  // tracks, and a read missing it lets an FPL demonstration figure be read as a
  // Match one — in a ranking, which is the one place ADR-0003 is careful never
  // to let the tracks meet.
  const [scored] = await query(
    "select max(gw) as through_gw from scores where season = $1"
    + " and track = 'match'",
    [season]
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

  const entrants: LeaderboardEntrant[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    baseModelClass: textOrNull(row.base_model_class),
    matchPoints: numberOrNull(row.match_points),
    betPoints: numberOrNull(row.bet_points),
    n: numberOrNull(row.n)
  }));

  return json({
    season,
    throughGw,
    settledFixtures: Number(settled?.settled ?? 0),
    // One string per ranking rather than one per row: the scorer writes the
    // same sentence into every row a ranking can be read off, and the page
    // shows it once under the table.
    matchPointsQualification: textOrNull(rows[0]?.match_qualification),
    betPointsQualification: textOrNull(rows[0]?.bet_qualification),
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

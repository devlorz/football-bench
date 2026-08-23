/**
 * The combined ranking's whole arithmetic: which Competitions count, what one
 * row is, and the totals both columns rank by. No DOM, no database, no
 * fetch — the page that will call this is a fetch and a render (spec 0014),
 * and this is the module that renders perfectly while being wrong instead.
 * Prior art is `competition-view.ts` and `fpl-view.ts` (spec 0025).
 */

import type { LeaderboardBody } from "../../src/dashboard/read-api.js";
import { entrantSlug } from "./entrant-link.js";

/**
 * One Competition's leaderboard, labelled with the code it was fetched for.
 *
 * The page decides the fetch list itself, from `MATCH_PROMPT_COMPETITIONS`
 * directly, and hands the labelled bodies in here — this module holds no
 * copy of that list. `entrant-link.ts`'s own docstring is the reason: that
 * constant lives in `src/predictions/openrouter-entrant.ts`, which drags in
 * `zod` and the rest of the server-side prompt machinery, and this module
 * ships to a browser. Re-exporting it here would be the fifty-kilobyte leak
 * that file was written to stop happening a second time.
 */
export interface CompetitionLeaderboard {
  competition: string;
  body: LeaderboardBody;
}

/** One ranked row: one seat, summed across the covered leagues. */
export interface OverallRow {
  slug: string;
  name: string;
  baseModelClass: string | null;
  matchPoints: number;
  betPoints: number;
  /**
   * Whether this row is an Exhibition Run's (ADR-0052). A flag and not the
   * per-league "ran after Gameweek N" the leaderboard carries: that label
   * names one Competition's Gameweek and this row spans several, so the page
   * says what the row is and leaves which Gameweek to the league it came from.
   */
  exhibition: boolean;
}

/** One covered league's contribution to the evidence line. */
export interface OverallFixtures {
  competition: string;
  settledFixtures: number;
}

export type OverallRanking =
  | { kind: "nothing-covered" }
  | {
      kind: "ranking";
      /** The covered Competitions, in the order they are rendered. */
      covered: string[];
      matchRanked: OverallRow[];
      betRanked: OverallRow[];
      fixtures: OverallFixtures[];
      totalFixtures: number;
    };

/**
 * A Competition enters the sum when it is Active *and* scored: `active` is
 * true and `throughGw` is not null. An Active league with nothing scored
 * would contribute a nought that reads as a score, and a league nobody has
 * opened has no seats to contribute at all (ADR-0051).
 */
const isCovered = ({ body }: CompetitionLeaderboard): boolean =>
  body.active && body.throughGw !== null;

/**
 * Every row, keyed by the seat's slug and summed only over the Competitions
 * `isCovered` kept. The covered set is decided once, above this function, and
 * never re-derived per row: a slug absent from one covered league's
 * `entrants` simply adds nothing there, which is the nought ADR-0051 asks
 * for rather than a shrunken set of leagues for that one row.
 *
 * An Exhibition Run is summed and ranked like any other row (ADR-0052), and
 * carries `exhibition` so the page can label it and show the caveat. What it
 * does not carry is the league-by-league story: its Gameweek coverage need
 * not be the roster's, and it may hold seats in fewer leagues than the sum
 * spans, so its total can be over less than every other row's. The page says
 * that in its qualification; the arithmetic does not correct for it, exactly
 * as it does not correct for leagues of different sizes.
 *
 * Keyed apart from the roster's rows rather than by slug alone. One Base Model
 * can hold an Entrant's seat in one league and an Exhibition Run's in another
 * -- that is the ordinary way a late arrival is checked -- and a shared key
 * would add the two into one row, publishing a total that is half a
 * competitor's and half a replay's under a single name.
 */
const summedRows = (covered: readonly CompetitionLeaderboard[]): OverallRow[] => {
  const rows = new Map<string, OverallRow>();
  for (const { body } of covered) {
    for (const entrant of body.entrants) {
      const exhibition = entrant.exhibition !== null;
      const slug = entrantSlug(entrant.id);
      const key = exhibition ? `exhibition:${slug}` : slug;
      // Name and Base Model Class are read off whichever covered league's
      // body names this slug first; every league seats the same Season
      // Roster (ADR-0038), so they do not vary between them.
      const row = rows.get(key) ?? {
        slug,
        name: entrant.name,
        baseModelClass: entrant.baseModelClass,
        matchPoints: 0,
        betPoints: 0,
        exhibition
      };
      row.matchPoints += entrant.matchPoints ?? 0;
      row.betPoints += entrant.betPoints ?? 0;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
};

/**
 * Descending by `key`, stable: two rows level on the column being ranked keep
 * the order they arrived in, which is the order the leaderboard's own sort
 * already ranks ties in (`Array.prototype.sort` has been a stable sort since
 * ES2019).
 */
const rankedBy = (
  rows: readonly OverallRow[], key: "matchPoints" | "betPoints"
): OverallRow[] => [...rows].sort((a, b) => b[key] - a[key]);

/**
 * The whole of the combined ranking's arithmetic, from the four leaderboard
 * bodies a page fetched. Two states, and which one applies is read off what
 * this returns rather than an empty array a caller has to interpret: an empty
 * `covered` list is not a ranking of nobody, and every other field below
 * would be there to be misread as one.
 */
export const overallRanking = (
  leaderboards: readonly CompetitionLeaderboard[]
): OverallRanking => {
  const covered = leaderboards.filter(isCovered);
  if (covered.length === 0) return { kind: "nothing-covered" };

  const rows = summedRows(covered);
  const fixtures = covered.map(({ competition, body }) => ({
    competition, settledFixtures: body.settledFixtures
  }));

  return {
    kind: "ranking",
    covered: covered.map(({ competition }) => competition),
    matchRanked: rankedBy(rows, "matchPoints"),
    betRanked: rankedBy(rows, "betPoints"),
    fixtures,
    totalFixtures: fixtures.reduce((sum, { settledFixtures }) => sum + settledFixtures, 0)
  };
};

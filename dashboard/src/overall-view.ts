/**
 * The combined ranking's whole arithmetic: which Competitions count, what one
 * row is, and the totals both columns rank by. No DOM, no database, no
 * fetch — the page that will call this is a fetch and a render (spec 0014),
 * and this is the module that renders perfectly while being wrong instead.
 * Prior art is `competition-view.ts` and `fpl-view.ts` (spec 0025).
 */

import type { LeaderboardBody, LeaderboardEntrant } from "../../src/dashboard/read-api.js";
import { isLeaderboardPair, pairUp } from "./combine-rows.js";
import { entrantSlug } from "./entrant-link.js";
import {
  COMBINED_RANKING_CLOSING,
  COMBINED_RANKING_CUP_CLAUSE,
  COMBINED_RANKING_EXHIBITION_CLAUSE,
  COMBINED_RANKING_GUEST_CLAUSE,
  COMBINED_RANKING_PREFACE
} from "./overall-caveat.js";

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

/** One ranked row: one seat, summed across the covered Competitions. */
export interface OverallRow {
  slug: string;
  name: string;
  baseModelClass: string | null;
  /**
   * As on the leaderboard row it was summed from (spec 0029): ticket 0119
   * finds the Exhibition and Guest rows of one Base Model by these.
   */
  role: LeaderboardEntrant["role"];
  baseModel: LeaderboardEntrant["baseModel"];
  matchPoints: number;
  betPoints: number;
  /**
   * Whether this row is an Exhibition Run's (ADR-0052). A flag and not the
   * per-Competition "ran after Gameweek N" the leaderboard carries: that
   * label names one Competition's Gameweek and this row spans several, so the
   * page says what the row is and leaves which Gameweek to the Competition it
   * came from.
   */
  exhibition: boolean;
  /**
   * A Guest Seat's row (ADR-0064): the covered Competitions it sits in, in the
   * covered order, so the page can say a total over fewer of them is one.
   * Null on every other row.
   */
  guest: { competitions: string[] } | null;
  /**
   * On a row combining one Base Model's Exhibition Run and Guest (ticket
   * 0119): the Competitions each part answered in, the Exhibition's only where
   * a replayed answer is in range. Absent on every other row.
   */
  parts?: { exhibition: string[]; guest: string[] };
}

/** One covered Competition's contribution to the evidence line. */
export interface OverallFixtures {
  competition: string;
  settledFixtures: number;
}

export type OverallRanking =
  | { kind: "nothing-covered" }
  /**
   * Bodies from different Editions, which are never summed (ADR-0061): the
   * page names each Competition's Edition instead of a total.
   */
  | { kind: "mixed-editions"; editions: { competition: string; number: number }[] }
  | {
      kind: "ranking";
      /** The covered Competitions, in the order they are rendered. */
      covered: string[];
      matchRanked: OverallRow[];
      betRanked: OverallRow[];
      fixtures: OverallFixtures[];
      totalFixtures: number;
      /**
       * The qualification sentence under the table, in this order: the
       * Edition set summed and the cup's absence, the preface, the Exhibition
       * clause when an Exhibition Run is ranked (ADR-0052), the Guest clause
       * when a Guest is (ADR-0064), and the closing. Each clause states that
       * its row's total may be over fewer Fixtures and Competitions,
       * uncorrected.
       */
      qualification: string;
      /**
       * The recall-versus-skill caveat, present exactly when at least one
       * Exhibition Run is in the combined ranking and null otherwise (ADR-0052).
       * Read from the covered leaderboard bodies rather than imported.
       */
      exhibitionCaveat: string | null;
      /**
       * The typed-endpoint sentence (ADR-0059), present exactly when a
       * `typesafe` row is in the combined ranking — beside `exhibitionCaveat`
       * and never instead of it. Read from the covered leaderboard bodies the
       * same way.
       */
      typesafeCaveat: string | null;
      /**
       * Whether some Base Model has both an Exhibition and a Guest row here,
       * which is when the page shows the toggle (ticket 0119).
       */
      splittable: boolean;
    };

/**
 * A Competition enters the sum when it is Active *and* scored: `active` is
 * true and `throughGw` is not null. An Active Competition with nothing
 * scored would contribute a nought that reads as a score, and a Competition
 * nobody has opened has no seats to contribute at all (ADR-0051).
 */
const isCovered = ({ body }: CompetitionLeaderboard): boolean =>
  body.active && body.throughGw !== null;

/**
 * Every row, keyed by the seat's slug and summed only over the Competitions
 * `isCovered` kept. The covered set is decided once, above this function, and
 * never re-derived per row: a slug absent from one covered Competition's
 * `entrants` simply adds nothing there, which is the nought ADR-0051 asks
 * for rather than a shrunken set of Competitions for that one row.
 *
 * An Exhibition Run is summed and ranked like any other row (ADR-0052), and
 * carries `exhibition` so the page can label it and show the caveat. What it
 * does not carry is the Competition-by-Competition story: its Gameweek
 * coverage need not be the roster's, and it may hold seats in fewer
 * Competitions than the sum spans, so its total can be over less than every
 * other row's. The page says that in its qualification; the arithmetic does
 * not correct for it, exactly as it does not correct for Competitions of
 * different sizes.
 *
 * Keyed apart from the roster's rows rather than by slug alone. One Base Model
 * can hold an Entrant's seat in one Competition and an Exhibition Run's in
 * another -- that is the ordinary way a late arrival is checked -- and a
 * shared key would add the two into one row, publishing a total that is half
 * a competitor's and half a replay's under a single name. A Guest is keyed
 * apart by the same rule (spec 0029, story 32), and from an Exhibition Run of
 * its Base Model too: `combined` below merges those two afterwards (ticket
 * 0119), and the split view is these rows as they are.
 */
const summedRows = (
  covered: readonly CompetitionLeaderboard[]
): { rows: OverallRow[]; inRange: Map<OverallRow, string[]> } => {
  const rows = new Map<string, OverallRow>();
  // Where each Exhibition row has a replayed answer in range, for a combined
  // row's label and caveat.
  const inRange = new Map<OverallRow, string[]>();
  for (const { competition, body } of covered) {
    for (const entrant of body.entrants) {
      const exhibition = entrant.exhibition !== null;
      // `!= null` keeps a body cached from before the field existed.
      const guest = entrant.guest != null;
      const slug = entrantSlug(entrant.id);
      const key = exhibition ? `exhibition:${slug}` : guest ? `guest:${slug}` : slug;
      // Name, Base Model Class and Base Model are read off whichever covered
      // Competition's body names this key first. They do not vary between
      // Competitions: every one seats the same Season Roster (ADR-0038), and
      // an Exhibition's or a Guest's rows under one slug are one Base Model's
      // seats by ADR-0064's id convention.
      const row = rows.get(key) ?? {
        slug,
        name: entrant.name,
        baseModelClass: entrant.baseModelClass,
        role: entrant.role,
        baseModel: entrant.baseModel,
        matchPoints: 0,
        betPoints: 0,
        exhibition,
        guest: guest ? { competitions: [] } : null
      };
      row.guest?.competitions.push(competition);
      if (exhibition) {
        const answered = inRange.get(row) ?? [];
        if (entrant.exhibition!.firstGw != null) answered.push(competition);
        inRange.set(row, answered);
      }
      row.matchPoints += entrant.matchPoints ?? 0;
      row.betPoints += entrant.betPoints ?? 0;
      rows.set(key, row);
    }
  }
  return { rows: [...rows.values()], inRange };
};

/**
 * The Base Models whose rows must not combine because some covered
 * Competition refuses its pair: a body cached before `firstGw` existed, a part
 * doubled in one Competition, or a replayed range reaching its Guest's first
 * Lock there. The same test the Competition's own page applies
 * (`isLeaderboardPair`), so `/overall` never combines what that page splits.
 */
const refused = (covered: readonly CompetitionLeaderboard[]): Set<string> => {
  const out = new Set<string>();
  for (const { body } of covered) {
    for (const row of body.entrants) {
      if (row.exhibition === null) continue;
      const mine = body.entrants.filter(({ baseModel }) => baseModel === row.baseModel);
      const guests = mine.filter(({ guest }) => guest != null);
      if (row.exhibition.firstGw === undefined
        || mine.filter(({ exhibition }) => exhibition !== null).length > 1
        || guests.length > 1
        || (guests.length === 1 && !isLeaderboardPair(row, guests[0]!))) {
        out.add(row.baseModel);
      }
    }
  }
  return out;
};

/**
 * Each Exhibition row merged with the Guest row of its Base Model (ticket
 * 0119), by the pairing every combining page shares (`pairUp`).
 */
const combined = (
  rows: readonly OverallRow[],
  inRange: ReadonlyMap<OverallRow, string[]>,
  refusedBaseModels: ReadonlySet<string>
): OverallRow[] => pairUp(
  rows,
  (row) => row.exhibition ? "exhibition" : row.guest !== null ? "guest" : null,
  (row) => !refusedBaseModels.has(row.baseModel),
  (row, guest): OverallRow => {
    const exhibition = inRange.get(row) ?? [];
    return {
      ...guest,
      matchPoints: row.matchPoints + guest.matchPoints,
      betPoints: row.betPoints + guest.betPoints,
      exhibition: exhibition.length > 0,
      parts: { exhibition, guest: guest.guest!.competitions }
    };
  }
);

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
 * The whole of the combined ranking's arithmetic, from the leaderboard bodies
 * a page fetched, one per listed Competition. Two states, and which one
 * applies is read off what this returns rather than an empty array a caller
 * has to interpret: an empty `covered` list is not a ranking of nobody, and
 * every other field below would be there to be misread as one.
 */
export const overallRanking = (
  leaderboards: readonly CompetitionLeaderboard[],
  { split = false }: { split?: boolean } = {}
): OverallRanking => {
  // Every body, covered or not: an Edition that has scored nothing yet still
  // makes the set two Editions.
  const editions = leaderboards.map(({ competition, body }) => ({
    competition, number: body.edition.number
  }));
  if (new Set(editions.map(({ number }) => number)).size > 1) {
    return { kind: "mixed-editions", editions };
  }
  const covered = leaderboards.filter(isCovered);
  if (covered.length === 0) return { kind: "nothing-covered" };

  const { rows: splitRows, inRange } = summedRows(covered);
  const combinedRows = combined(splitRows, inRange, refused(covered));
  const rows = split ? splitRows : combinedRows;
  const fixtures = covered.map(({ competition, body }) => ({
    competition, settledFixtures: body.settledFixtures
  }));
  // Only while a row still carries a replayed answer: a combined row whose
  // Exhibition part is out of range carries no caveat (ticket 0119).
  const exhibitionCaveat = rows.some(({ exhibition }) => exhibition)
    ? covered.find(({ body }) => body.exhibitionCaveat !== null)?.body.exhibitionCaveat ?? null
    : null;
  const typesafeCaveat =
    covered.find(({ body }) => body.typesafeCaveat !== undefined)
      ?.body.typesafeCaveat ?? null;
  // Which set was summed heads the sentence, and the cup's absence with it
  // (ADR-0060, ADR-0061).
  const editionClause = `Edition ${editions[0]!.number} of `
    + new Intl.ListFormat("en").format(covered.map(({ competition }) => competition))
    + ` is summed here; ${COMBINED_RANKING_CUP_CLAUSE}`;
  const qualification = [
    editionClause,
    COMBINED_RANKING_PREFACE,
    exhibitionCaveat !== null ? COMBINED_RANKING_EXHIBITION_CLAUSE : null,
    rows.some(({ guest }) => guest !== null) ? COMBINED_RANKING_GUEST_CLAUSE : null,
    COMBINED_RANKING_CLOSING
  ].filter((part) => part !== null).join(" ");

  return {
    kind: "ranking",
    covered: covered.map(({ competition }) => competition),
    matchRanked: rankedBy(rows, "matchPoints"),
    betRanked: rankedBy(rows, "betPoints"),
    fixtures,
    totalFixtures: fixtures.reduce((sum, { settledFixtures }) => sum + settledFixtures, 0),
    qualification,
    exhibitionCaveat,
    typesafeCaveat,
    splittable: combinedRows.length < splitRows.length
  };
};

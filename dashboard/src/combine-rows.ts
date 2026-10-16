/**
 * One Base Model's Exhibition Run and Guest Seat as one row (ticket 0119, spec
 * 0029). The read API returns the two split; a page combines them here unless
 * the reader asked `?rows=split`. Only those two roles combine: an Entrant's or
 * a Shadow's row passes through whatever its Base Model (story 32). No DOM, no
 * fetch, beside `overall-view.ts`, which combines `/overall`'s rows itself.
 */

import type {
  EntrantGameweek, EntrantRecord, LeaderboardEntrant
} from "../../src/dashboard/read-api.js";

/** Which Gameweeks each part answered; `exhibition` is null when none is in range. */
export interface Parts {
  exhibition: { firstGw: number; lastGw: number } | null;
  guest: { fromGw: number };
}

export type CombinedEntrant = LeaderboardEntrant & { parts?: Parts };
export type CombinedGameweek = EntrantGameweek & { part?: "exhibition" | "guest" };
export type CombinedRecord = Omit<EntrantRecord, "gameweeks"> & {
  gameweeks: CombinedGameweek[];
  parts?: Parts;
};

/** A sum that stays null only when both sides are: nothing scored is not nought. */
const add = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/** Which part a row is, or null for a row that never combines. */
export type PartOf<T> = (row: T) => "exhibition" | "guest" | null;

/**
 * Each Exhibition row merged with the Guest row of its Base Model, in the
 * Exhibition row's place, and every other row as it came. Shared by every page
 * that combines, `/overall` included, so the rule is decided once:
 * - only exactly one Exhibition row and one Guest row of a Base Model pair. A
 *   Guest withdrawn and seated again is two Guest rows, and guessing which one
 *   pairs would count a part twice or strand one;
 * - never on a missing `baseModel`: a body the edge cached before it existed is
 *   served for up to an hour after the deploy that added it (`SCORED_CACHE`),
 *   and two `undefined`s must not match. `partOf` reads `exhibition` and
 *   `guest`, never `role`, for the same reason;
 * - never where `isPair` refuses, which is each caller's own staleness and
 *   overlap test.
 */
export const pairUp = <T extends { baseModel: string }, R>(
  rows: readonly T[],
  partOf: PartOf<T>,
  isPair: (exhibition: T, guest: T) => boolean,
  merge: (exhibition: T, guest: T) => R
): (T | R)[] => {
  const merged = new Set<T>();
  const out = rows.map((row) => {
    if (partOf(row) !== "exhibition" || row.baseModel == null) return row;
    const mine = rows.filter((other) => other.baseModel === row.baseModel);
    const exhibitions = mine.filter((other) => partOf(other) === "exhibition");
    const guests = mine.filter((other) => partOf(other) === "guest");
    if (exhibitions.length !== 1 || guests.length !== 1 || !isPair(row, guests[0]!)) {
      return row;
    }
    merged.add(guests[0]!);
    return merge(row, guests[0]!);
  });
  return out.filter((row) => !merged.has(row as T));
};

/** Which part a leaderboard row or a record is. */
const partOfRow: PartOf<{ exhibition: object | null; guest: object | null }> = (row) =>
  row.exhibition !== null ? "exhibition" : row.guest != null ? "guest" : null;

/**
 * Whether one Competition's Exhibition and Guest rows may combine: not from a
 * body cached before `firstGw` existed, which has no range to name, and not
 * where the replayed range reaches the Guest's first Lock. 0118's cap keeps the
 * two apart; this keeps a combined total from counting a Gameweek twice if
 * anything ever does not.
 */
export const isLeaderboardPair = (e: LeaderboardEntrant, g: LeaderboardEntrant): boolean =>
  e.exhibition!.firstGw !== undefined
  && (e.exhibition!.lastGw === null || e.exhibition!.lastGw < g.guest!.fromGw);

/** A leaderboard's rows, combined. The page ranks what this returns. */
export const combineEntrants = (
  entrants: readonly LeaderboardEntrant[]
): CombinedEntrant[] => pairUp(
  entrants,
  partOfRow,
  isLeaderboardPair,
  (e, g): CombinedEntrant => {
    const { firstGw, lastGw } = e.exhibition!;
    const inRange = firstGw !== null && lastGw !== null;
    return {
      ...g,
      matchPoints: add(e.matchPoints, g.matchPoints),
      betPoints: add(e.betPoints, g.betPoints),
      n: add(e.n, g.n),
      // Kept only while a replayed answer is in range: the caveat is keyed on it.
      exhibition: inRange ? e.exhibition : null,
      parts: {
        exhibition: inRange ? { firstGw, lastGw } : null,
        guest: { fromGw: g.guest!.fromGw }
      }
    };
  }
);

/**
 * A record's rows, combined: one history whose Gameweeks each name the part
 * that answered. The Exhibition record spans the field's Gameweeks with noughts
 * where it answered nothing, so only its weeks before the Guest's first Lock
 * are kept. Records whose answered weeks overlap never combine, so every
 * total summed below is over weeks the history shows once.
 */
export const combineRecords = (
  records: readonly EntrantRecord[]
): CombinedRecord[] => pairUp(
  records,
  partOfRow,
  (e, g) => !e.gameweeks.some(({ gw, settled }) => gw >= g.guest!.fromGw && settled > 0),
  (e, g): CombinedRecord => {
    const fromGw = g.guest!.fromGw;
    const replayed = e.gameweeks.filter(({ gw }) => gw < fromGw);
    const answered = replayed.filter(({ settled }) => settled > 0);
    const inRange = answered.length > 0;
    const n = add(e.n, g.n);
    return {
      ...g,
      matchPoints: add(e.matchPoints, g.matchPoints),
      betPoints: add(e.betPoints, g.betPoints),
      // The `n`-weighted mean; a side with no settled Fixture weighs nothing.
      rps: e.rps === null || !e.n ? g.rps
        : g.rps === null || !g.n ? e.rps
        : (e.rps * e.n + g.rps * g.n) / n!,
      n,
      exhibition: inRange ? e.exhibition : null,
      // Over both sides' entries, so one only a single part holds is kept.
      tiers: [...new Set([...g.tiers, ...e.tiers].map(({ points }) => points))]
        .map((points) => ({
          points,
          count: [g, e].reduce((sum, { tiers }) =>
            sum + (tiers.find((tier) => tier.points === points)?.count ?? 0), 0)
        })),
      markets: [...new Set([...g.markets, ...e.markets].map(({ market }) => market))]
        .map((market) => {
          const both = [g, e].map(({ markets }) => markets.find((m) => m.market === market));
          return {
            market,
            hits: both.reduce((sum, m) => sum + (m?.hits ?? 0), 0),
            n: both.reduce((sum, m) => sum + (m?.n ?? 0), 0)
          };
        }),
      gameweeks: [
        ...(inRange ? replayed : []).map((week) => ({ ...week, part: "exhibition" as const })),
        ...g.gameweeks.map((week) => ({ ...week, part: "guest" as const }))
      ],
      parts: {
        exhibition: inRange
          ? { firstGw: answered[0]!.gw, lastGw: answered.at(-1)!.gw }
          : null,
        guest: { fromGw }
      }
    };
  }
);

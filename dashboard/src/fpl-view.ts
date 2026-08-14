/**
 * Every sentence and mark the FPL ranking is read through, apart from the page
 * that prints them.
 *
 * They live here for the reason `chart-domain.ts` does: each of them can be
 * wrong without looking wrong. A span that says "Gameweeks 1-5" over a record
 * missing Gameweek 4, a footnote naming the Gameweek the movement was not
 * measured against, a status line that claims a Gameweek settled before one
 * has, or a movement marker that reads a fall as a rise all render perfectly.
 * The page around them is a script over a fetch and has no test; these do —
 * and a sentence the page builds for itself is one outside that rule, so none
 * of them are built there.
 */

/** Which way an Entrant moved, and how the design colours it. */
export interface Movement {
  mark: string;
  tone: "up" | "down" | "flat" | "none";
}

/**
 * The design's `▲n` for a rise, `▼n` for a fall and `–` for holding a place.
 *
 * No movement at all -- the first Settled Gameweek of the record, where there
 * is no snapshot behind the ranking to measure against -- draws nothing. The
 * dash is the mark for "did not move", and an Entrant nothing is known about
 * has not stood still.
 */
export const movement = (places: number | null): Movement => {
  if (places === null) return { mark: "", tone: "none" };
  if (places > 0) return { mark: `▲${places}`, tone: "up" };
  if (places < 0) return { mark: `▼${-places}`, tone: "down" };
  return { mark: "–", tone: "flat" };
};

/**
 * A Squad value as the design prints it: tenths of a million to one decimal,
 * with no unit, because the column is headed "Squad value" and the whole column
 * carries the same one.
 */
export const squadValue = (tenths: number | null): string =>
  tenths === null ? "—" : (tenths / 10).toFixed(1);

/**
 * The Gameweeks the record actually holds, in order: the span, less the holes
 * announced inside it.
 *
 * Derived from the three fields the body states rather than gathered back out
 * of the Race variant's series. The endpoint computed `missingGws` by taking
 * exactly this difference, so this reads the answer it published — and a page
 * that re-derives the record from the payload of one chart is a page that
 * disagrees with the body the moment that chart changes shape.
 */
const settledGws = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): number[] =>
  fromGw === null || throughGw === null
    ? []
    : Array.from(
        { length: throughGw - fromGw + 1 },
        (_, offset) => fromGw + offset
      ).filter((gw) => !missingGws.includes(gw));

/**
 * The kicker beside the title: what the ranking is cumulative over, and any
 * Gameweek inside that span the record holds nothing for.
 *
 * The hole is named rather than smoothed over. A Gameweek any Entrant stored no
 * Manager State in is removed from every Season path (ADR-0011), so it is in no
 * total on the page -- and "Gameweeks 1-5" over a record that skipped one is a
 * claim about five Gameweeks that four of them answer.
 */
export const gameweekSpan = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): string => {
  const span = fromGw === null || throughGw === null
    ? "no Gameweek settled"
    : fromGw === throughGw
      ? `Gameweek ${throughGw}`
      : `Gameweeks ${fromGw}–${throughGw}`;
  const missing = missingGws.length === 0
    ? ""
    : ` · not in the record: ${missingGws.map((gw) => `GW${gw}`).join(", ")}`;
  return `Cumulative, ${span}${missing}`;
};

/**
 * The Season as the rest of the site prints it. One place, because the header
 * and the pre-Season panel both say it and two spellings of one Season on one
 * page is a page that cannot decide what it is showing.
 */
export const seasonLabel = (season: string): string => season.replace("-", "/");

/**
 * What the Δ column is measured against, or nothing at all.
 *
 * The last Gameweek the record holds before the one on screen, and never
 * `throughGw − 1`: a record that skipped a Gameweek has no snapshot there, and
 * the movement beside every row was measured against the last Gameweek that has
 * one. Naming the wrong Gameweek is the quietest error on the page -- the
 * sentence reads perfectly either way.
 *
 * It takes the same three fields the kicker does, so the whole of the step from
 * a body to a Gameweek is here under test, and the page hands over what it was
 * given rather than working any of it out on the way.
 *
 * At the first Settled Gameweek there is nothing behind the ranking, the Δ
 * column is empty, and the sentence would be naming a Gameweek that does not
 * exist. It says nothing instead.
 */
export const deltaNote = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): string => {
  const previousGw = settledGws(fromGw, throughGw, missingGws).at(-2);
  return previousGw === undefined
    ? ""
    : `Δ is the change against the cumulative snapshot at GW${previousGw}.`;
};

/**
 * The header's status line. A Season with nothing settled says so rather than
 * showing a Gameweek nought.
 */
export const statusLine = (
  season: string,
  throughGw: number | null,
  entrants: number
): string => [
  `Season ${seasonLabel(season)}`,
  throughGw === null ? "no Gameweek settled" : `GW${throughGw} settled`,
  `${entrants} ${entrants === 1 ? "entrant" : "entrants"}`
].join(" · ");

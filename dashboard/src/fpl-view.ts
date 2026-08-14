/**
 * Every sentence, mark and position the FPL ranking is read through, apart from
 * the page that prints them.
 *
 * They live here for the reason `chart-domain.ts` does: each of them can be
 * wrong without looking wrong. A span that says "Gameweeks 1-5" over a record
 * missing Gameweek 4, a footnote naming the Gameweek the movement was not
 * measured against, a status line that claims a Gameweek settled before one
 * has, a movement marker that reads a fall as a rise, or a chart whose labels
 * have swapped lines all render perfectly.
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
 *
 * The Race variant's own axis is labelled from this for the same reason: a
 * Gameweek settles for the whole field or for none of it (ADR-0011), so the
 * Gameweeks are a fact about the record and not about whichever Entrant the
 * page happened to read a series off.
 */
export const settledGws = (
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
 * The Cards variant's Chips tag, which counts in words as well as in figures.
 *
 * One Chip is a chip. The table's own column is the bare number under a header
 * that says what it counts, so it needs none of this; a tile carries its own
 * noun and a tile reading "1 chips" is the only thing on it that can be wrong
 * without being a wrong figure.
 */
export const chipsTag = (remaining: number | null): string =>
  remaining === null ? "—" : `${remaining} ${remaining === 1 ? "chip" : "chips"}`;

/** How the design draws a place in the field, wherever that place is drawn. */
export interface RankBand {
  /** The weight: the leader, the two behind it, or the rest of the field. */
  band: "1" | "top" | "rest";
  /** The dash the design gives third place, so second and third stay apart. */
  dashed: boolean;
}

/**
 * Which of the design's three weights a rank is drawn at.
 *
 * A band and never a tier: CONTEXT.md keeps that word for the Match Points tier
 * and nothing else, and this is a place in the FPL ranking.
 *
 * One classification for the whole page — the Race line, the name at the end of
 * it and the Cards tile are three pictures of one hierarchy, and three readings
 * of `rank` are three chances for them to disagree about who the leader is. The
 * dash is part of the same answer for the same reason: it was the one thing the
 * page still read `rank` a second time to decide.
 *
 * Here rather than in the page because a leader drawn in the colour of the
 * ninth renders perfectly, which is the whole of what this module is for. An
 * Entrant with no rank at all is the rest of the field: ranks are null before
 * the first Settled Gameweek, where the Race is not drawn, so nothing reaches
 * this that a lighter line would misrepresent.
 */
export const rankBand = (rank: number | null): RankBand => ({
  band: rank === 1 ? "1" : rank !== null && rank <= 3 ? "top" : "rest",
  dashed: rank === 3
});

/**
 * Where a column of labels sits once none of them overlap: each at the position
 * it asked for, or pushed down far enough to clear the one above it by `gap`.
 *
 * The Race chart's labels hang off the end of nine lines, and nine Entrants
 * that opened on the same fifteen players can end a Gameweek on the same total
 * — so the ends they are hung on are not spread out at all, and the design
 * fixes the minimum gap rather than hoping. Positions come back in the order
 * they were given, because the caller pairs them with its own rows by index.
 *
 * Pushed down and never reordered: the label a line ends above stays above, and
 * a de-overlap that sorted the collisions apart would hand a rank's name to
 * another rank's line.
 *
 * A run that passed `height` is then pulled back off the foot one label at a
 * time, from the bottom up, and never as one block: a runaway leader with the
 * rest of the field packed on the baseline is a real Season, and shifting all
 * nine by what the pack overflowed by would carry that one label off the top of
 * the panel. Taken from the bottom, only the labels that have to move do, every
 * gap survives, and the whole column stays inside the plot for as long as the
 * field needs less of it than there is — nine labels at the design's 17 units
 * need 136 of the plot's 300.
 *
 * It lives here rather than in `chart-domain.ts` because that module is the
 * Match track's cumulative chart, down to its docstring, and a second track's
 * geometry moving in makes it neither track's. This is the module the slice's
 * own rule points at: what the FPL ranking can get wrong without looking wrong.
 */
export const spreadLabels = (
  positions: number[],
  gap: number,
  height: number
): number[] => {
  const placed = new Array<number>(positions.length);
  // Stable, so labels that asked for the same position keep the order they
  // arrived in rather than an order the sort invented.
  const order = positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position - b.position);

  let cursor = -Infinity;
  for (const { position, index } of order) {
    cursor = Math.max(position, cursor + gap);
    placed[index] = cursor;
  }

  cursor = height;
  for (const { index } of [...order].reverse()) {
    cursor = Math.min(placed[index]!, cursor);
    placed[index] = cursor;
    cursor -= gap;
  }
  return placed;
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

/**
 * Chart geometry shared by both tracks: the domains and positions that can be
 * wrong without being visible — an axis that quietly clips a line, a Gameweek
 * drawn under the wrong point, or a line drawn through a Gameweek nobody has a
 * figure for. A page's own script is a fetch and a render and has no test;
 * these functions do (spec 0014's Testing Decisions: "chart geometry is
 * tested as pure functions on their documented behaviour, not by rendering").
 *
 * `ceiling` and `across` opened this module for the Match track's cumulative
 * chart and are read unchanged by the FPL leaderboard's Race chart; the two
 * below are the FPL Entrant record's. Nothing here composes an FPL sentence
 * or a Match one — that split stays in each track's own view module
 * (`fpl-view.ts`), which is the FPL vocabulary and never chart arithmetic.
 */

/**
 * A ceiling at or above the highest total the field reached, in four intervals
 * so the design's five grid lines still land on numbers a reader recognises.
 *
 * The design's fixed 260 clips any Season that outscores it — a 38-Gameweek
 * Season passes it before March — and wastes half the plot on one that has not
 * reached it yet. The nought floor is four, so the ticks of a Season with one
 * point between everybody are still whole numbers rather than five noughts.
 */
export const ceiling = (most: number): number => {
  if (!(most > 0)) return 4;
  const rough = most / 4;
  // `rough / magnitude` is in [1, 10) by construction, so the last factor
  // always answers and `step` is never undefined.
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((factor) => factor * magnitude)
    .find((candidate) => candidate >= rough) ?? magnitude * 10;
  return Math.max(4, step * 4);
};

/**
 * Where a Gameweek sits across the plot, as a fraction of the way from the
 * Season's first to its last.
 *
 * By the Gameweek's own number and never by its position in an array. The
 * series are hung on the Gameweeks the scorer wrote rows for, and a Season can
 * hold a Gameweek that owns no Fixture at all — spacing the rows evenly would
 * silently slide every Gameweek after the missing one a step to the left, and
 * nothing on the chart would say so.
 *
 * A Season of one Gameweek has no width to spread over and draws at the left
 * edge rather than dividing by zero.
 */
export const across = (gw: number, first: number, last: number): number =>
  last === first ? 0 : (gw - first) / (last - first);

/**
 * Where a value sits in its own series' band: 0 at the series' lowest point, 1
 * at its highest.
 *
 * Squad value and bank are drawn as two independently-scaled series (spec
 * 0014, story 24), each read against its own min and max rather than one axis
 * shared between a six-figure value and a single-figure bank. A series with no
 * spread at all -- every Gameweek banking the same amount -- has nothing to
 * divide the gap by; treating that gap as one rather than nought keeps every
 * point at the same real position instead of the whole series collapsing onto
 * a `NaN` coordinate, which is what would stop the line drawing across the
 * chart at all.
 */
export const scaleOwnBand = (
  values: readonly number[]
): (value: number) => number => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return (value) => (value - lo) / span;
};

/**
 * Whether the point at `index` starts a new run of consecutive Gameweeks
 * rather than continuing the last one.
 *
 * A chart drawn by joining every point in array order in a straight line
 * draws across a Gameweek the record holds nothing for -- the interpolation
 * ADR-0011's "a Gap is reported, never back-filled" rule forbids. A break in
 * the numbering is the only signal a chart has that a point is missing
 * between two it does hold, so the check is arithmetic on the Gameweek
 * itself and not on the array's length.
 */
export const startsRun = (
  weeks: readonly { gw: number }[], index: number
): boolean => index === 0 || weeks[index]!.gw !== weeks[index - 1]!.gw + 1;

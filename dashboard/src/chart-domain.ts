/**
 * The two domains of the cumulative Match Points chart, which follow the data
 * rather than the design's fixed 0–260 and GW1–GW14.
 *
 * They live here, apart from the page that draws with them, because they are
 * the one part of that chart that can be wrong without being visible: an axis
 * that quietly clips a line, or one that puts Gameweek 8 where Gameweek 9
 * belongs, still renders as a chart. The page is a script over a fetch and has
 * no test; these two functions do.
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

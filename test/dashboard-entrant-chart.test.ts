import { describe, expect, test } from "vitest";
import { across, ceiling } from "../dashboard/src/chart-domain.js";

/**
 * The Entrant record's chart, at the two Season lengths spec 0011 names. No
 * database: these are the two functions the page's domains are computed by, and
 * they are here because a wrong axis still renders as a chart.
 */
describe("the cumulative chart's domains", () => {
  test("never clips the field, at either Season length", () => {
    // The design's Season tops 309 and its fixed axis stopped at 260; a full
    // 38-Gameweek Season passes 700. Both are drawn whole.
    for (const most of [1, 42, 260, 309, 700, 812, 1_000]) {
      const top = ceiling(most);

      expect(top).toBeGreaterThanOrEqual(most);
      // Four intervals, five grid lines, and each of them a round number.
      expect(top / 4).toBe(Math.round((top / 4) * 100) / 100);
      expect(Number.isFinite(top)).toBe(true);
    }
  });

  test("answers a different axis at Gameweek 14 and at Gameweek 30", () => {
    // The same rate of scoring over twice the Season: an axis that did not
    // follow the data would answer both with one number, and one of the two
    // charts would be wrong.
    const shorter = ceiling(309);
    const longer = ceiling(662);

    expect(longer).toBeGreaterThan(shorter);
    expect(shorter).toBeGreaterThanOrEqual(309);
    expect(longer).toBeGreaterThanOrEqual(662);

    // And the last Gameweek is the right edge in both, so no line stops short
    // of the plot or runs past it.
    expect(across(14, 1, 14)).toBe(1);
    expect(across(30, 1, 30)).toBe(1);
    expect(across(1, 1, 30)).toBe(0);
  });

  test("places a Gameweek by its number and not by its turn", () => {
    // A Season whose Gameweek 7 owns no Fixture writes no row for it, so the
    // series is thirteen entries long and Gameweek 8 is the seventh of them.
    // It belongs seven fourteenths across all the same.
    expect(across(8, 1, 14)).toBeCloseTo(7 / 13, 12);
    expect(across(8, 1, 14)).not.toBeCloseTo(6 / 12, 12);
  });

  test("draws a Season of one Gameweek at the left edge", () => {
    expect(across(1, 1, 1)).toBe(0);
    expect(ceiling(0)).toBe(4);
  });
});

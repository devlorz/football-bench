import { describe, expect, test } from "vitest";
import {
  across, ceiling, scaleOwnBand, startsRun
} from "../dashboard/src/chart-domain.js";

/**
 * Chart geometry pure enough to test without a database or a render: `ceiling`
 * and `across` compute the Match Entrant record's domains at the two Season
 * lengths spec 0011 names and are read unchanged by the FPL leaderboard's Race
 * chart; `scaleOwnBand` and `startsRun` are the FPL Entrant record's own. A
 * wrong axis, a wrongly-scaled line, or a line drawn through a Gameweek
 * nobody has a figure for all still render as a chart.
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

describe("scaling a series against its own band", () => {
  test("puts the lowest point at 0 and the highest at 1", () => {
    const at = scaleOwnBand([100.6, 101.2, 100.9, 101.2]);
    expect(at(100.6)).toBe(0);
    expect(at(101.2)).toBe(1);
    expect(at(100.9)).toBeCloseTo(0.5);
  });

  test("still resolves every point on a flat series, rather than dividing by nought", () => {
    // A bank line that never moved has no spread to scale against. Every
    // point still has to be a real number, or the polyline collapses on a
    // `NaN` coordinate and the line never draws at all.
    const at = scaleOwnBand([0.9, 0.9, 0.9]);
    expect(at(0.9)).toBe(0);
    expect(Number.isFinite(at(0.9))).toBe(true);
  });
});

describe("splitting a series at a Gameweek it does not hold", () => {
  test("starts a run at the first point and continues while Gameweeks are consecutive", () => {
    const weeks = [{ gw: 1 }, { gw: 2 }, { gw: 3 }];
    expect(weeks.map((_, index) => startsRun(weeks, index)))
      .toEqual([true, false, false]);
  });

  test("starts a new run wherever a Gameweek is missing between two the record holds", () => {
    // The seeded Season's own shape: GW4 is missing, so GW5 starts a run
    // rather than continuing from GW3 -- a chart joining the two with one
    // line would draw straight across the hole.
    const weeks = [{ gw: 1 }, { gw: 2 }, { gw: 3 }, { gw: 5 }];
    expect(weeks.map((_, index) => startsRun(weeks, index)))
      .toEqual([true, false, false, true]);
  });
});

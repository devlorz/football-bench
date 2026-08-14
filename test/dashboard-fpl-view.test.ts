import { describe, expect, test } from "vitest";
import {
  chipsTag, deltaNote, gameweekSpan, movement, rankBand, seasonLabel,
  settledGws, spreadLabels, squadValue, statusLine
} from "../dashboard/src/fpl-view.js";

/**
 * Every step the FPL ranking takes between a response and what a reader sees:
 * the movement marker, the Squad value, the span the ranking is cumulative
 * over, the Gameweeks inside it the record holds, the Gameweek the movement was
 * measured against, the header's status line, the Cards variant's Chips tag,
 * the weight a place in the field is drawn at, and where the Race chart's
 * labels sit. No database. They are here because each of them renders perfectly
 * while being wrong, and nothing the page does on its own has that property.
 */
describe("the ranking's movement marker", () => {
  test("reads a rise and a fall as opposite things", () => {
    expect(movement(2)).toEqual({ mark: "▲2", tone: "up" });
    expect(movement(-1)).toEqual({ mark: "▼1", tone: "down" });
    // The fall carries its size without its sign: the arrow is what says which
    // way, and "▼-1" would be a place lost twice.
    expect(movement(-4).mark).toBe("▼4");
  });

  test("distinguishes holding a place from having no place behind it", () => {
    // The design's dash means "did not move". The first Settled Gameweek of the
    // record has no snapshot behind it, and an Entrant nothing is known about
    // has not stood still -- so it draws nothing rather than the dash.
    expect(movement(0)).toEqual({ mark: "–", tone: "flat" });
    expect(movement(null)).toEqual({ mark: "", tone: "none" });
  });
});

describe("the Squad value column", () => {
  test("prints tenths of a million to one decimal", () => {
    expect(squadValue(1012)).toBe("101.2");
    expect(squadValue(1000)).toBe("100.0");
    expect(squadValue(998)).toBe("99.8");
  });

  test("says nothing rather than nought for a Squad it has not read", () => {
    // Nought would be a Squad worth nothing, which is not a state the track
    // has: an Entrant with no Manager State has no Squad value at all.
    expect(squadValue(null)).toBe("—");
  });
});

describe("the span the ranking is cumulative over", () => {
  test("names the first and the last Settled Gameweek", () => {
    expect(gameweekSpan(1, 5, [])).toBe("Cumulative, Gameweeks 1–5");
  });

  test("announces a Gameweek the record holds nothing for", () => {
    // The seeded Season's own shape: one Entrant stored no Manager State at
    // Gameweek 4, so ADR-0011 removes it from every Season path and no total on
    // the page counts it. "Gameweeks 1-5" alone would claim five Gameweeks that
    // four of them answer.
    expect(gameweekSpan(1, 5, [4]))
      .toBe("Cumulative, Gameweeks 1–5 · not in the record: GW4");
    expect(gameweekSpan(1, 6, [3, 4]))
      .toBe("Cumulative, Gameweeks 1–6 · not in the record: GW3, GW4");
  });

  test("does not pluralise a span of one Gameweek", () => {
    expect(gameweekSpan(2, 2, [])).toBe("Cumulative, Gameweek 2");
  });

  test("says nothing has settled rather than naming Gameweek nought", () => {
    expect(gameweekSpan(null, null, [])).toBe("Cumulative, no Gameweek settled");
  });
});

describe("the footnote's movement reference", () => {
  test("names the Gameweek behind the one on screen", () => {
    expect(deltaNote(1, 4, []))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("names the last Gameweek with a snapshot and not the one before", () => {
    // The seeded Season's own shape again: nothing was scored at Gameweek 4, so
    // the movement beside every row was measured against Gameweek 3. Reading
    // `throughGw − 1` would print GW4 -- a sentence that reads perfectly and
    // names a Gameweek the record does not hold.
    expect(deltaNote(1, 5, [4]))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("skips two holes in a row the same way it skips one", () => {
    expect(deltaNote(1, 6, [4, 5]))
      .toBe("Δ is the change against the cumulative snapshot at GW3.");
  });

  test("reads the Gameweek behind a span that does not start at one", () => {
    // `fromGw` is where the record starts and not where the Season does.
    expect(deltaNote(12, 14, []))
      .toBe("Δ is the change against the cumulative snapshot at GW13.");
  });

  test("says nothing at the first Settled Gameweek", () => {
    // The Δ column is empty there, and a sentence explaining it would be naming
    // a Gameweek that does not exist.
    expect(deltaNote(1, 1, [])).toBe("");
    expect(deltaNote(null, null, [])).toBe("");
    // A span whose only other Gameweek is a hole is that same case.
    expect(deltaNote(1, 2, [1])).toBe("");
  });
});

describe("the Gameweeks the record holds", () => {
  test("is the span less the holes announced inside it", () => {
    expect(settledGws(1, 5, [])).toEqual([1, 2, 3, 4, 5]);
    // The seeded Season's own shape. The Race variant's axis is labelled from
    // this, so the hole is a longer segment in every line rather than a
    // Gameweek 4 label sitting where Gameweek 5's points were plotted.
    expect(settledGws(1, 5, [4])).toEqual([1, 2, 3, 5]);
  });

  test("holds nothing before the first Settled Gameweek", () => {
    expect(settledGws(null, null, [])).toEqual([]);
  });
});

describe("the Cards variant's Chips tag", () => {
  test("counts one Chip in the singular", () => {
    expect(chipsTag(1)).toBe("1 chip");
    expect(chipsTag(3)).toBe("3 chips");
    // Nought Chips left is a fact about the Entrant and reads as the plural.
    expect(chipsTag(0)).toBe("0 chips");
  });

  test("says nothing rather than nought for a count it has not read", () => {
    expect(chipsTag(null)).toBe("—");
  });
});

describe("the weight a place in the field is drawn at", () => {
  test("gives the design's three bands to the leader, the chasers and the rest", () => {
    expect(rankBand(1)).toEqual({ band: "1", dashed: false });
    expect(rankBand(2)).toEqual({ band: "top", dashed: false });
    expect(rankBand(4)).toEqual({ band: "rest", dashed: false });
    expect(rankBand(9)).toEqual({ band: "rest", dashed: false });
  });

  test("dashes third place alone, so second and third stay apart", () => {
    // Both are drawn at the same weight in the same ink. The dash is the only
    // thing between them, and it belongs to the rank rather than to the chart
    // that draws it -- the Cards tile reads the same answer and ignores it.
    expect(rankBand(3)).toEqual({ band: "top", dashed: true });
  });

  test("draws a rank it has not read as the rest of the field", () => {
    // Ranks are null before the first Settled Gameweek, where there is no Race
    // to draw. Nothing should reach here -- and if it does, an unranked Entrant
    // is not the leader.
    expect(rankBand(null)).toEqual({ band: "rest", dashed: false });
  });
});

describe("the Race chart's label positions", () => {
  test("leaves labels that already clear each other where they are", () => {
    expect(spreadLabels([40, 100, 200], 17, 300)).toEqual([40, 100, 200]);
  });

  test("pushes a collision down to exactly the minimum gap", () => {
    expect(spreadLabels([100, 105, 140], 17, 300)).toEqual([100, 117, 140]);
    // The push carries: the third clears the second's new position and not the
    // one it asked for.
    expect(spreadLabels([100, 105, 110], 17, 300)).toEqual([100, 117, 134]);
  });

  test("returns positions in the order it was given them", () => {
    // The caller pairs a label with a row by index. Handed the ends of nine
    // lines out of rank order, the answer stays out of rank order -- and the
    // label that was above stays above.
    expect(spreadLabels([200, 100, 105], 17, 300)).toEqual([200, 100, 117]);
  });

  test("holds a whole field on one total inside the plot", () => {
    // Nine Entrants that opened on the same fifteen players end the first
    // Gameweek on the same total, so every line ends at the same height. The
    // run is pulled back off the foot of the panel, and every gap survives it.
    const stacked = spreadLabels(Array.from({ length: 9 }, () => 280), 17, 300);
    expect(stacked.at(-1)).toBe(300);
    expect(stacked[0]).toBe(300 - 8 * 17);
    for (let index = 1; index < stacked.length; index += 1) {
      expect(stacked[index]! - stacked[index - 1]!).toBe(17);
    }
  });

  test("does not carry a runaway leader off the top of the plot", () => {
    // A leader clear of a field packed on the baseline: the pack overflows the
    // foot and the leader does not. Pulling the whole column up by what the
    // pack overflowed by would put the leader's label above the panel -- it is
    // the labels that have to move that move, from the bottom up.
    const packed = spreadLabels(
      [30, ...Array.from({ length: 8 }, () => 280)], 17, 300
    );
    expect(packed[0]).toBe(30);
    expect(Math.min(...packed)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...packed)).toBeLessThanOrEqual(300);
    for (let index = 2; index < packed.length; index += 1) {
      expect(packed[index]! - packed[index - 1]!).toBeGreaterThanOrEqual(17);
    }
  });

  test("gives labels that asked for one position the order they arrived in", () => {
    // Two equal ends are two lines crossing at the same point, and the sort
    // that separates them must not be the one deciding which name goes on top.
    expect(spreadLabels([50, 50], 17, 300)).toEqual([50, 67]);
  });
});

describe("the header's status line", () => {
  test("carries the Season, the Gameweek and the size of the field", () => {
    expect(statusLine("2026-27", 4, 9)).toBe("Season 2026/27 · GW4 settled · 9 entrants");
  });

  test("before the first Settled Gameweek claims none", () => {
    expect(statusLine("2026-27", null, 9))
      .toBe("Season 2026/27 · no Gameweek settled · 9 entrants");
  });

  test("spells the Season the way the panel beside it does", () => {
    // Both read it from here, so the header and the pre-Season panel cannot
    // print one Season two ways on one page.
    expect(seasonLabel("2026-27")).toBe("2026/27");
    expect(statusLine("2026-27", 4, 9)).toContain(seasonLabel("2026-27"));
  });
});

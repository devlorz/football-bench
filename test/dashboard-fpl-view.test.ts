import { describe, expect, test } from "vitest";
import {
  deltaNote, gameweekSpan, movement, seasonLabel, squadValue, statusLine
} from "../dashboard/src/fpl-view.js";

/**
 * Every step the FPL ranking takes between a response and what a reader sees:
 * the movement marker, the Squad value, the span the ranking is cumulative
 * over, the Gameweek the movement was measured against, and the header's status
 * line. No database. They are here because each of them renders perfectly while
 * being wrong, and nothing the page does on its own has that property.
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

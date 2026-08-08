import { describe, expect, test } from "vitest";
import { formatScoringRehearsal } from "../src/dry-run/format-scoring-rehearsal.js";
import type { ScoringRehearsalResult } from "../src/dry-run/rehearse-scoring.js";
import { MATCH_POINTS_METRIC } from "../src/predictions/score-match-gameweek.js";

function result(shortfalls: string[]): ScoringRehearsalResult {
  return {
    shortfalls,
    report: {
      settled: 10,
      entrants: ["one", "two"],
      metrics: [
        {
          entrantId: "one",
          gw: 1,
          metric: MATCH_POINTS_METRIC,
          value: 5,
          n: 1,
          detail: { fixtures: [{ fplId: 1, points: 5 }] }
        },
        {
          entrantId: "two",
          gw: 1,
          metric: MATCH_POINTS_METRIC,
          value: 0,
          n: 1,
          detail: { fixtures: [{ fplId: 1, points: 0 }] }
        }
      ]
    },
    dryRun: {
      instant: new Date("2026-08-21T13:00:00Z"),
      deadline: new Date("2026-08-21T19:00:00Z"),
      contexts: [],
      phases: [
        { trigger: "main", gapAlert: null, predictions: 1 },
        { trigger: "fill", gapAlert: null, predictions: 2 }
      ],
      expected: { predictions: 2, gaps: 18 }
    }
  };
}

describe("reading a scoring rehearsal", () => {
  test("shows every Entrant with the evidence under its total", () => {
    const output = formatScoringRehearsal("2026-27", 1, result([]));

    expect(output).toContain("one");
    expect(output).toContain("two");
    // The per-Fixture detail, not just the total: a reviewer who cannot see
    // which Fixture paid the 5 cannot disagree with it.
    expect(output).toContain(`gw 1 ${MATCH_POINTS_METRIC} = 5 (n=1)`);
    expect(output).toContain('{"fixtures":[{"fplId":1,"points":5}]}');
    expect(output).toContain("The rehearsal produced the whole scoring record.");
  });

  test("counts the Predictions the last phase reached, not the first", () => {
    // The Fill runs after the main run and is the state the scoring pass saw.
    expect(formatScoringRehearsal("2026-27", 1, result([])))
      .toContain("10 of 10 Fixtures settled, 0 contexts, 2 Predictions");
  });

  test("spells out every shortfall rather than only failing", () => {
    const output = formatScoringRehearsal(
      "2026-27", 1, result(["two is missing brier", "reference-elo is missing rps"])
    );

    expect(output).toContain("The rehearsal fell short:\n  two is missing brier\n"
      + "  reference-elo is missing rps");
  });
});

import { describe, expect, test } from "vitest";
import { formatScoringRehearsal } from "../src/dry-run/format-scoring-rehearsal.js";
import type { ScoringRehearsalResult } from "../src/dry-run/rehearse-scoring.js";
import { MATCH_POINTS_METRIC } from "../src/predictions/score-match-gameweek.js";

function result(shortfalls: string[]): ScoringRehearsalResult {
  return {
    shortfalls,
    observedAt: new Date("2026-09-26T06:33:08Z"),
    report: {
      scheduled: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      locked: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      settled: [
        [2, 0], [1, 1], [0, 1], [1, 3], [2, 2],
        [3, 1], [0, 0], [4, 0], [1, 2], [2, 1]
      ].map(([home, away], index) =>
        ({ fixtureId: 11 + index, home: home!, away: away! })),
      entrants: ["one", "two"],
      metrics: [
        {
          entrantId: "one",
          gw: 1,
          metric: MATCH_POINTS_METRIC,
          value: 5,
          n: 1,
          detail: { fixtures: [{ fixtureId: 1, points: 5 }] }
        },
        {
          entrantId: "two",
          gw: 1,
          metric: MATCH_POINTS_METRIC,
          value: 0,
          n: 1,
          detail: { fixtures: [{ fixtureId: 1, points: 0 }] }
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
    expect(output).toContain('{"fixtures":[{"fixtureId":1,"points":5}]}');
    expect(output).toContain("The rehearsal produced the whole scoring record.");
  });

  test("counts the Predictions the last phase reached, not the first", () => {
    // The Fill runs after the main run and is the state the scoring pass saw.
    expect(formatScoringRehearsal("2026-27", 1, result([])))
      .toContain("10 of 10 Fixtures settled, 0 contexts, 2 Predictions");
  });

  test("names the Fixtures the script settled by their own ids", () => {
    const output = formatScoringRehearsal("2026-27", 2, result([]));

    expect(output).toContain("Fixture 11: 2-0\nFixture 12: 1-1");
    expect(output).toContain("Fixture 20: 2-1");
  });

  test("says each archived answer was replayed on the Fixture asked", () => {
    // As fabricated as the results: the rehearsal rewrote it, so it says so
    // under the same heading.
    expect(formatScoringRehearsal("2026-27", 1, result([]))).toContain(
      "Fabricated results\n" + "=".repeat(72) + "\n"
      + "Each Entrant's archived answer is replayed on every Fixture asked, "
      + "its fixture_id rewritten to that Fixture's; every other field is as "
      + "recorded."
    );
  });

  test("says the packets were built from bytes newer than the Lock", () => {
    // Observed 2026-09-26, the Lock 2026-08-21. Read off the packets of a
    // 2026-09-28 run: the Head Coach state carries what was known five weeks
    // later. A result from the Lock's own day did too, until ticket 0093
    // bounded history by kickoff. Availability was empty, so the output does
    // not claim it.
    const output = formatScoringRehearsal("2026-27", 1, result([]));

    expect(output).toContain(
      "The packets were built from bytes observed 2026-09-26T06:33:08.000Z, "
      + "after the Gameweek's Lock at 2026-08-21T19:00:00.000Z"
    );
    expect(output).not.toContain("Lock's own day");
    expect(output).toContain("Head Coach");
    expect(output).not.toContain("Availability");
  });

  test("says nothing about newer bytes when the archive predates the Lock", () => {
    const early = {
      ...result([]),
      observedAt: new Date("2026-07-29T00:00:00Z")
    };

    expect(formatScoringRehearsal("2026-27", 1, early))
      .not.toContain("The packets were built from bytes observed");
  });

  test("spells out every shortfall rather than only failing", () => {
    const output = formatScoringRehearsal(
      "2026-27", 1, result(["two is missing brier", "reference-elo is missing rps"])
    );

    expect(output).toContain("The rehearsal fell short:\n  two is missing brier\n"
      + "  reference-elo is missing rps");
  });
});

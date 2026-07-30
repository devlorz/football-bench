import { describe, expect, test } from "vitest";
import { expectedDryRunOutcome } from "../src/dry-run/expected-outcome.js";
import type { ArchivedEntrant } from "../src/dry-run/load-archive.js";

function entrant(id: string, baseModel: string): ArchivedEntrant {
  return {
    id,
    name: id,
    role: "entrant",
    base_model: baseModel,
    provider: "p",
    quantization: null,
    prompt_version: "match/2026-27-v1",
    config: {}
  };
}

function archivedAnswer(fixtureId: number): string {
  return JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          fixture_id: fixtureId,
          probs: { H: 0.5, D: 0.3, A: 0.2 },
          score: { home: 2, away: 1 },
          rationale: "archived"
        })
      }
    }]
  });
}

describe("the expected outcome of a dry run", () => {
  const entrants = [entrant("a", "vendor/a"), entrant("b", "vendor/b")];
  const snapshots = [
    { source: "openrouter-preflight:vendor/a", body: archivedAnswer(1) },
    { source: "openrouter-preflight:vendor/b", body: archivedAnswer(1) }
  ];

  test("expects one Prediction per Entrant for the Fixture its response names", () => {
    expect(expectedDryRunOutcome({
      entrants,
      snapshots,
      fixtureIds: [1, 2, 3],
      beforeLock: true
    })).toEqual({ predictions: 2, gaps: 4 });
  });

  test("expects nothing written once the Lock has passed", () => {
    expect(expectedDryRunOutcome({
      entrants,
      snapshots,
      fixtureIds: [1, 2, 3],
      beforeLock: false
    })).toEqual({ predictions: 0, gaps: 6 });
  });

  test("expects no Prediction from a response naming a Fixture outside the Gameweek", () => {
    expect(expectedDryRunOutcome({
      entrants,
      snapshots,
      fixtureIds: [7, 8],
      beforeLock: true
    })).toEqual({ predictions: 0, gaps: 4 });
  });

  test("expects no Prediction from an Entrant with no archived response", () => {
    expect(expectedDryRunOutcome({
      entrants,
      snapshots: [snapshots[0]!],
      fixtureIds: [1, 2],
      beforeLock: true
    })).toEqual({ predictions: 1, gaps: 3 });
  });
});

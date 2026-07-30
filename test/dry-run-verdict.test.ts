import { describe, expect, test } from "vitest";
import { dryRunVerdict } from "../src/dry-run/verdict.js";
import type { DryRunPhase } from "../src/dry-run/run-dry-run.js";

function phase(trigger: "main" | "fill", predictions: number, gaps: number) {
  return {
    trigger,
    predictions,
    gapAlert: {
      season: "2026-27",
      gameweek: 1,
      deadlineAt: new Date(0),
      observedAt: new Date(0),
      remainingMilliseconds: 0,
      gaps: Array.from({ length: gaps }, () => ({})) as never[]
    }
  } satisfies DryRunPhase;
}

describe("the dry run verdict", () => {
  test("passes when the last run matches what the archive should produce", () => {
    expect(dryRunVerdict({
      phases: [phase("main", 9, 81), phase("fill", 9, 81)],
      expected: { predictions: 9, gaps: 81 }
    })).toEqual({ predictions: 9, gaps: 81, matched: true });
  });

  test("fails on one Prediction short, which a Gap summary would not make obvious", () => {
    expect(dryRunVerdict({
      phases: [phase("main", 8, 82), phase("fill", 8, 82)],
      expected: { predictions: 9, gaps: 81 }
    })).toMatchObject({ matched: false });
  });

  test("reads the last run, since the Fill may close Gaps the main run left", () => {
    expect(dryRunVerdict({
      phases: [phase("main", 0, 90), phase("fill", 9, 81)],
      expected: { predictions: 9, gaps: 81 }
    })).toMatchObject({ matched: true });
  });

  test("counts no Gaps when a clean run emitted no report at all", () => {
    expect(dryRunVerdict({
      phases: [{ trigger: "fill", predictions: 9, gapAlert: null }],
      expected: { predictions: 9, gaps: 0 }
    })).toEqual({ predictions: 9, gaps: 0, matched: true });
  });
});

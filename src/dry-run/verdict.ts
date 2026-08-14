import type { ExpectedDryRunOutcome } from "./expected-outcome.js";
import type { DryRunPhase } from "./run-dry-run.js";

export interface DryRunVerdict {
  predictions: number;
  gaps: number;
  matched: boolean;
}

/**
 * Turns a dry run from a report someone interprets into a check that fails on
 * its own. Nine Predictions instead of ten looks almost identical to a human
 * skimming eighty lines of Gap summary.
 */
export function dryRunVerdict(result: {
  phases: DryRunPhase[];
  expected: ExpectedDryRunOutcome;
}): DryRunVerdict {
  const final = result.phases[result.phases.length - 1];
  const predictions = final?.predictions ?? 0;
  const gaps = final?.gapAlert?.gaps.length ?? 0;
  return {
    predictions,
    gaps,
    matched: predictions === result.expected.predictions
      && gaps === result.expected.gaps
  };
}

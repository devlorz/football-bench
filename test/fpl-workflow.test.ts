import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const fplWorkflow = readFileSync(".github/workflows/fpl.yml", "utf8");
const predictWorkflow = readFileSync(".github/workflows/predict.yml", "utf8");

function workflowName(yaml: string): string {
  return /^name: (.+)$/m.exec(yaml)![1]!;
}

function concurrencyGroup(yaml: string): string {
  return /^concurrency:\n  group: (.+)$/m.exec(yaml)![1]!;
}

describe("the FPL workflow's place in the schedule", () => {
  test("runs after the Prediction workflow rather than beside it", () => {
    // Both tracks lock at the same deadline (ADR-0006) and the Match track's
    // write path must not wait behind an FPL Gameweek. Two poll crons left
    // the order to whichever GitHub happened to start first; chaining decides
    // it. The FPL scheduler still polls Postgres for what is due — the trigger
    // says when to look, not what to do.
    expect(fplWorkflow).toContain("workflow_run:");
    expect(fplWorkflow).toMatch(/workflows: \["Deadline-relative Predictions"\]/);
    expect(fplWorkflow).not.toContain("schedule:");
    expect(fplWorkflow).not.toContain("cron:");
  });

  test("names the Prediction workflow exactly as that workflow names itself", () => {
    // A `workflow_run` trigger naming a workflow that does not exist is not an
    // error: it simply never fires. Renaming the Prediction workflow would
    // silently stop the FPL track from ever running again, and nothing else
    // would say so.
    const referenced = /workflows: \["([^"]+)"\]/.exec(fplWorkflow)![1];
    expect(referenced).toBe(workflowName(predictWorkflow));
  });

  test("fires whatever the Prediction run concluded", () => {
    // A failing Prediction run is not a reason to stop managing nine Squads,
    // and the FPL Gameweek has its own Lock to reach. `completed` covers every
    // conclusion; `success` would make one track's outage the other's.
    expect(fplWorkflow).toContain("types: [completed]");
    expect(fplWorkflow).not.toContain("types: [requested]");
  });

  test("keeps a concurrency group of its own", () => {
    // The chaining decides which starts first; this decides that neither ever
    // queues behind the other — an FPL Gameweek that overran would otherwise
    // hold up the next Prediction poll half an hour later.
    expect(concurrencyGroup(fplWorkflow))
      .not.toBe(concurrencyGroup(predictWorkflow));
  });
});

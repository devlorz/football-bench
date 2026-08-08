import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const scoreWorkflow = readFileSync(".github/workflows/score.yml", "utf8");
const fetchWorkflow = readFileSync(".github/workflows/fetch.yml", "utf8");
const predictWorkflow = readFileSync(".github/workflows/predict.yml", "utf8");
const fplWorkflow = readFileSync(".github/workflows/fpl.yml", "utf8");

function concurrencyGroup(yaml: string): string {
  return /^concurrency:\n  group: (.+)$/m.exec(yaml)![1]!;
}

/** Minutes past midnight UTC, so two daily crons can be put in order. */
function dailyCronInstant(yaml: string): number {
  const [, minute, hour] = /cron: "(\d+) (\d+) \* \* \*"/.exec(yaml)!;
  return Number(hour) * 60 + Number(minute);
}

describe("the scoring workflow's place in the schedule", () => {
  test("runs after the daily fetch that materialises what it reads", () => {
    // The scorer reads stored rows only, so a Gameweek's results and its
    // deferred Locks must already have been fetched. Ordering by clock rather
    // than by `workflow_run` because scoring is worth doing on a day the fetch
    // failed too: yesterday's correction is still unscored.
    expect(dailyCronInstant(scoreWorkflow))
      .toBeGreaterThan(dailyCronInstant(fetchWorkflow));
  });

  test("can be dispatched by hand to apply a corrected result", () => {
    // The same job, not a second one: a correction is applied by scoring the
    // Season exactly as the daily run does.
    expect(scoreWorkflow).toContain("workflow_dispatch:");
    expect(scoreWorkflow).toContain("npm run match:score");
    const jobs = scoreWorkflow.split("\njobs:\n")[1]!;
    expect(jobs.match(/^  \w[\w-]*:$/gm)).toEqual(["  score:"]);
  });

  test("queues behind no other track and holds none up", () => {
    // Its own group, so a Season-long scoring run cannot delay a Prediction
    // poll and a slow fetch cannot delay it.
    const group = concurrencyGroup(scoreWorkflow);
    expect(group).toBe("match-scoring");
    for (const other of [fetchWorkflow, predictWorkflow, fplWorkflow]) {
      expect(group).not.toBe(concurrencyGroup(other));
    }
  });

  test("reports a failure through the reporter this suite exercises", () => {
    // The step below is the only thing tying the tested script to the job that
    // runs it; a failing run reports nothing if the two drift apart.
    expect(scoreWorkflow).toContain("if: ${{ failure() }}");
    expect(scoreWorkflow).toContain("bash scripts/report-score-failure.sh");
    expect(scoreWorkflow).toContain("issues: write");
  });
});

describe("the scoring workflow failure reporter", () => {
  let directory: string;
  let callLog: string;

  beforeEach(() => {
    directory = mkdtempSync("/tmp/score-failure-reporter-");
    callLog = join(directory, "gh-calls");
    const fakeGh = join(directory, "gh");
    writeFileSync(fakeGh, [
      "#!/bin/sh",
      "{",
      "  printf 'CALL'",
      "  for argument in \"$@\"; do printf '\\t%s' \"${argument}\"; done",
      "  printf '\\n'",
      "} >> \"${GH_CALL_LOG}\"",
      "if [ \"$1\" = issue ] && [ \"$2\" = list ]; then",
      "  printf '%s\\n' \"${FAKE_ISSUE_NUMBER:-}\"",
      "fi"
    ].join("\n"));
    chmodSync(fakeGh, 0o755);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const run = (
    overrides: Record<string, string> = {}
  ): ReturnType<typeof spawnSync> =>
    spawnSync("bash", ["scripts/report-score-failure.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
        GH_CALL_LOG: callLog,
        RUN_URL: "https://github.test/owner/repository/actions/runs/123",
        ...overrides
      }
    });

  test("opens an assigned issue naming the failed run", () => {
    const opened = run({ SCORE_ALERT_ASSIGNEE: "operator" });

    expect(opened).toMatchObject({ status: 0, stderr: "" });
    const calls = readFileSync(callLog, "utf8");
    expect(calls).toContain("CALL\tissue\tlist");
    expect(calls).toContain("CALL\tissue\tcreate");
    // Its own title, so a scoring failure is not filed under the Prediction
    // workflow's issue and silently read as the same outage.
    expect(calls).toContain("--title\tMatch track scoring is failing");
    expect(calls).toContain(
      "The daily scoring run failed: "
      + "https://github.test/owner/repository/actions/runs/123"
    );
    expect(calls).toContain("--assignee\toperator");
  });

  test("comments on the open issue rather than opening a second", () => {
    const commented = run({
      SCORE_ALERT_ASSIGNEE: "operator",
      FAKE_ISSUE_NUMBER: "42"
    });

    expect(commented).toMatchObject({ status: 0, stderr: "" });
    const calls = readFileSync(callLog, "utf8");
    expect(calls).toContain("CALL\tissue\tcomment\t42");
    expect(calls).not.toContain("CALL\tissue\tcreate");
  });

  test("opens an unassigned issue when no assignee is configured", () => {
    const opened = run();

    expect(opened).toMatchObject({ status: 0, stderr: "" });
    const calls = readFileSync(callLog, "utf8");
    expect(calls).toContain("CALL\tissue\tcreate");
    expect(calls).not.toContain("--assignee");
  });
});

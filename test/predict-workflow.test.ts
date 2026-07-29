import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("the Prediction workflow failure reporter", () => {
  let directory: string;
  let callLog: string;

  beforeEach(() => {
    directory = mkdtempSync("/tmp/predict-failure-reporter-");
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

  test("opens a distinct assigned issue or comments on its open instance", () => {
    const environment = {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      GH_CALL_LOG: callLog,
      RUN_URL: "https://github.test/owner/repository/actions/runs/123",
      PREDICT_ALERT_ASSIGNEE: "operator"
    };

    const opened = spawnSync(
      "bash",
      ["scripts/report-predict-failure.sh"],
      { cwd: process.cwd(), env: environment, encoding: "utf8" }
    );
    expect(opened).toMatchObject({ status: 0, stderr: "" });
    const createCalls = readFileSync(callLog, "utf8");
    expect(createCalls).toContain("CALL\tissue\tlist");
    expect(createCalls).toContain("CALL\tissue\tcreate");
    expect(createCalls).toContain("--title\tPrediction workflow is failing");
    expect(createCalls).toContain(
      "The Prediction workflow failed: "
      + "https://github.test/owner/repository/actions/runs/123"
    );
    expect(createCalls).toContain("--assignee\toperator");

    writeFileSync(callLog, "");
    const commented = spawnSync(
      "bash",
      ["scripts/report-predict-failure.sh"],
      {
        cwd: process.cwd(),
        env: { ...environment, FAKE_ISSUE_NUMBER: "42" },
        encoding: "utf8"
      }
    );
    expect(commented).toMatchObject({ status: 0, stderr: "" });
    const commentCalls = readFileSync(callLog, "utf8");
    expect(commentCalls).toContain("CALL\tissue\tcomment\t42");
    expect(commentCalls).not.toContain("CALL\tissue\tcreate");
  });

  test("opens or comments on an assigned issue for a completed Fill with Gaps", () => {
    const reportPath = join(directory, "fill-gaps.md");
    const environment = {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      GH_CALL_LOG: callLog,
      RUN_URL: "https://github.test/owner/repository/actions/runs/456",
      PREDICT_ALERT_ASSIGNEE: "operator",
      FILL_GAP_REPORT_PATH: reportPath
    };

    const silent = spawnSync(
      "bash",
      ["scripts/report-prediction-fill-gaps.sh"],
      { cwd: process.cwd(), env: environment, encoding: "utf8" }
    );
    expect(silent).toMatchObject({ status: 0, stderr: "" });
    expect(existsSync(callLog)).toBe(false);

    writeFileSync(reportPath, [
      "Prediction Gaps remain for 2026-27 Gameweek 1.",
      "2h 0m remain before the Lock.",
      "- Unavailable Entrant: Fixture 1, Arsenal v Coventry City — provider"
    ].join("\n"));
    const opened = spawnSync(
      "bash",
      ["scripts/report-prediction-fill-gaps.sh"],
      { cwd: process.cwd(), env: environment, encoding: "utf8" }
    );
    expect(opened).toMatchObject({ status: 0, stderr: "" });
    const createCalls = readFileSync(callLog, "utf8");
    expect(createCalls).toContain("CALL\tissue\tlist");
    expect(createCalls).toContain("CALL\tissue\tcreate");
    expect(createCalls).toContain("--title\tPrediction Fill has Gaps");
    expect(createCalls).toContain(
      "Unavailable Entrant: Fixture 1, Arsenal v Coventry City — provider"
    );
    expect(createCalls).toContain(
      "Run: https://github.test/owner/repository/actions/runs/456"
    );
    expect(createCalls).toContain("--assignee\toperator");

    writeFileSync(callLog, "");
    const commented = spawnSync(
      "bash",
      ["scripts/report-prediction-fill-gaps.sh"],
      {
        cwd: process.cwd(),
        env: { ...environment, FAKE_ISSUE_NUMBER: "84" },
        encoding: "utf8"
      }
    );
    expect(commented).toMatchObject({ status: 0, stderr: "" });
    const commentCalls = readFileSync(callLog, "utf8");
    expect(commentCalls).toContain("CALL\tissue\tcomment\t84");
    expect(commentCalls).not.toContain("CALL\tissue\tcreate");
  });
});

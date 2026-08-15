import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CompletedPredictionRun } from "../src/predictions/run-scheduled-predictions.js";
import { writeCompletedRunAlert } from "../src/cli/write-gap-alert.js";

describe("completed scheduled Prediction alerts", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("hands only a Fill Gap report to the workflow issue boundary", () => {
    directory = mkdtempSync("/tmp/prediction-fill-gaps-");
    const reportPath = join(directory, "report.md");
    const gapAlert = {
      competition: "PL",
      season: "2026-27",
      gameweek: 1,
      deadlineAt: new Date("2026-08-21T17:30:00Z"),
      observedAt: new Date("2026-08-21T15:30:00Z"),
      remainingMilliseconds: 2 * 60 * 60 * 1000,
      gaps: [{
        entrantId: "gap/v1",
        entrantName: "Unavailable Entrant",
        fixtureId: 1,
        fixture: "Arsenal v Coventry City",
        cause: "provider" as const
      }]
    };
    const environment = {
      FILL_GAP_REPORT_PATH: reportPath
    };
    const main: CompletedPredictionRun = {
      competition: "PL",
      gameweek: 1,
      trigger: "main",
      gapAlert
    };
    const fill: CompletedPredictionRun = {
      competition: "PL",
      gameweek: 1,
      trigger: "fill",
      gapAlert
    };

    writeCompletedRunAlert(main, environment);
    expect(existsSync(reportPath)).toBe(false);

    writeCompletedRunAlert(fill, environment);
    expect(readFileSync(reportPath, "utf8")).toContain(
      "2h 0m remain before the Lock"
    );

    writeCompletedRunAlert({
      ...fill,
      gameweek: 2,
      gapAlert: {
        ...gapAlert,
        gameweek: 2
      }
    }, environment);
    const combined = readFileSync(reportPath, "utf8");
    expect(combined).toContain("Gameweek 1");
    expect(combined).toContain("Gameweek 2");
  });
});

import { appendFileSync, existsSync } from "node:fs";
import {
  formatGapAlert,
  formatGapAlertAnnotation,
  type GapAlert
} from "../predictions/gap-alert.js";
import type { CompletedPredictionRun } from "../predictions/run-scheduled-predictions.js";

export function writeGapAlert(
  alert: GapAlert,
  environment: NodeJS.ProcessEnv = process.env
): void {
  console.warn(formatGapAlert(alert));
  if (environment.GITHUB_ACTIONS === "true") {
    console.log(formatGapAlertAnnotation(alert));
  }
}

export function writeCompletedRunAlert(
  run: CompletedPredictionRun,
  environment: NodeJS.ProcessEnv = process.env
): void {
  if (run.gapAlert === undefined) {
    return;
  }
  writeGapAlert(run.gapAlert, environment);
  if (run.trigger !== "fill") {
    return;
  }

  const reportPath = environment.FILL_GAP_REPORT_PATH?.trim();
  if (reportPath === undefined || reportPath === "") {
    if (environment.GITHUB_ACTIONS === "true") {
      throw new Error(
        "FILL_GAP_REPORT_PATH is required for Fill Gap alerts in GitHub Actions"
      );
    }
    return;
  }
  const separator = existsSync(reportPath) ? "\n---\n\n" : "";
  appendFileSync(
    reportPath,
    `${separator}${formatGapAlert(run.gapAlert)}\n`,
    "utf8"
  );
}

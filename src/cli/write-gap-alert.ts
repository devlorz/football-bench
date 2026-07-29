import {
  formatGapAlert,
  formatGapAlertAnnotation,
  type GapAlert
} from "../predictions/gap-alert.js";

export function writeGapAlert(
  alert: GapAlert,
  environment: NodeJS.ProcessEnv = process.env
): void {
  console.warn(formatGapAlert(alert));
  if (environment.GITHUB_ACTIONS === "true") {
    console.log(formatGapAlertAnnotation(alert));
  }
}

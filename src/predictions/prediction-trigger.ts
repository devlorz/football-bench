export type AttemptTrigger = "main" | "fill" | "manual";
export type ScheduledPredictionTrigger = Exclude<AttemptTrigger, "manual">;

export function parseAttemptTrigger(
  value: string | undefined
): AttemptTrigger {
  const trigger = value ?? "main";
  if (trigger === "main" || trigger === "fill" || trigger === "manual") {
    return trigger;
  }
  throw new Error("PREDICTION_TRIGGER must be main, fill, or manual");
}

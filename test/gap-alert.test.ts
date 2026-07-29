import { describe, expect, test } from "vitest";
import {
  formatGapAlert,
  formatGapAlertAnnotation,
  type GapAlert
} from "../src/predictions/gap-alert.js";

describe("Prediction Gap alerts", () => {
  test("states the Entrant, Fixtures, causes, and time remaining", () => {
    const alert: GapAlert = {
      season: "2026-27",
      gameweek: 1,
      deadlineAt: new Date("2026-08-21T17:30:00Z"),
      observedAt: new Date("2026-08-21T11:30:00Z"),
      remainingMilliseconds: 6 * 60 * 60 * 1000,
      gaps: [
        {
          entrantId: "gap/v1",
          entrantName: "Unavailable Entrant",
          fixtureId: 1,
          fixture: "Arsenal v Coventry City",
          cause: "provider"
        },
        {
          entrantId: "gap/v1",
          entrantName: "Unavailable Entrant",
          fixtureId: 2,
          fixture: "Aston Villa v Newcastle",
          cause: "rate_limit"
        }
      ]
    };

    expect(formatGapAlert(alert)).toBe([
      "Prediction Gaps remain for 2026-27 Gameweek 1.",
      "6h 0m remain before the Lock at 2026-08-21T17:30:00.000Z.",
      "- Unavailable Entrant: Fixture 1, Arsenal v Coventry City — provider",
      "- Unavailable Entrant: Fixture 2, Aston Villa v Newcastle — rate_limit"
    ].join("\n"));
    expect(formatGapAlertAnnotation(alert)).toBe(
      "::warning title=Prediction Gaps remain::"
      + "Prediction Gaps remain for 2026-27 Gameweek 1.%0A"
      + "6h 0m remain before the Lock at 2026-08-21T17:30:00.000Z.%0A"
      + "- Unavailable Entrant: Fixture 1, Arsenal v Coventry City — provider%0A"
      + "- Unavailable Entrant: Fixture 2, Aston Villa v Newcastle — rate_limit"
    );
  });
});

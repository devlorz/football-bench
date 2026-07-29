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

  test("summarises a large incident by cause without dropping Entrants or Fixtures", () => {
    const alert: GapAlert = {
      season: "2026-27",
      gameweek: 1,
      deadlineAt: new Date("2026-08-21T17:30:00Z"),
      observedAt: new Date("2026-08-21T15:30:00Z"),
      remainingMilliseconds: 2 * 60 * 60 * 1000,
      gaps: Array.from({ length: 9 }, (_, entrantIndex) =>
        Array.from({ length: 10 }, (_, fixtureIndex) => ({
          entrantId: `entrant/${entrantIndex + 1}`,
          entrantName: `Entrant ${entrantIndex + 1}`,
          fixtureId: fixtureIndex + 1,
          fixture: `Home ${fixtureIndex + 1} v Away ${fixtureIndex + 1}`,
          cause: "provider" as const
        }))
      ).flat()
    };

    const report = formatGapAlert(alert);
    expect(report).toContain("90 Gaps grouped by cause:");
    expect(report).toContain("- provider: 90 Gaps");
    expect(report).toContain(
      "Entrants (9): Entrant 1; Entrant 2; Entrant 3; Entrant 4; "
      + "Entrant 5; Entrant 6; Entrant 7; Entrant 8; Entrant 9"
    );
    expect(report).toContain(
      "Fixtures (10): Fixture 1, Home 1 v Away 1;"
    );
    expect(report).toContain("Fixture 10, Home 10 v Away 10");
    expect(report.split("\n")).toHaveLength(6);
    expect(formatGapAlertAnnotation(alert).length).toBeLessThan(2_000);
  });

  test("states that the Lock has passed instead of saying zero time remains", () => {
    const alert: GapAlert = {
      season: "2026-27",
      gameweek: 1,
      deadlineAt: new Date("2026-08-21T17:30:00Z"),
      observedAt: new Date("2026-08-21T18:00:00Z"),
      remainingMilliseconds: 0,
      gaps: [{
        entrantId: "gap/v1",
        entrantName: "Late Entrant",
        fixtureId: 1,
        fixture: "Arsenal v Coventry City",
        cause: "deadline"
      }]
    };

    expect(formatGapAlert(alert).split("\n")[1]).toBe(
      "The Lock has passed (2026-08-21T17:30:00.000Z)."
    );
  });
});

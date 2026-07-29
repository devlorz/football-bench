import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  MATCH_PROMPT_SHA256,
  matchContext
} from "../src/predictions/openrouter-entrant.js";
import {
  buildHistoricalContext,
  type HistoricalMatch
} from "../src/context/build-historical-context.js";

describe("the Match Prompt Version", () => {
  test("pins the frozen template and context builder to a reviewed checksum", () => {
    const fixture = {
      fpl_id: 1,
      home_team: "Arsenal",
      away_team: "Coventry City",
      kickoff_at: new Date("2026-08-21T19:00:00Z")
    };
    const context = matchContext(
      fixture,
      buildHistoricalContext({
        season: "2026-27",
        asOf: new Date("2026-08-21T17:30:00Z"),
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        matches: [
          {
            season: "2025-26",
            division: "Premier League",
            played_on: new Date("2026-05-01T00:00:00Z"),
            home_team: "Arsenal",
            away_team: "Everton",
            home_goals: 3,
            away_goals: 1
          },
          {
            season: "2026-27",
            division: "Premier League",
            played_on: new Date("2026-08-10T00:00:00Z"),
            home_team: "Fulham",
            away_team: "Arsenal",
            home_goals: 0,
            away_goals: 2
          },
          {
            season: "2024-25",
            division: "Championship",
            played_on: new Date("2025-05-02T00:00:00Z"),
            home_team: "Coventry",
            away_team: "Stoke",
            home_goals: 1,
            away_goals: 1
          },
          {
            season: "2025-26",
            division: "Championship",
            played_on: new Date("2026-05-02T00:00:00Z"),
            home_team: "Coventry",
            away_team: "Hull",
            home_goals: 2,
            away_goals: 0
          }
        ] satisfies HistoricalMatch[]
      })
    );

    expect(
      createHash("sha256").update(context, "utf8").digest("hex")
    ).toBe(MATCH_PROMPT_SHA256);
  });
});

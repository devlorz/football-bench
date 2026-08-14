import { describe, expect, test } from "vitest";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { readDryRunJobConfig } from "../src/cli/config.js";

const environment = {
  DATABASE_URL: "postgresql://archive/real",
  SEASON: "2026-27",
  FOOTBALL_DATA_SEASON: "2025-26",
  GAMEWEEK: "1"
};

describe("the dry run job configuration", () => {
  test("reads the archive, the Season and the Gameweek being rehearsed", () => {
    expect(readDryRunJobConfig(environment)).toEqual({
      databaseUrl: "postgresql://archive/real",
      season: "2026-27",
      footballDataSeason: "2025-26",
      gameweek: 1,
      at: "deadline-6h",
      concurrency: SEASON_ROSTER_SIZE
    });
  });

  test("takes the rehearsed instant from the environment", () => {
    expect(readDryRunJobConfig({ ...environment, DRY_RUN_AT: "deadline+90m" }))
      .toMatchObject({ at: "deadline+90m" });
  });

  test("refuses an instant it cannot read, before any database is built", () => {
    expect(() => readDryRunJobConfig({ ...environment, DRY_RUN_AT: "soon" }))
      .toThrow(/soon/);
  });

  test("requires the archive it reads from", () => {
    expect(() => readDryRunJobConfig({ ...environment, DATABASE_URL: "" }))
      .toThrow(/DATABASE_URL is required/);
  });
});

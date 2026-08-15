import { describe, expect, test } from "vitest";
import {
  readDailyFetchJobConfig,
  readFetchJobConfig,
  readHistoricalFetchJobConfig
} from "../src/cli/config.js";

describe("the fetch job configuration", () => {
  test("requires both Seasons for the daily fetch", () => {
    expect(readDailyFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FOOTBALL_DATA_SEASON: "2025-26"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      footballDataSeason: "2025-26",
      footballDataOrgToken: null
    });

    // A Competition other than the Premier League reads football-data.org and
    // needs the token; a deployment running only the league that does not is
    // never asked for it.
    expect(readDailyFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FOOTBALL_DATA_SEASON: "2025-26",
      FOOTBALL_DATA_ORG_TOKEN: "  token  "
    })).toMatchObject({ footballDataOrgToken: "token" });

    expect(() => readDailyFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FOOTBALL_DATA_SEASON: "2526"
    })).toThrow("FOOTBALL_DATA_SEASON must use YYYY-YY format");
  });

  test("requires an explicit Season and Gameweek", () => {
    expect(readFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      gameweek: 1
    });

    expect(() => readFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "39"
    })).toThrow("GAMEWEEK must be an integer from 1 to 38");
  });

  test("requires the historical Season explicitly", () => {
    expect(readHistoricalFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      HISTORICAL_SEASON: "2025-26"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2025-26"
    });

    expect(() => readHistoricalFetchJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      HISTORICAL_SEASON: "25-26"
    })).toThrow("HISTORICAL_SEASON must use YYYY-YY format");
  });
});

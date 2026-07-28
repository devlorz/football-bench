import { describe, expect, test } from "vitest";
import { readFetchJobConfig } from "../src/cli/config.js";

describe("the fetch job configuration", () => {
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
});

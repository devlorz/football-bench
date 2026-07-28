import { describe, expect, test } from "vitest";
import { readPredictJobConfig } from "../src/cli/config.js";

describe("the predict job configuration", () => {
  test("requires the Entrant and OpenRouter credentials from the environment", () => {
    expect(readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      ENTRANT_ID: "entrant/v1",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      openRouterApiKey: "secret-from-environment"
    });

    expect(() => readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      ENTRANT_ID: "entrant/v1"
    })).toThrow("OPENROUTER_API_KEY is required");
  });
});

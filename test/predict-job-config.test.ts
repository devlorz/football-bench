import { describe, expect, test } from "vitest";
import { readPredictJobConfig } from "../src/cli/config.js";

describe("the predict job configuration", () => {
  test("runs every stored Entrant with a bounded concurrency", () => {
    expect(readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      PREDICT_CONCURRENCY: "4",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      gameweek: 1,
      concurrency: 4,
      openRouterApiKey: "secret-from-environment"
    });

    expect(readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      OPENROUTER_API_KEY: "secret-from-environment"
    }).concurrency).toBe(9);

    expect(() => readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      PREDICT_CONCURRENCY: "0",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("PREDICT_CONCURRENCY must be a positive integer");
    expect(() => readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1"
    })).toThrow("OPENROUTER_API_KEY is required");
  });
});

import { describe, expect, test } from "vitest";
import { DEFAULT_ENTRANT_CALL_TIMEOUT_MS } from "../src/predictions/openrouter-entrant.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import {
  readPredictJobConfig,
  readScheduledPredictJobConfig
} from "../src/cli/config.js";

describe("the predict job configuration", () => {
  test("runs every stored Entrant with a bounded concurrency", () => {
    expect(readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      PREDICT_CONCURRENCY: "4",
      PREDICTION_TRIGGER: "manual",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      gameweek: 1,
      concurrency: 4,
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      trigger: "manual",
      openRouterApiKey: "secret-from-environment"
    });

    expect(readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toMatchObject({
      concurrency: SEASON_ROSTER_SIZE,
      trigger: "main"
    });

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
    expect(() => readPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      PREDICTION_TRIGGER: "repair",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("PREDICTION_TRIGGER must be main, fill, or manual");
  });

  test("the scheduled job resolves its Gameweek from stored deadlines", () => {
    expect(readScheduledPredictJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      PREDICT_CONCURRENCY: "",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      concurrency: SEASON_ROSTER_SIZE,
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      openRouterApiKey: "secret-from-environment"
    });
  });

  test("the Entrant call's timeout is an operator knob on the Match track too", () => {
    // Four seats Gapped on the hard-coded two minutes across the first two
    // Gameweeks under the restarted Prompt Versions, every one of them at
    // exactly 120,000ms: a ceiling being hit, not a distribution ending.
    const environment = {
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      OPENROUTER_API_KEY: "secret-from-environment"
    };

    expect(readPredictJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "600000"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });
    expect(readScheduledPredictJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "600000"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });

    expect(() => readPredictJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "two minutes"
    })).toThrow("ENTRANT_CALL_TIMEOUT_MS must be a positive integer");
  });
});

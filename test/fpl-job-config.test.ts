import { describe, expect, test } from "vitest";
import {
  readFplStartJobConfig,
  readScheduledFplJobConfig
} from "../src/cli/config.js";

describe("the FPL job configuration", () => {
  test("the scheduled run resolves its Gameweek from stored deadlines", () => {
    expect(readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FPL_CONCURRENCY: "4",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      concurrency: 4,
      openRouterApiKey: "secret-from-environment"
    });

    // Nine by default, one worker per seat, and its own knob rather than the
    // Match track's: the two runs share a deadline and nothing else, and the
    // FPL prompt is several times the size, so one number for both would tie
    // two costs that have no reason to move together.
    expect(readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      PREDICT_CONCURRENCY: "2",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toMatchObject({ concurrency: 9 });

    expect(() => readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FPL_CONCURRENCY: "0",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("FPL_CONCURRENCY must be a positive integer");
    expect(() => readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27"
    })).toThrow("OPENROUTER_API_KEY is required");
    expect(() => readScheduledFplJobConfig({
      SEASON: "2026-27",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("DATABASE_URL is required");
    expect(() => readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("SEASON must use YYYY-YY format");
  });

  test("starting the track names the Gameweek explicitly", () => {
    // The operator chooses where the Season path begins and it is never
    // inferred, so the opening reads a Gameweek the scheduled run does not.
    expect(readFplStartJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "28",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      gameweek: 28,
      concurrency: 9,
      openRouterApiKey: "secret-from-environment"
    });

    expect(() => readFplStartJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("GAMEWEEK is required");
    expect(() => readFplStartJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "39",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("GAMEWEEK must be an integer from 1 to 38");
  });
});

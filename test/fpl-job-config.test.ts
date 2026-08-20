import { describe, expect, test } from "vitest";
import {
  readFplStartJobConfig,
  readScheduledFplJobConfig
} from "../src/cli/config.js";
import { FPL_ROSTER_SIZE } from "../src/season-roster.js";

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
      entrantCallTimeoutMs: 120_000,
      openRouterApiKey: "secret-from-environment"
    });

    // Ten by default, one worker per seat, and its own knob rather than the
    // Match track's: the two runs share a deadline and nothing else, and the
    // FPL prompt is several times the size, so one number for both would tie
    // two costs that have no reason to move together.
    expect(readScheduledFplJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      PREDICT_CONCURRENCY: "2",
      OPENROUTER_API_KEY: "secret-from-environment"
    // The FPL track's own size since ADR-0047, not the match track's: the
    // default means "the whole track at once" and the two tracks stopped being
    // the same width when three Base Models left this one.
    })).toMatchObject({ concurrency: FPL_ROSTER_SIZE });

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

  test("the Entrant call's timeout is an operator knob on both FPL jobs", () => {
    // Three of nine seats died at the hard-coded two minutes on every run of
    // the dry opening, each corpse forcing another full-board retry. A slow
    // reasoning model is now a configuration decision (spec 0010).
    const environment = {
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "1",
      OPENROUTER_API_KEY: "secret-from-environment"
    };

    expect(readScheduledFplJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "600000"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });
    expect(readFplStartJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "600000"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });

    // Unset is still this track's two minutes: ticket 0023 measured the Match
    // track's window and gave the Match track's default that number alone.
    expect(readFplStartJobConfig(environment))
      .toMatchObject({ entrantCallTimeoutMs: 120_000 });

    // A typo surfaces at job start rather than as a mystery mid-run.
    expect(() => readScheduledFplJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "two minutes"
    })).toThrow("ENTRANT_CALL_TIMEOUT_MS must be a positive integer");
    expect(() => readFplStartJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "0"
    })).toThrow("ENTRANT_CALL_TIMEOUT_MS must be a positive integer");
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
      concurrency: FPL_ROSTER_SIZE,
      entrantCallTimeoutMs: 120_000,
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

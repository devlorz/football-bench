import { describe, expect, test } from "vitest";
import { readPreflightJobConfig } from "../src/cli/config.js";

describe("the pre-flight job configuration", () => {
  test("requires one real Fixture and OpenRouter credentials from the environment", () => {
    expect(readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "9",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      fixtureId: 42,
      expectedEntrantCount: 9,
      openRouterApiKey: "secret-from-environment"
    });

    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "9"
    })).toThrow("OPENROUTER_API_KEY is required");
    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "not-an-id",
      EXPECTED_ENTRANT_COUNT: "9",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("FIXTURE_ID must be a positive integer");
    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "0",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("EXPECTED_ENTRANT_COUNT must be a positive integer");
  });
});

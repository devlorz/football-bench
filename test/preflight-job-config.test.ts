import { describe, expect, test } from "vitest";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS
} from "../src/predictions/openrouter-entrant.js";
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
      competition: "PL",
      season: "2026-27",
      fixtureId: 42,
      expectedEntrantCount: 9,
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
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

  test("takes the Competition it probes, defaulting to the Premier League", () => {
    // The seats called and the packet built are the named Competition's, so a
    // code that is not one is refused here rather than reaching a roster query
    // that would quietly find no seats — or, worse, another league's.
    expect(readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      COMPETITION: "pd",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "10",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      competition: "PD",
      season: "2026-27",
      fixtureId: 42,
      expectedEntrantCount: 10,
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      openRouterApiKey: "secret-from-environment"
    });

    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      COMPETITION: "Premier League",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "10",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("COMPETITION must be a Competition code such as PL or PD");
  });

  test("aims at one Exhibition instead of counting a roster", () => {
    // The door in is data: a `models` row and this one variable. There is no
    // roster to count when one model is named, and demanding a count that is
    // never read would make the operator state a number about nothing.
    expect(readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXHIBITION_MODEL_ID: "exhibition/late",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      competition: "PL",
      season: "2026-27",
      fixtureId: 42,
      exhibitionModelId: "exhibition/late",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      openRouterApiKey: "secret-from-environment"
    });

    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("EXPECTED_ENTRANT_COUNT is required");

    // Both set is two different intentions, not one with a fallback: the
    // operator hears about it rather than having the count dropped in silence.
    expect(() => readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXHIBITION_MODEL_ID: "exhibition/late",
      EXPECTED_ENTRANT_COUNT: "9",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow(
      "EXHIBITION_MODEL_ID and EXPECTED_ENTRANT_COUNT cannot both be set"
    );
  });

  test("the check takes the same window as the run it clears", () => {
    // Pre-flight decides whether a seat is usable. Cutting it off at a window
    // narrower than the run's would fail a seat the run can use (ticket 0023).
    expect(readPreflightJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      FIXTURE_ID: "42",
      EXPECTED_ENTRANT_COUNT: "9",
      ENTRANT_CALL_TIMEOUT_MS: "600000",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });
  });
});

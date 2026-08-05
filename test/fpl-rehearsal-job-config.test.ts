import { describe, expect, test } from "vitest";
import { readFplRehearsalJobConfig } from "../src/cli/config.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";

const ENVIRONMENT = {
  DATABASE_URL: "postgresql://archive",
  SEASON: "2026-27"
};

describe("the FPL rehearsal's configuration", () => {
  test("asks for no provider key, because it answers its own calls", () => {
    // Every other job that calls Entrants requires OPENROUTER_API_KEY. A
    // rehearsal replays a script, so asking for a key it cannot spend would
    // invite an operator to hand it a real one.
    expect(readFplRehearsalJobConfig(ENVIRONMENT)).toEqual({
      databaseUrl: "postgresql://archive",
      season: "2026-27",
      concurrency: SEASON_ROSTER_SIZE
    });
  });

  test("takes the FPL track's own concurrency", () => {
    expect(readFplRehearsalJobConfig({
      ...ENVIRONMENT,
      FPL_CONCURRENCY: "3"
    }).concurrency).toBe(3);
  });

  test("refuses a concurrency that is not a positive integer", () => {
    expect(() => readFplRehearsalJobConfig({
      ...ENVIRONMENT,
      FPL_CONCURRENCY: "0"
    })).toThrow("FPL_CONCURRENCY must be a positive integer");
  });

  test("refuses a Season that is not a Season", () => {
    expect(() => readFplRehearsalJobConfig({
      ...ENVIRONMENT,
      SEASON: "2026"
    })).toThrow("SEASON must use YYYY-YY format");
  });

  test("refuses to run without the database holding the archive", () => {
    const { DATABASE_URL: _unused, ...rest } = ENVIRONMENT;
    expect(() => readFplRehearsalJobConfig(rest))
      .toThrow("DATABASE_URL is required");
  });
});

import { describe, expect, test } from "vitest";
import { readScoreJobConfig } from "../src/cli/config.js";

describe("the scoring job configuration", () => {
  test("needs the database and the Season and nothing else", () => {
    expect(readScoreJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27"
    });
  });

  test("refuses a Season it cannot recognise", () => {
    expect(() => readScoreJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026"
    })).toThrow("SEASON must use YYYY-YY format");

    expect(() => readScoreJobConfig({ SEASON: "2026-27" }))
      .toThrow("DATABASE_URL is required");
  });
});

import { describe, expect, test } from "vitest";
import { readExhibitionJobConfig } from "../src/cli/config.js";

describe("the Exhibition replay job configuration", () => {
  test("names the one row to replay and the bound the Match track calls under", () => {
    expect(readExhibitionJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      EXHIBITION_MODEL_ID: "exhibition/late",
      PREDICT_CONCURRENCY: "4",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 4,
      openRouterApiKey: "secret-from-environment"
    });
  });

  test("refuses a replay with no model id, and takes no Gameweek", () => {
    expect(() => readExhibitionJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      GAMEWEEK: "7",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toThrow("EXHIBITION_MODEL_ID is required");
  });
});

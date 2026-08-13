import { describe, expect, test } from "vitest";
import {
  readExhibitionJobConfig,
  readExhibitionTrack,
  readFplExhibitionJobConfig
} from "../src/cli/config.js";

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

  test("walks the Match track unless the operator names another", () => {
    expect(readExhibitionTrack({})).toBe("match");
    expect(readExhibitionTrack({ TRACK: " fpl " })).toBe("fpl");
    // One entry point takes both tracks (spec 0013), so a typo in the one
    // argument that chooses between them must not quietly run the other.
    expect(() => readExhibitionTrack({ TRACK: "match-track" }))
      .toThrow("TRACK must be match or fpl");
  });

  test("takes a call timeout for the FPL track and no concurrency", () => {
    // A season path is replayed in order, so there is never a second call to
    // bound — and the FPL prompt is the one that needs a timeout of its own
    // (spec 0010).
    expect(readFplExhibitionJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      EXHIBITION_MODEL_ID: "exhibition/late",
      ENTRANT_CALL_TIMEOUT_MS: "600000",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toEqual({
      databaseUrl: "postgresql://localhost/benchmark",
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      entrantCallTimeoutMs: 600000,
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

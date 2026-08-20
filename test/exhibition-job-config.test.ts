import { describe, expect, test } from "vitest";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS
} from "../src/predictions/openrouter-entrant.js";
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
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
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

  test("takes no concurrency on the FPL track", () => {
    // A season path is replayed in order, so there is never a second call to
    // bound. Both tracks carry a call timeout since ticket 0023; only the
    // Match one's default moved, so this track's stays where it was.
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

    expect(readFplExhibitionJobConfig({
      DATABASE_URL: "postgresql://localhost/benchmark",
      SEASON: "2026-27",
      EXHIBITION_MODEL_ID: "exhibition/late",
      OPENROUTER_API_KEY: "secret-from-environment"
    })).toMatchObject({ entrantCallTimeoutMs: 120_000 });
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

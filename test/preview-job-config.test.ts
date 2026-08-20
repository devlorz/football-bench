import { describe, expect, test } from "vitest";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS
} from "../src/predictions/openrouter-entrant.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { readPreviewJobConfig } from "../src/cli/config.js";

const environment = {
  DATABASE_URL: "postgresql://archive/real",
  SEASON: "2026-27",
  FOOTBALL_DATA_SEASON: "2025-26",
  GAMEWEEK: "1",
  OPENROUTER_API_KEY: "preview-key"
};

describe("the preview job configuration", () => {
  test("reads the archive, the Competition, the Gameweek and the instant", () => {
    expect(readPreviewJobConfig(environment)).toEqual({
      databaseUrl: "postgresql://archive/real",
      season: "2026-27",
      footballDataSeason: "2025-26",
      footballDataOrgToken: null,
      competition: "PL",
      gameweek: 1,
      at: "deadline-6h",
      concurrency: SEASON_ROSTER_SIZE,
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      openRouterApiKey: "preview-key"
    });
  });

  test("takes the Competition from the environment, in the code's own case", () => {
    expect(readPreviewJobConfig({ ...environment, COMPETITION: " pd " }))
      .toMatchObject({ competition: "PD" });
  });

  test("refuses something that is not a Competition code", () => {
    expect(() => readPreviewJobConfig({ ...environment, COMPETITION: "La Liga" }))
      .toThrow(/COMPETITION must be a Competition code/);
  });

  test("takes the rehearsed instant from the environment", () => {
    expect(readPreviewJobConfig({ ...environment, PREVIEW_AT: "deadline-90m" }))
      .toMatchObject({ at: "deadline-90m" });
  });

  test("refuses an instant it cannot read, before any database is built", () => {
    expect(() => readPreviewJobConfig({ ...environment, PREVIEW_AT: "tonight" }))
      .toThrow(/tonight/);
  });

  test("requires the key the real roster is called with", () => {
    expect(() => readPreviewJobConfig({
      ...environment, OPENROUTER_API_KEY: ""
    })).toThrow(/OPENROUTER_API_KEY is required/);
  });

  test("the bench takes the Entrant call's window from the same knob", () => {
    // The one path here that spends real money, so it is the last place a
    // seat should be cut off by a number nobody could reach (ticket 0023).
    expect(readPreviewJobConfig({
      ...environment,
      ENTRANT_CALL_TIMEOUT_MS: "600000"
    })).toMatchObject({ entrantCallTimeoutMs: 600_000 });
  });
});

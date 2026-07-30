import { describe, expect, test } from "vitest";
import {
  ArchiveReplayMissError,
  createArchiveReplayFetcher
} from "../src/dry-run/archive-replay-fetcher.js";

describe("the archive replay fetcher", () => {
  test("serves an archived source body for the URL that produced it", async () => {
    const http = createArchiveReplayFetcher([
      { source: "fpl_fixtures", body: "[{\"id\":1}]" }
    ]);

    const response = await http(
      "https://fantasy.premierleague.com/api/fixtures/"
    );

    expect(response).toEqual({ status: 200, body: "[{\"id\":1}]" });
  });

  test("maps a football-data URL back to the Season its snapshot was archived under", async () => {
    const http = createArchiveReplayFetcher([
      { source: "football_data:2025-26:E0", body: "Div,Date\nE0,09/08/2025" }
    ]);

    const response = await http(
      "https://www.football-data.co.uk/mmz4281/2526/E0.csv"
    );

    expect(response.body).toBe("Div,Date\nE0,09/08/2025");
  });

  test("serves each Entrant the archived response recorded for its own Base Model", async () => {
    const http = createArchiveReplayFetcher([
      { source: "openrouter-preflight:x-ai/grok-4.5", body: "grok body" },
      { source: "openrouter-preflight:z-ai/glm-5.2", body: "glm body" }
    ]);

    const response = await http(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({ model: "z-ai/glm-5.2", messages: [] })
      }
    );

    expect(response.body).toBe("glm body");
  });

  test("refuses a URL no archived snapshot covers, so a dry run cannot reach the network", async () => {
    const http = createArchiveReplayFetcher([
      { source: "fpl_fixtures", body: "[]" }
    ]);

    await expect(
      http("https://fantasy.premierleague.com/api/bootstrap-static/")
    ).rejects.toThrow(ArchiveReplayMissError);
  });
});

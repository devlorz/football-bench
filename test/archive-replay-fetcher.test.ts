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

  // A Spanish division code is three characters where an English one is two,
  // and the URL pattern used to admit only two. The snapshot was archived and
  // held, and the replay still answered "no archived snapshot source is known"
  // — a dry run unable to replay history it had in hand.
  test("maps a three-character division code as readily as a two", async () => {
    const http = createArchiveReplayFetcher([
      { source: "football_data:2025-26:SP1", body: "Div,Date\nSP1,16/08/2025" }
    ]);

    const response = await http(
      "https://www.football-data.co.uk/mmz4281/2526/SP1.csv"
    );

    expect(response.body).toBe("Div,Date\nSP1,16/08/2025");
  });

  // Understat had no mapping at all until ticket 6, for either league. It is
  // worth a test rather than a line of code because the miss was invisible:
  // an unreachable Understat is a reported outcome and not a failure
  // (ADR-0019), so a dry run degraded every form line to "xG unavailable" and
  // still called itself a replay of the whole write path.
  test("replays Understat, whose Season is addressed by its opening year", async () => {
    const http = createArchiveReplayFetcher([
      { source: "understat:2025-26:La_liga", body: "{\"dates\":[]}" },
      { source: "understat:2025-26:EPL", body: "{\"dates\":[1]}" }
    ]);

    expect((await http("https://understat.com/getLeagueData/La_liga/2025")).body)
      .toBe("{\"dates\":[]}");
    expect((await http("https://understat.com/getLeagueData/EPL/2025")).body)
      .toBe("{\"dates\":[1]}");
  });

  // The turn of the century, where `(year + 1) % 100` has to keep its zero.
  test("addresses a Season whose second year needs a leading zero", async () => {
    const http = createArchiveReplayFetcher([
      { source: "understat:2099-00:EPL", body: "{\"dates\":[]}" }
    ]);

    expect((await http("https://understat.com/getLeagueData/EPL/2099")).body)
      .toBe("{\"dates\":[]}");
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

import { describe, expect, test } from "vitest";
import {
  ArchiveReplayMissError,
  createArchiveReplayFetcher
} from "../src/dry-run/archive-replay-fetcher.js";
import {
  sourceName as uefaSourceName,
  sourceUrl as uefaSourceUrl
} from "../src/uefa/fetch-competition.js";
import {
  listingSource,
  listingUrl,
  sheetSource,
  sheetUrl
} from "../src/365scores/fetch-match-stats.js";

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
      { source: "understat:2025-26:EPL", body: "{\"dates\":[1]}" },
      { source: "understat:2025-26:Serie_A", body: "{\"dates\":[2]}" },
      // A slug whose own name ends in a digit, where the Season's opening year
      // follows immediately after the slash: `Ligue_1/2025`. `Serie_A` does
      // not exercise that, and a pattern that read the trailing `1` as part of
      // the year would replay nothing.
      { source: "understat:2025-26:Ligue_1", body: "{\"dates\":[3]}" }
    ]);

    expect((await http("https://understat.com/getLeagueData/La_liga/2025")).body)
      .toBe("{\"dates\":[]}");
    expect((await http("https://understat.com/getLeagueData/EPL/2025")).body)
      .toBe("{\"dates\":[1]}");
    expect((await http("https://understat.com/getLeagueData/Serie_A/2025")).body)
      .toBe("{\"dates\":[2]}");
    expect((await http("https://understat.com/getLeagueData/Ligue_1/2025")).body)
      .toBe("{\"dates\":[3]}");
  });

  // The turn of the century, where `(year + 1) % 100` has to keep its zero.
  test("addresses a Season whose second year needs a leading zero", async () => {
    const http = createArchiveReplayFetcher([
      { source: "understat:2099-00:EPL", body: "{\"dates\":[]}" }
    ]);

    expect((await http("https://understat.com/getLeagueData/EPL/2099")).body)
      .toBe("{\"dates\":[]}");
  });

  /**
   * The first paged source the record reads, so the first whose snapshot name
   * has to carry an offset: two pages filed under one name would be one page
   * overwriting the other, and a Season would replay half its schedule.
   *
   * Driven from the fetch's own `sourceUrl` and `sourceName` rather than from
   * URLs written out here, because what this has to catch is the two drifting
   * apart — a URL this file spells itself would keep matching a pattern the
   * fetch had stopped producing.
   */
  test("replays every page of a UEFA Season under its own offset", async () => {
    const http = createArchiveReplayFetcher([
      { source: uefaSourceName("UNL", "2026-27", 0), body: "[{\"id\":\"1\"}]" },
      { source: uefaSourceName("UNL", "2026-27", 100), body: "[{\"id\":\"2\"}]" }
    ]);

    expect((await http(uefaSourceUrl("UNL", "2026-27", 0))).body)
      .toBe("[{\"id\":\"1\"}]");
    expect((await http(uefaSourceUrl("UNL", "2026-27", 100))).body)
      .toBe("[{\"id\":\"2\"}]");
  });

  /**
   * Driven from the fetch's own URL and name builders, for the reason the
   * UEFA case above is: what this catches is the two drifting apart. Neither
   * 365Scores URL carries the Season its snapshot is named for, so what is
   * proven here is the ending match that finds it.
   */
  test("replays a 365Scores day and a match sheet under their own names",
    async () => {
      const http = createArchiveReplayFetcher([
        {
          source: listingSource("UNL", "2026-27", "2026-09-24"),
          body: "{\"games\":[]}"
        },
        {
          source: sheetSource("UNL", "2026-27", "4444714"),
          body: "{\"statistics\":[]}"
        }
      ]);

      expect((await http(listingUrl("UNL", "2026-09-24"))).body)
        .toBe("{\"games\":[]}");
      expect((await http(sheetUrl("4444714"))).body)
        .toBe("{\"statistics\":[]}");
    });

  test("names the Season it looked for when no 365Scores snapshot matches",
    async () => {
      // The miss has to name the ending rather than report no known source:
      // these bytes may be archived under another Season, and "no archived
      // snapshot source is known" would send a reader to this file instead of
      // to the archive.
      const http = createArchiveReplayFetcher([
        {
          source: listingSource("UNL", "2026-27", "2026-09-24"),
          body: "{\"games\":[]}"
        }
      ]);

      await expect(http(sheetUrl("4444714"))).rejects
        .toThrow("365scores:<season>:<competition>:stats:4444714");
      await expect(http(listingUrl("UNL", "2026-10-01"))).rejects
        .toThrow("365scores:<season>:UNL:games:2026-10-01");
    });

  test("names no source for a UEFA Competition the record does not read",
    async () => {
      // A competitionId nothing maps is a URL this replay has no name for,
      // which is the honest answer: inventing `uefa:2026-27:?` would report a
      // missing snapshot for a Competition that was never archived.
      const http = createArchiveReplayFetcher([
        { source: uefaSourceName("UNL", "2026-27", 0), body: "[]" }
      ]);

      await expect(http(
        "https://match.uefa.com/v5/matches"
        + "?competitionId=1&seasonYear=2027&limit=100&offset=0"
      )).rejects.toThrow(ArchiveReplayMissError);
    });

  /**
   * The two Wikipedia pages a packet is built from, told apart by their
   * titles: a transfer list is filed under its window's name and a season
   * article under its own. Left unmapped, either would replay as a stated
   * absence over an archive that held the page, which is the failure this
   * file's comments have already recorded twice.
   */
  test("replays both Wikipedia pages under the names they are archived by",
    async () => {
      const http = createArchiveReplayFetcher([
        {
          source: "wikipedia:squad-changes:summer-2026",
          body: "the transfer list"
        },
        {
          source: "wikipedia:head-coach-changes:2026-27-premier-league",
          body: "the season article"
        }
      ]);

      expect((await http(
        "https://en.wikipedia.org/w/index.php"
        + "?title=List_of_English_football_transfers_summer_2026&action=raw"
      )).body).toBe("the transfer list");
      expect((await http(
        "https://en.wikipedia.org/w/index.php"
        + "?title=2026%E2%80%9327_Premier_League&action=raw"
      )).body).toBe("the season article");
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

  test("replays the live player points endpoint under its archived source", async () => {
    const http = createArchiveReplayFetcher([
      { source: "fpl_live:2026-27:1", body: "{\"elements\":[]}" }
    ]);

    const response = await http(
      "https://fantasy.premierleague.com/api/event/1/live/"
    );

    expect(response.body).toBe("{\"elements\":[]}");
  });

  test("refuses the live player points endpoint when the archive holds no snapshot for it", async () => {
    const http = createArchiveReplayFetcher([
      { source: "fpl_fixtures", body: "[]" }
    ]);

    await expect(
      http("https://fantasy.premierleague.com/api/event/1/live/")
    ).rejects.toThrow(
      "No archived snapshot for source fpl_live:<season>:1 (https://fantasy.premierleague.com/api/event/1/live/)"
    );
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

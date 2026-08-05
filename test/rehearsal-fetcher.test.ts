import { describe, expect, test } from "vitest";
import { ArchiveReplayMissError } from "../src/dry-run/archive-replay-fetcher.js";
import { parseOpenRouterResponse } from "../src/predictions/openrouter-entrant.js";
import { createRehearsalFetcher } from "../src/fpl-rehearsal/rehearsal-fetcher.js";

const SEASON = "2026-27";

describe("the rehearsal fetcher", () => {
  test("serves the fabricated points a Gameweek settled with", async () => {
    const http = createRehearsalFetcher({
      season: SEASON,
      snapshots: [
        { source: "fpl_live:2026-27:3", body: "{\"elements\":[]}" }
      ],
      answer: () => "unused"
    });

    const response = await http(
      "https://fantasy.premierleague.com/api/event/3/live/"
    );

    expect(response).toEqual({ status: 200, body: "{\"elements\":[]}" });
  });

  test("refuses a Gameweek whose points the rehearsal never fabricated", async () => {
    const http = createRehearsalFetcher({
      season: SEASON,
      snapshots: [
        { source: "fpl_live:2026-27:3", body: "{\"elements\":[]}" }
      ],
      answer: () => "unused"
    });

    // Gameweek 4 settled in no rehearsal, so asking for it is a scenario that
    // was never written rather than a Gameweek that scored nothing. The source
    // is named, because "no snapshot at all" and "no snapshot for this
    // Gameweek" are different mistakes to have made.
    await expect(
      http("https://fantasy.premierleague.com/api/event/4/live/")
    ).rejects.toThrow(
      "No archived snapshot for source fpl_live:2026-27:4"
    );
  });

  test("refuses a URL no snapshot covers, so a rehearsal cannot reach the network", async () => {
    const http = createRehearsalFetcher({
      season: SEASON,
      snapshots: [],
      answer: () => "unused"
    });

    await expect(
      http("https://fantasy.premierleague.com/api/bootstrap-static/")
    ).rejects.toThrow(ArchiveReplayMissError);
  });

  test("answers each Base Model from its own place in its own script", async () => {
    const asked: string[] = [];
    const http = createRehearsalFetcher({
      season: SEASON,
      snapshots: [],
      answer: (baseModel, attempt) => {
        asked.push(`${baseModel}#${attempt}`);
        return `${baseModel} said ${attempt}`;
      }
    });

    async function ask(baseModel: string): Promise<string | null> {
      const response = await http(
        "https://openrouter.ai/api/v1/chat/completions",
        { method: "POST", body: JSON.stringify({ model: baseModel, messages: [] }) }
      );
      // Read back through the parser the Entrant path actually uses, so the
      // envelope is proved against the contract rather than against a shape
      // this test invented.
      return parseOpenRouterResponse(response.body)?.content ?? null;
    }

    // Interleaved deliberately. A Repair is the same Base Model's next turn in
    // the same conversation, so a counter shared across the roster would hand
    // one Entrant's Repair to whoever happened to be called next.
    expect(await ask("vendor/one")).toBe("vendor/one said 0");
    expect(await ask("vendor/two")).toBe("vendor/two said 0");
    expect(await ask("vendor/one")).toBe("vendor/one said 1");
    expect(asked).toEqual([
      "vendor/one#0",
      "vendor/two#0",
      "vendor/one#1"
    ]);
  });
});

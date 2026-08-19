import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { DryRunArchive } from "../src/dry-run/load-archive.js";
import { previewGameweek } from "../src/dry-run/preview-gameweek.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";
import {
  firstMessageText,
  type CapturedTurn
} from "./sent-context.js";

const { Client } = pg;
const SEASON = "2026-27";
const FOOTBALL_DATA_SEASON = "2025-26";
const GAMEWEEK = 1;

/** A live-looking body that answers whichever Fixture was actually asked. */
function liveResponse(fixtureId: number): string {
  return JSON.stringify({
    openrouter_metadata: {
      endpoints: {
        available: [{ provider: "Vendor", model: "vendor/base-1", selected: true }]
      }
    },
    choices: [{
      message: {
        content: JSON.stringify({
          fixture_id: fixtureId,
          probs: { H: 0.5, D: 0.3, A: 0.2 },
          score: { home: 2, away: 1 },
          rationale: "Live answer."
        })
      }
    }],
    usage: { prompt_tokens: 1800, completion_tokens: 700 }
  });
}

describe("previewing a Gameweek with live Entrants", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let archive: DryRunArchive;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    archive = {
      observedAt: new Date("2026-07-29T00:00:00Z"),
      snapshots: [
        { source: "fpl_bootstrap", body: await archivedBody("fpl-bootstrap-2026-27.json.gz") },
        { source: "fpl_fixtures", body: await archivedBody("fpl-fixtures-2026-27.json.gz") },
        { source: "football_data:2025-26:E0", body: await archivedBody("football-data-2526-E0.csv.gz") },
        { source: "football_data:2025-26:E1", body: await archivedBody("football-data-2526-E1.csv.gz") }
      ],
      entrants: [
        {
          id: "one", name: "Entrant One", role: "entrant",
          base_model: "vendor/base-1", provider: "vendor", quantization: null,
          prompt_version: MATCH_PROMPT_VERSION, config: {}
        },
        {
          id: "two", name: "Entrant Two", role: "entrant",
          base_model: "vendor/base-2", provider: "vendor", quantization: "fp8",
          prompt_version: MATCH_PROMPT_VERSION, config: {}
        }
      ]
    };
    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
  });

  test("asks each Entrant about the Fixture in front of it and reports the answer", async () => {
    const asked: number[] = [];

    const result = await previewGameweek({
      target: client,
      archive,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      apiKey: "preview-key",
      concurrency: 4,
      at: "deadline-6h",
      http: async (url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          messages: CapturedTurn[];
        };
        const fixtureId = Number(
          /Fixture ID: (\d+)/.exec(firstMessageText(body.messages))?.[1] ?? 0
        );
        asked.push(fixtureId);
        return { status: 200, body: liveResponse(fixtureId) };
      }
    });

    // The point of a preview: every Entrant answers the Fixture it was asked
    // about, so nothing is rejected on fixture_id the way a replay would be.
    expect(result.gapAlert).toBeNull();
    expect(result.forecasts.length).toBe(asked.length);
    expect(result.forecasts.length).toBe(
      new Set(asked).size * archive.entrants.length
    );
    expect(result.forecasts[0]).toMatchObject({
      home: 0.5, draw: 0.3, away: 0.2,
      predictedHome: 2, predictedAway: 1, repairs: 0
    });
    expect(result.tokensIn).toBeGreaterThan(0);
  });

  test("previews the Competition it is given rather than the Premier League", async () => {
    // The bench (ticket 0020 slice 3) asks La Liga's Gameweek, and a preview
    // that always previewed the Premier League could not answer it. A
    // Competition whose Gameweeks this archive does not hold is the cheapest
    // proof the parameter reaches the run at all: the same call for `PL` gets
    // as far as the Entrants.
    await expect(previewGameweek({
      target: client,
      archive,
      competition: "PD",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      apiKey: "preview-key",
      concurrency: 1,
      at: "deadline-6h",
      http: async () => { throw new Error("no call should be made"); }
    })).rejects.toThrow("The archive produced no Gameweek 1 for Season 2026-27");
  });

  test("runs at an instant the Gameweek's own Lock dates, not at the wall clock", async () => {
    // A bench over a Gameweek already played answers after its Lock, and an
    // Entrant answering after its Lock is refused (ADR-0032's neighbour in
    // attempt-match-calls). The instant is therefore derived from the deadline
    // the way the dry run derives it, and the stored attempt says so.
    await previewGameweek({
      target: client,
      archive,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      apiKey: "preview-key",
      concurrency: 4,
      at: "deadline-6h",
      http: async (url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          messages: CapturedTurn[];
        };
        const fixtureId = Number(
          /Fixture ID: (\d+)/.exec(firstMessageText(body.messages))?.[1] ?? 0
        );
        return { status: 200, body: liveResponse(fixtureId) };
      }
    });

    const timing = await client.query<{ deadline: Date; started: Date }>(
      `select g.deadline_at as deadline, min(a.attempted_at) as started
         from gameweeks g, attempts a
        where g.competition = 'PL' and g.season = $1 and g.gw = $2
        group by g.deadline_at`,
      [SEASON, GAMEWEEK]
    );
    const row = timing.rows[0];
    expect(row).toBeDefined();
    expect(row!.started.getTime()).toBe(
      row!.deadline.getTime() - 6 * 60 * 60 * 1000
    );
  });

  test("builds the Gameweek from the archive without reaching the network for data", async () => {
    const result = await previewGameweek({
      target: client,
      archive,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      apiKey: "preview-key",
      concurrency: 1,
      at: "deadline-6h",
      // Only Entrant calls may leave. Anything else means the data layer went
      // live, when the archive is supposed to supply it.
      http: async (url) => {
        if (!url.includes("openrouter")) {
          throw new Error(`Preview reached the network for data: ${url}`);
        }
        return { status: 200, body: liveResponse(1) };
      }
    });

    const context = result.contexts[0];
    expect(context?.body).toContain("Fixture ID:");
    expect(context?.body).toContain("Historical context");
    expect(context?.body).toContain("FPL-derived player context");
  });
});

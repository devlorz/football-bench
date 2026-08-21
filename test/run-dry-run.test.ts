import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import { runDryRun } from "../src/dry-run/run-dry-run.js";
import {
  prepareArchivedGameweek
} from "../src/dry-run/prepare-archived-gameweek.js";
import type { DryRunArchive } from "../src/dry-run/load-archive.js";
import { archivedBase64Body, archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const FOOTBALL_DATA_SEASON = "2025-26";
const GAMEWEEK = 1;

describe("a dry run against an archived Gameweek", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let archive: DryRunArchive;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    archive = {
      observedAt: new Date("2026-07-29T00:00:00Z"),
      snapshots: [
        {
          source: "fpl_bootstrap",
          body: await archivedBody("fpl-bootstrap-2026-27.json.gz")
        },
        {
          source: "fpl_fixtures",
          body: await archivedBody("fpl-fixtures-2026-27.json.gz")
        },
        {
          source: "football_data:2025-26:E0",
          body: await archivedBody("football-data-2526-E0.csv.gz")
        },
        {
          source: "football_data:2025-26:E1",
          body: await archivedBody("football-data-2526-E1.csv.gz")
        },
        {
          source: "openrouter-preflight:openai/gpt-5.6-sol-pro",
          body: await archivedBase64Body(
            "openrouter-gpt-5.6-sol-pro-2026-07-29.base64"
          )
        }
      ],
      entrants: [
        {
          id: "sol",
          name: "Sol Pro",
          role: "entrant",
          base_model: "openai/gpt-5.6-sol-pro",
          provider: "openai",
          quantization: null,
          prompt_version: MATCH_PROMPT_VERSION,
          config: {}
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

  async function dryRun(at: string) {
    return runDryRun({
      target: client,
      archive,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at,
      concurrency: 4
    });
  }

  test("runs the whole path from archived snapshots and stores Predictions", async () => {
    const result = await dryRun("deadline-6h");

    // The archived Gameweek holds ten Fixtures, and the loaded history spans
    // both divisions of the prior Season.
    const counts = await client.query(
      `select
         (select count(*)::int from contexts) as contexts,
         (select count(*)::int from historical_matches) as history,
         (select count(*)::int from fpl_players) as players,
         (select count(*)::int from predictions) as predictions`
    );
    expect(counts.rows[0]).toEqual({
      contexts: 10,
      history: 932,
      players: 563,
      predictions: 1
    });
    expect(result.instant.getTime())
      .toBe(result.deadline.getTime() - 6 * 3_600_000);
  });

  test("records a Gap for each Fixture the single archived response does not answer", async () => {
    const result = await dryRun("deadline-6h");

    // One OpenRouter response is archived per Base Model, recorded against one
    // Fixture. Replayed against the other nine it is correctly rejected on its
    // fixture_id, after the full three Repairs each.
    const attempts = await client.query(
      `select error_kind, count(*)::int as n
         from attempts where trigger = 'main'
        group by error_kind order by n desc`
    );
    expect(attempts.rows).toEqual([
      { error_kind: "schema", n: 36 },
      { error_kind: null, n: 1 }
    ]);
    expect(result.phases[0]!.gapAlert?.gaps).toHaveLength(9);
  });

  test("produces a context per Fixture that a person can read", async () => {
    const result = await dryRun("deadline-6h");

    expect(result.contexts.length).toBeGreaterThan(0);
    const [first] = result.contexts;
    expect(first!.body).toContain("Predict this Premier League Fixture.");
    expect(first!.body).toContain(first!.homeTeam);
  });

  test("rehearses the Fill after the main run, reusing the stored contexts", async () => {
    const result = await dryRun("deadline-6h");

    // The Fill must find the context the main run stored rather than building
    // a fresher one, so a late-filled Entrant sees what its peers saw.
    const contexts = await client.query(
      "select count(*)::int as n from contexts"
    );
    expect(contexts.rows[0].n).toBe(10);

    const byTrigger = await client.query(
      `select trigger, count(*)::int as n
         from attempts group by trigger order by trigger`
    );
    expect(byTrigger.rows).toEqual([
      { trigger: "fill", n: 36 },
      { trigger: "main", n: 37 }
    ]);
    expect(result.phases.map(({ trigger }) => trigger))
      .toEqual(["main", "fill"]);
  });

  test("states the outcome the archive should produce, and produces it", async () => {
    const result = await dryRun("deadline-6h");

    expect(result.expected).toEqual({ predictions: 1, gaps: 9 });
    expect(result.phases[0]!.predictions).toBe(1);
    expect(result.phases[0]!.gapAlert?.gaps).toHaveLength(9);
  });

  test("expects nothing written once the Lock has passed", async () => {
    const result = await dryRun("deadline+90m");

    expect(result.expected).toEqual({ predictions: 0, gaps: 10 });
    expect(result.phases[0]!.predictions).toBe(0);
  });

  test("refuses to write a Prediction when the chosen instant is past the Lock", async () => {
    await dryRun("deadline+90m");

    const predictions = await client.query(
      "select count(*)::int as n from predictions"
    );
    const refused = await client.query(
      "select count(*)::int as n from attempts where error_kind = 'deadline'"
    );
    expect(predictions.rows[0].n).toBe(0);
    expect(refused.rows[0].n).toBeGreaterThan(0);
  });

  test("rehearses one Competition, not every league the archive has bytes for", async () => {
    // Ticket 0033 captured Serie A's and Ligue 1's schedules long before either
    // was activated, so an archive holds a football-data.org snapshot for a
    // league whose Understat, transfer and season-article bytes do not exist.
    // Listed, that league takes the rehearsal down with it -- and the Premier
    // League's own rehearsal went red over Serie A for exactly this reason.
    const withAForeignSchedule: DryRunArchive = {
      ...archive,
      snapshots: [
        ...archive.snapshots,
        { source: `football_data_org:${SEASON}:SA`, body: "never read" }
      ]
    };

    await prepareArchivedGameweek({
      target: client,
      archive: withAForeignSchedule,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON
    });

    const listed = await client.query<{ competition: string }>(
      "select competition from competitions order by competition"
    );
    expect(listed.rows.map(({ competition }) => competition)).toEqual(["PL"]);
  });
});

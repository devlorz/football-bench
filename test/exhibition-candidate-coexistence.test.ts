import { describe, expect, test, beforeAll, beforeEach } from "vitest";
import pg from "pg";
import { insertOxAlpha, resetSchema, OX_ALPHA_FIXTURE } from "./schema-fixture.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";
import { readGapAlert } from "../src/predictions/gap-alert.js";
import { handleDashboardRequest, type LeaderboardBody } from "../src/dashboard/read-api.js";
import { loadStartedRoster } from "../src/fpl/manager-state-store.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import { runFplGameweek } from "../src/fpl/run-fpl-gameweek.js";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
  MATCH_PROMPT_VERSION
} from "../src/predictions/openrouter-entrant.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { FPL_ROSTER_SIZE } from "../src/season-roster.js";
import { FPL_POOL, lockPool } from "./fpl-pool-fixture.js";
import { BASE_MODELS, seatId } from "./fpl-seat-fixture.js";

const { Client } = pg;

function okResponse(model: string, fixtureId = 1): string {
  return JSON.stringify({
    model,
    openrouter_metadata: {
      endpoints: {
        available: [{
          provider: `Resolved ${model}`,
          model,
          selected: true
        }]
      }
    },
    choices: [{
      message: {
        content: JSON.stringify({
          fixture_id: fixtureId,
          probs: { H: 0.6, D: 0.24, A: 0.16 },
          score: { home: 2, away: 1 },
          rationale: "Pre-flight answer."
        })
      }
    }]
  });
}

const LEGAL_FPL_ACTION = JSON.stringify({
  transfers_in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  },
  rationale: "The opening fifteen."
});

const STAND_PAT_FPL_ACTION = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  },
  rationale: "Standing pat."
});

describe("exhibition candidate coexistence and pre-flight", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         predictions, contexts, fixtures, attempts, models, gameweeks,
         competitions, manager_states, fpl_players
       restart identity cascade`
    );

    await client.query(
      `insert into competitions (competition, season) values ('PL', '2026-27');
       insert into gameweeks (competition, season, gw, deadline_at)
       values
         ('PL', '2026-27', 1, '2026-08-21T17:30:00Z'),
         ('PL', '2026-27', 2, '2026-08-28T17:30:00Z');
       insert into fixtures (
         competition, season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values (
         'PL', '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City', '2026-08-21T19:00:00Z'
       );`
    );

    for (let i = 1; i <= 10; i++) {
      const pad = String(i).padStart(2, "0");
      await client.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role, config
         ) values ($1, $2, $3, $4, null, $5, 'entrant', '{"baseModelClass":"Open-weight"}')`,
        [`match/entrant-${pad}`, `Entrant ${i}`, `vendor/model-${i}`, `provider-${i}`, MATCH_PROMPT_VERSION]
      );
    }
  });

  test("inserting the exhibition row persists the required acceptance fields", async () => {
    await insertOxAlpha(client);

    const res = await client.query(
      `select id, name, base_model, provider, quantization, prompt_version, role, config
         from models where id = $1`,
      [OX_ALPHA_FIXTURE.id]
    );

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toEqual({
      id: "exhibition/ox-alpha",
      name: "Ox Alpha",
      base_model: "stealth/ox-alpha",
      provider: "stealth",
      quantization: null,
      prompt_version: MATCH_PROMPT_VERSION,
      role: "exhibition",
      config: {
        baseModelClass: "First-party",
        canonical_slug: "stealth/ox-alpha",
        catalog_checked_at: "2026-08-23"
      }
    });
  });

  test("predictGameweek behaves identically before and after inserting Ox Alpha", async () => {
    const runPredict = async () => {
      const calledModels: string[] = [];
      await predictGameweek({
        database: client,
        competition: "PL",
        season: "2026-27",
        gameweek: 1,
        concurrency: 10,
        apiKey: "test-key",
        entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
        now: () => new Date("2026-08-21T12:00:00Z"),
        http: async (_url, options) => {
          const req = JSON.parse(options?.body ?? "{}") as { model: string };
          calledModels.push(req.model);
          return { status: 200, body: okResponse(req.model) };
        }
      });
      return calledModels;
    };

    const before = await runPredict();
    expect(before).toHaveLength(10);

    // Reset predictions table, insert Ox Alpha, and run again
    await client.query("truncate predictions restart identity cascade");
    await insertOxAlpha(client);

    const after = await runPredict();
    expect(after).toEqual(before);
    expect(after).not.toContain("stealth/ox-alpha");
  });

  test("full-roster preflightBaseModels behaves identically before and after inserting Ox Alpha", async () => {
    const runPreflight = async () => {
      const called: string[] = [];
      const report = await preflightBaseModels({
        database: client,
        competition: "PL",
        season: "2026-27",
        fixtureId: 1,
        expectedEntrantCount: 10,
        apiKey: "test-key",
        entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
        http: async (_url, options) => {
          const req = JSON.parse(options?.body ?? "{}") as { model: string };
          called.push(req.model);
          return { status: 200, body: okResponse(req.model) };
        }
      });
      return { ok: report.ok, called };
    };

    const before = await runPreflight();
    expect(before.ok).toBe(true);
    expect(before.called).toHaveLength(10);

    await insertOxAlpha(client);

    const after = await runPreflight();
    expect(after).toEqual(before);
    expect(after.called).not.toContain("stealth/ox-alpha");
  });

  test("startFplTrack and runFplGameweek behave identically before and after inserting Ox Alpha", async () => {
    await lockPool(client, 1, FPL_POOL);
    await lockPool(client, 2, FPL_POOL);

    const fplModels = BASE_MODELS.slice(0, FPL_ROSTER_SIZE);
    for (const baseModel of fplModels) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [seatId(baseModel), baseModel, baseModel, FPL_PROMPT_VERSION]
      );
    }

    const httpOpening = async () => ({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: LEGAL_FPL_ACTION } }],
        openrouter_metadata: {
          endpoints: { available: [{ provider: "vendor", model: "vendor/m", selected: true }] }
        },
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      })
    });

    const httpGameweek = async () => ({
      status: 200,
      body: JSON.stringify({
        choices: [{ message: { content: STAND_PAT_FPL_ACTION } }],
        openrouter_metadata: {
          endpoints: { available: [{ provider: "vendor", model: "vendor/m", selected: true }] }
        },
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      })
    });

    // Opening track before Ox Alpha
    const openingBefore = await startFplTrack({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: FPL_ROSTER_SIZE,
      apiKey: "test-key",
      entrantCallTimeoutMs: 5000,
      now: () => new Date("2026-08-21T12:00:00Z"),
      http: httpOpening
    });
    expect(openingBefore.missing).toEqual([]);

    const rosterBefore = await loadStartedRoster(client, "2026-27", 1);
    expect(rosterBefore).toEqual(fplModels.map(seatId));

    // Run Gameweek 2 before Ox Alpha
    const gw2Before = await runFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 2,
      concurrency: FPL_ROSTER_SIZE,
      apiKey: "test-key",
      entrantCallTimeoutMs: 5000,
      now: () => new Date("2026-08-28T12:00:00Z"),
      http: httpGameweek
    });
    expect(gw2Before).toEqual({
      kind: "played",
      gameweek: 2,
      played: fplModels.map(seatId),
      standing: [],
      missing: []
    });

    // Insert Ox Alpha
    await insertOxAlpha(client);

    const rosterAfter = await loadStartedRoster(client, "2026-27", 1);
    expect(rosterAfter).toEqual(rosterBefore);
    expect(rosterAfter).not.toContain("exhibition/ox-alpha");

    // startFplTrack also ignores Ox Alpha on a fresh opening
    await client.query("truncate manager_states restart identity cascade");
    const openingAfter = await startFplTrack({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: FPL_ROSTER_SIZE,
      apiKey: "test-key",
      entrantCallTimeoutMs: 5000,
      now: () => new Date("2026-08-21T12:00:00Z"),
      http: httpOpening
    });
    expect(openingAfter).toEqual(openingBefore);
  });

  test("readGapAlert behaves identically before and after inserting Ox Alpha", async () => {
    await client.query(
      `insert into contexts (competition, season, gw, track, fixture_id, hash, body)
       values ('PL', '2026-27', 1, 'match', 1, 'dummyhash', 'dummybody')`
    );
    const contextId = (await client.query<{ id: number }>("select id from contexts limit 1")).rows[0]!.id;

    for (let i = 1; i <= 9; i++) {
      const pad = String(i).padStart(2, "0");
      await client.query(
        `insert into predictions (
           competition, season, fixture_id, model_id, probs, pred_home, pred_away, context_id, attempts_used, rationale, predicted_at
         ) values (
           'PL', '2026-27', 1, $1, '{"H":0.5,"D":0.3,"A":0.2}', 1, 0, $2, 1, 'test', now()
         )`,
        [`match/entrant-${pad}`, contextId]
      );
    }
    await client.query(
      `insert into attempts (
         competition, season, gw, track, fixture_id, model_id, attempt_no, trigger, ok, error_kind, attempted_at
       ) values ('PL', '2026-27', 1, 'match', 1, 'match/entrant-10', 1, 'main', false, 'provider', now())`
    );

    const alertBefore = await readGapAlert(client, "PL", "2026-27", 1, () => new Date("2026-08-21T12:00:00Z"));
    expect(alertBefore?.gaps).toHaveLength(1);
    expect(alertBefore?.gaps[0]?.entrantId).toBe("match/entrant-10");

    await insertOxAlpha(client);

    const alertAfter = await readGapAlert(client, "PL", "2026-27", 1, () => new Date("2026-08-21T12:00:00Z"));
    expect(alertAfter).toEqual(alertBefore);
  });

  // Note: Combined ranking dropping exhibition rows is tested in
  // test/dashboard-overall-view.test.ts:178 ("is absent from the output entirely").
  test("dashboard endpoints behave identically before and after inserting Ox Alpha", async () => {
    const query = async (sql: string, params?: readonly unknown[]) => {
      const res = await client.query(sql, params as unknown[]);
      return res.rows;
    };

    const getDashboardState = async () => {
      const leaderboardRes = await handleDashboardRequest(
        new Request("https://benchmark.local/api/pl/leaderboard"),
        query,
        "2026-27",
        new Date("2026-08-21T12:00:00Z")
      );
      const leaderboardBody = await leaderboardRes.json() as LeaderboardBody;

      const entrantsRes = await handleDashboardRequest(
        new Request("https://benchmark.local/api/pl/entrants"),
        query,
        "2026-27",
        new Date("2026-08-21T12:00:00Z")
      );
      const entrantsBody = await entrantsRes.json() as { entrants: Array<{ id: string }> };

      return { leaderboardBody, entrantsBody };
    };

    const before = await getDashboardState();
    expect(before.leaderboardBody.entrants.map((e) => e.id)).not.toContain("exhibition/ox-alpha");

    await insertOxAlpha(client);

    const after = await getDashboardState();
    expect(after).toEqual(before);
  });

  test("deleting the exhibition row removes all operational state while preserving audit snapshot evidence", async () => {
    const query = async (sql: string, params?: readonly unknown[]) => {
      const res = await client.query(sql, params as unknown[]);
      return res.rows;
    };

    const initialLeaderboard = await (await handleDashboardRequest(
      new Request("https://benchmark.local/api/pl/leaderboard"),
      query,
      "2026-27",
      new Date("2026-08-21T12:00:00Z")
    )).json();

    // 1. Insert row and run single-model pre-flight (leaving audit snapshot)
    await insertOxAlpha(client);
    await preflightBaseModels({
      database: client,
      competition: "PL",
      season: "2026-27",
      fixtureId: 1,
      exhibitionModelId: OX_ALPHA_FIXTURE.id,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      http: async () => ({ status: 200, body: okResponse("stealth/ox-alpha") })
    });

    const snapshotBefore = await client.query<{ source: string }>(
      "select source from raw_snapshots where source = 'openrouter-preflight:stealth/ox-alpha'"
    );
    expect(snapshotBefore.rows).toHaveLength(1);

    // 2. Delete exhibition row
    const deleted = await client.query("delete from models where id = $1", [OX_ALPHA_FIXTURE.id]);
    expect(deleted.rowCount).toBe(1);

    // 3. Operational state is clean: model row is gone and dashboard matches initial state
    const modelsAfter = await client.query("select id from models order by id");
    expect(modelsAfter.rows).toHaveLength(10);
    expect(modelsAfter.rows.map((r) => r.id)).not.toContain(OX_ALPHA_FIXTURE.id);

    const leaderboardAfter = await (await handleDashboardRequest(
      new Request("https://benchmark.local/api/pl/leaderboard"),
      query,
      "2026-27",
      new Date("2026-08-21T12:00:00Z")
    )).json();
    expect(leaderboardAfter).toEqual(initialLeaderboard);

    // 4. Audit evidence remains intact in raw_snapshots
    const snapshotAfter = await client.query<{ source: string }>(
      "select source from raw_snapshots where source = 'openrouter-preflight:stealth/ox-alpha'"
    );
    expect(snapshotAfter.rows).toHaveLength(1);
  });

  test("single-model pre-flight targeting exhibition/ox-alpha probes the model directly", async () => {
    await insertOxAlpha(client);

    let calledUrl = "";
    let calledPayload: { model?: string; provider?: { order?: string[]; allow_fallbacks?: boolean } } = {};

    const report = await preflightBaseModels({
      database: client,
      competition: "PL",
      season: "2026-27",
      fixtureId: 1,
      exhibitionModelId: "exhibition/ox-alpha",
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      http: async (url, options) => {
        calledUrl = url;
        calledPayload = JSON.parse(options?.body ?? "{}") as typeof calledPayload;
        return {
          status: 200,
          body: JSON.stringify({
            model: "stealth/ox-alpha",
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: "Stealth",
                  model: "stealth/ox-alpha",
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.65, D: 0.2, A: 0.15 },
                  score: { home: 2, away: 0 },
                  rationale: "Ox Alpha prediction."
                })
              }
            }]
          })
        };
      }
    });

    expect(report.ok).toBe(true);
    expect(calledUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calledPayload.model).toBe("stealth/ox-alpha");
    expect(calledPayload.provider).toEqual({
      order: ["stealth"],
      allow_fallbacks: false
    });
    expect(report.results).toEqual([{
      modelId: "exhibition/ox-alpha",
      baseModel: "stealth/ox-alpha",
      status: "parseable",
      detail: null,
      resolvedProvider: "Stealth",
      resolvedModel: "stealth/ox-alpha",
      rawBody: null
    }]);
  });
});

import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { openFplGameweek } from "../src/fpl/open-fpl-gameweek.js";
import { parseFplTrackContextPool } from "../src/context/build-fpl-track-context.js";
import { GAMEWEEK_RULES } from "../src/fpl/apply-gameweek-action.js";
import { FPL_POOL } from "./fpl-pool-fixture.js";

const { Client } = pg;

const LEGAL_ACTION = JSON.stringify({
  transfers_in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  }
});

function openRouterBody(content: string): string {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

describe("opening the FPL track for a Gameweek", () => {
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
         predictions, contexts, fixtures, manager_states, attempts, models,
         gameweeks, fpl_players
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    for (const player of FPL_POOL) {
      await client.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added, observed_at
         ) values (
           '2026-27', 1, $1, $2, $3, $4, $5, 'a', null, '', null,
           '2026-08-21T17:00:00Z'
         )`,
        [
          player.fplId,
          player.club,
          player.webName,
          player.position,
          player.priceTenths
        ]
      );
    }
  });

  test("hands the Entrant the stored context and keeps its opening Manager State", async () => {
    let prompt = "";
    await openFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async (_url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          messages: Array<{ content: string }>;
        };
        prompt = body.messages[0]!.content;
        return { status: 200, body: openRouterBody(LEGAL_ACTION) };
      }
    });

    const contexts = await client.query(
      "select track, fpl_id, hash, body from contexts"
    );
    expect(contexts.rows).toHaveLength(1);
    const [context] = contexts.rows as Array<{
      track: string;
      fpl_id: number | null;
      hash: string;
      body: string;
    }>;
    expect(context).toMatchObject({ track: "fpl", fpl_id: null });
    // What the Entrant saw is what was stored, and the hash proves it.
    expect(prompt).toBe(context!.body);
    expect(context!.hash).toBe(
      createHash("sha256").update(context!.body).digest("hex")
    );
    // The context carries the Entrant's own state and the locked pool, with
    // each player pinned on one line the reducer can price from.
    expect(context!.body).toContain("£100.0m");
    expect(context!.body).toContain(
      '{"id":8,"name":"Palmer","club":"Chelsea","position":"MID",'
      + '"price":"£12.0m","price_tenths":120,"status":"available"}'
    );
    // Every rule the reducer can refuse an action for is stated in the text
    // the Entrant was handed, including the two that reach past the Squad
    // itself.
    expect(context!.body).toContain(
      "Every player must be in this Gameweek's player pool."
    );
    expect(context!.body).toContain(
      "A Transfer can only sell a player your Squad owns."
    );
    for (const rule of GAMEWEEK_RULES) {
      expect(context!.body).toContain(rule);
    }
    expect(parseFplTrackContextPool(context!.body)).toEqual(
      FPL_POOL.map(({ fplId, club, position, priceTenths }) => ({
        fplId,
        club,
        position,
        priceTenths
      }))
    );

    const states = await client.query(
      `select model_id, season, gw, squad, team_sheet, bank, free_transfers,
              hits, chips_used, chip_active, rolled_over, attempts_used
         from manager_states`
    );
    expect(states.rows).toEqual([{
      model_id: "entrant/v1",
      season: "2026-27",
      gw: 1,
      squad: {
        active: [
          { fplId: 1, purchasePriceTenths: 45 },
          { fplId: 2, purchasePriceTenths: 40 },
          { fplId: 3, purchasePriceTenths: 60 },
          { fplId: 4, purchasePriceTenths: 55 },
          { fplId: 5, purchasePriceTenths: 50 },
          { fplId: 6, purchasePriceTenths: 45 },
          { fplId: 7, purchasePriceTenths: 40 },
          { fplId: 8, purchasePriceTenths: 120 },
          { fplId: 9, purchasePriceTenths: 90 },
          { fplId: 10, purchasePriceTenths: 75 },
          { fplId: 11, purchasePriceTenths: 55 },
          { fplId: 12, purchasePriceTenths: 45 },
          { fplId: 13, purchasePriceTenths: 105 },
          { fplId: 14, purchasePriceTenths: 70 },
          { fplId: 15, purchasePriceTenths: 60 }
        ],
        free_hit_stash: null
      },
      team_sheet: {
        starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
        bench: [2, 7, 12, 15],
        captain: 8,
        viceCaptain: 13
      },
      // £100.0m less the £95.5m Squad above.
      bank: 45,
      free_transfers: 1,
      // The opening fifteen are not Transfers beyond an allowance.
      hits: 0,
      chips_used: { firstHalf: [], secondHalf: [] },
      chip_active: null,
      rolled_over: false,
      attempts_used: 0
    }]);
  });

  test("stores no Manager State for an action completed on the deadline", async () => {
    await openFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      // The Lock is the deadline instant itself, not the moment after it.
      now: () => new Date("2026-08-21T17:30:00Z"),
      http: async () => ({
        status: 200,
        body: openRouterBody(LEGAL_ACTION)
      })
    });

    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);
    // The context is built before any action, so it is stored either way.
    const contexts = await client.query("select track from contexts");
    expect(contexts.rows).toEqual([{ track: "fpl" }]);
  });

  test("stores one shared context however many Entrants open the Gameweek", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    const prompts: string[] = [];
    for (const entrantId of ["entrant/v1", "entrant/v2"]) {
      await openFplGameweek({
        database: client,
        season: "2026-27",
        gameweek: 1,
        entrantId,
        apiKey: "test-key",
        now: () => new Date("2026-08-21T11:30:00Z"),
        http: async (_url, options) => {
          const body = JSON.parse(options?.body ?? "{}") as {
            messages: Array<{ content: string }>;
          };
          prompts.push(body.messages[0]!.content);
          return { status: 200, body: openRouterBody(LEGAL_ACTION) };
        }
      });
    }

    const contexts = await client.query("select body from contexts");
    expect(contexts.rows).toHaveLength(1);
    // Both Entrants were handed the one stored text.
    expect(prompts).toEqual([
      (contexts.rows[0] as { body: string }).body,
      (contexts.rows[0] as { body: string }).body
    ]);

    const states = await client.query(
      "select model_id from manager_states order by model_id"
    );
    expect(states.rows).toEqual([
      { model_id: "entrant/v1" },
      { model_id: "entrant/v2" }
    ]);
  });

  test("hands the second Entrant the stored context, not a rebuilt one", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    const prompts: string[] = [];
    const open = (entrantId: string): Promise<void> => openFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async (_url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          messages: Array<{ content: string }>;
        };
        prompts.push(body.messages[0]!.content);
        return { status: 200, body: openRouterBody(LEGAL_ACTION) };
      }
    });

    await open("entrant/v1");
    // A later snapshot moves a price between the two Entrants' calls.
    await client.query(
      `update fpl_players
          set price_tenths = 125
        where season = '2026-27' and gw = 1 and fpl_id = 8`
    );
    await open("entrant/v2");

    const contexts = await client.query("select hash, body from contexts");
    expect(contexts.rows).toHaveLength(1);
    const [stored] = contexts.rows as Array<{ hash: string; body: string }>;
    // Both Entrants saw the one audited text, and neither saw the new price.
    expect(prompts).toEqual([stored!.body, stored!.body]);
    expect(stored!.body).toContain("Palmer");
    expect(stored!.body).not.toContain("£12.5m");
    expect(stored!.hash).toBe(
      createHash("sha256").update(stored!.body).digest("hex")
    );

    // And is charged the price it was shown: Palmer at £12.0m, £4.5m banked.
    const second = await client.query<{
      squad: { active: Array<{ fplId: number; purchasePriceTenths: number }> };
      bank: number;
    }>(
      `select squad, bank
         from manager_states
        where model_id = 'entrant/v2'`
    );
    expect(second.rows[0]!.squad.active).toContainEqual({
      fplId: 8,
      purchasePriceTenths: 120
    });
    expect(second.rows[0]!.bank).toBe(45);
  });
});

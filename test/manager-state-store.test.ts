import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  loadManagerState,
  storeManagerState
} from "../src/fpl/manager-state-store.js";
import {
  applyGameweekAction,
  openingManagerState,
  type GameweekAction
} from "../src/fpl/apply-gameweek-action.js";
import { LOCKED_POOL as POOL } from "./fpl-pool-fixture.js";
import {
  OPENING_ACTION as OPENING,
  TWO_TRANSFERS
} from "./fpl-action-fixture.js";

const { Client } = pg;

function stateFrom(action: GameweekAction, from = openingManagerState()) {
  const outcome = applyGameweekAction(from, action, POOL);
  if ("violation" in outcome) {
    throw new Error(`the fixture action must be legal: ${outcome.violation.kind}`);
  }
  return outcome.state;
}

describe("storing and reloading Manager State", () => {
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
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
  });

  test("reloads a stored state complete enough to take the next action", async () => {
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1,
      state: stateFrom(OPENING),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });

    const reloaded = await loadManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1
    });

    // The stored row alone, with no earlier Gameweek read, is what the next
    // reducer step runs on. Enzo and Wilson sell for the £9.0m and £6.0m they
    // cost against £5.0m and £6.0m in, so 45 + 150 - 110 = 85; the one banked
    // Free Transfer pays for the first Transfer and the second costs a Hit.
    expect(applyGameweekAction(reloaded!, TWO_TRANSFERS, POOL)).toMatchObject({
      state: {
        bankTenths: 85,
        freeTransfers: 1,
        hits: 4,
        squad: { free_hit_stash: null }
      }
    });
  });

  test("keeps one row per Entrant and Gameweek and leaves the earlier one alone", async () => {
    const opened = stateFrom(OPENING);
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1,
      state: opened,
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: stateFrom(TWO_TRANSFERS, opened),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });

    const rows = await client.query(
      `select gw, bank, free_transfers, hits,
              squad -> 'active' -> 14 ->> 'fplId' as last_owned
         from manager_states
        where model_id = 'entrant/v1'
        order by gw`
    );

    expect(rows.rows).toEqual([
      { gw: 1, bank: 45, free_transfers: 1, hits: 0, last_owned: "15" },
      { gw: 2, bank: 85, free_transfers: 1, hits: 4, last_owned: "19" }
    ]);
  });
});

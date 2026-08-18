import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { insertExhibition, resetSchema } from "./schema-fixture.js";
import {
  loadManagerState,
  loadStandingManagerState,
  loadStartedRoster,
  loadStartingGameweek,
  storeManagerState
} from "../src/fpl/manager-state-store.js";
import { applyGameweekAction } from "../src/fpl/apply-gameweek-action.js";
import {
  buildFplTrackContext,
  parseFplTrackContextPool
} from "../src/context/build-fpl-track-context.js";
import {
  FPL_POOL,
  LOCKED_POOL as POOL,
  trackPool
} from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION as OPENING,
  STAND_PAT,
  TWO_TRANSFERS
} from "./fpl-action-fixture.js";

const { Client } = pg;

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

  test("round-trips a Free Hit's stash well enough to revert from the row alone", async () => {
    // The stash is the one part of Manager State that exists only during a
    // Free Hit, so it is the one part a storage layer could drop without any
    // other test noticing. Gameweek 3's action is judged against nothing but
    // the reloaded Gameweek 2 row.
    const opened = legalStateFrom(OPENING);
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(FREE_HIT_REBUILD, opened, 2),
      attemptsUsed: 0,
      rationale: "Free Hit rebuild.",
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });

    const reloaded = await loadManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2
    });

    expect(reloaded).toMatchObject({
      squad: {
        active: expect.arrayContaining([
          { fplId: 17, purchasePriceTenths: 50 }
        ]),
        free_hit_stash: {
          squad: expect.arrayContaining([
            { fplId: 15, purchasePriceTenths: 60 }
          ]),
          team_sheet: OPENING.teamSheet,
          bank: 45
        }
      },
      chipActive: "free_hit",
      chipsUsed: { firstHalf: ["free_hit"], secondHalf: [] }
    });

    // Standing pat on the Gameweek 1 Team Sheet names Timber, Enzo and Wilson,
    // whom the Free Hit sent away: it is legal only because the reloaded row
    // carried enough to put them back.
    expect(applyGameweekAction(reloaded!, STAND_PAT, POOL, 3)).toMatchObject({
      state: {
        squad: { free_hit_stash: null },
        bankTenths: 45,
        chipActive: null
      }
    });
  });

  test("shows the Entrant the Squad the reloaded row will judge it on", async () => {
    // The whole chain a Free Hit crosses: stored, reloaded, rendered into the
    // context the Entrant reads, and judged by the reducer. The context and
    // the reducer revert the stash through the same function, so an Entrant
    // that picks a Team Sheet from what it was shown cannot be refused for
    // naming players the row says it does not own.
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(FREE_HIT_REBUILD, legalStateFrom(OPENING), 2),
      attemptsUsed: 0,
      rationale: "Free Hit rebuild.",
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    const reloaded = await loadManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2
    });

    const body = buildFplTrackContext({
      season: "2026-27",
      gameweek: 3,
      state: reloaded!,
      pool: trackPool(FPL_POOL),
      schedule: [],
      league: null,
      performance: [],
      settledThrough: null
    });

    expect(body).toContain("Bank: £4.5m");
    expect(body).toContain("- 15 | bought for £6.0m");
    expect(body).not.toContain("- 19 |");

    // Priced from the pool the context pinned, exactly as `openFplGameweek`
    // does it. The Team Sheet names the fifteen the context showed.
    expect(applyGameweekAction(
      reloaded!,
      STAND_PAT,
      parseFplTrackContextPool(body),
      3
    )).toMatchObject({ state: { squad: { free_hit_stash: null } } });
  });

  test("reloads a stored state complete enough to take the next action", async () => {
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1,
      state: legalStateFrom(OPENING),
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
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
    expect(applyGameweekAction(reloaded!, TWO_TRANSFERS, POOL, 2))
      .toMatchObject({
        state: {
          bankTenths: 85,
          freeTransfers: 1,
          hits: 4,
          squad: { free_hit_stash: null }
        }
      });
  });

  test("keeps one row per Entrant and Gameweek and leaves the earlier one alone", async () => {
    const opened = legalStateFrom(OPENING);
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1,
      state: opened,
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(TWO_TRANSFERS, opened, 2),
      attemptsUsed: 0,
      rationale: "Two Transfers.",
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

  test("carries the last state stored into a Gameweek, across a silent one", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 3, '2026-09-04T17:30:00Z')`
    );
    const opened = legalStateFrom(OPENING);
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 1,
      state: opened,
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });

    // Gameweek 2 stored nothing — a provider that never answered, or an action
    // that landed after the Lock. The Squad did not stop existing because the
    // Gameweek was silent, so Gameweek 3 is played on the last one that stood.
    //
    // Which Gameweek it last stood in comes back with it. Without that the
    // caller cannot tell one silent Gameweek from ten, and a state carried
    // across a gap as though there were none loses every Free Transfer the
    // gap would have granted and keeps a Chip active that stopped being so.
    expect(await loadStandingManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      before: 3
    })).toEqual({ gameweek: 1, state: opened });

    // And an Entrant with nothing behind it is at its opening, which is what
    // decides that its Gameweek has no Team Sheet to Roll Over onto.
    expect(await loadStandingManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      before: 1
    })).toBeNull();
  });

  test("reads the Gameweek the track started at off the seats alone", async () => {
    await insertExhibition(client, { promptVersion: "fpl/2026-27-v1" });
    const opened = legalStateFrom(OPENING);
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: opened,
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    // An Exhibition Run holds Manager States in this table too (ADR-0032), and
    // here it holds an earlier one than any seat. The Gameweek the *track*
    // started at is a fact about the seats: an Exhibition cannot move it, or a
    // Gameweek before the start would become playable retrospectively for the
    // whole roster.
    await storeManagerState(client, {
      entrantId: "exhibition/late",
      season: "2026-27",
      gameweek: 1,
      state: opened,
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
      predictedAt: new Date("2026-09-30T11:30:00Z")
    });

    expect(await loadStartingGameweek(client, "2026-27")).toBe(2);
    expect(await loadStartedRoster(client, "2026-27", 2)).toEqual([
      "entrant/v1"
    ]);
  });
});

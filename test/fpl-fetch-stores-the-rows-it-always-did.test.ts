import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { fetchFplDaily } from "../src/fpl/fetch-gameweek.js";
import { fetchFplPlayerPoints } from "../src/fpl/fetch-player-points.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/";
const LIVE_URL = "https://fantasy.premierleague.com/api/event/1/live/";

// Either side of the archived bootstrap's Gameweek 1 deadline: the first run
// inserts everything and snapshots the players, the second meets every row
// again after the Lock, so the conflict branches are the ones writing.
const BEFORE_GAMEWEEK_ONE = new Date("2026-08-21T17:00:00.000Z");
const AFTER_GAMEWEEK_ONE = new Date("2026-08-25T12:00:00.000Z");
const AFTER_GAMEWEEK_TWO = new Date("2026-08-30T12:00:00.000Z");

/**
 * Every row of the tables the fetch writes, as Postgres prints it.
 * `updated_at` is the one column the statement fills from the clock of the
 * database rather than from the fetch, so it cannot be compared across runs.
 */
async function storedRows(client: pg.Client, table: string): Promise<string[]> {
  const result = await client.query(
    `select (to_jsonb(t) - 'updated_at')::text as row
       from ${table} t
      order by 1`
  );
  return result.rows.map(({ row }) => row as string);
}

async function storedState(client: pg.Client) {
  return {
    gameweeks: await storedRows(client, "gameweeks"),
    fixtures: await storedRows(client, "fixtures"),
    fpl_players: await storedRows(client, "fpl_players"),
    fpl_player_points: await storedRows(client, "fpl_player_points")
  };
}

/**
 * Captured from the per-row statements before ticket 0088 replaced them, and
 * committed so the equivalence is against those bytes and not against a
 * reading of the new code.
 */
async function expectedState() {
  return JSON.parse(
    await archivedBody("fpl-2026-27-stored-rows-before-0088.json.gz")
  );
}

describe("the FPL fetch's writes", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const statements: string[] = [];
  const database = {
    query: ((text: string, values?: unknown[]) => {
      statements.push(text);
      return client.query(text, values);
    }) as pg.Client["query"]
  };
  // Parsed, so a test can damage or reshape one field before the fetch sees
  // the bytes; the archived shape is everything it leaves alone.
  let bootstrap: any;
  let fixtures: any[];
  let live: any;
  const http = async (url: string) => {
    const body = new Map([
      [BOOTSTRAP_URL, bootstrap],
      [FIXTURES_URL, fixtures],
      [LIVE_URL, live]
    ]).get(url);
    if (body === undefined) {
      throw new Error(`Unexpected outbound request: ${url}`);
    }
    return { status: 200, body: JSON.stringify(body) };
  };

  function inserts(table: string): number {
    return statements.filter((text) =>
      text.trimStart().startsWith(`insert into ${table} `)
    ).length;
  }

  beforeAll(async () => {
    await client.connect();
    await client.query("set timezone = 'UTC'");
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         fpl_player_points, fpl_players, fixtures, gameweeks, raw_snapshots
       restart identity cascade`
    );
    statements.length = 0;
    bootstrap = JSON.parse(await archivedBody("fpl-bootstrap-2026-27.json.gz"));
    fixtures = JSON.parse(await archivedBody("fpl-fixtures-2026-27.json.gz"));
    live = JSON.parse(
      await archivedBody("fpl-live-2026-27-gw1-recorded.json.gz")
    );
  });

  async function daily(now: Date) {
    await fetchFplDaily({ database, season: "2026-27", http, now: () => now });
  }

  async function playerPoints() {
    await fetchFplPlayerPoints({
      database, season: "2026-27", gameweek: 1, http
    });
  }

  test("the daily fetch writes players, events and Fixtures one statement per table, storing the rows it always did", async () => {
    const expected = await expectedState();

    await daily(BEFORE_GAMEWEEK_ONE);
    expect(await storedState(client)).toEqual(expected.beforeGameweekOne);
    expect(inserts("gameweeks")).toBe(1);
    expect(inserts("fpl_players")).toBe(1);
    expect(inserts("fixtures")).toBe(1);

    statements.length = 0;
    await daily(AFTER_GAMEWEEK_ONE);
    expect(await storedState(client)).toEqual(expected.afterGameweekOne);
    expect(inserts("gameweeks")).toBe(1);
    expect(inserts("fixtures")).toBe(1);
  });

  test("a Gameweek's player points are written by one statement, storing the rows they always were", async () => {
    await daily(BEFORE_GAMEWEEK_ONE);
    statements.length = 0;

    await playerPoints();

    expect((await storedState(client)).fpl_player_points)
      .toEqual((await expectedState()).playerPoints);
    expect(inserts("fpl_player_points")).toBe(1);
  });

  test("a Fixture's result, its Lock, its move and a moved deadline are stored as they always were", async () => {
    const expected = await expectedState();
    const archivedFixtures = fixtures;
    const [played, lateListed] = archivedFixtures.filter(
      ({ event }) => event === 1
    );

    // Absent from the first read, so it is first inserted after the Lock and
    // carries a `locked_in_gw` the later move can defer.
    fixtures = archivedFixtures.filter(({ id }) => id !== lateListed.id);
    await daily(BEFORE_GAMEWEEK_ONE);

    fixtures = archivedFixtures.map((fixture) =>
      fixture.id === played.id
        ? {
          ...fixture,
          finished: true,
          finished_provisional: true,
          team_h_score: 2,
          team_a_score: 1
        }
        : fixture
    );
    await daily(AFTER_GAMEWEEK_ONE);
    expect(await storedState(client)).toEqual(expected.lifecycle.afterGameweekOne);

    // The played Fixture reads as unplayed again, which must not erase its
    // result; the late one moves to Gameweek 3 after its Lock; and FPL moves
    // a Locked deadline, which must not reach the stored one, and an open one,
    // which must.
    fixtures = archivedFixtures.map((fixture) =>
      fixture.id === lateListed.id ? { ...fixture, event: 3 } : fixture
    );
    bootstrap.events[0].deadline_time = "2026-08-22T17:30:00Z";
    bootstrap.events[3].deadline_time = "2026-09-12T11:00:00Z";
    await daily(AFTER_GAMEWEEK_TWO);
    expect(await storedState(client)).toEqual(expected.lifecycle.afterGameweekTwo);
  });

  test("an id FPL sends twice is stored as its last copy", async () => {
    bootstrap.events.push({
      ...bootstrap.events[4],
      deadline_time: "2026-09-19T10:00:00Z"
    });
    fixtures.push({ ...fixtures[0], kickoff_time: "2026-08-21T20:00:00Z" });
    live.elements.push({
      ...live.elements[0],
      stats: { ...live.elements[0].stats, total_points: 99 }
    });

    await daily(BEFORE_GAMEWEEK_ONE);
    await playerPoints();

    expect(await storedState(client)).toEqual((await expectedState()).duplicates);
  });

  test("a second run over the same responses changes nothing", async () => {
    await daily(AFTER_GAMEWEEK_ONE);
    await playerPoints();
    const first = await storedState(client);

    await daily(AFTER_GAMEWEEK_ONE);
    await playerPoints();

    expect(await storedState(client)).toEqual(first);
  });

  test("responses that fail validation write no row", async () => {
    fixtures.at(-1).team_h = 999;
    await expect(daily(BEFORE_GAMEWEEK_ONE)).rejects.toThrow("unknown team id");

    live.elements.at(-1).stats.minutes = -1;
    await expect(playerPoints()).rejects.toThrow("fpl_live");

    expect(await storedState(client)).toEqual({
      gameweeks: [], fixtures: [], fpl_players: [], fpl_player_points: []
    });
  });
});

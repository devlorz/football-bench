import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  fetchFplDaily,
  fetchFplGameweek,
  FplSourceHttpError,
  FplSourceValidationError
} from "../src/fpl/fetch-gameweek.js";
import {
  buildFplContext,
  type FplPlayer
} from "../src/context/build-fpl-context.js";
import { archivedBody } from "./archived-fixture.js";

const { Client } = pg;
const beforeFirstDeadline = () => new Date("2026-08-21T17:00:00.000Z");

async function archivedFplSources() {
  const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
  const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
  const responses = new Map([
    ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
    ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
  ]);
  return {
    fixturesBody,
    responses,
    http: async (url: string) => ({
      status: 200,
      body: responses.get(url) ?? ""
    })
  };
}

describe("fetching an FPL Gameweek", () => {
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
         fpl_players, fixtures, gameweeks, raw_snapshots
       restart identity cascade`
    );
  });

  test("stores the deadline, every Fixture, and byte-exact source snapshots", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const responses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    const requested: string[] = [];

    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => {
        requested.push(url);
        const body = responses.get(url);
        if (body === undefined) {
          throw new Error(`Unexpected outbound request: ${url}`);
        }
        return { status: 200, body };
      }
    });

    expect(requested).toEqual([...responses.keys()]);

    const gameweek = await client.query(
      "select season, gw, deadline_at from gameweeks"
    );
    expect(gameweek.rows).toEqual([{
      season: "2026-27",
      gw: 1,
      deadline_at: new Date("2026-08-21T17:30:00.000Z")
    }]);

    const fixtures = await client.query(
      `select season, fpl_id, gw, home_team, away_team, kickoff_at
         from fixtures
        order by fpl_id`
    );
    expect(fixtures.rowCount).toBe(10);
    expect(fixtures.rows[0]).toEqual({
      season: "2026-27",
      fpl_id: 1,
      gw: 1,
      home_team: "Arsenal",
      away_team: "Coventry City",
      kickoff_at: new Date("2026-08-21T19:00:00.000Z")
    });

    const players = await client.query(
      `select
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added, observed_at
         from fpl_players
        where fpl_id in (1, 5)
        order by fpl_id`
    );
    expect(players.rowCount).toBe(2);
    expect(players.rows).toEqual([
      {
        season: "2026-27",
        gw: 1,
        fpl_id: 1,
        team_name: "Arsenal",
        web_name: "Raya",
        position: "GKP",
        price_tenths: 60,
        status: "a",
        chance_of_playing_next_round: null,
        news: "",
        news_added: null,
        observed_at: new Date("2026-08-21T17:00:00.000Z")
      },
      {
        season: "2026-27",
        gw: 1,
        fpl_id: 5,
        team_name: "Arsenal",
        web_name: "J.Timber",
        position: "DEF",
        price_tenths: 65,
        status: "i",
        chance_of_playing_next_round: 0,
        news: "Groin injury - Expected back 21 Aug",
        news_added: new Date("2026-07-23T12:01:23.272Z"),
        observed_at: new Date("2026-08-21T17:00:00.000Z")
      }
    ]);
    const playerCount = await client.query(
      "select count(*)::int as count from fpl_players"
    );
    expect(playerCount.rows).toEqual([{ count: 563 }]);
    const fixturePlayers = await client.query<FplPlayer>(
      `select
         fpl_id, team_name, web_name, position, price_tenths, status,
         chance_of_playing_next_round, news, news_added
         from fpl_players
        where season = '2026-27'
          and gw = 1
          and team_name in ('Arsenal', 'Coventry City')`
    );
    const context = buildFplContext({
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      players: fixturePlayers.rows
    });
    expect(context).toContain(
      "- Saka | MID | £9.5m | status: available"
    );
    expect(context).toContain(
      "- J.Timber | DEF | £6.5m | status: injured | chance of playing next round: 0% | news: Groin injury - Expected back 21 Aug | news added: 2026-07-23T12:01:23.272Z"
    );
    expect(context).toContain(
      "- Rudoni | MID | £5.0m | status: doubtful | chance of playing next round: 75% | news: Shoulder injury - 75% chance of playing | news added: 2026-07-23T12:01:23.481Z"
    );

    const snapshots = await client.query(
      "select source, sha256, body from raw_snapshots order by source"
    );
    expect(snapshots.rows).toEqual([
      {
        source: "fpl_bootstrap",
        sha256: "7a585efb24ef7c1a349e21c3ed0ebef548f8e0fc986cfe97a016d0becdb81253",
        body: bootstrapBody
      },
      {
        source: "fpl_fixtures",
        sha256: "9e7484118381f8202830906ba993c176475d8ca1796571f5dd78cbfc2d73bd3e",
        body: fixturesBody
      }
    ]);
  });

  test("labels a daily player snapshot with FPL's next Gameweek", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const responses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);

    const result = await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: beforeFirstDeadline,
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    });

    expect(result).toEqual({
      gameweek: 1,
      playerSnapshotStored: true
    });
    const stored = await client.query(
      `select
         (select array_agg(distinct gw order by gw) from fpl_players) as player_gws,
         (select count(*)::int from gameweeks) as gameweeks,
         (select count(*)::int from fixtures) as fixtures`
    );
    expect(stored.rows).toEqual([{
      player_gws: [1],
      gameweeks: 38,
      fixtures: 380
    }]);
  });

  test("refreshes locked Fixtures while snapshotting players for the next Gameweek", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const responses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    const http = async (url: string) => ({
      status: 200,
      body: responses.get(url) ?? ""
    });

    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:29:59.999Z"),
      http
    });

    const changedBootstrap = JSON.parse(bootstrapBody);
    changedBootstrap.events[0].deadline_time = "2026-08-22T17:30:00Z";
    changedBootstrap.events[0].is_next = false;
    changedBootstrap.events[1].is_next = true;
    changedBootstrap.elements[0].now_cost = 61;
    responses.set(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      JSON.stringify(changedBootstrap)
    );
    const changedFixtures = JSON.parse(fixturesBody);
    changedFixtures[0].kickoff_time = "2026-08-21T20:00:00Z";
    responses.set(
      "https://fantasy.premierleague.com/api/fixtures/",
      JSON.stringify(changedFixtures)
    );

    const result = await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    expect(result).toEqual({
      gameweek: 2,
      playerSnapshotStored: true
    });
    const stored = await client.query(
      `select
         (select deadline_at from gameweeks where season = '2026-27' and gw = 1)
           as deadline_at,
         (select price_tenths from fpl_players
           where season = '2026-27' and gw = 1 and fpl_id = 1) as gw1_price,
         (select price_tenths from fpl_players
           where season = '2026-27' and gw = 2 and fpl_id = 1) as gw2_price,
         (select kickoff_at from fixtures
           where season = '2026-27' and fpl_id = 1) as kickoff_at`
    );
    expect(stored.rows).toEqual([{
      deadline_at: new Date("2026-08-21T17:30:00.000Z"),
      gw1_price: 60,
      gw2_price: 61,
      kickoff_at: new Date("2026-08-21T20:00:00.000Z")
    }]);
  });

  test("keeps a locked Prediction when its Fixture is deferred", async () => {
    const {
      fixturesBody,
      responses,
      http
    } = await archivedFplSources();
    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:29:00.000Z"),
      http
    });
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/model', 'provider',
         'match/2026-27-v1', 'entrant'
       );
       insert into contexts (
         season, gw, track, fpl_id, hash, body
       ) values (
         '2026-27', 1, 'match', 1, 'context-hash', 'context'
       );
       update fixtures
          set locked_in_gw = 1
        where season = '2026-27' and fpl_id = 1;
       insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away,
         context_id, attempts_used, predicted_at
       )
       select
         'entrant/v1', '2026-27', 1, '{"H":0.6,"D":0.25,"A":0.15}',
         2, 1, id, 0, '2026-08-21T17:29:00Z'
       from contexts
       where season = '2026-27' and gw = 1 and fpl_id = 1`
    );

    const movedFixtures = JSON.parse(fixturesBody);
    movedFixtures[0].event = 2;
    movedFixtures[0].kickoff_time = "2026-08-29T14:00:00Z";
    responses.set(
      "https://fantasy.premierleague.com/api/fixtures/",
      JSON.stringify(movedFixtures)
    );

    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    const stored = await client.query(
      `select
         f.gw, f.locked_in_gw, f.kickoff_at, f.deferred,
         count(p.*)::int as predictions
       from fixtures f
       left join predictions p
         on p.season = f.season
        and p.fpl_id = f.fpl_id
      where f.season = '2026-27' and f.fpl_id = 1
      group by f.season, f.fpl_id`
    );
    expect(stored.rows).toEqual([{
      gw: 2,
      locked_in_gw: 1,
      kickoff_at: new Date("2026-08-29T14:00:00.000Z"),
      deferred: true,
      predictions: 1
    }]);
  });

  test("marks a locked Fixture deferred while FPL leaves it unscheduled", async () => {
    const {
      fixturesBody,
      responses,
      http
    } = await archivedFplSources();
    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:29:00.000Z"),
      http
    });
    await client.query(
      `update fixtures
          set locked_in_gw = 1
        where season = '2026-27' and fpl_id = 1`
    );

    const unscheduledFixtures = JSON.parse(fixturesBody);
    unscheduledFixtures[0].event = null;
    unscheduledFixtures[0].kickoff_time = null;
    responses.set(
      "https://fantasy.premierleague.com/api/fixtures/",
      JSON.stringify(unscheduledFixtures)
    );

    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    const stored = await client.query(
      `select gw, locked_in_gw, kickoff_at, deferred
         from fixtures
        where season = '2026-27' and fpl_id = 1`
    );
    expect(stored.rows).toEqual([{
      gw: 1,
      locked_in_gw: 1,
      kickoff_at: new Date("2026-08-21T19:00:00.000Z"),
      deferred: true
    }]);
  });

  test("attaches a late new Fixture to the next open Gameweek", async () => {
    const {
      fixturesBody,
      responses,
      http
    } = await archivedFplSources();
    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:29:00.000Z"),
      http
    });

    const fixturesWithLateAddition = JSON.parse(fixturesBody);
    fixturesWithLateAddition.push({
      ...fixturesWithLateAddition[0],
      id: 999,
      event: 1,
      kickoff_time: "2026-08-23T14:00:00Z"
    });
    responses.set(
      "https://fantasy.premierleague.com/api/fixtures/",
      JSON.stringify(fixturesWithLateAddition)
    );

    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    const stored = await client.query(
      `select gw, locked_in_gw, deferred
         from fixtures
        where season = '2026-27' and fpl_id = 999`
    );
    expect(stored.rows).toEqual([{
      gw: 1,
      locked_in_gw: 2,
      deferred: false
    }]);
  });

  test("stores the next Lock when a manual fetch finds a late Fixture", async () => {
    const {
      fixturesBody,
      responses,
      http
    } = await archivedFplSources();
    const fixtures = JSON.parse(fixturesBody);
    fixtures.push({
      ...fixtures[0],
      id: 999,
      event: 1,
      kickoff_time: "2026-08-23T14:00:00Z"
    });
    responses.set(
      "https://fantasy.premierleague.com/api/fixtures/",
      JSON.stringify(fixtures)
    );

    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    const stored = await client.query(
      `select
         (select array_agg(gw order by gw) from gameweeks) as gameweeks,
         (select locked_in_gw from fixtures where fpl_id = 999)
           as locked_in_gw`
    );
    expect(stored.rows).toEqual([{
      gameweeks: [1, 2],
      locked_in_gw: 2
    }]);
  });

  test("does not reopen a player partition when FPL leaves a locked event next", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const responses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    const http = async (url: string) => ({
      status: 200,
      body: responses.get(url) ?? ""
    });
    await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:29:59.999Z"),
      http
    });

    const changedBootstrap = JSON.parse(bootstrapBody);
    changedBootstrap.events[0].deadline_time = "2026-08-22T17:30:00Z";
    changedBootstrap.elements[0].now_cost = 61;
    responses.set(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      JSON.stringify(changedBootstrap)
    );

    const result = await fetchFplDaily({
      database: client,
      season: "2026-27",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http
    });

    expect(result).toEqual({
      gameweek: 1,
      playerSnapshotStored: false
    });
    const locked = await client.query(
      `select
         (select deadline_at from gameweeks where season = '2026-27' and gw = 1)
           as deadline_at,
         (select price_tenths from fpl_players
           where season = '2026-27' and gw = 1 and fpl_id = 1) as price`
    );
    expect(locked.rows).toEqual([{
      deadline_at: new Date("2026-08-21T17:30:00.000Z"),
      price: 60
    }]);
  });

  test("archives changed upstream bytes but stores no derived rows", async () => {
    const bootstrap = JSON.parse(
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    );
    bootstrap.events[0].deadline_time = 42;
    const changedBootstrapBody = JSON.stringify(bootstrap);
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const responses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        changedBootstrapBody
      ],
      [
        "https://fantasy.premierleague.com/api/fixtures/",
        fixturesBody
      ]
    ]);

    await expect(fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toThrow("fpl_bootstrap.events.0.deadline_time");

    const stored = await client.query(
      `select
         (select count(*)::int from gameweeks) as gameweeks,
         (select count(*)::int from fixtures) as fixtures,
         (select count(*)::int from fpl_players) as players,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows[0]).toEqual({
      gameweeks: 0,
      fixtures: 0,
      players: 0,
      snapshots: 2
    });
    const evidence = await client.query(
      "select source, body from raw_snapshots order by source"
    );
    expect(evidence.rows).toEqual([
      { source: "fpl_bootstrap", body: changedBootstrapBody },
      { source: "fpl_fixtures", body: fixturesBody }
    ]);
  });

  test("reports every changed upstream field in one validation failure", async () => {
    const bootstrap = JSON.parse(
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    );
    bootstrap.events[0].deadline_time = 42;
    bootstrap.teams[0].name = "";
    const responses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(bootstrap)
      ],
      [
        "https://fantasy.premierleague.com/api/fixtures/",
        await archivedBody("fpl-fixtures-2026-27.json.gz")
      ]
    ]);

    await expect(fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toMatchObject({
      name: FplSourceValidationError.name,
      issues: [
        { field: "events.0.deadline_time" },
        { field: "teams.0.name" }
      ]
    });
  });

  test("classifies a non-successful upstream response", async () => {
    await expect(fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => ({
        status: url.includes("bootstrap-static") ? 503 : 200,
        body: ""
      })
    })).rejects.toMatchObject({
      name: FplSourceHttpError.name,
      source: "fpl_bootstrap",
      status: 503
    });

    const snapshots = await client.query(
      "select source, body from raw_snapshots order by source"
    );
    expect(snapshots.rows).toEqual([
      { source: "fpl_bootstrap", body: "" },
      { source: "fpl_fixtures", body: "" }
    ]);
  });

  test("rejects a changed player shape before storing derived rows", async () => {
    const bootstrap = JSON.parse(
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    );
    bootstrap.elements[0].now_cost = "6.0";
    const responses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(bootstrap)
      ],
      [
        "https://fantasy.premierleague.com/api/fixtures/",
        await archivedBody("fpl-fixtures-2026-27.json.gz")
      ]
    ]);

    await expect(fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toThrow("fpl_bootstrap.elements.0.now_cost");

    const derived = await client.query(
      `select
         (select count(*)::int from fixtures) as fixtures,
         (select count(*)::int from fpl_players) as players`
    );
    expect(derived.rows).toEqual([{ fixtures: 0, players: 0 }]);
  });

  test("does not duplicate an unchanged source snapshot", async () => {
    const responses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        await archivedBody("fpl-bootstrap-2026-27.json.gz")
      ],
      [
        "https://fantasy.premierleague.com/api/fixtures/",
        await archivedBody("fpl-fixtures-2026-27.json.gz")
      ]
    ]);
    const options = {
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url: string) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    };

    await fetchFplGameweek(options);
    const firstObservation = await client.query(
      `select first_seen_at, last_seen_at
         from raw_snapshots
        where source = 'fpl_bootstrap'`
    );
    await client.query("select pg_sleep(0.01)");
    await fetchFplGameweek(options);

    const stored = await client.query(
      `select
         (select count(*)::int from gameweeks) as gameweeks,
         (select count(*)::int from fixtures) as fixtures,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows[0]).toEqual({
      gameweeks: 1,
      fixtures: 10,
      snapshots: 2
    });

    const latestObservation = await client.query(
      `select first_seen_at, last_seen_at
         from raw_snapshots
        where source = 'fpl_bootstrap'`
    );
    expect(latestObservation.rows[0].first_seen_at).toEqual(
      firstObservation.rows[0].first_seen_at
    );
    expect(latestObservation.rows[0].last_seen_at.getTime()).toBeGreaterThan(
      firstObservation.rows[0].last_seen_at.getTime()
    );
  });

  test("keeps player context from earlier Gameweeks", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const firstResponses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: beforeFirstDeadline,
      http: async (url) => ({
        status: 200,
        body: firstResponses.get(url) ?? ""
      })
    });

    const changedBootstrap = JSON.parse(bootstrapBody);
    changedBootstrap.elements[0].now_cost = 61;
    const secondResponses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(changedBootstrap)
      ],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 2,
      now: beforeFirstDeadline,
      http: async (url) => ({
        status: 200,
        body: secondResponses.get(url) ?? ""
      })
    });

    const rayaPrices = await client.query(
      `select gw, price_tenths
         from fpl_players
        where season = '2026-27' and fpl_id = 1
        order by gw`
    );
    expect(rayaPrices.rows).toEqual([
      { gw: 1, price_tenths: 60 },
      { gw: 2, price_tenths: 61 }
    ]);
  });

  test("does not replace player context at or after the Gameweek deadline", async () => {
    const bootstrapBody = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    const fixturesBody = await archivedBody("fpl-fixtures-2026-27.json.gz");
    const firstResponses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: () => new Date("2026-08-21T17:29:59.999Z"),
      http: async (url) => ({
        status: 200,
        body: firstResponses.get(url) ?? ""
      })
    });

    const changedBootstrap = JSON.parse(bootstrapBody);
    changedBootstrap.elements[0].now_cost = 61;
    const changedBootstrapBody = JSON.stringify(changedBootstrap);
    const changedFixtures = JSON.parse(fixturesBody);
    changedFixtures[0].kickoff_time = "2026-08-21T20:00:00Z";
    const changedFixturesBody = JSON.stringify(changedFixtures);
    const secondResponses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        changedBootstrapBody
      ],
      ["https://fantasy.premierleague.com/api/fixtures/", changedFixturesBody]
    ]);
    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http: async (url) => ({
        status: 200,
        body: secondResponses.get(url) ?? ""
      })
    });

    const stored = await client.query(
      `select
         (select price_tenths
            from fpl_players
           where season = '2026-27' and gw = 1 and fpl_id = 1) as price,
         (select kickoff_at
            from fixtures
           where season = '2026-27' and fpl_id = 1) as kickoff_at,
         (select body
            from raw_snapshots
           where source = 'fpl_bootstrap'
           order by first_seen_at desc
           limit 1) = $1 as latest_snapshot_archived`,
      [changedBootstrapBody]
    );
    expect(stored.rows).toEqual([{
      price: 60,
      kickoff_at: new Date("2026-08-21T20:00:00.000Z"),
      latest_snapshot_archived: true
    }]);
  });
});

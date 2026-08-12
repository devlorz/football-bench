import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  runDailyFetch,
  StaleFootballDataSeasonError
} from "../src/fetch/daily-fetch.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const UNDERSTAT_LEAGUE_DATA_URL = "https://understat.com/getLeagueData/EPL/2026";

const SUMMER_TRANSFERS_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=List_of_English_football_transfers_summer_2026&action=raw";

const UNDERSTAT_LEAGUE_BODY = JSON.stringify({
  dates: [{
    id: "29001",
    datetime: "2026-08-15 11:30:00",
    h: { title: "Liverpool" },
    a: { title: "Bournemouth" },
    xG: { h: "2.31", a: "0.78" },
    isResult: true
  }]
});

/**
 * Every source the daily fetch reaches, answered from the archived fixtures.
 * A test that cares about one of them overrides that entry and leaves the
 * rest alone.
 */
async function sourceResponses(
  overrides: [string, string][] = []
): Promise<Map<string, string>> {
  return new Map([
    [
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    ],
    [
      "https://fantasy.premierleague.com/api/fixtures/",
      await archivedBody("fpl-fixtures-2026-27.json.gz")
    ],
    [
      "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
      await archivedBody("football-data-2526-E0.csv.gz")
    ],
    [
      "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
      await archivedBody("football-data-2526-E1.csv.gz")
    ],
    [UNDERSTAT_LEAGUE_DATA_URL, UNDERSTAT_LEAGUE_BODY],
    [
      SUMMER_TRANSFERS_URL,
      await archivedBody("wikipedia-transfers-summer-2026.txt.gz")
    ],
    ...overrides
  ]);
}

describe("the daily fetch", () => {
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
         historical_matches, fpl_players, fixtures, gameweeks, raw_snapshots,
         understat_match_xg, squad_changes
       restart identity cascade`
    );
  });

  test("re-running unchanged source data duplicates neither rows nor snapshots", async () => {
    const responses = await sourceResponses();
    const options = {
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url: string) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    };

    await runDailyFetch(options);
    await runDailyFetch(options);

    const stored = await client.query(
      `select
         (select count(*)::int from raw_snapshots) as snapshots,
         (select count(*)::int from gameweeks) as gameweeks,
         (select count(*)::int from fixtures) as fixtures,
         (select count(*)::int from fpl_players) as players,
         (select count(*)::int from historical_matches) as matches`
    );
    expect(stored.rows).toEqual([{
      snapshots: 6,
      gameweeks: 38,
      fixtures: 380,
      players: 563,
      matches: 932
    }]);
  });

  test("a retry completes a partially failed run without duplicating completed work", async () => {
    const bootstrap = JSON.parse(
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    );
    const validBootstrapBody = JSON.stringify(bootstrap);
    bootstrap.events[0].deadline_time = 42;
    const responses = await sourceResponses([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(bootstrap)
      ]
    ]);
    const options = {
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url: string) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    };

    await expect(runDailyFetch(options)).rejects.toThrow(
      "fpl_bootstrap.events.0.deadline_time"
    );
    const partial = await client.query(
      `select
         (select count(*)::int from historical_matches) as matches,
         (select count(*)::int from fpl_players) as players`
    );
    expect(partial.rows).toEqual([{ matches: 932, players: 0 }]);

    responses.set(
      "https://fantasy.premierleague.com/api/bootstrap-static/",
      validBootstrapBody
    );
    await runDailyFetch(options);

    const recovered = await client.query(
      `select
         (select count(*)::int from raw_snapshots) as snapshots,
         (select count(*)::int from historical_matches) as matches,
         (select count(*)::int from fpl_players) as players`
    );
    expect(recovered.rows).toEqual([{
      snapshots: 7,
      matches: 932,
      players: 563
    }]);
  });

  test("survives an Understat outage and reports the missing xG", async () => {
    const responses = await sourceResponses();

    const result = await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url) => url.startsWith("https://understat.com/")
        ? { status: 503, body: "<html>down for maintenance" }
        : { status: 200, body: responses.get(url) ?? "" }
    });

    // The enrichment source failed; the write path completed regardless.
    expect(result.xg.stored).toBe(false);
    expect(result.xg.stored === false && result.xg.failure).toContain(
      "understat:2026-27:EPL"
    );
    const stored = await client.query(
      `select
         (select count(*)::int from historical_matches) as matches,
         (select count(*)::int from fpl_players) as players,
         (select count(*)::int from understat_match_xg) as xg`
    );
    expect(stored.rows).toEqual([{ matches: 932, players: 563, xg: 0 }]);
  });

  test("stores current-Season xG alongside the rest of the daily fetch", async () => {
    const responses = await sourceResponses([
      [UNDERSTAT_LEAGUE_DATA_URL, JSON.stringify({
        dates: [{
          id: "29001",
          datetime: "2026-08-15 11:30:00",
          h: { title: "Liverpool" },
          a: { title: "Bournemouth" },
          xG: { h: "2.31", a: "0.78" },
          isResult: true
        }]
      })]
    ]);

    const result = await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    });

    expect(result.xg).toEqual({ stored: true });
    const stored = await client.query(
      "select season, understat_match_id, home_xg from understat_match_xg"
    );
    expect(stored.rows).toEqual([{
      season: "2026-27",
      understat_match_id: "29001",
      home_xg: "2.31"
    }]);
  });

  test("stores the upcoming Gameweek's Squad Changes while the section renders", async () => {
    const responses = await sourceResponses();

    const result = await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    });

    expect(result.squadChanges).toMatchObject({ stored: true, gameweek: 1 });
    const signings = await client.query(
      `select player
         from squad_changes
        where season = '2026-27' and gw = 1
          and club = 'Spurs' and direction = 'in'
        order by dated_on, player`
    );
    expect(signings.rows).toEqual([
      { player: "Jan Paul van Hecke" },
      { player: "Andy Robertson" },
      { player: "Marcos Senesi" },
      { player: "Martin D\u00fabravka" },
      { player: "Mateus Fernandes" },
      { player: "Sandro Tonali" }
    ]);
  });

  test("fails after the Lock when football-data still targets the prior Season", async () => {
    const responses = await sourceResponses();

    await expect(runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      now: () => new Date("2026-08-21T17:30:00.000Z"),
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    })).rejects.toMatchObject({
      name: StaleFootballDataSeasonError.name,
      season: "2026-27",
      footballDataSeason: "2025-26"
    });

    const matches = await client.query(
      `select season, count(*)::int as count
         from historical_matches
        group by season`
    );
    expect(matches.rows).toEqual([{ season: "2025-26", count: 932 }]);
  });
});

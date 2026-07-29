import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  runDailyFetch,
  StaleFootballDataSeasonError
} from "../src/fetch/daily-fetch.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

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
         historical_matches, fpl_players, fixtures, gameweeks, raw_snapshots
       restart identity cascade`
    );
  });

  test("re-running unchanged source data duplicates neither rows nor snapshots", async () => {
    const responses = new Map([
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
      snapshots: 4,
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
    const responses = new Map([
      [
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(bootstrap)
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
      snapshots: 5,
      matches: 932,
      players: 563
    }]);
  });

  test("fails after the Lock when football-data still targets the prior Season", async () => {
    const responses = new Map([
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
      ]
    ]);

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

import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  fetchFootballDataSeason,
  FootballDataSourceValidationError
} from "../src/football-data/fetch-season.js";
import { footballDataTeamName } from "../src/football-data/team-identity.js";

const { Client } = pg;

async function archivedBody(name: string): Promise<string> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return gunzipSync(await readFile(fileURLToPath(url))).toString("utf8");
}

describe("fetching football-data.co.uk results", () => {
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
      "truncate historical_matches, raw_snapshots restart identity cascade"
    );
  });

  test("archives and stores a Season of Premier League and Championship results", async () => {
    const premierLeague = await archivedBody("football-data-2526-E0.csv.gz");
    const championship = await archivedBody("football-data-2526-E1.csv.gz");
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        premierLeague
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        championship
      ]
    ]);
    const requested: string[] = [];

    await fetchFootballDataSeason({
      database: client,
      season: "2025-26",
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

    const counts = await client.query(
      `select division, count(*)::int as matches
         from historical_matches
        group by division
        order by division`
    );
    expect(counts.rows).toEqual([
      { division: "Championship", matches: 552 },
      { division: "Premier League", matches: 380 }
    ]);

    const promotedSideResult = await client.query(
      `select season, division, played_on, home_team, away_team,
              home_goals, away_goals
         from historical_matches
        where home_team = 'Coventry'
          and away_team = 'Wrexham'`
    );
    expect(promotedSideResult.rows).toEqual([{
      season: "2025-26",
      division: "Championship",
      played_on: new Date("2026-04-26T00:00:00.000Z"),
      home_team: "Coventry",
      away_team: "Wrexham",
      home_goals: 3,
      away_goals: 1
    }]);

    const fplBootstrap = JSON.parse(
      await archivedBody("fpl-bootstrap-2026-27.json.gz")
    ) as { teams: Array<{ name: string }> };
    const storedTeamNames = await client.query<{ team: string }>(
      `select home_team as team from historical_matches
       union
       select away_team as team from historical_matches`
    );
    const availableHistory = new Set(
      storedTeamNames.rows.map(({ team }) => team)
    );
    expect(
      fplBootstrap.teams
        .map(({ name }) => name)
        .filter((name) => !availableHistory.has(footballDataTeamName(name)))
    ).toEqual([]);

    const snapshots = await client.query(
      "select source, sha256, body from raw_snapshots order by source"
    );
    expect(snapshots.rows).toEqual([
      {
        source: "football_data:2025-26:E0",
        sha256: "3e3a8352f9ada6789c508d6ca184424421fed56a30400904a4a327c583407e62",
        body: premierLeague
      },
      {
        source: "football_data:2025-26:E1",
        sha256: "98954c319950f19158624b17a154ef1c56eb7b8d169ef317f28f06d11d0b9a74",
        body: championship
      }
    ]);
  });

  test("archives changed bytes and reports every missing consumed column", async () => {
    const premierLeague = await archivedBody("football-data-2526-E0.csv.gz");
    const championship = await archivedBody("football-data-2526-E1.csv.gz");
    const changedPremierLeague = premierLeague
      .replace("HomeTeam", "ChangedHomeTeam")
      .replace("FTAG", "ChangedFTAG");
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        changedPremierLeague
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        championship
      ]
    ]);

    await expect(fetchFootballDataSeason({
      database: client,
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toMatchObject({
      name: FootballDataSourceValidationError.name,
      source: "football_data:2025-26:E0",
      issues: [
        { field: "header.HomeTeam" },
        { field: "header.FTAG" }
      ]
    });

    const stored = await client.query(
      `select
         (select count(*)::int from historical_matches) as matches,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows).toEqual([{ matches: 0, snapshots: 2 }]);
  });

  test("archives every received body before reporting a sibling HTTP failure", async () => {
    const premierLeague = await archivedBody("football-data-2526-E0.csv.gz");

    await expect(fetchFootballDataSeason({
      database: client,
      season: "2025-26",
      http: async (url) => url.endsWith("/E0.csv")
        ? { status: 200, body: premierLeague }
        : { status: 503, body: "{\"error\":\"temporarily unavailable\"}" }
    })).rejects.toMatchObject({
      source: "football_data:2025-26:E1",
      status: 503
    });

    const stored = await client.query(
      `select source, body
         from raw_snapshots
        order by source`
    );
    expect(stored.rows).toEqual([
      {
        source: "football_data:2025-26:E0",
        body: premierLeague
      },
      {
        source: "football_data:2025-26:E1",
        body: "{\"error\":\"temporarily unavailable\"}"
      }
    ]);
    const matches = await client.query(
      "select count(*)::int as count from historical_matches"
    );
    expect(matches.rows).toEqual([{ count: 0 }]);
  });

  test("replaces a corrected division snapshot without retaining the old match", async () => {
    const premierLeague = await archivedBody("football-data-2526-E0.csv.gz");
    const championship = await archivedBody("football-data-2526-E1.csv.gz");
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        premierLeague
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        championship
      ]
    ]);
    const options = {
      database: client,
      season: "2025-26",
      http: async (url: string) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    };
    await fetchFootballDataSeason(options);
    responses.set(
      "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
      premierLeague.replace(
        "E0,15/08/2025,20:00,Liverpool,Bournemouth",
        "E0,16/08/2025,20:00,Liverpool,Bournemouth"
      )
    );

    await fetchFootballDataSeason(options);

    const corrected = await client.query(
      `select played_on
         from historical_matches
        where season = '2025-26'
          and division = 'Premier League'
          and home_team = 'Liverpool'
          and away_team = 'Bournemouth'`
    );
    expect(corrected.rows).toEqual([{
      played_on: new Date("2025-08-16T00:00:00.000Z")
    }]);
    const count = await client.query(
      `select count(*)::int as count
         from historical_matches
        where season = '2025-26'
          and division = 'Premier League'`
    );
    expect(count.rows).toEqual([{ count: 380 }]);
  });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  fetchFootballDataSeason,
  FootballDataSourceValidationError
} from "../src/football-data/fetch-season.js";
import {
  resolveFootballDataTeamName, teamNamesOf
} from "../src/football-data/team-identity.js";
import { archivedBody, archivedHomeTeams } from "./archived-fixture.js";

const { Client } = pg;

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
      competition: "PL",
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
        .filter((name) => {
          const resolved = resolveFootballDataTeamName(teamNamesOf("PL"), name);
          return resolved === undefined || !availableHistory.has(resolved);
        })
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

  test("stores both sides' shots and shots on target for each division", async () => {
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        await archivedBody("football-data-2526-E0.csv.gz")
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        await archivedBody("football-data-2526-E1.csv.gz")
      ]
    ]);

    await fetchFootballDataSeason({
      database: client,
      competition: "PL",
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    });

    const stored = await client.query(
      `select division, home_team, away_team,
              home_shots, away_shots,
              home_shots_on_target, away_shots_on_target
         from historical_matches
        where (home_team, away_team) in (
                ('Liverpool', 'Bournemouth'), ('Birmingham', 'Ipswich')
              )
        order by division`
    );
    expect(stored.rows).toEqual([
      {
        division: "Championship",
        home_team: "Birmingham",
        away_team: "Ipswich",
        home_shots: 11,
        away_shots: 7,
        home_shots_on_target: 3,
        away_shots_on_target: 1
      },
      {
        division: "Premier League",
        home_team: "Liverpool",
        away_team: "Bournemouth",
        home_shots: 19,
        away_shots: 10,
        home_shots_on_target: 10,
        away_shots_on_target: 3
      }
    ]);
  });

  test("loads a row whose shot columns are absent or blank with no counts", async () => {
    const responses = new Map([
      // A Season predating the shot columns entirely.
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
        + "E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2\n"
      ],
      // The columns arrived, but this row has nothing in them.
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
        + "E1,08/08/2025,20:00,Birmingham,Ipswich,1,1,,,,\n"
      ]
    ]);

    await fetchFootballDataSeason({
      database: client,
      competition: "PL",
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    });

    const stored = await client.query(
      `select home_team, home_goals, away_goals,
              home_shots, away_shots,
              home_shots_on_target, away_shots_on_target
         from historical_matches
        order by home_team`
    );
    expect(stored.rows).toEqual([
      {
        home_team: "Birmingham",
        home_goals: 1,
        away_goals: 1,
        home_shots: null,
        away_shots: null,
        home_shots_on_target: null,
        away_shots_on_target: null
      },
      {
        home_team: "Liverpool",
        home_goals: 4,
        away_goals: 2,
        home_shots: null,
        away_shots: null,
        home_shots_on_target: null,
        away_shots_on_target: null
      }
    ]);
  });

  // Ligue 2 2025-26 carries one row with both score cells empty --
  // Bastia v Red Star of 05/12/2025, a Match football-data.co.uk has no result
  // for -- and the first backfill of `FL1` failed on it. Skipped rather than
  // stored: a 0-0 invented here is a result that never happened, and every
  // base rate the packet prints is an average over these rows.
  //
  // Both halves are the claim. A row with one score and not the other is a
  // half-written row, not a Match without a result, and still fails -- which
  // is what stops "skip the empties" from becoming "skip anything awkward".
  test("skips a row the source has no result for, and refuses a half-written one",
    async () => {
      const responses = new Map([
        [
          "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
          "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
          + "E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2\n"
          + "E0,16/08/2025,20:00,Arsenal,Chelsea,,\n"
        ],
        [
          "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
          "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
          + "E1,08/08/2025,20:00,Birmingham,Ipswich,1,1\n"
        ]
      ]);

      await fetchFootballDataSeason({
        database: client,
        competition: "PL",
        season: "2025-26",
        http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
      });

      const stored = await client.query(
        "select home_team from historical_matches order by home_team"
      );
      expect(stored.rows.map((row) => row.home_team))
        .toEqual(["Birmingham", "Liverpool"]);

      await client.query(
        "truncate historical_matches, raw_snapshots restart identity cascade"
      );
      const halfWritten = new Map(responses);
      halfWritten.set(
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
        + "E0,16/08/2025,20:00,Arsenal,Chelsea,2,\n"
      );

      await expect(fetchFootballDataSeason({
        database: client,
        competition: "PL",
        season: "2025-26",
        http: async (url) => ({ status: 200, body: halfWritten.get(url) ?? "" })
      })).rejects.toMatchObject({
        name: FootballDataSourceValidationError.name,
        source: "football_data:2025-26:E0",
        issues: [
          { field: "row.2.FTAG", detail: "expected a non-negative integer" }
        ]
      });
    });

  test("refuses a row whose shot column is present but malformed", async () => {
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
        + "E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2,19,ten,10,-3\n"
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
        + "E1,08/08/2025,20:00,Birmingham,Ipswich,1,1,11,7,3,1\n"
      ]
    ]);

    await expect(fetchFootballDataSeason({
      database: client,
      competition: "PL",
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toMatchObject({
      name: FootballDataSourceValidationError.name,
      source: "football_data:2025-26:E0",
      issues: [
        { field: "row.2.AS", detail: "expected a non-negative integer" },
        { field: "row.2.AST", detail: "expected a non-negative integer" }
      ]
    });

    const stored = await client.query(
      `select
         (select count(*)::int from historical_matches) as matches,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows).toEqual([{ matches: 0, snapshots: 2 }]);
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
      competition: "PL",
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
      competition: "PL",
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
      competition: "PL",
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

  // Ticket 6. Same reader, same Season path, a different Competition: the two
  // Spanish files, the two Spanish division names, and `competition = 'PD'` on
  // every row. Migration 0024 dropped the `PL` default on a column outside the
  // primary key, so a reader that kept the Competition implicit would file
  // these under the Premier League with nothing to collide and nothing to
  // check — which is the whole reason the argument exists.
  test("stores a Spanish Season under La Liga's own divisions", async () => {
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/SP1.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
        + "SP1,16/08/2025,20:00,Barcelona,Vallecano,3,0,21,4,9,1\n"
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/SP2.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
        + "SP2,17/08/2025,19:30,Almeria,Cadiz,1,1,12,9,4,3\n"
      ]
    ]);

    await fetchFootballDataSeason({
      database: client,
      competition: "PD",
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    });

    const stored = await client.query(
      `select competition, division, home_team, away_team
         from historical_matches
        order by division`
    );
    expect(stored.rows).toEqual([
      {
        competition: "PD",
        division: "La Liga",
        home_team: "Barcelona",
        away_team: "Vallecano"
      },
      {
        competition: "PD",
        division: "Segunda División",
        home_team: "Almeria",
        away_team: "Cadiz"
      }
    ]);
  });

  // Serie A's map, checked against the bytes it was derived from rather than
  // against a list somebody typed out: every key is a club in the recorded
  // response, every club in the recorded response is a key, and the twenty
  // values are twenty distinct stored identities. A transcription that dropped
  // a club, invented one, or pointed two live names at one stored name fails
  // here.
  //
  // The two named pairs are the whole of what this league can get wrong and
  // still read: the official name of one Milan club ends in the city that is
  // the other's stored identity.
  test("maps Serie A's twenty from the response the map was derived from",
    async () => {
      const recorded = JSON.parse(
        await archivedBody("football-data-org-2026-27-SA-recorded.json.gz")
      ) as { matches: Array<{
        homeTeam: { name: string }; awayTeam: { name: string };
      }> };
      const clubs = new Set(recorded.matches.flatMap(
        ({ homeTeam, awayTeam }) => [homeTeam.name, awayTeam.name]
      ));

      const topFlight = await archivedHomeTeams("football-data-2526-I1.csv.gz");
      const secondTier = await archivedHomeTeams("football-data-2526-I2.csv.gz");

      const names = teamNamesOf("SA");
      expect(Object.keys(names ?? {}).sort()).toEqual([...clubs].sort());

      // Distinctness alone would pass a value football-data.co.uk has never
      // stored, which is the failure this map exists to prevent: it fails
      // nothing, and every club's history section reads as though the club had
      // none. So each value is required to be an identity one of the two
      // stored divisions actually holds -- seventeen that played 2025-26 in
      // Serie A and the three promoted out of Serie B.
      const values = Object.values(names ?? {});
      expect(new Set(values).size).toBe(20);
      expect(values.filter((name) => topFlight.has(name))).toHaveLength(17);
      // Which seventeen, not how many: a count admits a live name pointed at
      // the wrong stored club, so long as the wrong one is also in `I1`. The
      // three of `I1`'s twenty this map leaves behind are the three relegated
      // out of it, and no others.
      expect([...topFlight].filter((name) => !values.includes(name)).sort())
        .toEqual(["Cremonese", "Pisa", "Verona"]);
      expect(values.filter((name) => secondTier.has(name)).sort())
        .toEqual(["Frosinone", "Monza", "Venezia"]);
      expect(values.filter(
        (name) => !topFlight.has(name) && !secondTier.has(name)
      )).toEqual([]);

      expect(resolveFootballDataTeamName(names, "FC Internazionale Milano"))
        .toBe("Inter");
      expect(resolveFootballDataTeamName(names, "AC Milan")).toBe("Milan");
    });

  // Ligue 1's eighteen, checked the same way and against the same bytes.
  // Eighteen and not twenty is the whole of what this league adds: a test that
  // carried Serie A's twenty over would fail here rather than quietly pass a
  // short map, and the counts below are read off the two committed files.
  //
  // The pair this league can get wrong and still read is the two Paris clubs:
  // pointing `Paris Saint-Germain FC` at `Paris FC` leaves eighteen distinct
  // keys and eighteen `F1` members, so only naming them catches it.
  test("maps Ligue 1's eighteen from the response the map was derived from",
    async () => {
      const recorded = JSON.parse(
        await archivedBody("football-data-org-2026-27-FL1-recorded.json.gz")
      ) as { matches: Array<{
        homeTeam: { name: string }; awayTeam: { name: string };
      }> };
      const clubs = new Set(recorded.matches.flatMap(
        ({ homeTeam, awayTeam }) => [homeTeam.name, awayTeam.name]
      ));

      const topFlight = await archivedHomeTeams("football-data-2526-F1.csv.gz");
      const secondTier = await archivedHomeTeams("football-data-2526-F2.csv.gz");

      const names = teamNamesOf("FL1");
      expect(Object.keys(names ?? {}).sort()).toEqual([...clubs].sort());

      const values = Object.values(names ?? {});
      expect(new Set(values).size).toBe(18);
      expect(values.filter((name) => topFlight.has(name))).toHaveLength(16);
      // Which two of `F1` this map leaves behind, not how many: the two
      // relegated out of it, and no others.
      expect([...topFlight].filter((name) => !values.includes(name)).sort())
        .toEqual(["Metz", "Nantes"]);
      expect(values.filter((name) => secondTier.has(name)).sort())
        .toEqual(["Le Mans", "Troyes"]);
      expect(values.filter(
        (name) => !topFlight.has(name) && !secondTier.has(name)
      )).toEqual([]);

      expect(resolveFootballDataTeamName(names, "Paris Saint-Germain FC"))
        .toBe("Paris SG");
      expect(resolveFootballDataTeamName(names, "Paris FC")).toBe("Paris FC");
      // The other name a substring derivation could not answer: the stored
      // name is the city, the official one the demonym.
      expect(resolveFootballDataTeamName(names, "Stade Rennais FC 1901"))
        .toBe("Rennes");
    });

  // The per-file division check, over the mistake that is actually available:
  // football-data.co.uk answers a season it has no file for by redirecting to
  // a near-miss filename — `2627/SP1.csv` currently lands on Portugal's
  // `P1.csv` — and `fetch` follows it. Without this the Portuguese first
  // division would be stored as La Liga, every row well-formed.
  test("refuses a file whose rows belong to another division", async () => {
    const responses = new Map([
      [
        "https://www.football-data.co.uk/mmz4281/2526/SP1.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
        + "P1,07/08/2026,20:15,Estoril,Famalicao,1,1\n"
      ],
      [
        "https://www.football-data.co.uk/mmz4281/2526/SP2.csv",
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
        + "SP2,17/08/2025,19:30,Almeria,Cadiz,1,1\n"
      ]
    ]);

    await expect(fetchFootballDataSeason({
      database: client,
      competition: "PD",
      season: "2025-26",
      http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
    })).rejects.toMatchObject({
      name: FootballDataSourceValidationError.name,
      source: "football_data:2025-26:SP1",
      issues: [{ field: "row.2.Div", detail: "expected SP1" }]
    });

    const matches = await client.query(
      "select count(*)::int as count from historical_matches"
    );
    expect(matches.rows).toEqual([{ count: 0 }]);
  });

  test("refuses a Competition with no curated divisions", async () => {
    await expect(fetchFootballDataSeason({
      database: client,
      competition: "BL1",
      season: "2025-26",
      http: async () => {
        throw new Error("no request should be made");
      }
    })).rejects.toThrow("Competition BL1 has no curated divisions");
  });
});

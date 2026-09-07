import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  projectSettledFixturesIntoHistoricalMatches
} from "../src/football-data/project-settled-fixtures.js";
import { fetchFootballDataSeason } from "../src/football-data/fetch-season.js";

const { Client } = pg;

interface SeedFixture {
  competition: string;
  season: string;
  fixtureId: number;
  gw: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  result: { home_goals: number; away_goals: number; outcome: string } | null;
}

async function seedFixture(
  client: pg.Client,
  {
    competition, season, fixtureId, gw, homeTeam, awayTeam, kickoffAt, result
  }: SeedFixture
): Promise<void> {
  await client.query(
    `insert into fixtures (
       competition, season, fixture_id, gw, locked_in_gw, home_team,
       away_team, kickoff_at, result
     ) values ($1, $2, $3, $4, $4, $5, $6, $7, $8)`,
    [
      competition, season, fixtureId, gw, homeTeam, awayTeam, kickoffAt,
      result === null ? null : JSON.stringify(result)
    ]
  );
}

describe("projecting settled Fixtures into historical_matches (ADR-0056)", () => {
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
      "truncate historical_matches, fixtures, gameweeks restart identity cascade"
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PL', '2026-27', 1, '2026-08-15T00:00:00Z')`
    );
  });

  test("writes a settled Fixture as the top flight with shots null, and skips a resultless one",
    async () => {
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 1, gw: 1,
        homeTeam: "Arsenal", awayTeam: "Coventry City",
        kickoffAt: "2026-08-16T14:00:00Z",
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });
      // Not yet played: `result` is null exactly as `settledResult` leaves it
      // (ADR-0050), and needs no rule of its own here.
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 2, gw: 1,
        homeTeam: "Everton", awayTeam: "Fulham",
        kickoffAt: "2026-08-16T14:00:00Z",
        result: null
      });

      await projectSettledFixturesIntoHistoricalMatches({
        database: client, competition: "PL", season: "2026-27"
      });

      const stored = await client.query(
        `select competition, season, division, played_on, home_team, away_team,
                home_goals, away_goals,
                home_shots, away_shots, home_shots_on_target, away_shots_on_target
           from historical_matches`
      );
      expect(stored.rows).toEqual([{
        competition: "PL",
        season: "2026-27",
        division: "Premier League",
        played_on: new Date("2026-08-16T00:00:00.000Z"),
        // `Coventry City` is the Fixture's own name; the stored identity is
        // football-data.co.uk's, which `teamNamesOf("PL")` maps it to.
        home_team: "Arsenal",
        away_team: "Coventry",
        home_goals: 2,
        away_goals: 1,
        home_shots: null,
        away_shots: null,
        home_shots_on_target: null,
        away_shots_on_target: null
      }]);
    });

  test("leaves the second division's rows byte-identical", async () => {
    await client.query(
      `insert into historical_matches
         (competition, season, division, played_on, home_team, away_team,
          home_goals, away_goals)
       values ('PL', '2026-27', 'Championship', '2026-08-09T00:00:00Z',
               'Hull', 'Ipswich', 1, 1)`
    );
    const before = await client.query(
      "select * from historical_matches where division = 'Championship'"
    );
    await seedFixture(client, {
      competition: "PL", season: "2026-27", fixtureId: 1, gw: 1,
      homeTeam: "Arsenal", awayTeam: "Chelsea",
      kickoffAt: "2026-08-16T14:00:00Z",
      result: { home_goals: 2, away_goals: 1, outcome: "H" }
    });

    await projectSettledFixturesIntoHistoricalMatches({
      database: client, competition: "PL", season: "2026-27"
    });

    const after = await client.query(
      "select * from historical_matches where division = 'Championship'"
    );
    expect(after.rows).toEqual(before.rows);
  });

  test("a recovered football-data.co.uk fetch overwrites the projection",
    async () => {
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 1, gw: 1,
        homeTeam: "Arsenal", awayTeam: "Chelsea",
        kickoffAt: "2026-08-16T14:00:00Z",
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });
      await projectSettledFixturesIntoHistoricalMatches({
        database: client, competition: "PL", season: "2026-27"
      });

      const responses = new Map([
        [
          "https://www.football-data.co.uk/mmz4281/2627/E0.csv",
          "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,HS,AS,HST,AST\n"
          + "E0,16/08/2026,14:00,Arsenal,Chelsea,2,1,15,8,7,3\n"
        ],
        [
          "https://www.football-data.co.uk/mmz4281/2627/E1.csv",
          "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n"
        ]
      ]);
      await fetchFootballDataSeason({
        database: client, competition: "PL", season: "2026-27",
        http: async (url) => ({ status: 200, body: responses.get(url) ?? "" })
      });

      const stored = await client.query(
        `select home_shots, away_shots
           from historical_matches
          where division = 'Premier League' and home_team = 'Arsenal'`
      );
      expect(stored.rows).toEqual([{ home_shots: 15, away_shots: 8 }]);
    });

  // A second outage day must not undo the first day's own gap-fill work.
  // Gameweek 1 already carries real shots from an earlier successful
  // football-data.co.uk fetch; Gameweek 2 is the new gap. Running the
  // projection again -- as the daily fetch would on every day the outage
  // continues -- must leave Gameweek 1 exactly as football-data.co.uk left
  // it and add only Gameweek 2, never re-null a row that already answered.
  test("never nulls a row football-data.co.uk already answered with shots",
    async () => {
      await client.query(
        `insert into historical_matches
           (competition, season, division, played_on, home_team, away_team,
            home_goals, away_goals, home_shots, away_shots,
            home_shots_on_target, away_shots_on_target)
         values ('PL', '2026-27', 'Premier League', '2026-08-16T00:00:00Z',
                 'Arsenal', 'Chelsea', 2, 1, 15, 8, 7, 3)`
      );
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 1, gw: 1,
        homeTeam: "Arsenal", awayTeam: "Chelsea",
        kickoffAt: "2026-08-16T14:00:00Z",
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 2, gw: 1,
        homeTeam: "Everton", awayTeam: "Fulham",
        kickoffAt: "2026-08-23T14:00:00Z",
        result: { home_goals: 0, away_goals: 0, outcome: "D" }
      });

      await projectSettledFixturesIntoHistoricalMatches({
        database: client, competition: "PL", season: "2026-27"
      });

      const stored = await client.query(
        `select home_team, away_team, home_shots, away_shots
           from historical_matches
          where division = 'Premier League'
          order by home_team`
      );
      expect(stored.rows).toEqual([
        {
          home_team: "Arsenal", away_team: "Chelsea",
          home_shots: 15, away_shots: 8
        },
        {
          home_team: "Everton", away_team: "Fulham",
          home_shots: null, away_shots: null
        }
      ]);
    });

  test("refuses a Fixture name football-data/team-identity.ts has not reviewed",
    async () => {
      await seedFixture(client, {
        competition: "PL", season: "2026-27", fixtureId: 1, gw: 1,
        homeTeam: "Arsenal", awayTeam: "A Brand New Promoted Club FC",
        kickoffAt: "2026-08-16T14:00:00Z",
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });

      await expect(projectSettledFixturesIntoHistoricalMatches({
        database: client, competition: "PL", season: "2026-27"
      })).rejects.toThrow("A Brand New Promoted Club FC");

      const stored = await client.query(
        "select count(*)::int as count from historical_matches"
      );
      expect(stored.rows).toEqual([{ count: 0 }]);
    });
});

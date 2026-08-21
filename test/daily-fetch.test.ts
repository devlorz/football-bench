import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  runDailyFetch,
  StaleFootballDataSeasonError
} from "../src/fetch/daily-fetch.js";
import {
  StaleCompetitionSourceError
} from "../src/football-data-org/fetch-competition.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const UNDERSTAT_LEAGUE_DATA_URL = "https://understat.com/getLeagueData/EPL/2026";

// The three Spanish sources the fetch reaches once `PD` is listed. Each stands
// for "this source answered", not for its parser — the parsers have their own
// suites over recorded bytes. What these prove is that the loop reaches them
// at all, which is what a `PL` literal used to stop it doing.
const UNDERSTAT_LA_LIGA_DATA_URL =
  "https://understat.com/getLeagueData/La_liga/2026";

const SPANISH_DIVISION_URLS = [
  "https://www.football-data.co.uk/mmz4281/2526/SP1.csv",
  "https://www.football-data.co.uk/mmz4281/2526/SP2.csv"
] as const;

const spanishDivisionCsv = (division: string): string =>
  "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR\n"
  + `${division},15/08/2025,17:00,Barcelona,Getafe,2,0,H\n`;

const LA_LIGA_MATCHES_URL =
  "https://api.football-data.org/v4/competitions/PD/matches?season=2026";

const SUMMER_TRANSFERS_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=List_of_English_football_transfers_summer_2026&action=raw";

// Reached because the fetch walks every listed Competition, and this suite
// lists two. A league whose transfer page nobody fetches renders its Squad
// Changes section as a stated absence over a page that was there all along.
const SPANISH_SUMMER_TRANSFERS_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=List_of_Spanish_football_transfers_summer_2026&action=raw";

const ENGLISH_SEASON_ARTICLE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=2026%E2%80%9327_Premier_League&action=raw";

const SPANISH_SEASON_ARTICLE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=2026%E2%80%9327_La_Liga&action=raw";

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
    [UNDERSTAT_LA_LIGA_DATA_URL, JSON.stringify({ dates: [] })],
    [SPANISH_DIVISION_URLS[0], spanishDivisionCsv("SP1")],
    [SPANISH_DIVISION_URLS[1], spanishDivisionCsv("SP2")],
    [
      SUMMER_TRANSFERS_URL,
      await archivedBody("wikipedia-transfers-summer-2026.txt.gz")
    ],
    [
      SPANISH_SUMMER_TRANSFERS_URL,
      await archivedBody("wikipedia-transfers-spain-summer-2026.txt.gz")
    ],
    [
      ENGLISH_SEASON_ARTICLE_URL,
      await archivedBody("wikipedia-2026-27-premier-league.txt.gz")
    ],
    [
      SPANISH_SEASON_ARTICLE_URL,
      await archivedBody("wikipedia-2026-27-la-liga.txt.gz")
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
         understat_match_xg, squad_changes, head_coach_changes, competitions
       restart identity cascade`
    );
    // Every source the fetch reaches, it reaches per listed Competition, so a
    // Season listing none reaches none — the state the pre-cron checklist calls
    // the quietest way for a deployment to do nothing at all, and the state
    // migration 0022 leaves a database migrated from empty in. A test that ran
    // without this row would be testing that state and calling it the Premier
    // League. The two tests that want a second league add `PD` themselves.
    await client.query(
      "insert into competitions (competition, season) values ('PL', $1)",
      ["2026-27"]
    );
  });

  test("reads football-data.org for every listed Competition but the Premier League",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('PD', $1)",
        ["2026-27"]
      );
      // La Liga Locked its Gameweek 1 on 15 August, so a listed `PD` holding
      // no current-Season history is stale by its own clock and the guard
      // says so by name. What this test is about is which sources the loop
      // reaches, so it holds the row that makes the league not stale rather
      // than the failure that would answer for it.
      await client.query(
        `insert into historical_matches
           (competition, season, division, played_on,
            home_team, away_team, home_goals, away_goals)
         values ('PD', '2026-27', 'La Liga', '2026-08-16T19:00:00Z',
                 'Barcelona', 'Getafe', 2, 0)`
      );
      // The recorded response, not ticket 3's constructed one: that fixture
      // carries `Girona FC` and `RCD Mallorca`, neither of which is in La Liga
      // in 2026-27, so the Squad Change club map derived from the real twenty
      // refuses them — correctly, and loudly, which is the failure that map
      // exists to make.
      const responses = await sourceResponses([[
        LA_LIGA_MATCHES_URL,
        await archivedBody("football-data-org-2026-27-PD-recorded.json.gz")
      ]]);
      const requested: string[] = [];

      await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => {
          requested.push(url);
          return { status: 200, body: responses.get(url) ?? "" };
        }
      });

      // The Premier League never reaches football-data.org, and La Liga is
      // read once. The dispatch is the `competitions` row and nothing else:
      // no branch above names either league.
      expect(requested.filter((url) => url.includes("api.football-data.org")))
        .toEqual([LA_LIGA_MATCHES_URL]);

      const { rows } = await client.query(
        `select competition, count(*)::int as fixtures
           from fixtures where season = $1
          group by competition order by competition`,
        ["2026-27"]
      );
      expect(rows).toEqual([
        { competition: "PD", fixtures: 380 },
        { competition: "PL", fixtures: 380 }
      ]);
    });

  test("a Competition whose source is unusable does not cost another its fetch",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('PD', $1)",
        ["2026-27"]
      );
      const responses = await sourceResponses([[
        LA_LIGA_MATCHES_URL,
        '{"matches": []}'
      ]]);

      await expect(runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      })).rejects.toThrow(StaleCompetitionSourceError);

      // Loud, and the Premier League's day still landed.
      const { rows } = await client.query(
        "select count(*)::int as fixtures from fixtures where competition = 'PL'"
      );
      expect(rows[0]?.fixtures).toBe(380);
    });

  test("re-running unchanged source data duplicates neither rows nor snapshots", async () => {
    const responses = await sourceResponses();
    const options = {
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      footballDataOrgToken: null,
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
      snapshots: 7,
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
      footballDataOrgToken: null,
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
      snapshots: 8,
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
      footballDataOrgToken: null,
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
      footballDataOrgToken: null,
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

  test("stores the upcoming Gameweek's Head Coach changes", async () => {
    const responses = await sourceResponses();

    const result = await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      footballDataOrgToken: null,
      now: () => new Date("2026-08-21T17:00:00.000Z"),
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    });

    // The composition, not the fetch: that the daily job walks the listed
    // Competitions into this source too, reports the Premier League's outcome
    // in the shape the workflow reads, and leaves rows behind.
    expect(result.headCoachChanges)
      .toMatchObject({ stored: true, gameweek: 1, changes: 18 });
    const arrival = await client.query(
      `select head_coach, manner
         from head_coach_changes
        where season = '2026-27' and gw = 1
          and club = 'Liverpool' and direction = 'in'`
    );
    expect(arrival.rows).toEqual([
      { head_coach: "Andoni Iraola", manner: null }
    ]);
  });

  test("stores the upcoming Gameweek's Squad Changes while the section renders", async () => {
    const responses = await sourceResponses();

    const result = await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2025-26",
      footballDataOrgToken: null,
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
      footballDataOrgToken: null,
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

  test("dates each Competition's staleness from its own Gameweek 1 deadline",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('PD', $1)",
        ["2026-27"]
      );
      // The Premier League's current Season is loading and La Liga's is not,
      // which is the pair of states a shared question cannot tell apart: asked
      // about the English feed on La Liga's behalf it finds this row and calls
      // Spain live. The discrimination is what this ticket is for, so it is
      // asserted here rather than left to a test about something else.
      await client.query(
        `insert into historical_matches
           (competition, season, division, played_on,
            home_team, away_team, home_goals, away_goals)
         values ('PL', '2026-27', 'Premier League', '2026-08-16T15:00:00Z',
                 'Arsenal', 'Chelsea', 1, 0)`
      );
      const responses = await sourceResponses([[
        LA_LIGA_MATCHES_URL,
        await archivedBody("football-data-org-2026-27-PD-recorded.json.gz")
      ]]);

      // La Liga Locked its Gameweek 1 on 15 August and the Premier League
      // Locks its own at 17:30Z today, so this instant is six days past one
      // league's deadline and half an hour inside the other's. A guard dated
      // from the English clock reads it as "not yet" for both, which is how a
      // Competition with no current-Season history at all stays quiet.
      await expect(runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      })).rejects.toMatchObject({
        name: StaleFootballDataSeasonError.name,
        competition: "PD",
        season: "2026-27",
        footballDataSeason: "2025-26"
      });

      // Loud for La Liga, and the Premier League's day still landed whole:
      // one league's staleness is collected as that league's error.
      const { rows } = await client.query(
        `select competition, count(*)::int as fixtures
           from fixtures where season = $1
          group by competition order by competition`,
        ["2026-27"]
      );
      expect(rows).toEqual([
        { competition: "PD", fixtures: 380 },
        { competition: "PL", fixtures: 380 }
      ]);
    });

  test("collects every stale Competition rather than stopping at the first",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('PD', $1)",
        ["2026-27"]
      );
      const responses = await sourceResponses([[
        LA_LIGA_MATCHES_URL,
        await archivedBody("football-data-org-2026-27-PD-recorded.json.gz")
      ]]);

      // Both leagues are past their own deadline at 17:30Z and neither holds a
      // current-Season result. A guard that threw where this one collects
      // would report the league it happened to ask first and leave the other's
      // staleness undiscovered until that one was fixed -- so the run has to
      // name both, and still fail.
      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:30:00.000Z"),
        http: async (url: string) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      }).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toMatchObject([
        { name: StaleFootballDataSeasonError.name, competition: "PD" },
        { name: StaleFootballDataSeasonError.name, competition: "PL" }
      ]);
    });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  runDailyFetch,
  StaleFootballDataSeasonError
} from "../src/fetch/daily-fetch.js";
import {
  StaleCompetitionSourceError
} from "../src/football-data-org/fetch-competition.js";
import {
  FootballDataSourceHttpError
} from "../src/football-data/fetch-season.js";
import {
  UnknownCompetitionSourcesError
} from "../src/fetch/competition-sources.js";
import { UnknownUefaMatchdayError } from "../src/uefa/fetch-competition.js";
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

/**
 * Every URL one Competition's registry entry names, so that a test can assert
 * the whole set a run reached rather than a filter over one host. "And no
 * other" is the half a `filter(...).toEqual([...])` cannot see, and it is the
 * half that catches a loop which stopped reading the registry.
 */
const PREMIER_LEAGUE_URLS = [
  "https://fantasy.premierleague.com/api/bootstrap-static/",
  "https://fantasy.premierleague.com/api/fixtures/",
  "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
  "https://www.football-data.co.uk/mmz4281/2526/E1.csv",
  UNDERSTAT_LEAGUE_DATA_URL,
  SUMMER_TRANSFERS_URL,
  ENGLISH_SEASON_ARTICLE_URL
] as const;

/**
 * The only source a Nations League entry names today. Two pages, because the
 * feed answers a hundred matches at a time and the league phase is 156.
 */
const NATIONS_LEAGUE_URLS = [
  "https://match.uefa.com/v5/matches"
  + "?competitionId=2014&seasonYear=2027&limit=100&offset=0",
  "https://match.uefa.com/v5/matches"
  + "?competitionId=2014&seasonYear=2027&limit=100&offset=100"
] as const;

const UEFA_PAGES = [
  "uefa-2026-27-UNL-recorded-offset-0.json.gz",
  "uefa-2026-27-UNL-recorded-offset-100.json.gz"
] as const;

const LA_LIGA_URLS = [
  LA_LIGA_MATCHES_URL,
  ...SPANISH_DIVISION_URLS,
  UNDERSTAT_LA_LIGA_DATA_URL,
  SPANISH_SUMMER_TRANSFERS_URL,
  SPANISH_SEASON_ARTICLE_URL
] as const;

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

  test("reads UEFA for the Nations League and leaves the leagues' sources alone",
    async () => {
      // The registry's whole promise, at the seam where it is kept: `UNL`
      // names one source and reads that one, the Premier League's seven are
      // untouched beside it, and neither Competition reaches the other's. A
      // cup has no history, no xG, no Squad Changes and no head coaches yet,
      // and the entries that say so are `null` — so the absence is a set this
      // test can name rather than a failure nobody sees.
      await client.query(
        "insert into competitions (competition, season) values ('UNL', $1)",
        ["2026-27"]
      );
      const responses = await sourceResponses([
        [NATIONS_LEAGUE_URLS[0], await archivedBody(UEFA_PAGES[0])],
        [NATIONS_LEAGUE_URLS[1], await archivedBody(UEFA_PAGES[1])]
      ]);
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

      expect([...requested].sort()).toEqual(
        [...PREMIER_LEAGUE_URLS, ...NATIONS_LEAGUE_URLS].sort()
      );
      const { rows } = await client.query(
        `select count(*)::int as fixtures from fixtures
          where competition = 'UNL' and season = '2026-27'`
      );
      expect(rows[0]?.fixtures).toBe(156);
    });

  test("a knockout matchday costs the Nations League its day and no other",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('UNL', $1)",
        ["2026-27"]
      );
      // The 2024-25 edition, whose feed carries `MD7`, `MD8`, `SF`, `3rd
      // place` and `Final` — the shape this Season's feed takes the day
      // November's draw is made (ADR-0057 defers them).
      const responses = await sourceResponses([
        [
          NATIONS_LEAGUE_URLS[0],
          await archivedBody("uefa-2024-25-UNL-recorded-offset-0.json.gz")
        ],
        [
          NATIONS_LEAGUE_URLS[1],
          await archivedBody("uefa-2024-25-UNL-recorded-offset-100.json.gz")
        ]
      ]);

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      }).catch((error: unknown) => error);

      // `MD8` and not `MD7` only because it is the first of the five the
      // recorded pages carry; which one is named is the point, not which.
      expect(thrown).toMatchObject({
        name: UnknownUefaMatchdayError.name,
        competition: "UNL",
        matchday: "MD8"
      });
      // The Premier League's day landed whole around it, which is the
      // per-Competition collection doing for a cup what it does for a league.
      const { rows } = await client.query(
        "select count(*)::int as fixtures from fixtures where competition = 'PL'"
      );
      expect(rows[0]?.fixtures).toBe(380);
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

  // ADR-0056 / ticket 0067. The same instant as the test above -- past the
  // Lock, football-data.co.uk still down -- but this time the Fixture FPL
  // just settled is the result the guard needs, projected rather than
  // absent, and the run still fails on the source outage alone.
  test("projects a settled Fixture when football-data.co.uk is down, and still fails loudly",
    async () => {
      const fixtures = JSON.parse(
        await archivedBody("fpl-fixtures-2026-27.json.gz")
      ) as Array<{
        id: number; team_h: number; team_a: number;
        finished: boolean; team_h_score: number | null; team_a_score: number | null;
      }>;
      const arsenalVCoventry = fixtures.find((fixture) => fixture.id === 1);
      if (arsenalVCoventry === undefined) {
        throw new Error("fixture 1 is missing from the archived FPL fixtures");
      }
      arsenalVCoventry.finished = true;
      arsenalVCoventry.team_h_score = 2;
      arsenalVCoventry.team_a_score = 1;
      const responses = await sourceResponses([[
        "https://fantasy.premierleague.com/api/fixtures/",
        JSON.stringify(fixtures)
      ]]);

      // `footballDataSeason` matches `season`: football-data.co.uk is already
      // being asked about the current Season and is simply down, the one
      // scenario the projection is for. A stale `FOOTBALL_DATA_SEASON` is a
      // separate misconfiguration covered by its own test below.
      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2026-27",
        footballDataOrgToken: null,
        now: () => new Date("2026-08-21T17:30:00.000Z"),
        http: async (url) => url.includes("football-data.co.uk")
          ? { status: 503, body: "<html>maintenance" }
          : { status: 200, body: responses.get(url) ?? "" }
      }).catch((error: unknown) => error);

      // Loud for the same reason it is today: football-data.co.uk answered
      // 503, and saving the projected result changes nothing about that.
      expect(thrown).toBeInstanceOf(FootballDataSourceHttpError);

      // The guard ran after the projection and found a current-Season result,
      // so no `StaleFootballDataSeasonError` joins it -- a single rejection
      // rather than an `AggregateError` of two.
      const projected = await client.query(
        `select competition, season, division, played_on,
                home_team, away_team, home_goals, away_goals,
                home_shots, away_shots
           from historical_matches
          where season = '2026-27'`
      );
      expect(projected.rows).toEqual([{
        competition: "PL",
        season: "2026-27",
        division: "Premier League",
        played_on: new Date("2026-08-21T00:00:00.000Z"),
        home_team: "Arsenal",
        away_team: "Coventry",
        home_goals: 2,
        away_goals: 1,
        home_shots: null,
        away_shots: null
      }]);
    });

  // The other direction of the same reordering: football-data.co.uk down and
  // nothing settled anywhere else either (the default archived FPL fixtures
  // are still in the future at this `now`), so the projection has nothing to
  // write and the guard must still fire -- "no source did" has to mean no
  // source, not "the projection ran".
  test("still fires the staleness guard when football-data.co.uk is down and no source has a result",
    async () => {
      const responses = await sourceResponses();

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2026-27",
        footballDataOrgToken: null,
        now: () => new Date("2026-08-21T17:30:00.000Z"),
        http: async (url) => url.includes("football-data.co.uk")
          ? { status: 503, body: "<html>maintenance" }
          : { status: 200, body: responses.get(url) ?? "" }
      }).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toMatchObject([
        { name: FootballDataSourceHttpError.name },
        { name: StaleFootballDataSeasonError.name, competition: "PL" }
      ]);
      const matches = await client.query(
        "select count(*)::int as count from historical_matches"
      );
      expect(matches.rows).toEqual([{ count: 0 }]);
    });

  // football-data.co.uk answering with a body that fails to validate is not
  // an outage: the site is up, and projecting over the gap would paper over a
  // real data bug (a malformed row, or a redirect to the wrong division --
  // ADR-0050's Portugal case) with results that read clean. This behaves
  // exactly as it did before ticket 0067: no projection, no historical row,
  // and the staleness guard still fires on top of the validation error.
  test("does not project when football-data.co.uk answers but its body fails to validate",
    async () => {
      const responses = await sourceResponses([[
        "https://www.football-data.co.uk/mmz4281/2526/E0.csv",
        // `FTAG` is missing from the header entirely -- a required column
        // gone, not a bad value in one that is present.
        "Div,Date,Time,HomeTeam,AwayTeam,FTHG\n"
        + "E0,15/08/2025,20:00,Liverpool,Bournemouth,4\n"
      ]]);

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: null,
        now: () => new Date("2026-08-21T17:30:00.000Z"),
        http: async (url) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      }).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toMatchObject([
        { name: "FootballDataSourceValidationError" },
        { name: StaleFootballDataSeasonError.name, competition: "PL" }
      ]);
      const matches = await client.query(
        "select count(*)::int as count from historical_matches where season = '2026-27'"
      );
      expect(matches.rows).toEqual([{ count: 0 }]);
    });

  // `FOOTBALL_DATA_SEASON` left stale is a second, independent misconfiguration
  // that can coincide with a real outage. ADR-0056's projection is "temporary
  // by construction" only because the *next* successful fetch targets the same
  // Season it projected into and rewrites the division whole; a fetch still
  // pointed at last Season's file will never do that, so a projection made
  // here would never heal and would silently swallow the one signal --
  // `StaleFootballDataSeasonError`'s "advance FOOTBALL_DATA_SEASON" guidance --
  // that tells an operator the env is behind. Projecting only when
  // `footballDataSeason === season` keeps the promise instead of breaking it.
  test("does not project when FOOTBALL_DATA_SEASON is stale, even if football-data.co.uk is also down",
    async () => {
      // A settled current-Season Fixture, exactly like the successful
      // projection test above -- without the `footballDataSeason === season`
      // gate, this is enough on its own to make the projection succeed and
      // mask the guard, which is precisely the regression this test exists to
      // catch.
      const fixtures = JSON.parse(
        await archivedBody("fpl-fixtures-2026-27.json.gz")
      ) as Array<{
        id: number; finished: boolean;
        team_h_score: number | null; team_a_score: number | null;
      }>;
      const arsenalVCoventry = fixtures.find((fixture) => fixture.id === 1);
      if (arsenalVCoventry === undefined) {
        throw new Error("fixture 1 is missing from the archived FPL fixtures");
      }
      arsenalVCoventry.finished = true;
      arsenalVCoventry.team_h_score = 2;
      arsenalVCoventry.team_a_score = 1;
      const responses = await sourceResponses([[
        "https://fantasy.premierleague.com/api/fixtures/",
        JSON.stringify(fixtures)
      ]]);

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: null,
        now: () => new Date("2026-08-21T17:30:00.000Z"),
        http: async (url) => url.includes("football-data.co.uk")
          ? { status: 503, body: "<html>maintenance" }
          : { status: 200, body: responses.get(url) ?? "" }
      }).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toMatchObject([
        { name: FootballDataSourceHttpError.name },
        {
          name: StaleFootballDataSeasonError.name,
          competition: "PL",
          season: "2026-27",
          footballDataSeason: "2025-26"
        }
      ]);
      const matches = await client.query(
        "select count(*)::int as count from historical_matches where season = '2026-27'"
      );
      expect(matches.rows).toEqual([{ count: 0 }]);
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

  // The registry, at the seam ADR-0057 put it behind. The two tests above
  // assert which Competition reaches football-data.org; this one asserts the
  // whole set, because the registry's promise is "exactly the sources its
  // entry names" and a loop that grew a source back would pass every filter
  // written over one host.
  test("reaches exactly the sources each listed Competition's entry names",
    async () => {
      await client.query(
        "insert into competitions (competition, season) values ('PD', $1)",
        ["2026-27"]
      );
      // The row that keeps La Liga off its own staleness guard, as in the
      // first test of this suite: what is under test here is which sources
      // are reached, not what the guard says about them.
      await client.query(
        `insert into historical_matches
           (competition, season, division, played_on,
            home_team, away_team, home_goals, away_goals)
         values ('PD', '2026-27', 'La Liga', '2026-08-16T19:00:00Z',
                 'Barcelona', 'Getafe', 2, 0)`
      );
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

      // Not de-duplicated: each of these is requested exactly once a run, and
      // a loop that asked twice is a doubled source read that a `Set` would
      // hide behind the same green.
      expect([...requested].sort()).toEqual(
        [...PREMIER_LEAGUE_URLS, ...LA_LIGA_URLS].sort()
      );
    });

  /**
   * Lists a Competition the registry has no entry for.
   *
   * Since ticket 0071 there is no such code to hand: the `competition_code`
   * domain and the registry hold the same set, and `test/schema.test.ts` is
   * red the moment they differ. So the only way left to reach this guard is
   * the mistake it exists for — a code a migration admits to the domain whose
   * author forgets the registry — and the domain's check is dropped here to
   * stage exactly that. It goes back `not valid`, which restores the rule for
   * every later insert while leaving the staged row where the fetch can find
   * it.
   */
  const listUnnamedCompetition = async (code: string): Promise<void> => {
    const { rows } = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_type t on t.oid = c.contypid
        where t.typname = 'competition_code'`
    );
    await client.query(
      "alter domain competition_code drop constraint competition_code_check"
    );
    await client.query(
      "insert into competitions (competition, season) values ($1, '2026-27')",
      [code]
    );
    await client.query(
      "alter domain competition_code add constraint competition_code_check "
      + `${rows[0]!.definition} not valid`
    );
  };

  test("fails by name for a listed Competition the registry has no entry for",
    async () => {
      await listUnnamedCompetition("UCL");
      const responses = await sourceResponses();
      const requested: string[] = [];

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => {
          requested.push(url);
          return { status: 200, body: responses.get(url) ?? "" };
        }
      }).catch((error: unknown) => error);

      expect(thrown).toMatchObject({
        name: UnknownCompetitionSourcesError.name,
        competition: "UCL"
      });
      // Nothing was reached on its behalf -- every URL of the run belongs to
      // the Premier League's entry -- and the Premier League's day landed
      // whole, which is the per-Competition collection working as it does for
      // every other failure.
      expect([...requested].sort()).toEqual([...PREMIER_LEAGUE_URLS].sort());
      const { rows } = await client.query(
        "select count(*)::int as fixtures from fixtures where competition = 'PL'"
      );
      expect(rows[0]?.fixtures).toBe(380);
    });

  // The set assertion above proves the unnamed Competition reached nothing; it
  // cannot prove *when* it was refused, and moving the registry check back
  // below the FPL fetch would leave it green. This one dates the refusal: the
  // FPL bootstrap is made invalid so that it fails too, and the registry's
  // error has to arrive first in the `AggregateError`. `errors` is appended to
  // in execution order, so first there means before the run's first request.
  test("refuses an unnamed Competition before the run's first request",
    async () => {
      await listUnnamedCompetition("UCL");
      const bootstrap = JSON.parse(
        await archivedBody("fpl-bootstrap-2026-27.json.gz")
      );
      bootstrap.events[0].deadline_time = 42;
      const responses = await sourceResponses([[
        "https://fantasy.premierleague.com/api/bootstrap-static/",
        JSON.stringify(bootstrap)
      ]]);

      const thrown = await runDailyFetch({
        database: client,
        season: "2026-27",
        footballDataSeason: "2025-26",
        footballDataOrgToken: "a-football-data-org-token",
        now: () => new Date("2026-08-21T17:00:00.000Z"),
        http: async (url: string) => ({
          status: 200,
          body: responses.get(url) ?? ""
        })
      }).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toMatchObject([
        { name: UnknownCompetitionSourcesError.name, competition: "UCL" },
        { message: expect.stringContaining("fpl_bootstrap.events.0.deadline_time") }
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

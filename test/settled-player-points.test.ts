import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { runDailyFetch } from "../src/fetch/daily-fetch.js";
import { NO_LIVE_STATS } from "../src/fpl/fetch-player-points.js";
import { storeManagerState } from "../src/fpl/manager-state-store.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";
import { OPENING_ACTION } from "./fpl-action-fixture.js";
import { EVERYONE_PLAYED } from "./fpl-points-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";

const { Client } = pg;

const BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/";
const UNDERSTAT_URL = "https://understat.com/getLeagueData/EPL/2026";

function liveUrl(gameweek: number): string {
  return `https://fantasy.premierleague.com/api/event/${gameweek}/live/`;
}

// Between the Gameweek 1 and Gameweek 2 deadlines the archived bodies carry.
const AFTER_GAMEWEEK_ONE = new Date("2026-08-25T12:00:00.000Z");

const PREMIER_LEAGUE_CSV =
  "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\n"
  + "E0,22/08/2026,Arsenal,Coventry,2,1\n";
const CHAMPIONSHIP_CSV =
  "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\n"
  + "E1,22/08/2026,Millwall,Watford,0,0\n";
const UNDERSTAT_BODY = JSON.stringify({
  dates: [{
    id: "29001",
    datetime: "2026-08-22 11:30:00",
    h: { title: "Arsenal" },
    a: { title: "Coventry" },
    xG: { h: "2.31", a: "0.78" },
    isResult: true
  }]
});

/**
 * The archived pre-season bootstrap reports every Gameweek unchecked, so the
 * settled path is exercised against the pinned `data_checked` contract rather
 * than claimed from those bytes. Gameweek 1 is marked checked by hand and
 * Gameweek 2 becomes the next open one.
 */
async function bootstrapWithSettledGameweekOne(): Promise<string> {
  const bootstrap = JSON.parse(
    await archivedBody("fpl-bootstrap-2026-27.json.gz")
  );
  bootstrap.events[0] = {
    ...bootstrap.events[0],
    finished: true,
    data_checked: true,
    is_current: true,
    is_next: false
  };
  bootstrap.events[1] = { ...bootstrap.events[1], is_next: true };
  return JSON.stringify(bootstrap);
}

/**
 * A live stat block a test can damage one field of. The block it starts from
 * is the boundary's own, so a widening the fetch learns about reaches these
 * scripted bodies without being retyped here.
 */
function statsWith(overrides: Record<string, unknown> = {}) {
  return { ...NO_LIVE_STATS, ...overrides };
}

interface LivePlayer {
  id: number;
  minutes: number;
  totalPoints: number;
  stats?: Record<string, unknown>;
}

function liveBody(players: LivePlayer[]): string {
  return JSON.stringify({
    elements: players.map(({ id, minutes, totalPoints, stats }) => ({
      id,
      stats: statsWith({ minutes, total_points: totalPoints, ...stats }),
      explain: []
    }))
  });
}

async function sources(
  bootstrap: string,
  live: string
): Promise<Map<string, string>> {
  return new Map([
    [BOOTSTRAP_URL, bootstrap],
    [FIXTURES_URL, await archivedBody("fpl-fixtures-2026-27.json.gz")],
    [liveUrl(1), live],
    ["https://www.football-data.co.uk/mmz4281/2627/E0.csv", PREMIER_LEAGUE_CSV],
    ["https://www.football-data.co.uk/mmz4281/2627/E1.csv", CHAMPIONSHIP_CSV],
    [UNDERSTAT_URL, UNDERSTAT_BODY]
  ]);
}

describe("collecting settled player Gameweek points", () => {
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
         fpl_player_points, historical_matches, fpl_players, fixtures,
         gameweeks, raw_snapshots, understat_match_xg, manager_states,
         scores, models
       restart identity cascade`
    );
  });

  async function runWith(responses: Map<string, string>): Promise<string[]> {
    const requested: string[] = [];
    await runDailyFetch({
      database: client,
      season: "2026-27",
      footballDataSeason: "2026-27",
      footballDataOrgToken: null,
      now: () => AFTER_GAMEWEEK_ONE,
      http: async (url) => {
        requested.push(url);
        const body = responses.get(url);
        if (body === undefined) {
          throw new Error(`Unexpected outbound request: ${url}`);
        }
        return { status: 200, body };
      }
    });
    return requested;
  }

  test("stores per-player points for a Gameweek FPL reports checked", async () => {
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([
        { id: 1, minutes: 90, totalPoints: 7 },
        { id: 5, minutes: 0, totalPoints: 0 }
      ])
    ));

    const points = await client.query(
      `select season, gw, fpl_id, minutes, total_points
         from fpl_player_points
        order by fpl_id`
    );
    expect(points.rows).toEqual([
      {
        season: "2026-27",
        gw: 1,
        fpl_id: 1,
        minutes: 90,
        total_points: 7
      },
      {
        season: "2026-27",
        gw: 1,
        fpl_id: 5,
        minutes: 0,
        total_points: 0
      }
    ]);
  });

  test("stores every stat the live endpoint sends for a player", async () => {
    // A striker who scored twice, set one up and was booked; a keeper who kept
    // the sheet, made six saves and was booked too. Values are picked so that
    // no two columns carry the same pair down the two rows -- a column that
    // reads the same as its neighbour is one a swapped wiring could hide in.
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([
        {
          id: 1,
          minutes: 88,
          totalPoints: 15,
          stats: {
            goals_scored: 2,
            assists: 1,
            clean_sheets: 0,
            bonus: 3,
            yellow_cards: 1,
            red_cards: 0,
            saves: 0,
            expected_goals: "1.27",
            expected_assists: "0.43",
            expected_goals_conceded: "1.88"
          }
        },
        {
          id: 5,
          minutes: 90,
          totalPoints: 9,
          stats: {
            goals_scored: 0,
            assists: 0,
            clean_sheets: 1,
            bonus: 2,
            yellow_cards: 1,
            red_cards: 0,
            saves: 6,
            expected_goals: "0.00",
            expected_assists: "0.05",
            expected_goals_conceded: "0.61"
          }
        }
      ])
    ));

    const points = await client.query(
      `select
         fpl_id, minutes, total_points, goals_scored, assists, clean_sheets,
         bonus, yellow_cards, red_cards, saves, expected_goals,
         expected_assists, expected_goals_conceded
         from fpl_player_points
        where season = '2026-27' and gw = 1
        order by fpl_id`
    );
    expect(points.rows).toEqual([
      {
        fpl_id: 1,
        minutes: 88,
        total_points: 15,
        goals_scored: 2,
        assists: 1,
        clean_sheets: 0,
        bonus: 3,
        yellow_cards: 1,
        red_cards: 0,
        saves: 0,
        // Fixed-point, so the source's two decimals come back as they went in.
        expected_goals: "1.27",
        expected_assists: "0.43",
        expected_goals_conceded: "1.88"
      },
      {
        fpl_id: 5,
        minutes: 90,
        total_points: 9,
        goals_scored: 0,
        assists: 0,
        clean_sheets: 1,
        bonus: 2,
        yellow_cards: 1,
        red_cards: 0,
        saves: 6,
        expected_goals: "0.00",
        expected_assists: "0.05",
        expected_goals_conceded: "0.61"
      }
    ]);
  });

  test("archives a body whose stat is malformed and stores no row from it", async () => {
    // A third decimal cannot be stored at the schema's precision without being
    // rounded, which would leave a stat that disagrees with the bytes it is
    // supposed to trace back to.
    const damaged = liveBody([
      { id: 1, minutes: 90, totalPoints: 6, stats: { expected_goals: "0.427" } },
      { id: 5, minutes: 90, totalPoints: 2, stats: { saves: -1 } },
      // Beyond what numeric(5, 2) holds. Refused here, naming its field,
      // rather than reaching Postgres as an overflow with no player attached.
      { id: 9, minutes: 90, totalPoints: 1, stats: { expected_assists: "1000" } }
    ]);

    await expect(runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      damaged
    ))).rejects.toThrow(
      /fpl_live\.elements\.0\.stats\.expected_goals:.*fpl_live\.elements\.1\.stats\.saves:.*fpl_live\.elements\.2\.stats\.expected_assists:/s
    );

    const archived = await client.query(
      "select body from raw_snapshots where source = 'fpl_live:2026-27:1'"
    );
    expect(archived.rows).toEqual([{ body: damaged }]);
    const points = await client.query(
      "select count(*)::int as stored from fpl_player_points"
    );
    expect(points.rows).toEqual([{ stored: 0 }]);
  });

  test("follows a corrected stat as it follows a corrected total", async () => {
    const withBonus = (bonus: number, expectedGoals: string): string =>
      liveBody([{
        id: 1,
        minutes: 90,
        totalPoints: 6,
        stats: { goals_scored: 1, bonus, expected_goals: expectedGoals }
      }]);

    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      withBonus(1, "0.52")
    ));
    // FPL revised the bonus and restated the xG after checking the Gameweek.
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      withBonus(3, "0.66")
    ));

    const corrected = await client.query(
      `select fpl_id, goals_scored, bonus, expected_goals
         from fpl_player_points`
    );
    expect(corrected.rows).toEqual([
      { fpl_id: 1, goals_scored: 1, bonus: 3, expected_goals: "0.66" }
    ]);
  });

  test("writes the demonstration record for the Gameweek it just settled", async () => {
    // A whole FPL roster standing on the fixture Squad at Gameweek 1. Seeded
    // rather than played: what this test is about is the step after the action
    // path, and the action path has its own suite.
    for (let seat = 1; seat <= SEASON_ROSTER_SIZE; seat += 1) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [
          `fpl/base-${seat}`,
          `FPL Seat ${seat}`,
          `vendor/base-${seat}`,
          FPL_PROMPT_VERSION
        ]
      );
    }
    // `gameweeks` is written by the fetch itself, so the states cannot be
    // stored until it has run once.
    await runWith(await sources(
      await archivedBody("fpl-bootstrap-2026-27.json.gz"),
      liveBody([])
    ));
    for (let seat = 1; seat <= SEASON_ROSTER_SIZE; seat += 1) {
      await storeManagerState(client, {
        entrantId: `fpl/base-${seat}`,
        season: "2026-27",
        gameweek: 1,
        state: legalStateFrom(OPENING_ACTION),
        attemptsUsed: 0,
        predictedAt: new Date("2026-08-21T11:30:00Z")
      });
    }

    // Now FPL checks Gameweek 1. Storing the points and leaving them there
    // would be a record nothing ever wrote: the ticket has the production path
    // feed the deterministic scorer once the points settle, and the daily
    // fetch is where settlement is learnt.
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody(EVERYONE_PLAYED.map(({ fplId, minutes, totalPoints }) => ({
        id: fplId,
        minutes,
        totalPoints
      })))
    ));

    // The opening eleven score 49 and the captain adds his 9 again: 58, with
    // no Hit to deduct.
    const scored = await client.query<{ model_id: string; value: number }>(
      `select model_id, value::int as value
         from scores
        where gw = 1 and track = 'fpl' and metric = 'fpl_points'
        order by model_id`
    );
    expect(scored.rows).toHaveLength(SEASON_ROSTER_SIZE);
    for (const row of scored.rows) {
      expect(row.value).toBe(58);
    }
    const cumulative = await client.query<{ value: number; n: number }>(
      `select value::int as value, n
         from scores
        where gw = 1
          and track = 'fpl'
          and metric = 'fpl_points_season_to_date'
          and model_id = 'fpl/base-1'`
    );
    expect(cumulative.rows).toEqual([{ value: 58, n: 1 }]);
  });

  test("leaves a Gameweek FPL has not checked unscored", async () => {
    // The archived bodies are pre-season: every Gameweek is unchecked even
    // though the clock has passed Gameweek 1's deadline.
    const requested = await runWith(await sources(
      await archivedBody("fpl-bootstrap-2026-27.json.gz"),
      liveBody([{ id: 1, minutes: 90, totalPoints: 7 }])
    ));

    expect(requested).not.toContain(liveUrl(1));
    const points = await client.query(
      "select count(*)::int as stored from fpl_player_points"
    );
    expect(points.rows).toEqual([{ stored: 0 }]);
  });

  test("scores a settled Gameweek in which every player scored zero", async () => {
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([
        { id: 1, minutes: 90, totalPoints: 0 },
        { id: 5, minutes: 0, totalPoints: 0 }
      ])
    ));

    // Unlike the unchecked Gameweek above, a settled goalless one is stored:
    // the rows exist, and minutes still separate who appeared from who did not.
    const points = await client.query(
      `select fpl_id, minutes, total_points
         from fpl_player_points
        where season = '2026-27' and gw = 1
        order by fpl_id`
    );
    expect(points.rows).toEqual([
      { fpl_id: 1, minutes: 90, total_points: 0 },
      { fpl_id: 5, minutes: 0, total_points: 0 }
    ]);
  });

  test("archives the live body byte-for-byte and writes no row it cannot read", async () => {
    const damaged = JSON.stringify({
      elements: [{ id: 1, stats: statsWith({ minutes: "ninety", total_points: 7 }) }]
    });

    await expect(runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      damaged
    ))).rejects.toThrow("fpl_live.elements.0.stats.minutes");

    const archived = await client.query(
      "select body from raw_snapshots where source = 'fpl_live:2026-27:1'"
    );
    expect(archived.rows).toEqual([{ body: damaged }]);
    const points = await client.query(
      "select count(*)::int as stored from fpl_player_points"
    );
    expect(points.rows).toEqual([{ stored: 0 }]);
  });

  test("names every field it rejects, not just the first", async () => {
    const damaged = JSON.stringify({
      elements: [
        { id: 1, stats: statsWith({ minutes: 90, total_points: null }) },
        { id: 5, stats: statsWith({ minutes: -1, total_points: 2 }) }
      ]
    });

    await expect(runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      damaged
    ))).rejects.toThrow(
      /fpl_live\.elements\.0\.stats\.total_points:.*fpl_live\.elements\.1\.stats\.minutes:/s
    );
  });

  test("follows a corrected settled value without duplicating rows", async () => {
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([{ id: 1, minutes: 90, totalPoints: 7 }])
    ));
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([{ id: 1, minutes: 90, totalPoints: 7 }])
    ));

    const unchanged = await client.query(
      "select fpl_id, minutes, total_points from fpl_player_points"
    );
    expect(unchanged.rows).toEqual([
      { fpl_id: 1, minutes: 90, total_points: 7 }
    ]);

    // FPL revised the bonus after checking the Gameweek.
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([{ id: 1, minutes: 90, totalPoints: 9 }])
    ));

    const corrected = await client.query(
      "select fpl_id, minutes, total_points from fpl_player_points"
    );
    expect(corrected.rows).toEqual([
      { fpl_id: 1, minutes: 90, total_points: 9 }
    ]);
  });

  test("keeps taking the next Gameweek's pre-Lock price snapshot", async () => {
    await runWith(await sources(
      await bootstrapWithSettledGameweekOne(),
      liveBody([{ id: 1, minutes: 90, totalPoints: 7 }])
    ));

    // Gameweek 1 has settled; Gameweek 2 is open, so prices belong to it.
    const snapshot = await client.query(
      `select gw, count(*)::int as players
         from fpl_players
        group by gw
        order by gw`
    );
    expect(snapshot.rows).toEqual([{ gw: 2, players: 563 }]);
    const price = await client.query(
      `select price_tenths
         from fpl_players
        where season = '2026-27' and gw = 2 and fpl_id = 1`
    );
    expect(price.rows).toEqual([{ price_tenths: 60 }]);
  });
});

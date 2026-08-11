import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest, type LeaderboardBody, type Query
} from "../src/dashboard/read-api.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import {
  BET_POINTS_QUALIFICATION, MATCH_POINTS_QUALIFICATION, scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";

const { Client } = pg;

const SEASON = "2026-27";

/** Any instant: the leaderboard reads no clock. The Fixtures page will. */
const NOW = new Date("2026-11-15T12:00:00Z");

/**
 * The nine Entrants of the seeded roster, in the order the endpoint returns
 * them. Written out rather than derived, so a seat quietly leaving the roster
 * fails here.
 */
const ROSTER = [
  "claude/v1", "deepseek/v1", "gemini/v1", "glm/v1", "gpt/v1",
  "grok/v1", "kimi/v1", "minimax/v1", "qwen/v1"
];

/** Gameweeks 1 to 13 hold ten Fixtures and Gameweek 14 holds nine. */
const SETTLED_FIXTURES = 13 * 10 + 9;

/** The seed's one Gapped Entrant, and the settled Fixture it never answered. */
const GAPPED = "minimax/v1";

describe("the dashboard read API", () => {
  /** Seeds and rebuilds. Nothing reads through this one. */
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  /**
   * Every read the seam makes, under the role the Worker will hold in
   * production. A table granted without a policy returns nothing under Row
   * Level Security and reports no error, so reading as the owner here would
   * pass a suite the deployed dashboard fails.
   */
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const get = async (path: string): Promise<Response> =>
    handleDashboardRequest(
      new Request(`https://benchmark.example${path}`), query, SEASON, NOW
    );

  const leaderboard = async (): Promise<LeaderboardBody> => {
    const response = await get("/api/leaderboard");
    expect(response.status).toBe(200);
    return await response.json() as LeaderboardBody;
  };

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({ database: writer, season: SEASON, stopAt: "the design's" });

    // An FPL seat and an FPL `scores` row, present for every test below. Both
    // filters the roster needs are load-bearing and neither substitutes for the
    // other: the seat carries the same `entrant` role as the nine and is told
    // apart by its Prompt Version, and the row sits on a Gameweek past the last
    // the Match track scored, so a read missing `track = 'match'` reports a
    // Season one Gameweek further on than it is.
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ('fpl-claude/v1', 'Claude', 'anthropic/claude-opus-4.5',
                 'anthropic', $1, 'entrant')`,
      [FPL_PROMPT_VERSION]
    );
    await writer.query(
      `insert into scores (model_id, season, gw, track, metric, value, n)
       values ('fpl-claude/v1', $1, 15, 'fpl', 'fpl_points_season_to_date',
               812, 15)`,
      [SEASON]
    );

    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reads as the role the Worker holds in production", async () => {
    const [current] = await query("select current_role as role");
    expect(current?.role).toBe("dashboard_read");

    // Granted six tables and no seventh: a table the dashboard was never meant
    // to read is refused rather than returned empty, and the refusal is what
    // says the role is doing anything at all.
    await expect(query("select 1 from attempts limit 1"))
      .rejects.toThrow(/permission denied/);
  });

  test("returns the nine Entrants of the match roster", async () => {
    const body = await leaderboard();

    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    expect(body.season).toBe(SEASON);
  });

  test("carries each Entrant's Base Model Class", async () => {
    const body = await leaderboard();

    const classes = new Map(
      body.entrants.map(({ id, baseModelClass }) => [id, baseModelClass])
    );
    expect(classes.get("claude/v1")).toBe("Frontier");
    expect(classes.get("grok/v1")).toBe("First-party");
    expect(classes.get("deepseek/v1")).toBe("Open-weight");
  });

  test("reads the Gameweek the Match track has been scored through", async () => {
    const body = await leaderboard();

    // Fourteen and not fifteen: Gameweek 15 is Locked and unplayed, and the
    // FPL row sitting on it is on the other track.
    expect(body.throughGw).toBe(14);

    // The Lock is the pre-season state's own fact. A scored Season has a table
    // to read, and a page carrying both could put a deadline beside it.
    expect(body.nextLock).toBeNull();
  });

  test("carries Match Points and Bet Points for every Entrant", async () => {
    const body = await leaderboard();

    for (const entrant of body.entrants) {
      expect(typeof entrant.matchPoints).toBe("number");
      expect(typeof entrant.betPoints).toBe("number");
    }
    // A leaderboard of nine identical rows would pass everything above.
    expect(new Set(body.entrants.map(({ matchPoints }) => matchPoints)).size)
      .toBeGreaterThan(1);
  });

  test("carries both qualifications byte for byte out of storage", async () => {
    // The storage round trip, and the only test that proves it: this Season has
    // ranking rows, so both strings are read from `detail` and compared against
    // the constants the scorer wrote them from. Shortening either in the read
    // layer fails here.
    const storedIn = async (metric: string): Promise<Array<unknown>> =>
      (await writer.query<{ qualification: string }>(
        `select distinct detail ->> 'qualification' as qualification
           from scores where season = $1 and metric = $2`,
        [SEASON, metric]
      )).rows;

    expect(await storedIn("match_points_season_to_date"))
      .toEqual([{ qualification: MATCH_POINTS_QUALIFICATION }]);
    expect(await storedIn("bet_points_season_to_date"))
      .toEqual([{ qualification: BET_POINTS_QUALIFICATION }]);

    const body = await leaderboard();

    expect(body.matchPointsQualification).toBe(MATCH_POINTS_QUALIFICATION);
    expect(body.betPointsQualification).toBe(BET_POINTS_QUALIFICATION);
  });

  test("counts the Season's settled Fixtures, not an Entrant's own", async () => {
    const body = await leaderboard();

    expect(body.settledFixtures).toBe(SETTLED_FIXTURES);
    const byId = new Map(body.entrants.map((each) => [each.id, each]));
    // The Gapped Entrant settled one Fixture fewer than the Season did, which
    // is the difference the hero count exists to keep out of itself.
    expect(byId.get(GAPPED)?.n).toBe(SETTLED_FIXTURES - 1);
    expect(byId.get("claude/v1")?.n).toBe(SETTLED_FIXTURES);
  });

  test("carries the cache lifetime the scoring run moves on", async () => {
    const response = await get("/api/leaderboard");

    expect(response.headers.get("cache-control"))
      .toBe("public, s-maxage=300, stale-while-revalidate=3600");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  });

  test("answers the same body through the Worker's driver", async () => {
    // `numeric` and `count(*)` reach one driver as a string and the other as a
    // number, which is exactly what this endpoint is full of, so the bodies
    // matching is the claim worth making. What the driver needs and why is in
    // `test/worker-driver.ts`.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/leaderboard"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await leaderboard());
    } finally {
      await driver.end();
    }
  });

  test("answers an unknown path with a 404", async () => {
    expect((await get("/api/leaderboards")).status).toBe(404);
    expect((await get("/")).status).toBe(404);
  });
});

describe("the dashboard read API before the Season starts", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches restart identity cascade`
    );
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("returns the entered Entrants with nothing scored", async () => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as LeaderboardBody;

    // The field the pre-season state switches on. An empty array cannot tell a
    // Season that has not started from a request that returned nothing.
    expect(body.throughGw).toBeNull();
    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    expect(body.settledFixtures).toBe(0);
    expect(body.entrants.every(({ matchPoints }) => matchPoints === null))
      .toBe(true);
    expect(body.matchPointsQualification).toBeNull();
  });

  test("states the Lock the empty table is waiting on", async () => {
    // The precondition the assertion below would otherwise assume: pre-season
    // holds Gameweek 1 and no other, so the earliest Gameweek is the one a
    // reader is waiting on rather than one the seed happens to order first.
    const gameweeks = await query(
      "select gw from gameweeks where season = $1 order by gw", [SEASON]
    );
    expect(gameweeks.map(({ gw }) => gw)).toEqual([1]);

    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as LeaderboardBody;

    expect(body.nextLock).toEqual({
      gw: 1, deadlineAt: "2026-08-14T17:30:00.000Z"
    });
  });
});

describe("the dashboard read API on a Locked Gameweek nothing has settled", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches restart identity cascade`
    );
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });

    // Gameweek 1 Locked, one Prediction committed, and the matches still being
    // played: the state a real Season is in for four days out of every seven.
    await writer.query(
      "update fixtures set locked_in_gw = gw where season = $1", [SEASON]
    );
    const context = await writer.query<{ id: string }>(
      `insert into contexts (season, gw, track, fpl_id, hash, body, built_at)
       values ($1, 1, 'match', 1, 'seeded-hash', 'seeded body', $2)
       returning id`,
      [SEASON, "2026-08-14T11:30:00Z"]
    );
    await writer.query(
      `insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
         attempts_used, predicted_at
       ) values ('claude/v1', $1, 1, '{"H": 0.5, "D": 0.3, "A": 0.2}', 2, 1,
                 $2, 0, $3)`,
      [SEASON, context.rows[0]?.id, "2026-08-14T11:30:00Z"]
    );
    await scoreMatchSeason({
      database: writer,
      season: SEASON,
      now: () => new Date("2026-08-14T18:00:00Z")
    });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("holds the pre-season state while the scorer's behavioural rows exist",
    async () => {
      // Coherence, Gaps and Repairs are answerable the moment the Lock passes,
      // so the scorer has written rows on Gameweek 1. Without them this test
      // would be the pre-season one again and would prove nothing.
      const behavioural = await writer.query<{ metric: string }>(
        "select distinct metric from scores where season = $1 and gw = 1",
        [SEASON]
      );
      expect(behavioural.rows.length).toBeGreaterThan(0);
      expect(behavioural.rows.map(({ metric }) => metric))
        .not.toContain("match_points_season_to_date");

      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/leaderboard"),
        query, SEASON, NOW
      );
      const body = await response.json() as LeaderboardBody;

      // A Gameweek that has been answered is not a Gameweek that has been
      // scored. Reading the last `scores` row instead would call this Season
      // scored through Gameweek 1 and rank nine Entrants on nothing — and on a
      // Season already fourteen Gameweeks in, it would move the ranking to a
      // Locked Gameweek that has no ranking and blank all fourteen.
      expect(body.throughGw).toBeNull();
      expect(body.settledFixtures).toBe(0);
      expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
      expect(body.entrants.every(({ n }) => n === null)).toBe(true);
    });

  test("holds it through the window between results and the scoring run",
    async () => {
      // Results are ingested by a job of their own and scored by a later one,
      // so every settled Gameweek spends hours in this state: the Fixtures have
      // results, the scorer has not been back, and the Gameweek's behavioural
      // rows have been there since the Lock. Nothing may move until the scorer
      // runs.
      await writer.query(
        `update fixtures
            set result = jsonb_build_object(
                  'home_goals', 2, 'away_goals', 1, 'outcome', 'H'),
                updated_at = $2
          where season = $1`,
        [SEASON, "2026-08-15T20:00:00Z"]
      );

      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/leaderboard"),
        query, SEASON, NOW
      );
      const body = await response.json() as LeaderboardBody;

      // The evidence count is the Fixtures', and moves the moment they settle.
      // `throughGw` is the scorer's, and does not.
      expect(body.settledFixtures).toBe(10);
      expect(body.throughGw).toBeNull();
      expect(body.entrants.every(({ matchPoints }) => matchPoints === null))
        .toBe(true);
      expect(body.matchPointsQualification).toBeNull();
    });
});

describe("the dashboard read API when the whole roster Gapped a Gameweek", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches restart identity cascade`
    );
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });

    // Gameweek 1 Locked, played and settled, with not one Prediction against
    // it: the shape an OpenRouter outage over the Prediction window leaves,
    // which ADR-0009 enters this roster knowing can happen to all nine at once.
    await writer.query(
      `update fixtures
          set locked_in_gw = gw,
              result = jsonb_build_object(
                'home_goals', 2, 'away_goals', 1, 'outcome', 'H')
        where season = $1`,
      [SEASON]
    );
    await scoreMatchSeason({
      database: writer,
      season: SEASON,
      now: () => new Date("2026-08-16T10:00:00Z")
    });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reads a scored Gameweek that no Entrant scored on", async () => {
    // The scorer wrote what it had — the Gaps — and no Match Points row for
    // anybody, because no Entrant settled a Prediction.
    const points = await writer.query(
      "select 1 from scores where season = $1 and metric = $2",
      [SEASON, "match_points_season_to_date"]
    );
    expect(points.rowCount).toBe(0);

    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as LeaderboardBody;

    // Ten Fixtures settled and the scorer has been over them: this Season has
    // been scored, and reporting it as pre-season would tell a reader the
    // Season had not started on the day it did.
    expect(body.throughGw).toBe(1);
    expect(body.settledFixtures).toBe(10);
    expect(body.entrants).toHaveLength(ROSTER.length);
    for (const entrant of body.entrants) {
      expect(entrant).toMatchObject({ matchPoints: 0, betPoints: 0, n: 0 });
    }

    // The documented exception, and not the round trip. There is no stored
    // string in this state — the rows that carry a qualification are exactly
    // the ones that were never written — so what is asserted here is only that
    // a visible ranking of nine noughts does not reach a reader bare. The
    // storage round trip is proved on the seeded Season and nowhere else, and
    // the two are kept apart so neither reads as evidence for the other.
    const anyQualification = await writer.query(
      `select 1 from scores
        where season = $1 and detail ? 'qualification'`,
      [SEASON]
    );
    expect(anyQualification.rowCount).toBe(0);

    expect(body.matchPointsQualification).toBe(MATCH_POINTS_QUALIFICATION);
    expect(body.betPointsQualification).toBe(BET_POINTS_QUALIFICATION);
  });
});

describe("the dashboard read API with a qualification missing from storage", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches restart identity cascade`
    );
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    // A Season full of ranking rows with one caveat gone from them: a scorer
    // that stopped writing it, or a hand at a `psql` prompt. Not the state the
    // documented exception covers, and nothing about it says so from inside a
    // single row.
    await writer.query(
      `update scores set detail = detail - 'qualification'
        where season = $1 and metric = $2`,
      [SEASON, "bet_points_season_to_date"]
    );
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("fails closed rather than substituting the canonical string", async () => {
    // The fallback is decided by whether ranking rows exist, once, and never
    // per string. Asked per qualification it would answer this with the
    // constant — indistinguishable from the exception, and a storage fault
    // nobody would ever see. A reader gets the page's error line instead.
    await expect(handleDashboardRequest(
      new Request("https://benchmark.example/api/leaderboard"),
      query, SEASON, NOW
    )).rejects.toThrow(/bet_qualification/);
  });
});

describe("the dashboard read API with an Entrant that settled nothing", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches restart identity cascade`
    );
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    // What the scorer leaves for an Entrant that Gapped every Fixture of the
    // Season: the behavioural rows are its own and the outcome-dependent ones
    // were never written. The rows are removed rather than invented, so every
    // figure the other eight are read on is still the scorer's own.
    await writer.query(
      `delete from scores
        where model_id = 'claude/v1' and metric in ($1, $2)`,
      [
        "match_points_season_to_date", "bet_points_season_to_date"
      ]
    );
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("keeps both qualifications on a ranking the first Entrant is absent from",
    async () => {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/leaderboard"),
        query, SEASON, NOW
      );
      const body = await response.json() as LeaderboardBody;

      // `claude/v1` sorts first, so a read taking the qualification from the
      // first row would publish eight Entrants' rankings with neither caveat —
      // the one failure spec 0011 names as its sharper problem.
      expect(body.matchPointsQualification).toBe(MATCH_POINTS_QUALIFICATION);
      expect(body.betPointsQualification).toBe(BET_POINTS_QUALIFICATION);

      const byId = new Map(body.entrants.map((each) => [each.id, each]));
      // Settled nothing, on a Season that has been scored: a nought, and not
      // the shape reserved for a Season that has not started.
      expect(byId.get("claude/v1")).toMatchObject({
        matchPoints: 0, betPoints: 0, n: 0
      });
      expect(byId.get("gpt/v1")?.n).toBe(SETTLED_FIXTURES);
    });
});

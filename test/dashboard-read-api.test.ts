import pg from "pg";
import postgres from "postgres";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest, type Query
} from "../src/dashboard/read-api.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import {
  BET_POINTS_QUALIFICATION, MATCH_POINTS_QUALIFICATION
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

interface LeaderboardEntrant {
  id: string;
  name: string;
  baseModelClass: string | null;
  matchPoints: number | null;
  betPoints: number | null;
  n: number | null;
}

interface LeaderboardBody {
  season: string;
  throughGw: number | null;
  settledFixtures: number;
  matchPointsQualification: string | null;
  betPointsQualification: string | null;
  entrants: LeaderboardEntrant[];
}

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

  test("carries both qualifications byte for byte", async () => {
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
    // ADR-0027 puts `postgres.js` on the Worker and `pg` everywhere else, which
    // leaves the driver the one part of the read path a suite running on `pg`
    // cannot see. The two disagree about exactly what this endpoint is full of
    // — `numeric` and `count(*)` reach one as a string and the other as a
    // number — so the bodies matching is the claim worth making.
    // Handed the parts rather than the URL. `postgres.js` does not read the
    // `?host=` parameter a connection string carries — `pg` does, and the
    // harness's temporary cluster listens on a socket and on no TCP port at
    // all, so the URL that reaches `pg` over a socket sends `postgres.js` to
    // whatever is on localhost at the same port. Deployment hands the Worker an
    // ordinary `host:port` URL and never meets this; a test that pointed the
    // driver at a developer's own Postgres and reported a driver fault would.
    const url = new URL(process.env.DATABASE_URL ?? "");
    const sql = postgres({
      host: url.searchParams.get("host") ?? url.hostname,
      port: Number(url.port),
      username: url.username,
      database: url.pathname.slice(1),
      max: 1,
      fetch_types: false
    });
    try {
      await sql.unsafe("set role dashboard_read");
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/leaderboard"),
        (text, parameters = []) => sql.unsafe(text, parameters as never[]),
        SEASON,
        NOW
      );

      expect(await response.json()).toEqual(await leaderboard());
    } finally {
      await sql.end();
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
});

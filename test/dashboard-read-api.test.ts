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
  MATCH_PROMPT_COMPETITIONS, MATCH_PROMPT_VERSION, matchPromptOf
} from "../src/predictions/openrouter-entrant.js";
import { EXHIBITION_CAVEAT } from "../src/exhibition/recall-caveat.js";
import {
  BET_POINTS_QUALIFICATION, BET_POINTS_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_QUALIFICATION, MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC,
  scoreMatchSeason
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

/** La Liga's one seat, seated under La Liga's own frozen Prompt Version. */
const SPANISH_SEAT = "match-pd/claude/v1";

/**
 * More Match Points than any Entrant of the seeded Premier League Season, so a
 * ranking that admitted this row would be topped by it and no assertion about
 * the order below could pass by accident.
 */
const SPANISH_POINTS = 9_999;

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
    const response = await get("/api/pl/leaderboard");
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

    // A La Liga seat and La Liga rows, present for every test below. This is
    // the Competition counterpart of the FPL row above and the failure ADR-0035
    // exists to prevent: a ranking spans one Competition and never two, and
    // until this Season had a second league in it no query could be caught
    // unioning them.
    //
    // Every filter it tests is load-bearing on its own. The seat carries the
    // same `entrant` role as the nine and is told apart by its Prompt Version,
    // which each Competition freezes its own of (ADR-0038) -- so a roster read
    // missing it seats ten. Its Gameweek is past the last the Premier League
    // scored, so a read missing `competition` reports a Season six Gameweeks
    // further on than it is. And its Match Points are the highest figure in
    // either league, so a ranking that admitted it would be topped by it.
    await writer.query(
      `insert into competitions (competition, season) values ('PD', $1)`,
      [SEASON]
    );
    await writer.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PD', $1, 20, $2)`,
      [SEASON, "2026-12-19T17:30:00Z"]
    );
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($2, 'Spanish Claude', 'anthropic/claude-opus-4.5',
                 'anthropic', $1, 'entrant')`,
      [matchPromptOf("PD").version, SPANISH_SEAT]
    );
    for (const [metric, value, n] of [
      [RPS_METRIC, 0.18, 10],
      [MATCH_POINTS_SEASON_TO_DATE_METRIC, SPANISH_POINTS, 10],
      [BET_POINTS_SEASON_TO_DATE_METRIC, 44, 10]
    ] as const) {
      await writer.query(
        `insert into scores (
           model_id, competition, season, gw, track, metric, value, n, detail
         ) values ($1, 'PD', $2, 20, 'match', $3, $4, $5, $6)`,
        [
          SPANISH_SEAT, SEASON, metric, value, n,
          JSON.stringify({ qualification: "A La Liga qualification." })
        ]
      );
    }

    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reads as the role the Worker holds in production", async () => {
    const [current] = await query("select current_role as role");
    expect(current?.role).toBe("dashboard_read");

    // Granted the tables the endpoints read and no other: one the dashboard
    // was never meant to read is refused rather than returned empty, and the
    // refusal is what says the role is doing anything at all. Which tables
    // those are is `schema.test.ts`'s to state, and it grows as endpoints do.
    await expect(query("select 1 from raw_snapshots limit 1"))
      .rejects.toThrow(/permission denied/);
  });

  test("returns the nine Entrants of the match roster", async () => {
    const body = await leaderboard();

    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    expect(body.season).toBe(SEASON);
    // The Season lists this Competition, and a scored ranking is the third of
    // the three states the page draws.
    expect(body.active).toBe(true);
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
           from scores
          where competition = 'PL' and season = $1 and metric = $2`,
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
    const response = await get("/api/pl/leaderboard");

    // The edge lifetime, and the stale window ADR-0028 asks for. `max-age` and
    // not `s-maxage`: Cloudflare disables stale-serving entirely on a response
    // carrying `s-maxage`, `must-revalidate` or `proxy-revalidate` (RFC 9111
    // 4.2.4), so the `stale-while-revalidate` beside an `s-maxage` was a
    // directive that never once took effect. This header is consumed by the
    // edge and stripped before the response reaches anyone.
    expect(response.headers.get("cloudflare-cdn-cache-control"))
      .toBe("max-age=300, stale-while-revalidate=3600, stale-if-error=0");

    // And nothing the browser may reuse without asking first. `no-cache`
    // permits it to store the response and forbids serving one again without
    // revalidating -- it is `no-store` that forbids keeping it. A browser given
    // `s-maxage` and no `max-age` may reuse freely on a heuristic, which is how
    // a stopped Worker rendered a cached body and no error line three separate
    // times. The edge is the cache, and it answers the revalidation.
    expect(response.headers.get("cache-control")).toBe("no-cache");

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
        new Request("https://benchmark.example/api/pl/leaderboard"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await leaderboard());
    } finally {
      await driver.end();
    }
  });

  test("answers an unknown path with a 404", async () => {
    expect((await get("/api/pl/leaderboards")).status).toBe(404);
    expect((await get("/")).status).toBe(404);
  });

  test("serves no leaderboard that names no Competition", async () => {
    // The path the single-league site served. It stops existing rather than
    // gaining a default: a default would restore the Premier League to the
    // special place the paths just took away from it, and a request naming no
    // Competition names nothing (ADR-0039).
    expect((await get("/api/leaderboard")).status).toBe(404);
  });

  test("answers a Competition it does not serve with a 404", async () => {
    // A typo and a league nobody has frozen a Prompt Version for get the same
    // answer: a missing thing, and not an empty league. `BL1` is in the
    // schema's `competition_code` domain and has no frozen Prompt Version,
    // which is the case one list for both the build and the API keeps from
    // disagreeing. It read `SA` until Serie A was opened -- an unopened code
    // is the point, so it has to be one no ticket is about to open.
    expect((await get("/api/xx/leaderboard")).status).toBe(404);
    expect((await get("/api/bl1/leaderboard")).status).toBe(404);
  });

  test("carries a lifetime on the 404, so a miss cannot outlive its cause",
    async () => {
      const response = await get("/api/bl1/leaderboard");

      expect(response.status).toBe(404);

      // The incident this header exists for: `/api/pd/leaderboard` answered
      // 404 from the edge for days after the deploy that created the route,
      // because the 404 carried a content type and nothing else and the edge
      // picked its own TTL (ticket 0017). A path that answers 404 today
      // answers 200 the day its Competition is served, so the miss deserves
      // a shorter lifetime than any answer the edge would have chosen.
      expect(response.headers.get("cloudflare-cdn-cache-control"))
        .toBe("max-age=60, stale-if-error=0");

      // And the browser asks every load, like every other response here.
      expect(response.headers.get("cache-control")).toBe("no-cache");
    });

  test("lets no Competition's rows reach another's response", async () => {
    // The claim ADR-0035 exists for, asserted in both directions through the
    // seam a reader reads and under the select-only role the Worker holds.
    const spain = await get("/api/pd/leaderboard");
    expect(spain.status).toBe(200);
    const spanish = await spain.json() as LeaderboardBody;

    // La Liga sees its own seat and none of the Premier League's nine.
    expect(spanish.entrants.map(({ id }) => id)).toEqual([SPANISH_SEAT]);
    expect(spanish.throughGw).toBe(20);
    expect(spanish.entrants[0]?.matchPoints).toBe(SPANISH_POINTS);

    // And the Premier League sees nothing of La Liga's: not the seat, not the
    // figure that would top its ranking, and not the Gameweek that would move
    // its Season six weeks on. Every one of these is a filter that has to hold
    // on its own -- the roster's Prompt Version, the ranking join, the scored
    // Gameweek -- and a body that passed only the first would still be wrong.
    const body = await leaderboard();

    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    expect(body.throughGw).toBe(14);
    expect(body.entrants.map(({ matchPoints }) => matchPoints))
      .not.toContain(SPANISH_POINTS);
    expect(body.settledFixtures).toBe(SETTLED_FIXTURES);
    // The qualification is read out of the rows the ranking was read off, so a
    // sentence from the other league is a ranking published on a row it was
    // never read from.
    expect(body.matchPointsQualification).toBe(MATCH_POINTS_QUALIFICATION);
  });

  test("serves each Competition at one spelling of its path", async () => {
    // The edge caches by URL, and spec 0017 moves no cache lifetime: a
    // Competition answered at four spellings is one resource holding four
    // cache entries, each expiring on its own. The upper-case spelling is the
    // same missing thing as any other typo.
    expect((await get("/api/PL/leaderboard")).status).toBe(404);
    expect((await get("/api/Pl/leaderboard")).status).toBe(404);
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
       historical_matches, competitions restart identity cascade`
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
      new Request("https://benchmark.example/api/pl/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as LeaderboardBody;

    // Open, and waiting. Both halves matter: this state and the unopened one
    // below agree on every other field in the body, so the page can only tell
    // a table that will fill from a league nobody has entered by this flag.
    expect(body.active).toBe(true);
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
      new Request("https://benchmark.example/api/pl/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as LeaderboardBody;

    expect(body.nextLock).toEqual({
      gw: 1, deadlineAt: "2026-08-14T17:30:00.000Z"
    });
  });

  test("says a served Competition the Season has not opened is not Active",
    async () => {
      // The precondition, stated rather than assumed: La Liga has a frozen
      // Prompt Version, so it is served and routed, and the Season lists the
      // Premier League alone. That gap is the state -- and it is the one a
      // fresh Season is in for every league between freezing its Prompt
      // Version and opening it.
      expect(MATCH_PROMPT_COMPETITIONS).toContain("PD");
      const listed = await query(
        "select competition from competitions where season = $1", [SEASON]
      );
      expect(listed.map(({ competition }) => competition)).toEqual(["PL"]);

      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pd/leaderboard"),
        query, SEASON, NOW
      );

      // Not a 404, which is what an unserved Competition answers and would say
      // the league does not exist; and not a failure status, which is the only
      // thing the page turns into its error line. A league that has not opened
      // is a fact, and a fact is answered with a body.
      expect(response.status).toBe(200);
      const body = await response.json() as LeaderboardBody;

      expect(body.active).toBe(false);
      expect(body.season).toBe(SEASON);

      // Empty everywhere a reader could otherwise be promised something: no
      // Entrant was entered, no Lock is coming, and no ranking is being
      // qualified. `throughGw` is null here as it is pre-season, which is
      // exactly why `active` and not this field is what the page switches on.
      expect(body.entrants).toEqual([]);
      expect(body.throughGw).toBeNull();
      expect(body.nextLock).toBeNull();
      expect(body.settledFixtures).toBe(0);
      expect(body.matchPointsQualification).toBeNull();
      expect(body.betPointsQualification).toBeNull();
      expect(body.exhibitionCaveat).toBeNull();
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
       historical_matches, competitions restart identity cascade`
    );
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });

    // Gameweek 1 Locked, one Prediction committed, and the matches still being
    // played: the state a real Season is in for four days out of every seven.
    await writer.query(
      "update fixtures set locked_in_gw = gw where season = $1", [SEASON]
    );
    const context = await writer.query<{ id: string }>(
      `insert into contexts (season, gw, track, fixture_id, hash, body, built_at)
       values ($1, 1, 'match', 1, 'seeded-hash', 'seeded body', $2)
       returning id`,
      [SEASON, "2026-08-14T11:30:00Z"]
    );
    await writer.query(
      `insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
         attempts_used, predicted_at
       ) values ('claude/v1', $1, 1, '{"H": 0.5, "D": 0.3, "A": 0.2}', 2, 1,
                 $2, 0, $3)`,
      [SEASON, context.rows[0]?.id, "2026-08-14T11:30:00Z"]
    );
    await scoreMatchSeason({
      database: writer,
      competition: "PL",
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
        new Request("https://benchmark.example/api/pl/leaderboard"),
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

  test("keeps a replayed Exhibition Run off a Season with no ranking",
    async () => {
      // A label this endpoint could derive: the run answered two days after
      // Gameweek 1's deadline, so it did run after Gameweek 1.
      await writer.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ('late-arrival/v1', 'Late Arrival', 'late/base-model',
                   'late', $1, 'exhibition')`,
        [MATCH_PROMPT_VERSION]
      );
      await writer.query(
        `insert into predictions (
           model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
           attempts_used, predicted_at
         )
         select 'late-arrival/v1', $1, 1, '{"H":0.5,"D":0.3,"A":0.2}', 2, 1,
                c.id, 0, $2
           from contexts c
          where c.season = $1 and c.track = 'match' and c.fixture_id = 1`,
        [SEASON, "2026-08-16T09:00:00Z"]
      );

      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/leaderboard"),
        query, SEASON, NOW
      );
      const body = await response.json() as LeaderboardBody;

      // An Exhibition Run is ranked among the Entrants, and this Season has no
      // ranking to be among: the page draws its "Entered for 2026-27" list off
      // this same array, and that list is who was entered for the Season —
      // which an Exhibition Run, joining after the fact, was not. Admitting it
      // here would put it on a seat roll under a heading that is false of it,
      // and with no ranked column to carry its label.
      expect(body.throughGw).toBeNull();
      expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);

      // And no caveat, because nothing on the page is describing it.
      expect(body.exhibitionCaveat).toBeNull();
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
        new Request("https://benchmark.example/api/pl/leaderboard"),
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
       historical_matches, competitions restart identity cascade`
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
      competition: "PL",
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
      new Request("https://benchmark.example/api/pl/leaderboard"),
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
       historical_matches, competitions restart identity cascade`
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
      new Request("https://benchmark.example/api/pl/leaderboard"),
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
       historical_matches, competitions restart identity cascade`
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
        new Request("https://benchmark.example/api/pl/leaderboard"),
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

describe("the dashboard read API with an Exhibition Run on the Season", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const leaderboard = async (): Promise<LeaderboardBody> => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/pl/leaderboard"),
      query, SEASON, NOW
    );
    expect(response.status).toBe(200);
    return await response.json() as LeaderboardBody;
  };

  /** The Exhibition Run's own row, and the one the label is derived against. */
  const EXHIBITION = "late-arrival/v1";

  /**
   * A second Exhibition Run, interrupted and resumed across a deadline: two
   * answers a week apart with Gameweek 15's Lock between them. It is what makes
   * the label's aggregate load-bearing — one taken over the run's first answer
   * would call this Gameweek 14 while half its figures were answered after
   * Gameweek 15 had been played.
   */
  const RESUMED = "resumed-arrival/v1";

  const EXHIBITIONS = [EXHIBITION, RESUMED];

  /**
   * After Gameweek 14's deadline and before Gameweek 15's, which are a week
   * apart. The Season is scored through 14, so this is the instant a replay of
   * every Settled Gameweek would have been answered at.
   */
  const REPLAYED_AT = "2026-11-15T09:00:00Z";

  /** A week later, with Gameweek 15's deadline passed in between. */
  const RESUMED_AT = "2026-11-22T09:00:00Z";

  /** The one settled Fixture the Exhibition Run left unanswered. */
  const EXHIBITION_GAP = 1;

  /** Every roster figure as it stood before the Exhibition Run existed. */
  let withoutExhibition: LeaderboardBody;

  /**
   * Every Match row the scorer wrote for the roster, without its `scored_at`:
   * the stamp is the run's and moves whenever a row is rewritten, and what is
   * claimed here is that the figures did not.
   */
  const rosterScores = async (): Promise<Map<string, string>> => {
    const stored = await writer.query<{
      model_id: string; gw: number; metric: string;
    }>(
      `select model_id, gw, metric, value, n, detail from scores
        where season = $1 and track = 'match'
          and model_id <> all ($2::text[])
        order by model_id, gw, metric`,
      [SEASON, EXHIBITIONS]
    );
    return new Map(stored.rows.map((row) => [
      `${row.model_id} gw${row.gw} ${row.metric}`, JSON.stringify(row)
    ]));
  };

  let scoresWithout: Map<string, string>;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await writer.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches, competitions restart identity cascade`
    );
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await reader.query("set role dashboard_read");

    // The baseline is taken after a scoring run of its own, so that the run
    // which admits the Exhibition Run is the second and not the first. The seed
    // leaves Gameweek 15 Locked, answered and unscored, and comparing a Season
    // scored once against a Season scored twice would report every Gameweek 15
    // row as a figure the Exhibition Run moved.
    await scoreMatchSeason({
      database: writer,
      competition: "PL",
      season: SEASON,
      now: () => new Date("2026-11-15T12:00:00Z")
    });
    withoutExhibition = await leaderboard();
    scoresWithout = await rosterScores();

    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($1, 'Late Arrival', 'late/base-model', 'late', $2,
                 'exhibition')`,
      [EXHIBITION, MATCH_PROMPT_VERSION]
    );

    // A near-perfect replay: the exact scoreline of every settled Fixture bar
    // one, answered months after the Lock it is attributed to. Perfect rather
    // than plausible because the claim under test is that a run which tops the
    // readable table and beats every Entrant on RPS still reaches a reader
    // labelled, and still moves nothing the roster is measured by.
    //
    // Bar one, because an Exhibition Run's own Gap is the other way the
    // statistical layer could feel it: a complete case is the Fixtures every
    // retained Entrant answered, so an Exhibition Gap counted among them would
    // silently take Fixture 1 out of all nine Entrants' shared sample. It is a
    // Fixture the seed's Gapped Entrant answered, so the Gap here is the
    // Exhibition Run's alone.
    await writer.query(
      `insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
         attempts_used, predicted_at
       )
       select $2, $1, f.fixture_id,
              case f.result ->> 'outcome'
                when 'H' then '{"H":0.9,"D":0.05,"A":0.05}'::jsonb
                when 'D' then '{"H":0.05,"D":0.9,"A":0.05}'::jsonb
                else '{"H":0.05,"D":0.05,"A":0.9}'::jsonb
              end,
              (f.result ->> 'home_goals')::int,
              (f.result ->> 'away_goals')::int,
              c.id, 0, $3
         from fixtures f
         join contexts c
           on c.season = f.season and c.track = 'match' and c.fixture_id = f.fixture_id
        where f.season = $1 and f.locked_in_gw is not null
          and f.result is not null and f.fixture_id <> $4`,
      [SEASON, EXHIBITION, REPLAYED_AT, EXHIBITION_GAP]
    );

    // The resumed run: two Fixtures of Gameweek 1, answered a week apart.
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($1, 'Resumed Arrival', 'resumed/base-model', 'resumed', $2,
                 'exhibition')`,
      [RESUMED, MATCH_PROMPT_VERSION]
    );
    for (const [fplId, at] of [[2, REPLAYED_AT], [3, RESUMED_AT]] as const) {
      await writer.query(
        `insert into predictions (
           model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
           attempts_used, predicted_at
         )
         select $2, $1, $3, '{"H":0.5,"D":0.3,"A":0.2}', 1, 0, c.id, 0, $4
           from contexts c
          where c.season = $1 and c.track = 'match' and c.fixture_id = $3`,
        [SEASON, RESUMED, fplId, at]
      );
    }
    await scoreMatchSeason({
      database: writer,
      competition: "PL",
      season: SEASON,
      now: () => new Date("2026-11-16T10:00:00Z")
    });

    return async () => {
      await writer.end();
      await reader.end();
    };
    // Seeds a Season and scores it twice over; the default ten seconds is not
    // enough for the second pass.
  }, 60_000);

  test("ranks the Exhibition Run among the Entrants, labelled by when it ran",
    async () => {
      const body = await leaderboard();

      const exhibition =
        body.entrants.find(({ id }) => id === EXHIBITION);

      // Fourteen, and derived: every `predicted_at` on this run falls between
      // Gameweek 14's deadline and Gameweek 15's, and nothing was told this
      // endpoint which Gameweek that is.
      expect(exhibition?.exhibition).toEqual({ ranAfterGw: 14 });

      // Its Gap is its own: one Fixture short of the Season, and the Gapped
      // Entrant is still exactly one short of it too.
      expect(exhibition?.n).toBe(SETTLED_FIXTURES - 1);

      // Ranked among them and not beside them, in both readable tables: one
      // shape of row, and a leaderboard sorted by either column puts this run
      // at the top of it. Both are asserted because both are rankings a reader
      // switches between, and a Bet Points join quietly lost would leave the
      // Exhibition Run's second column reading nought against a field that
      // scored.
      const leads = (field: "matchPoints" | "betPoints"): void => {
        expect(exhibition?.[field]).toBeGreaterThan(Math.max(
          ...withoutExhibition.entrants.map((each) => each[field] ?? 0)
        ));
      };
      leads("matchPoints");
      leads("betPoints");

      // And the resumed run is labelled by its last answer rather than its
      // first: Gameweek 15's Lock passed between the two, so by the time it
      // gave the second, Gameweek 15 had been played.
      expect(body.entrants.find(({ id }) => id === RESUMED)?.exhibition)
        .toEqual({ ranAfterGw: 15 });

      // And every Entrant is still an Entrant, carrying no label of its own.
      const roster =
        body.entrants.filter(({ id }) => !EXHIBITIONS.includes(id));
      expect(roster.map(({ id }) => id)).toEqual(ROSTER);
      expect(roster.every(({ exhibition: label }) => label === null)).toBe(true);
    });

  test("carries the recall-versus-skill caveat the table now needs", async () => {
    const body = await leaderboard();

    expect(body.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

    // And a table of the roster alone does not carry a caveat about somebody
    // who is not in it. The same body, one Exhibition Run earlier.
    expect(withoutExhibition.exhibitionCaveat).toBeNull();
  });

  test("moves no figure the roster is read on", async () => {
    const body = await leaderboard();

    // Byte for byte, and over the whole body rather than a field at a time: a
    // run that may remember the results must be visible and must change
    // nothing, and the strongest form of that claim is the Season answering
    // identically with it present and absent. Compared as text, so a `numeric`
    // arriving as a string on one pass and a number on the other is a failure
    // rather than a deep-equality that looks past it.
    const roster = (published: LeaderboardBody): string =>
      JSON.stringify({
        ...published,
        exhibitionCaveat: null,
        entrants:
          published.entrants.filter(({ id }) => !EXHIBITIONS.includes(id))
      });

    expect(roster(body)).toBe(roster(withoutExhibition));

    expect(body.entrants).toHaveLength(ROSTER.length + EXHIBITIONS.length);

    // And underneath the body, the same claim about every row the scorer
    // wrote — the Gap rates, the intervals and the Paired Differences the
    // leaderboard never reads included. This is where an Exhibition Run
    // standing as a Comparison Anchor, or emptying a complete case with a Gap
    // of its own, would show up.
    const after = await rosterScores();
    const moved = [...after]
      .filter(([key, row]) => scoresWithout.get(key) !== row)
      .map(([key]) => key);

    expect(moved).toEqual([]);
    expect([...after.keys()]).toEqual([...scoresWithout.keys()]);
  });
});

import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest,
  type FplLeaderboardBody, type LeaderboardBody, type Query
} from "../src/dashboard/read-api.js";
import {
  DEMONSTRATION_QUALIFICATION, FPL_POINTS_SEASON_TO_DATE_METRIC
} from "../src/fpl/demonstration-record.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The FPL endpoints read no clock; the Match track's Fixtures page does. */
const NOW = new Date("2026-11-15T12:00:00Z");

/**
 * The nine FPL seats, written out rather than derived, so a seat quietly
 * leaving the roster fails here. They are `fpl/` seats and not the `/v1` Match
 * ones: both carry `role = 'entrant'` and only the Prompt Version tells them
 * apart, so a read that lost the filter would answer with the other track's.
 */
const ROSTER = [
  "fpl/claude", "fpl/deepseek", "fpl/gemini", "fpl/glm", "fpl/gpt",
  "fpl/grok", "fpl/kimi", "fpl/minimax", "fpl/qwen"
];

/**
 * The Gameweeks the seed's record covers. Gameweek 4 is Settled and scored for
 * nobody — one Entrant stored no Manager State, and ADR-0011 removes the
 * Gameweek from every Season path — so the span ends at 5 with a hole in it.
 */
const SCORED_GAMEWEEKS = [1, 2, 3, 5];

describe("the FPL leaderboard endpoint", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  /**
   * Every read under the role the Worker holds in production. A table granted
   * without a policy returns nothing under Row Level Security and reports no
   * error, so reading as the owner would pass a suite the deployed dashboard
   * fails.
   */
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const get = (path: string): Promise<Response> =>
    handleDashboardRequest(
      new Request(`https://benchmark.example${path}`), query, SEASON, NOW
    );

  const leaderboard = async (): Promise<FplLeaderboardBody> => {
    const response = await get("/api/fpl/leaderboard");
    expect(response.status).toBe(200);
    return await response.json() as FplLeaderboardBody;
  };

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reads the two tables the FPL section added to the role", async () => {
    // The grant and its policy travelled together (migration 0020). Without the
    // policy these select zero rows and report no error, which would reach a
    // reader as nine Squads worth nothing rather than as a failure.
    expect((await query("select 1 from manager_states limit 1")).length).toBe(1);
    expect((await query("select 1 from fpl_players limit 1")).length).toBe(1);

    // And no table beyond what the endpoints read.
    await expect(query("select 1 from fpl_player_points limit 1"))
      .rejects.toThrow(/permission denied/);
  });

  test("ranks the nine FPL seats through the latest scored Gameweek", async () => {
    const body = await leaderboard();

    expect(body.season).toBe(SEASON);
    expect(body.fromGw).toBe(1);
    expect(body.throughGw).toBe(5);
    expect([...body.entrants].map(({ id }) => id).sort())
      .toEqual([...ROSTER].sort());

    // Ranked, and ordered by the rank: rank 1 is the top of the field and the
    // totals fall from there.
    const ranks = body.entrants.map(({ rank }) => rank);
    expect(ranks[0]).toBe(1);
    expect(ranks).toEqual([...ranks].sort((a, b) => (a ?? 0) - (b ?? 0)));

    const totals = body.entrants.map(({ totalPoints }) => totalPoints ?? 0);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));

    // The design prints the Base Model id beneath the Entrant's name.
    const top = body.entrants[0]!;
    expect(top.baseModel).toMatch(/\//);
    expect(top.gwPoints).toBeGreaterThan(0);
  });

  test("carries each Entrant's cumulative series for the Race variant", async () => {
    const body = await leaderboard();

    // The hole in the span, said out loud. Gameweek 4 is Settled and scored for
    // nobody, and a reader handed a series that steps from 3 to 5 with nothing
    // beside it would read the step as a Gameweek in which nobody scored.
    expect(body.missingGws).toEqual([4]);

    for (const entrant of body.entrants) {
      // Absent from every series because it is absent from every Season path:
      // the hole is what the record says, not what this smoothed.
      expect(entrant.cumulative.map(({ gw }) => gw)).toEqual(SCORED_GAMEWEEKS);

      // Cumulative and not per-Gameweek: the series only ever climbs, and its
      // last point is the total the ranking is ordered by.
      const points = entrant.cumulative.map((each) => each.points);
      expect(points).toEqual([...points].sort((a, b) => a - b));
      expect(entrant.cumulative.at(-1)?.points).toBe(entrant.totalPoints);
    }
  });

  test("moves the rank against the previous scored Gameweek's snapshot",
    async () => {
      const body = await leaderboard();

      // Recomputed from the stored snapshots rather than restated: the claim is
      // that the marker is the change between two rankings the scorer wrote,
      // and the previous one is Gameweek 3 because Gameweek 4 scored nobody.
      const rankedAt = (gameweek: number): Map<string, number> => {
        const at = body.entrants.map((entrant) => ({
          id: entrant.id,
          points: entrant.cumulative.find(({ gw }) => gw === gameweek)?.points
        }));
        return new Map(at.map(({ id, points }) => [
          id,
          1 + at.filter((other) => (other.points ?? 0) > (points ?? 0)).length
        ]));
      };
      const before = rankedAt(3);

      for (const entrant of body.entrants) {
        expect(entrant.movement)
          .toBe(before.get(entrant.id)! - entrant.rank!);
      }

      // And the seed is a Season where somebody moved, so the assertion above
      // is not nine noughts agreeing with nine noughts.
      expect(body.entrants.some(({ movement }) => movement !== 0)).toBe(true);
    });

  test("values every Squad at its players' Selling Prices", async () => {
    const body = await leaderboard();

    const value = new Map(
      body.entrants.map(({ id, squadValueTenths }) => [id, squadValueTenths])
    );

    // The opening fifteen cost £98.5m. Salah rose 110 → 120 and Jackson fell
    // 70 → 65, and every Entrant still holds both: half the rise is £0.5m and
    // the whole of the fall is £0.5m, so a Squad nobody Transferred out of is
    // worth what it cost again. Listing the pair at today's price instead would
    // read £99.0m.
    expect(value.get("fpl/gpt")).toBe(985);

    // The one Entrant that Transferred twice: Watkins (£8.0m) and Rogers
    // (£5.5m) out, Wissa and Kudus (£6.5m each) in.
    expect(value.get("fpl/claude")).toBe(985 - 80 - 55 + 65 + 65);
  });

  test("counts the Chips each Entrant can still play", async () => {
    const body = await leaderboard();

    const chips = new Map(
      body.entrants.map(({ id, chipsRemaining }) => [id, chipsRemaining])
    );
    // Two sets of four, one per half-Season, and one Entrant has played a
    // Bench Boost.
    expect(chips.get("fpl/gpt")).toBe(8);
    expect(chips.get("fpl/grok")).toBe(7);
  });

  test("carries the qualification byte for byte out of storage", async () => {
    const body = await leaderboard();

    const [stored] = await query(
      `select detail ->> 'qualification' as qualification from scores
        where season = $1 and track = 'fpl'
          and metric = 'fpl_points_season_to_date' limit 1`,
      [SEASON]
    );
    expect(body.qualification).toBe(stored?.qualification);

    // And it is the sentence the scorer freezes, so the equality above is not
    // two copies of the same mistake.
    expect(body.qualification).toBe(DEMONSTRATION_QUALIFICATION);
  });

  test("excludes the Match track's rows, as the Match track excludes its",
    async () => {
      const fpl = await leaderboard();
      const match =
        await (await get("/api/leaderboard")).json() as LeaderboardBody;

      // One seed, both rankings, and neither one's Gameweek or roster leaks
      // into the other: the Match track is scored through 14 over nine `/v1`
      // seats, the FPL track through 5 over nine `fpl/` seats.
      expect(fpl.throughGw).toBe(5);
      expect(match.throughGw).toBe(14);
      expect(
        match.entrants.map(({ id }) => id).filter((id) => id.startsWith("fpl/"))
      ).toEqual([]);
      expect(fpl.entrants.every(({ id }) => id.startsWith("fpl/"))).toBe(true);
    });

  test("carries the scored-data cache lifetime", async () => {
    const response = await get("/api/fpl/leaderboard");

    // The lifetime the daily scoring run moves on, and `stale-if-error=0` so a
    // Worker that has lost its database goes dark rather than serving numbers
    // that look current.
    expect(response.headers.get("cloudflare-cdn-cache-control"))
      .toBe("max-age=300, stale-while-revalidate=3600, stale-if-error=0");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  });

  test("answers the same body through the Worker's driver", async () => {
    // `numeric` and `max(gw)` reach one driver as a string and the other as a
    // number, and this body is full of both.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/fpl/leaderboard"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await leaderboard());
    } finally {
      await driver.end();
    }
  });
});

describe("the FPL leaderboard at the first Settled Gameweek", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    // The record as it stood after the first Gameweek was scored and before the
    // second was: one snapshot, and nothing behind it to have moved against.
    await writer.query(
      "delete from scores where season = $1 and track = 'fpl' and gw > 1",
      [SEASON]
    );
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("shows no movement rather than inventing one", async () => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/fpl/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as FplLeaderboardBody;

    expect(body.throughGw).toBe(1);
    expect(body.entrants.every(({ rank }) => rank !== null)).toBe(true);
    // Null and not nought: nought is a place held, which is a claim about a
    // ranking that does not exist yet.
    expect(body.entrants.map(({ movement }) => movement))
      .toEqual(body.entrants.map(() => null));
  });
});

describe("the FPL leaderboard once Gameweek 19 has settled", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    // The seed plays five Gameweeks, and the boundary this is about is the
    // nineteenth. The record is therefore moved rather than played: the last
    // scored Gameweek's rows are filed under Gameweek 19, which is the one
    // thing the assertion below reads. Every Manager State stays where it was
    // and is still the standing one, since the endpoint takes the latest at or
    // before the Gameweek it is reading.
    // A `scores` row belongs to a Gameweek of the Season, so Gameweek 19 has
    // to exist before a row can be filed under it. Its own deadline, four
    // weeks past the fifteenth the seed schedules.
    await writer.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ($1, 19, '2026-12-18T17:30:00Z')`,
      [SEASON]
    );
    await writer.query(
      `update scores set gw = 19
        where season = $1 and track = 'fpl' and gw = 5`,
      [SEASON]
    );
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("stops counting the first half's Chips once their deadline passes",
    async () => {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/fpl/leaderboard"),
        query, SEASON, NOW
      );
      const body = await response.json() as FplLeaderboardBody;
      expect(body.throughGw).toBe(19);

      // Four and not eight, and four for the Entrant that spent a Bench Boost
      // as much as for the eight that spent nothing: the first-half set expires
      // unspent at the Gameweek 19 deadline, which a Settled Gameweek 19 is
      // past. Counted against the Gameweek the Entrant plays next.
      expect(body.entrants.map(({ chipsRemaining }) => chipsRemaining))
        .toEqual(body.entrants.map(() => 4));
    });
});

describe("the FPL leaderboard before the Season starts", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("returns the entered seats with nothing ranked", async () => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/fpl/leaderboard"),
      query, SEASON, NOW
    );
    const body = await response.json() as FplLeaderboardBody;

    // The field the empty state switches on. An empty array cannot tell a
    // Season that has not started from a request that returned nothing, and the
    // header's Entrant count is read off the seats.
    expect(body.throughGw).toBeNull();
    expect(body.fromGw).toBeNull();
    expect(body.qualification).toBeNull();
    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    expect(body.entrants.every((entrant) =>
      entrant.rank === null && entrant.totalPoints === null
      && entrant.squadValueTenths === null && entrant.cumulative.length === 0
    )).toBe(true);
  });
});

describe("the FPL leaderboard with the qualification missing from storage",
  () => {
    const writer = new Client({ connectionString: process.env.DATABASE_URL });
    const reader = new Client({ connectionString: process.env.DATABASE_URL });

    const query: Query = async (sql, parameters = []) =>
      (await reader.query(sql, [...parameters])).rows;

    beforeAll(async () => {
      await writer.connect();
      await reader.connect();
      await resetSchema(writer);
      await seedSeason({
        database: writer, season: SEASON, stopAt: "the design's"
      });
      // One Entrant's row at the Gameweek the ranking is read off, and no
      // other: a scorer that stopped writing it, or a hand at a `psql` prompt.
      // The Gameweeks behind it keep theirs, which is what makes this the case
      // worth writing — a reader of the first stored sentence it can find would
      // publish this ranking on the strength of a row it was not read from.
      await writer.query(
        `update scores set detail = detail - 'qualification'
          where season = $1 and track = 'fpl' and metric = $2
            and gw = 5 and model_id = 'fpl/kimi'`,
        [SEASON, FPL_POINTS_SEASON_TO_DATE_METRIC]
      );
      await reader.query("set role dashboard_read");

      return async () => {
        await writer.end();
        await reader.end();
      };
    });

    test("fails closed rather than serving a bare ranking", async () => {
      await expect(handleDashboardRequest(
        new Request("https://benchmark.example/api/fpl/leaderboard"),
        query, SEASON, NOW
      )).rejects.toThrow(/qualification/);
    });
  });

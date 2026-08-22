import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason, type SeedStop } from "../src/seed-season.js";
import {
  handleDashboardRequest, type EntrantsBody, type Query
} from "../src/dashboard/read-api.js";
import {
  MATCH_PROMPT_VERSION, matchPromptOf
} from "../src/predictions/openrouter-entrant.js";
import {
  BET_POINTS_METRIC, BET_POINTS_SEASON_TO_DATE_METRIC,
  GAP_RATE_SEASON_TO_DATE_METRIC, MATCH_POINTS_METRIC,
  MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC,
  RPS_SEASON_TO_DATE_METRIC, scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The Entrant record reads no clock; the seam takes one all the same. */
const NOW = new Date("2026-11-15T12:00:00Z");

/** The nine Entrants of the match roster, in the order the endpoint holds. */
const ROSTER = [
  "claude/v1", "deepseek/v1", "gemini/v1", "glm/v1", "gpt/v1",
  "grok/v1", "kimi/v1", "minimax/v1", "qwen/v1"
];

/** The Gameweek the design's Season is scored through. */
const THROUGH_GW = 14;

/** The seed's Gapped Entrant. */
const GAPPED = "minimax/v1";

/** The tenth seat one case below enters, which answers nothing all Season. */
const ABSENT = "absent/v1";

/**
 * La Liga's one seat, and the Gameweek its Season is scored through — later
 * than the Premier League's, which is what makes the Gameweek this endpoint
 * reads at answerable in the Premier League's direction.
 */
const SPANISH_SEAT = "match-pd/claude/v1";
const SPANISH_GW = 20;

/** The seven legs of a Bet Slip, in the order a slip states them (ADR-0040). */
const MARKETS = [
  "result", "over_under_1.5", "over_under_2.5", "over_under_3.5",
  "over_under_4.5", "btts", "handicap_1.5"
];

function connections() {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const get = async (path: string): Promise<Response> =>
    handleDashboardRequest(
      new Request(`https://benchmark.example${path}`), query, SEASON, NOW
    );

  const entrants = async (
    path = "/api/pl/entrants"
  ): Promise<EntrantsBody> => {
    const response = await get(path);
    expect(response.status).toBe(200);
    return await response.json() as EntrantsBody;
  };

  return { writer, reader, get, entrants };
}

async function seed(
  writer: pg.Client,
  reader: pg.Client,
  stopAt: SeedStop
): Promise<void> {
  await writer.connect();
  await reader.connect();
  await resetSchema(writer);
  await seedSeason({ database: writer, season: SEASON, stopAt });
  await reader.query("set role dashboard_read");
}

/**
 * The same counts taken the other way: over the Season's *per-Gameweek* rows,
 * whose detail is flat. The endpoint reads the cumulative rows, whose detail is
 * nested one level deeper — a read assuming the flat shape there counts nothing
 * and says so silently, which is what this second source exists to catch.
 */
async function fromGameweekRows(writer: pg.Client, entrant: string) {
  const points = await writer.query<{ detail: { fixtures: {
    points: number;
  }[] } }>(
    `select detail from scores
      where season = $1 and track = 'match' and metric = $2 and model_id = $3
      order by gw`,
    [SEASON, MATCH_POINTS_METRIC, entrant]
  );
  const bets = await writer.query<{ detail: { fixtures: {
    slip: { market: string; won: boolean }[];
  }[] } }>(
    `select detail from scores
      where season = $1 and track = 'match' and metric = $2 and model_id = $3
      order by gw`,
    [SEASON, BET_POINTS_METRIC, entrant]
  );

  const scored = points.rows.flatMap((row) => row.detail.fixtures);
  const legs = bets.rows.flatMap((row) =>
    row.detail.fixtures.flatMap(({ slip }) => slip));

  return {
    tiers: [5, 3, 2, 0].map((tier) => ({
      points: tier,
      count: scored.filter((fixture) => fixture.points === tier).length
    })),
    markets: MARKETS.map((market) => {
      const own = legs.filter((leg) => leg.market === market);
      return {
        market,
        hits: own.filter(({ won }) => won).length,
        n: own.length
      };
    })
  };
}

describe("the Entrant record endpoint on the design's Season", () => {
  const { writer, reader, get, entrants } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "the design's");

    // A La Liga seat with a scored Season of its own beside the Premier
    // League's, for the reason the other two suites carry their counterparts: a
    // record spans one Competition and never two (ADR-0035), and until a Season
    // had a second league in it no query could be caught unioning them.
    //
    // Scored *through a later Gameweek* than the Premier League's 14, because
    // this endpoint reads the Gameweek before it reads anything else and takes
    // the maximum: a La Liga row on an earlier Gameweek would leave the Premier
    // League's answer identical with the filter dropped, and prove nothing.
    //
    // The seat carries the same `entrant` role as the nine and is told apart by
    // the Prompt Version each Competition freezes its own of (ADR-0038), so a
    // roster read missing that filter seats ten here and one over there.
    await writer.query(
      `insert into competitions (competition, season) values ('PD', $1)`,
      [SEASON]
    );
    await writer.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PD', $1, $2, $3)`,
      [SEASON, SPANISH_GW, "2027-01-15T17:30:00Z"]
    );
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($2, 'Spanish Claude', 'anthropic/claude-opus-4.5',
                 'anthropic', $1, 'entrant')`,
      [matchPromptOf("PD").version, SPANISH_SEAT]
    );

    // Written by hand rather than scored: what is being asserted is which rows
    // a read reaches, and the shortest way to a La Liga row on Gameweek 20 is
    // to write one. The per-Gameweek RPS row is what says the Season is scored
    // through that Gameweek; the four cumulative rows are what the record is
    // built from.
    const week = (detail: object) => ({ gameweeks: [{ gw: SPANISH_GW, ...detail }] });
    for (const [metric, value, n, detail] of [
      [RPS_METRIC, 0.2, 2, null],
      [MATCH_POINTS_SEASON_TO_DATE_METRIC, 8, 2,
        week({ points: 8, fixtures: [{ points: 5 }, { points: 3 }] })],
      [BET_POINTS_SEASON_TO_DATE_METRIC, 1, 2,
        week({ points: 1, fixtures: [{ slip: [{ market: "result", won: true }] }] })],
      [RPS_SEASON_TO_DATE_METRIC, 0.2, 2, week({ mean: 0.2 })],
      [GAP_RATE_SEASON_TO_DATE_METRIC, 0, 2, week({ n: 2, gaps: [] })]
    ] as const) {
      await writer.query(
        `insert into scores (
           model_id, competition, season, gw, track, metric, value, n, detail
         ) values ($1, 'PD', $2, $3, 'match', $4, $5, $6, $7)`,
        [SPANISH_SEAT, SEASON, SPANISH_GW, metric, value, n, detail]
      );
    }

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("returns all nine with their complete per-Gameweek series", async () => {
    const body = await entrants();

    expect(body.season).toBe(SEASON);
    expect(body.throughGw).toBe(THROUGH_GW);
    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);

    // Every Entrant carries every Gameweek, which is what lets the chart draw
    // nine lines over one x-domain and what keeps a Gapped Gameweek in the
    // table rather than closing the record over it.
    for (const entrant of body.entrants) {
      expect(entrant.gameweeks.map(({ gw }) => gw)).toEqual(
        Array.from({ length: THROUGH_GW }, (_, index) => index + 1)
      );
    }
  });

  test("carries the four headline figures", async () => {
    const [first] = (await entrants()).entrants;
    expect(first).toBeDefined();

    expect(first!.name).toBeTruthy();
    expect(first!.matchPoints).toBeGreaterThan(0);
    expect(first!.betPoints).toBeGreaterThan(0);
    expect(first!.rps).toBeGreaterThan(0);
    expect(first!.gaps).toBe(0);
    expect(first!.n).toBeGreaterThan(0);
  });

  test("counts the tiers over the flattened cumulative detail", async () => {
    const body = await entrants();

    for (const entrant of body.entrants) {
      const expected = await fromGameweekRows(writer, entrant.id);
      expect(entrant.tiers).toEqual(expected.tiers);

      // Counted and not recovered: the tiers sum to the Fixtures the Entrant
      // settled, and the points they imply sum to its Match Points.
      const total = entrant.tiers.reduce((sum, { count }) => sum + count, 0);
      expect(total).toBe(entrant.n);
      expect(
        entrant.tiers.reduce((sum, tier) => sum + tier.points * tier.count, 0)
      ).toBe(entrant.matchPoints);
    }
  });

  test("counts the Bet Slip legs won per market", async () => {
    const body = await entrants();

    for (const entrant of body.entrants) {
      const expected = await fromGameweekRows(writer, entrant.id);
      expect(entrant.markets).toEqual(expected.markets);

      // The seven legs are stated per settled Fixture, and the legs won are
      // Bet Points — one count read twice rather than two that could disagree.
      expect(entrant.markets.map(({ market }) => market)).toEqual(MARKETS);
      expect(
        entrant.markets.reduce((sum, { hits }) => sum + hits, 0)
      ).toBe(entrant.betPoints);
      for (const market of entrant.markets) {
        expect(market.n).toBe(entrant.n);
      }
    }
  });

  test("sums the per-Gameweek series to the Season figures", async () => {
    for (const entrant of (await entrants()).entrants) {
      const sum = (pick: (row: (typeof entrant.gameweeks)[number]) => number) =>
        entrant.gameweeks.reduce((total, row) => total + pick(row), 0);

      expect(sum((row) => row.matchPoints)).toBe(entrant.matchPoints);
      expect(sum((row) => row.betPoints)).toBe(entrant.betPoints);
      expect(sum((row) => row.gaps)).toBe(entrant.gaps);
      // The denominator the counts were taken over, which is the Entrant's own
      // and not the Lock's.
      expect(sum((row) => row.settled)).toBe(entrant.n);
      expect(sum((row) => row.exact)).toBe(
        entrant.tiers.find(({ points }) => points === 5)?.count
      );
      // Everything from 2 up got the Outcome right.
      expect(sum((row) => row.outcome)).toBe(
        entrant.tiers
          .filter(({ points }) => points > 0)
          .reduce((total, { count }) => total + count, 0)
      );
    }
  });

  test("keeps the Gameweek an Entrant Gapped in its record", async () => {
    const body = await entrants();
    const gapped = body.entrants.find(({ id }) => id === GAPPED);

    expect(gapped?.gaps).toBeGreaterThan(0);
    const gap = gapped?.gameweeks.find((row) => row.gaps > 0);
    // The Gameweek is still a row, with the Fixtures its Lock owned beside the
    // fewer the Entrant answered.
    expect(gap).toBeDefined();
    expect(gap!.fixtures).toBeGreaterThan(0);
    expect(gap!.rps).not.toBeNull();
    // The Fixtures it answered are fewer than the Fixtures its Lock owned, by
    // exactly the Gaps.
    expect(gap!.settled).toBe(gap!.fixtures - gap!.gaps);
  });

  test("keeps each Competition's Entrant records out of the other's response",
    async () => {
      const premierLeague = await entrants();
      const laLiga = await entrants("/api/pd/entrants");

      // Asserted in both directions, because a filter can be missing from one
      // read and present in the other.
      //
      // The Premier League is scored through 14 and not La Liga's later 20 —
      // the Gameweek this whole body is read at, so dropping that filter empties
      // every figure below it — and its roster is its own nine and not ten.
      expect(premierLeague.throughGw).toBe(THROUGH_GW);
      expect(premierLeague.entrants.map(({ id }) => id)).toEqual(ROSTER);

      // La Liga's own Gameweek, its own seat, and its own written rows reaching
      // the record: a Competition's frozen Prompt Version seats its own roster,
      // and the Premier League's nine are not entered for this league at all.
      expect(laLiga.throughGw).toBe(SPANISH_GW);
      expect(laLiga.entrants.map(({ id }) => id)).toEqual([SPANISH_SEAT]);
      expect(laLiga.entrants[0]).toMatchObject({
        matchPoints: 8, betPoints: 1, rps: 0.2, gaps: 0, n: 2
      });
      expect(laLiga.entrants[0]?.gameweeks.map(({ gw }) => gw))
        .toEqual([SPANISH_GW]);

      // The figures are asserted and not merely the ids because that is what
      // holds the four joins onto `scores` to their own Competition. A seat
      // belongs to one league through its Prompt Version, so no join can drag
      // the *other* league's rows in — its `model_id` matches nothing here —
      // but a join naming the wrong Competition reaches none of this seat's
      // own rows either, and La Liga's record comes back all nulls under all
      // the right ids.
    });

  test("answers a Competition it does not serve, and the bare path, with a 404",
    async () => {
      // The same terms as the other two endpoints', which is now the whole of
      // the Match track: no default, and one lower-case spelling, so the edge
      // holds one entry per league rather than four.
      expect((await get("/api/entrants")).status).toBe(404);
      expect((await get("/api/bl1/entrants")).status).toBe(404);
      expect((await get("/api/PL/entrants")).status).toBe(404);
      expect((await get("/api/pl/entrants/1")).status).toBe(404);
    });

  test("answers the same body through the Worker's driver", async () => {
    // The body this endpoint builds is read out of four `jsonb` columns carried
    // whole across the seam, which no earlier endpoint does: the leaderboard
    // unwraps its one string in SQL, and the Fixtures page's `probs` is one
    // small object per row. A driver that handed `detail` back as text rather
    // than as an object would leave `perGameweek` finding no `gameweeks` key —
    // and every series, tier and market would come back empty with no error
    // anywhere, which is the exact failure this endpoint is written against.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/entrants"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await entrants());
    } finally {
      await driver.end();
    }
  });

  test("carries the cache lifetime the scoring run moves on", async () => {
    const response = await get("/api/pl/entrants");

    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
      "max-age=300, stale-while-revalidate=3600, stale-if-error=0"
    );
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("keeps a Base Model that left the other track", async () => {
    // The withdrawal filter belongs to the FPL track's reads and to no others
    // (ADR-0047). A seat is entered per track, so one Base Model holds two
    // rows, and leaving one track says nothing about the other. This is the
    // assertion that catches a filter applied one table too widely: the same
    // Base Models are withdrawn from the FPL track in production.
    const before = await entrants();
    const [first] = before.entrants;
    await writer.query(
      "update models set withdrawn_at = now() where id like 'fpl/%'"
    );
    try {
      const body = await entrants();

      expect(body.entrants).toHaveLength(before.entrants.length);
      expect(body.entrants[0]?.id).toBe(first?.id);
    } finally {
      await writer.query("update models set withdrawn_at = null");
    }
  });

});

describe("the Entrant record endpoint with a Gameweek wholly Gapped", () => {
  const { writer, reader, entrants } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "the design's");

    // A tenth seat that entered the Season and answered nothing in it — the
    // shape a provider outage across every Prediction window leaves, which
    // ADR-0009 enters this roster knowing about. A Prediction cannot be
    // deleted to make one, and must not be: the rows are immutable, and a test
    // that reached this state by deleting them would be asserting over a state
    // the system cannot arrive at.
    //
    // It carries no Match Points, Bet Points or RPS row at all. Only the Gap
    // rate, which the scorer writes for every Entrant of the roster whether it
    // answered or not, says its Season happened.
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role, config
       ) values ($1, 'Absent', 'absent/absent-1', 'openrouter', $2, 'entrant',
                 jsonb_build_object('baseModelClass', 'Open-weight'))`,
      [ABSENT, MATCH_PROMPT_VERSION]
    );
    await writer.query("delete from scores where season = $1", [SEASON]);
    await scoreMatchSeason({
      database: writer,
      competition: "PL",
      season: SEASON,
      now: () => new Date("2026-11-15T12:00:00Z")
    });

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("keeps a wholly Gapped Gameweek as a row of its own", async () => {
    const body = await entrants();
    const absent = body.entrants.find(({ id }) => id === ABSENT);

    // Still every Gameweek, so the record does not close over the ones the
    // Entrant was absent for and the chart draws its line across the same
    // x-domain as the eight that answered.
    expect(absent?.gameweeks.map(({ gw }) => gw)).toEqual(
      Array.from({ length: THROUGH_GW }, (_, index) => index + 1)
    );

    for (const week of absent!.gameweeks) {
      expect(week).toMatchObject({ matchPoints: 0, betPoints: 0, exact: 0, outcome: 0 });
      // Nothing settled, so there is no mean to report — and the Gaps are
      // every Fixture the Lock owned.
      expect(week.rps).toBeNull();
      expect(week.gaps).toBe(week.fixtures);
      expect(week.gaps).toBeGreaterThan(0);
    }

    // A nought is not an absence: the points read 0 because none were scored,
    // and the RPS stays null because a mean over nothing is not zero.
    expect(absent).toMatchObject({ matchPoints: 0, betPoints: 0, n: 0 });
    expect(absent!.rps).toBeNull();
    expect(absent!.gaps).toBeGreaterThan(0);

    // The breakdowns are asked for whatever the Entrant did, so both are still
    // there and both read nought. The markets are the Season's own, taken
    // across the field: this Entrant stated no leg of its own to name them
    // with, and seven rows of nought is the answer rather than no rows at all.
    expect(absent!.tiers).toEqual(
      [5, 3, 2, 0].map((points) => ({ points, count: 0 }))
    );
    expect(absent!.markets).toEqual(
      MARKETS.map((market) => ({ market, hits: 0, n: 0 }))
    );
  });
});

describe("the Entrant record endpoint before the Season starts", () => {
  const { writer, reader, entrants } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "pre-season");
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("returns the entered Entrants with nothing scored", async () => {
    const body = await entrants();

    expect(body.throughGw).toBeNull();
    expect(body.entrants.map(({ id }) => id)).toEqual(ROSTER);
    for (const entrant of body.entrants) {
      expect(entrant.matchPoints).toBeNull();
      expect(entrant.betPoints).toBeNull();
      expect(entrant.rps).toBeNull();
      expect(entrant.gaps).toBeNull();
      expect(entrant.n).toBeNull();
      expect(entrant.gameweeks).toEqual([]);
      expect(entrant.tiers).toEqual([]);
      expect(entrant.markets).toEqual([]);
    }
  });
});

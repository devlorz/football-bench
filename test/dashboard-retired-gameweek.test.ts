import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import {
  handleDashboardRequest, type LeaderboardBody, type Query,
  type RetiredGameweekBody
} from "../src/dashboard/read-api.js";
import {
  MATCH_PROMPT_VERSION, matchPromptOf
} from "../src/predictions/openrouter-entrant.js";
import {
  BET_POINTS_METRIC, BET_POINTS_SEASON_TO_DATE_METRIC, MATCH_POINTS_METRIC,
  MATCH_POINTS_SEASON_TO_DATE_METRIC, RPS_METRIC
} from "../src/predictions/score-match-gameweek.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";

/** Any instant: nothing this endpoint reads moves with a clock. */
const NOW = new Date("2026-11-15T12:00:00Z");

/**
 * La Liga's retired Prompt Version and the one Gameweek it owns whole, written
 * out rather than read from the module every assertion below is about.
 */
const RETIRED = { version: "match-pd/2026-27-v1", gw: 1 };

/** The version every La Liga run reads from the flip onwards. */
const RESTARTED = matchPromptOf("PD").version;

/**
 * Three v1 seats under their plain ids, which is the shape the retired ten
 * stand in, and two v2 seats under the segment a restart gives them
 * (ADR-0042). Both sets are `role = 'entrant'` and both name La Liga: the
 * Prompt Version is the only thing that tells them apart, which is exactly what
 * every read below is claiming to filter on.
 */
const V1_SEATS = ["match-pd/claude", "match-pd/gpt", "match-pd/kimi"];
const V2_SEATS = [
  `${RESTARTED}/claude-opus-5`, `${RESTARTED}/gpt-5.6`
];

/** The six Fixtures Gameweek 1's Lock owned, and the four the calendar moved. */
const OWNED = 6;
const MOVED = 4;

/** One stored RPS per v1 seat, distinct so no assertion passes by accident. */
const RPS = [0.2, 0.25, 0.3];

describe("La Liga's retired Gameweek", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await client.query(sql, [...parameters])).rows;

  const get = async (path: string): Promise<Response> =>
    handleDashboardRequest(
      new Request(`https://benchmark.example${path}`), query, SEASON, NOW
    );

  const block = async (): Promise<RetiredGameweekBody> => {
    const response = await get("/api/pd/retired");
    expect(response.status).toBe(200);
    return await response.json() as RetiredGameweekBody;
  };

  /**
   * Every figure the block may publish, and one of each thing it may not: a
   * Gameweek 2 row the retired version never played, and a Season-to-date row,
   * which is the merge ADR-0042 forbids wearing the shape of a total.
   */
  const score = async (
    seat: string, gw: number, metric: string, value: number
  ): Promise<void> => {
    await client.query(
      `insert into scores (
         model_id, competition, season, gw, track, metric, value, n
       ) values ($1, 'PD', $2, $3, 'match', $4, $5, $6)`,
      [seat, SEASON, gw, metric, value, OWNED]
    );
  };

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    for (const competition of ["PL", "PD"]) {
      await client.query(
        "insert into competitions (competition, season) values ($1, $2)",
        [competition, SEASON]
      );
      for (const gw of [1, 2]) {
        await client.query(
          `insert into gameweeks (competition, season, gw, deadline_at)
           values ($1, $2, $3, $4)`,
          [
            competition, SEASON, gw,
            gw === 1 ? "2026-08-15T17:30:00Z" : "2026-08-22T17:30:00Z"
          ]
        );
      }
    }

    // Ten Fixtures a reader can count on La Liga's Fixtures page, of which six
    // are Gameweek 1's by the only attribution the record has (ADR-0013): the
    // other four were scheduled into Gameweek 1 and moved, so they lock into
    // Gameweek 2 and are asked there under the restarted version.
    for (let fixture = 1; fixture <= OWNED + MOVED; fixture += 1) {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at, result
         ) values ('PD', $1, $2, 1, $3, 'Home', 'Away',
                   '2026-08-15T19:00:00Z', $4)`,
        [
          SEASON, fixture, fixture <= OWNED ? 1 : 2,
          fixture <= OWNED ? JSON.stringify({ home: 1, away: 0 }) : null
        ]
      );
    }

    for (const [version, seats] of [
      [RETIRED.version, V1_SEATS], [RESTARTED, V2_SEATS],
      // A Premier League seat under the Premier League's own version, so a read
      // that filtered by role alone would answer La Liga with it.
      [MATCH_PROMPT_VERSION, ["match/claude-opus-5"]]
    ] as const) {
      for (const seat of seats) {
        await client.query(
          `insert into models (
             id, name, base_model, provider, prompt_version, role
           ) values ($1, 'Seat', 'anthropic/claude-opus-5', 'anthropic', $2,
                     'entrant')`,
          [seat, version]
        );
      }
    }

    return async () => {
      await client.end();
    };
  });

  test("lists every v1 seat's Gameweek 1 Match Points, Bet Points and RPS",
    async () => {
      for (const [index, seat] of V1_SEATS.entries()) {
        await score(seat, RETIRED.gw, MATCH_POINTS_METRIC, 20 + index);
        await score(seat, RETIRED.gw, BET_POINTS_METRIC, 10 + index);
        await score(seat, RETIRED.gw, RPS_METRIC, RPS[index]!);
      }
      // Two rows the block must not read, written against the same seat and the
      // same Competition so nothing but the Gameweek and the metric excludes
      // them: a Gameweek the retired version never played, and a Season total,
      // which is the merge ADR-0042 forbids.
      await score(V1_SEATS[0]!, 2, MATCH_POINTS_METRIC, 999);
      await score(
        V1_SEATS[0]!, RETIRED.gw, MATCH_POINTS_SEASON_TO_DATE_METRIC, 999
      );
      await score(
        V1_SEATS[0]!, RETIRED.gw, BET_POINTS_SEASON_TO_DATE_METRIC, 999
      );

      const body = await block();

      expect(body.season).toBe(SEASON);
      expect(body.gw).toBe(RETIRED.gw);
      // The read names the retired version, which is the whole of what makes
      // this block readable while every other read has stopped seeing it.
      expect(body.promptVersion).toBe("match-pd/2026-27-v1");
      expect(body.entrants).toEqual([
        {
          id: "match-pd/claude", name: "Seat",
          matchPoints: 20, betPoints: 10, rps: RPS[0]
        },
        {
          id: "match-pd/gpt", name: "Seat",
          matchPoints: 21, betPoints: 11, rps: RPS[1]
        },
        {
          id: "match-pd/kimi", name: "Seat",
          matchPoints: 22, betPoints: 12, rps: RPS[2]
        }
      ]);
      // Three numbers per seat and no fourth: an interval, a Comparison Anchor
      // or a Season total would each be a field here, and one Gameweek supports
      // none of them.
      expect(Object.keys(body).sort())
        .toEqual(["entrants", "fixtures", "gw", "promptVersion", "season"]);
    });

  test("says so rather than guessing when the scores are not stored",
    async () => {
      await client.query(
        "delete from scores where model_id = any($1)", [V1_SEATS]
      );

      const body = await block();

      // Every seat still listed and every figure null. This state means slice
      // 1's scoring run never landed, and the page's honesty is the alarm — a
      // block that dropped the seats, or drew noughts, would report a Gameweek
      // nobody scored as a Gameweek everybody lost.
      expect(body.entrants.map(({ id }) => id)).toEqual(V1_SEATS);
      for (const entrant of body.entrants) {
        expect(entrant.matchPoints).toBeNull();
        expect(entrant.betPoints).toBeNull();
        expect(entrant.rps).toBeNull();
      }
    });

  test("counts the Fixtures the retired Gameweek's Lock owned, not the ten "
    + "scheduled into it", async () => {
    const body = await block();

    // Six and not ten. A reader comparing this block against a ten-row fixture
    // list must be able to read the difference as four Fixtures asked later,
    // and not as four the record lost.
    expect(body.fixtures).toBe(OWNED);
  });

  test("is not served for a Competition with no retired Gameweek", async () => {
    // The Premier League has none: it never used a version it has retired, so
    // there is no block for its page to carry and no body for one to be built
    // from. A 404 and not an empty block — an empty block is a claim that
    // something was retired and scored nought.
    expect((await get("/api/pl/retired")).status).toBe(404);
  });

  test("is the only read that returns the retired seats", async () => {
    // Both versions stand in one store, which is the state the flip leaves
    // behind for good. Every roster-shaped endpoint answers with the restarted
    // seats alone; this one answers with the retired ones alone; and no seat
    // appears in both.
    const leaderboard = await (await get("/api/pd/leaderboard")).json() as
      LeaderboardBody;
    const entrants = await (await get("/api/pd/entrants")).json() as
      { entrants: Array<{ id: string }> };
    const retired = await block();

    expect(leaderboard.entrants.map(({ id }) => id)).toEqual([...V2_SEATS].sort());
    expect(entrants.entrants.map(({ id }) => id)).toEqual([...V2_SEATS].sort());
    expect(retired.entrants.map(({ id }) => id)).toEqual(V1_SEATS);
  });
});

import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import {
  handleDashboardRequest, type LeaderboardBody, type Query,
  type RetiredGameweekBody
} from "../src/dashboard/read-api.js";
import {
  MATCH_PROMPT_VERSION, matchPromptOf, RETIRED_GAMEWEEK_CAVEAT
} from "../src/predictions/openrouter-entrant.js";
import {
  BET_POINTS_METRIC, BET_POINTS_QUALIFICATION,
  BET_POINTS_SEASON_TO_DATE_METRIC, MATCH_POINTS_METRIC,
  MATCH_POINTS_QUALIFICATION, MATCH_POINTS_SEASON_TO_DATE_METRIC,
  REFERENCE_HOME, RPS_METRIC
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

/** What the scorer stores beside each figure, by the metric it qualifies. */
const QUALIFICATIONS: Record<string, string> = {
  [MATCH_POINTS_METRIC]: MATCH_POINTS_QUALIFICATION,
  [BET_POINTS_METRIC]: BET_POINTS_QUALIFICATION
};

describe("La Liga's retired Gameweek", () => {
  /** Seeds and rewrites. Nothing reads through this one. */
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  /**
   * Every read the seam makes, under the role the Worker holds in production.
   * A table granted without a policy returns nothing under Row Level Security
   * and reports no error, so reading as the owner here would pass a suite the
   * deployed dashboard fails — and this block is a new read of `models`,
   * `scores` and `fixtures` rather than a new use of an old one.
   */
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

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
    await writer.query(
      `insert into scores (
         model_id, competition, season, gw, track, metric, value, n, detail
       ) values ($1, 'PD', $2, $3, 'match', $4, $5, $6, $7)`,
      [
        seat, SEASON, gw, metric, value, OWNED,
        // The sentence the scorer writes into every row a figure can be read
        // off. RPS carries none, which is why the block's third sentence is a
        // constant rather than a read.
        QUALIFICATIONS[metric] === undefined
          ? null
          : JSON.stringify({ qualification: QUALIFICATIONS[metric] })
      ]
    );
  };

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);

    for (const competition of ["PL", "PD"]) {
      await writer.query(
        "insert into competitions (competition, season) values ($1, $2)",
        [competition, SEASON]
      );
      for (const gw of [1, 2]) {
        await writer.query(
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
      await writer.query(
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
        await writer.query(
          `insert into models (
             id, name, base_model, provider, prompt_version, role
           ) values ($1, 'Seat', 'anthropic/claude-opus-5', 'anthropic', $2,
                     'entrant')`,
          [seat, version]
        );
      }
    }

    // The three Reference Lines, which sit under the Premier League's frozen
    // version and carry rows for every Competition they were run over — La
    // Liga's retired Gameweek 1 among them. They are the trap in this slice:
    // a ranking window narrowed by Prompt Version would keep them, because
    // theirs is the version that still stands, and a window narrowed by
    // `role = 'entrant'` would keep them too. Only the Gameweek excludes them,
    // which is why the window is a Gameweek.
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($1, 'Home advantage', 'reference', 'reference', $2,
                 'reference')`,
      [REFERENCE_HOME, MATCH_PROMPT_VERSION]
    );
    await score(REFERENCE_HOME, 1, RPS_METRIC, 0.31);

    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
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
      expect(Object.keys(body).sort()).toEqual([
        "betPointsQualification", "entrants", "evidenceCaveat", "fixtures",
        "gw", "matchPointsQualification", "promptVersion", "season"
      ]);
      // Byte for byte out of storage, which is the claim: the scorer writes the
      // sentence into every row a figure can be read off, and the block reads
      // it back rather than restating the constant.
      expect(body.matchPointsQualification).toBe(MATCH_POINTS_QUALIFICATION);
      expect(body.betPointsQualification).toBe(BET_POINTS_QUALIFICATION);
      expect(body.evidenceCaveat).toBe(RETIRED_GAMEWEEK_CAVEAT);
    });

  test("keeps the retired Gameweek out of the ranking beside it", async () => {
    // The block's whole premise, read from the other side. The v1 rows seeded
    // above are La Liga's only scored Gameweek and the leaderboard must not
    // date itself from them: they were earned under a question the ranking no
    // longer asks, and reading them would rank the restarted seats as noughts
    // against a Gameweek none of them was entered for.
    //
    // Neither figure below is filtered by a Prompt Version anywhere — a
    // Gameweek is scored, and a Fixture settles, whoever answered it — so this
    // is the one place the retired Gameweek can reach the ranking, and the one
    // place it is kept out.
    const beforeRestart = await (await get("/api/pd/leaderboard")).json() as
      LeaderboardBody;

    // Null, with a Reference Line's own RPS row sitting on that Gameweek as
    // well: the retired Gameweek is refused whoever wrote it.
    expect(beforeRestart.throughGw).toBeNull();
    // Not six. Gameweek 1's Lock owned six settled Fixtures, and the figure the
    // ranking is presented against counts none of them.
    expect(beforeRestart.settledFixtures).toBe(0);
    // And the Lock a reader is told to wait for is the restarted version's
    // first, not the one that has already been played and retired.
    expect(beforeRestart.nextLock?.gw).toBe(2);

    // The same reads, once the restarted version has a Gameweek of its own:
    // the window opens at Gameweek 2 rather than being shut. A filter that
    // answered null whatever the store held would pass everything above.
    await score(V2_SEATS[0]!, 2, RPS_METRIC, 0.19);
    await writer.query(
      `update fixtures set result = $2
        where competition = 'PD' and season = $1 and locked_in_gw = 2
          and fixture_id = $3`,
      [SEASON, JSON.stringify({ home: 2, away: 2 }), OWNED + 1]
    );

    const afterRestart = await (await get("/api/pd/leaderboard")).json() as
      LeaderboardBody;

    expect(afterRestart.throughGw).toBe(2);
    expect(afterRestart.settledFixtures).toBe(1);
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
    // The third roster-shaped read, and the one that seats the roster against
    // every Fixture: a Gameweek's slots are the standing seats, so a retired
    // seat reaching them would be a Gap on every Fixture of the Season.
    const fixtures = await (await get("/api/pd/fixtures")).json() as
      { fixtures: Array<{ slots: Array<{ entrant: { id: string } }> }> };
    const retired = await block();

    const seated = [...V2_SEATS].sort();
    expect(leaderboard.entrants.map(({ id }) => id)).toEqual(seated);
    expect(entrants.entrants.map(({ id }) => id)).toEqual(seated);
    expect(fixtures.fixtures.length).toBeGreaterThan(0);
    for (const fixture of fixtures.fixtures) {
      expect(fixture.slots.map(({ entrant }) => entrant.id)).toEqual(seated);
    }
    expect(retired.entrants.map(({ id }) => id)).toEqual(V1_SEATS);
  });

  test("refuses to publish a figure whose stored sentence is missing",
    async () => {
      // The sentence stripped from storage while the figures stay. It fails
      // closed rather than dropping the qualification and publishing the
      // numbers: ADR-0012's rule is that a value cannot reach a reader without
      // it, so a reader gets the page's failure line and not a Match Points
      // column stripped of what it means.
      //
      // A guard nothing has ever seen bite is the kind that turns out not to,
      // which is why it is walked into here rather than argued in a comment.
      await writer.query(
        `update scores set detail = '{}'
          where model_id = any($1) and metric = $2`,
        [V1_SEATS, MATCH_POINTS_METRIC]
      );

      await expect(get("/api/pd/retired"))
        .rejects.toThrow(/cannot be published without it/);
    });

  test("says so rather than guessing when the scores are not stored",
    async () => {
      await writer.query(
        "delete from scores where model_id = any($1)", [V1_SEATS]
      );

      const body = await block();

      // Every seat still listed, in order, and every figure null — asserted as
      // one shape rather than field by field, so a seat losing its name, the
      // order changing, or a fourth field arriving fails here too. This state
      // means slice 1's scoring run never landed, and the page's honesty is the
      // alarm: a block that dropped the seats, or drew noughts, would report a
      // Gameweek nobody scored as a Gameweek everybody lost.
      expect(body.entrants).toEqual(V1_SEATS.map((id) => ({
        id, name: "Seat", matchPoints: null, betPoints: null, rps: null
      })));
      // And nothing is qualified, because nothing is published. The three
      // sentences exist to let a figure reach a reader; with no figure they
      // would be three claims about an empty table.
      expect(body.matchPointsQualification).toBeNull();
      expect(body.betPointsQualification).toBeNull();
      expect(body.evidenceCaveat).toBeNull();
    });
});

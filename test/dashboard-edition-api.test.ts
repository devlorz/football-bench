import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest, type EntrantsBody, type FixturesBody,
  type LeaderboardBody, type Query
} from "../src/dashboard/read-api.js";
import { outcomeOf } from "../src/fixture-result.js";
import {
  MATCH_PROMPT_VERSION, matchPromptOf
} from "../src/predictions/openrouter-entrant.js";
import {
  MATCH_POINTS_SEASON_TO_DATE_METRIC, editionScopeQualification,
  scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";

const { Client } = pg;

const SEASON = "2026-27";
const NOW = new Date("2026-11-15T12:00:00Z");

/**
 * Ticket 0084 on today's record: one Edition everywhere. The archive is every
 * Match route's status and body over the seeded Season as HEAD served them
 * before this ticket, keyed by path.
 */
describe("the read API on a one-Edition record", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  /** As the Worker reads: `editions` unread under its role selects nothing. */
  const reader = new Client({ connectionString: process.env.DATABASE_URL });
  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;
  const get = (path: string) => handleDashboardRequest(
    new Request(`https://benchmark.example${path}`), query, SEASON, NOW
  );

  let before: Record<string, { status: number; body: string }>;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({ database: writer, season: SEASON, stopAt: "the design's" });
    await reader.query("set role dashboard_read");
    before = JSON.parse(
      await archivedBody("dashboard-match-bodies-before-0084.json.gz")
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("every route answers as before, plus the Edition it is", async () => {
    for (const [path, { status, body }] of Object.entries(before)) {
      const response = await get(path);
      const text = await response.text();
      expect({ path, status: response.status }).toEqual({ path, status });
      if (status !== 200) {
        expect({ path, text }).toEqual({ path, text: body });
        continue;
      }
      const { edition, ...rest } = JSON.parse(text);
      expect({ path, edition })
        .toEqual({ path, edition: { number: 1, firstGameweek: 1, lastGameweek: null } });
      expect({ path, rest: JSON.stringify(rest) }).toEqual({ path, rest: body });
    }
  });

  test("Edition 1's prefix serves the same bytes", async () => {
    for (const [path, { status }] of Object.entries(before)) {
      const prefixed = await get(path.replace("/api/", "/api/edition-1/"));
      const plain = await get(path);
      expect({ path, status: prefixed.status }).toEqual({ path, status });
      expect({ path, text: await prefixed.text() })
        .toEqual({ path, text: await plain.text() });
    }
  });

  test("an unknown Edition is a 404 that names it", async () => {
    // La Liga for `retired`: the Premier League has no such route at all.
    for (const path of ["pl/leaderboard", "pl/fixtures", "pl/entrants",
      "pd/retired"]) {
      const response = await get(`/api/edition-2/${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toMatch(/(PL|PD) Edition 2/);
    }
    // Not an Edition prefix at all, so the ordinary 404.
    expect(await (await get("/api/edition-01/pl/leaderboard")).text())
      .toBe("Not found");
  });
});

/**
 * Ticket 0084 past an Edition boundary. Seven Premier League Gameweeks of one
 * settled Fixture each; Edition 2 opens at Gameweek 6. `a` and `b` play both
 * Editions, `w` is withdrawn at Edition 2's first Lock, `n` is entered during
 * Edition 1 and `m` after its last Lock, and the Exhibition Run `x` replayed
 * every Gameweek after Gameweek 7's Lock. La Liga, whose retired Gameweek is
 * 1, opens Edition 2 at Gameweek 6 too, with nothing else in its record.
 */
describe("the read API past an Edition boundary", () => {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });
  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;
  const get = (path: string) => handleDashboardRequest(
    new Request(`https://benchmark.example${path}`), query, SEASON, NOW
  );
  const body = async <T>(path: string): Promise<T> => {
    const response = await get(path);
    expect({ path, status: response.status }).toEqual({ path, status: 200 });
    return await response.json() as T;
  };

  const lockOf = (gw: number) =>
    new Date(Date.UTC(2026, 7, 21 + 7 * (gw - 1), 17, 30));

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await writer.query(
      `insert into competitions (competition, season)
       values ('PL', $1) on conflict do nothing`,
      [SEASON]
    );
    await writer.query(
      `insert into editions (competition, season, edition, first_gw)
       values ('PL', $1, 2, 6), ('PD', $1, 2, 6)`,
      [SEASON]
    );
    const dayBefore = (at: Date) => new Date(at.getTime() - 86_400_000);
    const seats = [
      ["entrant/a", "entrant", dayBefore(lockOf(1)), null],
      ["entrant/b", "entrant", dayBefore(lockOf(1)), null],
      ["entrant/m", "entrant", new Date(lockOf(5).getTime() + 1), null],
      ["entrant/n", "entrant", dayBefore(lockOf(5)), null],
      ["entrant/w", "entrant", dayBefore(lockOf(1)), lockOf(6)],
      ["exhibition/x", "exhibition", dayBefore(lockOf(1)), null]
    ] as const;
    for (const [id, role, created, withdrawn] of seats) {
      await writer.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role,
           created_at, withdrawn_at
         ) values ($1, $1, 'provider/base-model', 'provider', $2, $3, $4, $5)`,
        [id, MATCH_PROMPT_VERSION, role, created, withdrawn]
      );
    }
    const result = { home_goals: 1, away_goals: 0, outcome: outcomeOf(1, 0) };
    for (let gw = 1; gw <= 7; gw++) {
      await writer.query(
        "insert into gameweeks (season, gw, deadline_at) values ($1, $2, $3)",
        [SEASON, gw, lockOf(gw)]
      );
      await writer.query(
        `insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team,
           kickoff_at, result
         ) values ($1, $2, $2, $2, $3, $4, $5, $6)`,
        [SEASON, gw, `Home ${gw}`, `Away ${gw}`,
          new Date(lockOf(gw).getTime() + 90 * 60_000), JSON.stringify(result)]
      );
      await writer.query(
        `insert into contexts (season, gw, track, fixture_id, hash, body)
         values ($1, $2, 'match', $2, $3, 'context')`,
        [SEASON, gw, `hash-${gw}`]
      );
      const answering = gw <= 5
        ? ["entrant/a", "entrant/b", "entrant/w", "exhibition/x"]
        : ["entrant/a", "entrant/b", "entrant/m", "entrant/n", "exhibition/x"];
      for (const id of answering) {
        // Each seat calls a different scoreline, so every total differs.
        const right = id === "entrant/a" ? gw <= 5 : id !== "entrant/w";
        await writer.query(
          `insert into predictions (
             model_id, season, fixture_id, probs, pred_home, pred_away,
             context_id, attempts_used, predicted_at
           )
           select $1, $2, $3, $4, $5, $6, c.id, 0, $7
             from contexts c
            where c.season = $2 and c.track = 'match' and c.fixture_id = $3`,
          [id, SEASON, gw,
            JSON.stringify(right
              ? { H: 0.7, D: 0.2, A: 0.1 }
              : { H: 0.1, D: 0.2, A: 0.7 }),
            right ? 1 : 0, right ? 0 : 2,
            id === "exhibition/x"
              ? new Date(lockOf(7).getTime() + 86_400_000)
              : new Date(lockOf(gw).getTime() - 3_600_000)]
        );
      }
    }
    await scoreMatchSeason({
      database: writer, competition: "PL", season: SEASON,
      now: () => new Date("2026-10-08T10:00:00Z")
    });
    await reader.query("set role dashboard_read");
    return async () => {
      await writer.query("delete from editions where edition > 1");
      await writer.end();
      await reader.end();
    };
  });

  const storedTotal = async (id: string, gw: number) => Number((await writer
    .query(
      `select value::float8 as value from scores
        where model_id = $1 and gw = $2 and metric = $3`,
      [id, gw, MATCH_POINTS_SEASON_TO_DATE_METRIC]
    )).rows[0]?.value);

  test("the latest Edition ranks its own members over its own Gameweeks",
    async () => {
      const board = await body<LeaderboardBody>("/api/pl/leaderboard");

      expect(board.edition)
        .toEqual({ number: 2, firstGameweek: 6, lastGameweek: null });
      expect(board.entrants.map(({ id, exhibition }) => [id, exhibition]))
        .toEqual([
          ["entrant/a", null], ["entrant/b", null], ["entrant/m", null],
          ["entrant/n", null], ["exhibition/x", { ranAfterGw: 7 }]
        ]);
      expect(board.throughGw).toBe(7);
      expect(board.settledFixtures).toBe(2);
      for (const { id, matchPoints } of board.entrants) {
        expect({ id, matchPoints })
          .toEqual({ id, matchPoints: await storedTotal(id, 7) });
      }
      expect(board.editionQualification).toBe(editionScopeQualification(6));
    });

  test("Edition 1 ranks Gameweeks 1-5 over the seats it had", async () => {
    const board = await body<LeaderboardBody>("/api/edition-1/pl/leaderboard");

    expect(board.edition)
      .toEqual({ number: 1, firstGameweek: 1, lastGameweek: 5 });
    // `w` left at Edition 2's first Lock and stays; `n` and `m` arrived after
    // its first Lock, `m` after its last.
    expect(board.entrants.map(({ id, exhibition }) => [id, exhibition]))
      .toEqual([
        ["entrant/a", null], ["entrant/b", null], ["entrant/w", null],
        ["exhibition/x", { ranAfterGw: 5 }]
      ]);
    expect(board.throughGw).toBe(5);
    expect(board.nextLock).toBeNull();
    expect(board.settledFixtures).toBe(5);
    for (const { id, matchPoints } of board.entrants) {
      expect({ id, matchPoints })
        .toEqual({ id, matchPoints: await storedTotal(id, 5) });
    }
    expect("editionQualification" in board).toBe(false);
  });

  test("an Entrant record reads only its Edition's Gameweeks", async () => {
    for (const [path, gws, members] of [
      ["/api/pl/entrants", [6, 7],
        ["entrant/a", "entrant/b", "entrant/m", "entrant/n"]],
      ["/api/edition-1/pl/entrants", [1, 2, 3, 4, 5],
        ["entrant/a", "entrant/b", "entrant/w"]]
    ] as const) {
      const record = await body<EntrantsBody>(path);
      expect({ path, throughGw: record.throughGw })
        .toEqual({ path, throughGw: gws.at(-1) });
      expect({ path, ids: record.entrants.map(({ id }) => id) })
        .toEqual({ path, ids: [...members, "exhibition/x"] });
      for (const { id, gameweeks } of record.entrants) {
        expect({ path, id, gws: gameweeks.map(({ gw }) => gw) })
          .toEqual({ path, id, gws });
      }
    }
    expect((await body<EntrantsBody>("/api/pl/entrants")).editionQualification)
      .toBe(editionScopeQualification(6));
    expect("editionQualification"
      in await body<EntrantsBody>("/api/edition-1/pl/entrants")).toBe(false);
  });

  test("the Fixtures route offers its Edition's Gameweeks alone", async () => {
    const latest = await body<FixturesBody>("/api/pl/fixtures?gw=3");
    expect([latest.gw, latest.gws]).toEqual([7, [6, 7]]);

    const first = await body<FixturesBody>("/api/edition-1/pl/fixtures?gw=6");
    expect([first.gw, first.gws]).toEqual([5, [1, 2, 3, 4, 5]]);
    const slots = first.fixtures.flatMap(({ slots }) =>
      slots.map(({ entrant, exhibition }) => [entrant.id, exhibition]));
    expect(slots).toEqual([
      ["entrant/a", undefined], ["entrant/b", undefined],
      ["entrant/w", undefined], ["exhibition/x", { ranAfterGw: 5 }]
    ]);
  });

  test("the retired Gameweek answers under Edition 1 alone", async () => {
    expect(matchPromptOf("PD").retired?.gw).toBe(1);
    const retired = await get("/api/edition-1/pd/retired");
    expect(retired.status).toBe(200);
    expect((await retired.json()).edition)
      .toEqual({ number: 1, firstGameweek: 1, lastGameweek: 5 });
    expect((await get("/api/pd/retired")).status).toBe(404);
    expect((await get("/api/edition-2/pd/retired")).status).toBe(404);
  });

  test("an Edition whose first Gameweek is unfetched seats the roster now",
    async () => {
      await writer.query(
        `insert into editions (competition, season, edition, first_gw)
         values ('PL', $1, 3, 8)`,
        [SEASON]
      );
      try {
        const board = await body<LeaderboardBody>("/api/pl/leaderboard");
        expect(board.edition)
          .toEqual({ number: 3, firstGameweek: 8, lastGameweek: null });
        expect(board.throughGw).toBeNull();
        expect(board.entrants.map(({ id }) => id))
          .toEqual(["entrant/a", "entrant/b", "entrant/m", "entrant/n"]);
      } finally {
        await writer.query("delete from editions where edition = 3");
      }
    });

  test("a restarted Competition's Edition 1 seats who stood at its first ranked Lock",
    async () => {
      // Production's La Liga: v2 was entered between Gameweek 1's Lock, which
      // v1 played, and Gameweek 2's, the restart's first.
      await writer.query(
        `insert into competitions (competition, season) values ('PD', $1)`,
        [SEASON]
      );
      await writer.query(
        `insert into gameweeks (competition, season, gw, deadline_at)
         values ('PD', $1, 1, '2026-08-15T17:00:00Z'),
                ('PD', $1, 2, '2026-08-20T17:30:00Z')`,
        [SEASON]
      );
      await writer.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role, created_at
         ) values ('match-pd/seat', 'Seat', 'provider/base-model', 'provider',
                   $1, 'entrant', '2026-08-20T05:06:33Z')`,
        [matchPromptOf("PD").version]
      );

      const board = await body<LeaderboardBody>("/api/edition-1/pd/leaderboard");
      expect(board.entrants.map(({ id }) => id)).toEqual(["match-pd/seat"]);
    });
});

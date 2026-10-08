import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";
import {
  GAP_RATE_METRIC,
  scoreMatchGameweek
} from "../src/predictions/score-match-gameweek.js";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
  matchPromptOf
} from "../src/predictions/openrouter-entrant.js";

const { Client } = pg;

/**
 * Ticket 0096: a match seat is asked at a Gameweek's Lock only when it was
 * entered at or before that Lock. Each site is checked with a seat entered a
 * second before the Lock and one a second after it, beside a seat entered
 * long before. Every seat states its `created_at`: this suite is about the
 * date of entry and does not lean on the test schema's default.
 */
const LOCK = "2026-08-21T17:30:00Z";
const LOCK_TWO = "2026-08-28T17:30:00Z";

describe("a match seat entered after a Lock", () => {
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
      `truncate scores, predictions, contexts, fixtures, attempts, models,
       gameweeks
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, $1), ('2026-27', 2, $2)`,
      [LOCK, LOCK_TWO]
    );
    await client.query(
      `insert into fixtures (
         season, fixture_id, gw, locked_in_gw, home_team, away_team,
         kickoff_at
       ) values
         ('2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
          '2026-08-21T19:00:00Z'),
         ('2026-27', 2, 2, 2, 'Everton', 'Fulham', '2026-08-28T19:00:00Z')`
    );
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role, created_at
       ) values
         ('match/standing', 'Standing', 'vendor/standing', 'vendor', $1,
          'entrant', '2026-07-01T00:00:00Z')`,
      [matchPromptOf("PL").version]
    );
  });

  const enter = async (
    offset: "-1 second" | "1 second",
    slug = "late"
  ): Promise<void> => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role, created_at
       ) values ($1, $2, $3, 'vendor', $4, 'entrant',
                 $5::timestamptz + $6::interval)`,
      [`match/${slug}`, slug, `vendor/${slug}`, matchPromptOf("PL").version,
        LOCK, offset]
    );
  };

  const score = (gameweek: number): Promise<void> => scoreMatchGameweek({
    database: client,
    competition: "PL",
    season: "2026-27",
    gameweek,
    now: () => new Date("2026-08-29T09:00:00Z")
  });
  const rowsOf = async (gameweek: number): Promise<unknown[]> =>
    (await client.query(
      `select * from scores where gw = $1 order by model_id, metric`,
      [gameweek]
    )).rows;
  const expectedAt = async (gameweek: number): Promise<string[]> =>
    (await client.query<{ model_id: string }>(
      `select model_id from scores
        where gw = $1 and metric = $2 order by model_id`,
      [gameweek, GAP_RATE_METRIC]
    )).rows.map(({ model_id }) => model_id);

  test("is expected by the scorer from the first Lock after its entry",
    async () => {
      await score(1);
      const before = await rowsOf(1);
      await enter("1 second");
      await score(1);
      await score(2);

      expect(await expectedAt(1)).toEqual(["match/standing"]);
      expect(await rowsOf(1)).toEqual(before);
      expect(await expectedAt(2)).toEqual(["match/late", "match/standing"]);
    });

  test("is expected at a Lock it was entered before", async () => {
    await enter("-1 second");
    await score(1);

    expect(await expectedAt(1)).toEqual(["match/late", "match/standing"]);
  });

  // The rehearsal clock stands before the Lock while the seat's entry stands
  // after it: what a dry run of a past Gameweek sees.
  test("is not called or reported as a Gap at a Lock before its entry",
    async () => {
      await enter("-1 second", "before");
      await enter("1 second", "after");
      const called = new Set<string>();

      const alert = await predictGameweek({
        competition: "PL",
        database: client,
        season: "2026-27",
        gameweek: 1,
        concurrency: 1,
        apiKey: "test-key",
        entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
        now: () => new Date("2026-08-21T17:29:00Z"),
        http: async (_url, options) => {
          called.add(
            (JSON.parse(options?.body ?? "{}") as { model: string }).model
          );
          return { status: 500, body: "unavailable" };
        }
      });

      expect([...called].sort()).toEqual(["vendor/before", "vendor/standing"]);
      expect(
        [...new Set(alert?.gaps.map(({ entrantId }) => entrantId))]
      ).toEqual(["match/before", "match/standing"]);
    });

  test("is not counted by the pre-flight at a Lock before its entry",
    async () => {
      await enter("-1 second", "before");
      await enter("1 second", "after");

      await expect(preflightBaseModels({
        database: client,
        competition: "PL",
        season: "2026-27",
        fixtureId: 1,
        expectedEntrantCount: 3,
        apiKey: "test-key",
        entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
        http: async () => {
          throw new Error("HTTP must not run");
        }
      })).rejects.toThrow(
        "Pre-flight requires exactly 3 Entrants at Prompt Version "
        + `${matchPromptOf("PL").version}; found 2`
      );
    });
});

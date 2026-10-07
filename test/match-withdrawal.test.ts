import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";
import { enterSeasonRoster } from "../src/season-roster.js";
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
 * Ticket 0083: a match seat stamped `withdrawn_at` is asked for a Gameweek
 * only when the stamp is later than that Gameweek's Lock. Each Lock-bound
 * site is checked with one seat stamped a second before the Lock and one a
 * second after it, beside a seat that was never stamped.
 */
const LOCK = "2026-08-21T17:30:00Z";

describe("a withdrawn match seat", () => {
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
       values ('2026-27', 1, $1)`,
      [LOCK]
    );
    await client.query(
      `insert into fixtures (
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Coventry City', '2026-08-21T19:00:00Z'
       )`
    );
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role, withdrawn_at
       ) values
         ('match/standing', 'Standing', 'vendor/standing', 'vendor', $1,
          'entrant', null),
         ('match/before', 'Before', 'vendor/before', 'vendor', $1,
          'entrant', $2::timestamptz - interval '1 second'),
         ('match/after', 'After', 'vendor/after', 'vendor', $1,
          'entrant', $2::timestamptz + interval '1 second')`,
      [matchPromptOf("PL").version, LOCK]
    );
  });

  test("is called and reported as a Gap only when stamped after the Lock",
    async () => {
      // At the Lock exactly is not later than it: the stamp ADR-0061 writes
      // is the Edition's first Lock, and that Lock must not ask the seat.
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role, withdrawn_at
         ) values ('match/at', 'At', 'vendor/at', 'vendor', $1, 'entrant', $2)`,
        [matchPromptOf("PL").version, LOCK]
      );
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

      expect([...called].sort()).toEqual(["vendor/after", "vendor/standing"]);
      const attempted = await client.query(
        "select distinct model_id from attempts order by model_id"
      );
      expect(attempted.rows).toEqual([
        { model_id: "match/after" },
        { model_id: "match/standing" }
      ]);
      expect(
        [...new Set(alert?.gaps.map(({ entrantId }) => entrantId))]
      ).toEqual(["match/after", "match/standing"]);
    });

  test("is expected by the scorer before the stamp's Lock and not after it",
    async () => {
      const lockTwo = "2026-08-28T17:30:00Z";
      await client.query(
        `insert into gameweeks (season, gw, deadline_at)
         values ('2026-27', 2, $1)`,
        [lockTwo]
      );
      await client.query(
        `update fixtures set locked_in_gw = 1;
         insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team,
           kickoff_at
         ) values (
           '2026-27', 2, 2, 2, 'Everton', 'Fulham', '2026-08-28T19:00:00Z'
         );
         update models set withdrawn_at = null`
      );
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

      await score(1);
      const before = await rowsOf(1);
      await client.query(
        `update models set withdrawn_at = $1::timestamptz + case id
           when 'match/before' then interval '-1 second'
           when 'match/after' then interval '1 second'
         end
         where id in ('match/before', 'match/after')`,
        [lockTwo]
      );
      await score(1);
      await score(2);

      expect(await expectedAt(1))
        .toEqual(["match/after", "match/before", "match/standing"]);
      expect(await rowsOf(1)).toEqual(before);
      expect(await expectedAt(2)).toEqual(["match/after", "match/standing"]);
    });

  test("is counted by the pre-flight only when stamped after the Lock",
    async () => {
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

  // No Lock to compare against here: the stamp is written ahead of the
  // Edition's first Lock and `roster:enter` runs before it arrives. A stamp
  // at all is what says the seat left the roster on purpose.
  test("is no disagreement for roster:enter, where a standing one still is",
    async () => {
      await client.query(
        "truncate models restart identity cascade"
      );
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role, withdrawn_at
         ) values ('match/departed', 'Departed', 'vendor/departed', 'vendor',
                   $1, 'entrant', $2)`,
        [matchPromptOf("PL").version, LOCK]
      );

      await expect(enterSeasonRoster(client, "PL", "2026-27")).resolves
        .toBeDefined();

      await client.query(
        "update models set withdrawn_at = null where id = 'match/departed'"
      );
      await expect(enterSeasonRoster(client, "PL", "2026-27")).rejects
        .toThrow("Seat match/departed is stored at Prompt Version");
    });
});

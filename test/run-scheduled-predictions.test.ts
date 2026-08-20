import pg from "pg";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS
} from "../src/predictions/openrouter-entrant.js";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { fetchFplGameweek } from "../src/fpl/fetch-gameweek.js";
import { runScheduledPredictions } from "../src/predictions/run-scheduled-predictions.js";
import {
  archivedBase64Body,
  archivedBody
} from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";
import {
  firstMessageText,
  type CapturedTurn
} from "./sent-context.js";

const { Client } = pg;

describe("scheduled Prediction runs", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let observedOpenRouterBody = "";

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    observedOpenRouterBody = await archivedBase64Body(
      "openrouter-gpt-5.6-sol-pro-2026-07-29.base64"
    );

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         competitions, prediction_runs, predictions, contexts, fixtures,
         attempts, models, gameweeks, historical_matches, fpl_players,
         raw_snapshots
       restart identity cascade`
    );
    // The scheduler walks the listed Competitions, so a Season with Gameweeks
    // and no `competitions` row has nothing due -- listing one is the
    // operational act the migration left it as, and this is the row a deploy
    // makes by hand (docs/runbooks/pre-cron-checklist.md).
    await client.query(
      "insert into competitions (competition, season) values ('PL', '2026-27')"
    );
    const bootstrapBody = await archivedBody(
      "fpl-bootstrap-2026-27.json.gz"
    );
    const fixturesBody = await archivedBody(
      "fpl-fixtures-2026-27.json.gz"
    );
    const responses = new Map([
      ["https://fantasy.premierleague.com/api/bootstrap-static/", bootstrapBody],
      ["https://fantasy.premierleague.com/api/fixtures/", fixturesBody]
    ]);
    await fetchFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      now: () => new Date("2026-08-21T11:00:00Z"),
      http: async (url) => ({
        status: 200,
        body: responses.get(url) ?? ""
      })
    });
    await client.query(
      `delete from fixtures
        where season = '2026-27' and fixture_id <> 1;
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'match/2026-27-v2', 'entrant'
       )`
    );
  });

  test("runs the main Prediction collection when its Lock is six hours away", async () => {
    const now = new Date("2026-08-21T11:30:00Z");

    const runs = await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 1,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => now,
      http: async () => ({
        status: 200,
        body: observedOpenRouterBody
      })
    });

    expect(runs).toEqual([{
      competition: "PL", gameweek: 1, trigger: "main"
    }]);
    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select trigger from attempts) as trigger,
         (select completed_at is not null from prediction_runs) as completed`
    );
    expect(stored.rows).toEqual([{
      predictions: 1,
      trigger: "main",
      completed: true
    }]);
  });

  test("the scheduled Fill calls only Gaps with the stored main-run context", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'gap/v1', 'Gap Entrant', 'vendor/gap', 'pinned-gap',
         'match/2026-27-v2', 'entrant'
       )`
    );
    let mainContext = "";
    await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 2,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: CapturedTurn[];
        };
        mainContext = firstMessageText(request.messages);
        if (request.model === "vendor/gap") {
          return { status: 503, body: "provider unavailable" };
        }
        return {
          status: 200,
          body: observedOpenRouterBody
        };
      }
    });
    await client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values ('PL', 
         '2026-27', 'Premier League', '2026-08-21T13:00:00Z',
         'Arsenal', 'Coventry', 9, 9
       )`
    );

    const fillRequests: Array<{
      model: string;
      context: string;
    }> = [];
    const fillNow = new Date("2026-08-21T15:30:00Z");
    const runs = await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 2,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => fillNow,
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: CapturedTurn[];
        };
        fillRequests.push({
          model: request.model,
          context: firstMessageText(request.messages)
        });
        return {
          status: 200,
          body: observedOpenRouterBody
        };
      }
    });

    expect(runs).toEqual([{
      competition: "PL", gameweek: 1, trigger: "fill"
    }]);
    expect(fillRequests).toEqual([{
      model: "vendor/gap",
      context: mainContext
    }]);
    expect(fillRequests[0]?.context).not.toContain("9-9");
    const predictions = await client.query(
      `select
         count(*)::int as prediction_count,
         count(distinct context_id)::int as context_count
         from predictions`
    );
    expect(predictions.rows).toEqual([{
      prediction_count: 2,
      context_count: 1
    }]);

    let repeatedCalls = 0;
    expect(await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 2,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => fillNow,
      http: async () => {
        repeatedCalls += 1;
        return { status: 200, body: "{}" };
      }
    })).toEqual([]);
    expect(repeatedCalls).toBe(0);
  });

  test("reports a completed run's Gaps from stored attempts while time remains", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'gap/v1', 'Unavailable Entrant', 'vendor/gap', 'pinned-gap',
         'match/2026-27-v2', 'entrant'
       )`
    );

    const clock = [
      new Date("2026-08-21T11:30:00Z"),
      new Date("2026-08-21T11:30:00Z"),
      new Date("2026-08-21T11:30:00Z"),
      new Date("2026-08-21T11:30:00Z"),
      new Date("2026-08-21T11:30:00Z"),
      new Date("2026-08-21T11:40:00Z"),
      new Date("2026-08-21T11:40:00Z")
    ];
    const runs = await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 2,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => {
        const instant = clock.shift();
        if (instant === undefined) {
          throw new Error("Unexpected clock read");
        }
        return instant;
      },
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          model: string;
        };
        return request.model === "vendor/gap"
          ? { status: 503, body: "provider unavailable" }
          : { status: 200, body: observedOpenRouterBody };
      }
    });

    expect(runs).toEqual([{
      competition: "PL",
      gameweek: 1,
      trigger: "main",
      gapAlert: {
        competition: "PL",
        season: "2026-27",
        gameweek: 1,
        deadlineAt: new Date("2026-08-21T17:30:00Z"),
        observedAt: new Date("2026-08-21T11:40:00Z"),
        remainingMilliseconds: 5 * 60 * 60 * 1000 + 50 * 60 * 1000,
        gaps: [{
          entrantId: "gap/v1",
          entrantName: "Unavailable Entrant",
          fixtureId: 1,
          fixture: "Arsenal v Coventry City",
          cause: "provider"
        }]
      }
    }]);
  });

  test("emits a completed run's Gap alert before a later due run fails", async () => {
    await client.query(
      `create function fail_fill_attempt()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.trigger = 'fill' then
           raise exception 'fill attempt persistence unavailable';
         end if;
         return new;
       end;
       $$;
       create trigger fill_attempt_fails
       before insert on attempts
       for each row execute function fail_fill_attempt()`
    );
    const emitted: Array<{ gameweek: number; trigger: string }> = [];

    await expect(runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 1,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => new Date("2026-08-21T15:30:00Z"),
      http: async () => ({ status: 503, body: "provider unavailable" }),
      onCompletedRun: (run) => {
        emitted.push({ gameweek: run.gameweek, trigger: run.trigger });
      }
    })).rejects.toThrow("fill attempt persistence unavailable");

    expect(emitted).toEqual([{ gameweek: 1, trigger: "main" }]);
  });

  test("retries an uncompleted scheduled run after persistence recovers", async () => {
    await client.query(
      `create function fail_scheduled_attempt()
       returns trigger
       language plpgsql
       as $$
       begin
         raise exception 'attempt persistence unavailable';
       end;
       $$;
       create trigger scheduled_attempt_fails
       before insert on attempts
       for each row execute function fail_scheduled_attempt()`
    );
    let observedAt = new Date("2026-08-21T11:30:00Z");
    const options = {
      database: client,
      season: "2026-27",
      concurrency: 1,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => observedAt,
      http: async () => ({
        status: 200,
        body: observedOpenRouterBody
      })
    };

    await expect(runScheduledPredictions(options)).rejects.toThrow(
      "attempt persistence unavailable"
    );
    const failed = await client.query(
      `select completed_at, attempt_count, last_error
         from prediction_runs`
    );
    expect(failed.rows).toEqual([{
      completed_at: null,
      attempt_count: 1,
      last_error: "attempt persistence unavailable"
    }]);

    await client.query(
      `drop trigger scheduled_attempt_fails on attempts;
       drop function fail_scheduled_attempt()`
    );
    observedAt = new Date("2026-08-21T17:30:00Z");
    const recoveredRuns = await runScheduledPredictions(options);
    expect(recoveredRuns).toEqual([{
      competition: "PL",
      gameweek: 1,
      trigger: "main",
      gapAlert: {
        competition: "PL",
        season: "2026-27",
        gameweek: 1,
        deadlineAt: new Date("2026-08-21T17:30:00Z"),
        observedAt: new Date("2026-08-21T17:30:00Z"),
        remainingMilliseconds: 0,
        gaps: [{
          entrantId: "entrant/v1",
          entrantName: "Tracer Entrant",
          fixtureId: 1,
          fixture: "Arsenal v Coventry City",
          cause: "deadline"
        }]
      }
    }]);
    const recovered = await client.query(
      `select
         r.completed_at is not null as completed,
         r.attempt_count,
         r.last_error,
         (select count(*)::int from predictions) as predictions,
         (select error_kind from attempts) as error_kind
         from prediction_runs r`
    );
    expect(recovered.rows).toEqual([{
      completed: true,
      attempt_count: 2,
      last_error: null,
      predictions: 0,
      error_kind: "deadline"
    }]);
  });
});

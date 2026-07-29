import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { fetchFplGameweek } from "../src/fpl/fetch-gameweek.js";
import { runScheduledPredictions } from "../src/predictions/run-scheduled-predictions.js";
import {
  archivedBase64Body,
  archivedBody
} from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

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
         prediction_runs, predictions, contexts, fixtures, attempts, models,
         gameweeks, historical_matches, fpl_players, raw_snapshots
       restart identity cascade`
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
        where season = '2026-27' and fpl_id <> 1;
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'match/2026-27-v1', 'entrant'
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
      now: () => now,
      http: async () => ({
        status: 200,
        body: observedOpenRouterBody
      })
    });

    expect(runs).toEqual([{ gameweek: 1, trigger: "main" }]);
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
         'match/2026-27-v1', 'entrant'
       )`
    );
    let mainContext = "";
    await runScheduledPredictions({
      database: client,
      season: "2026-27",
      concurrency: 2,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: Array<{ content: string }>;
        };
        mainContext = request.messages[0]?.content ?? "";
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
         season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values (
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
      now: () => fillNow,
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: Array<{ content: string }>;
        };
        fillRequests.push({
          model: request.model,
          context: request.messages[0]?.content ?? ""
        });
        return {
          status: 200,
          body: observedOpenRouterBody
        };
      }
    });

    expect(runs).toEqual([{ gameweek: 1, trigger: "fill" }]);
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
      now: () => fillNow,
      http: async () => {
        repeatedCalls += 1;
        return { status: 200, body: "{}" };
      }
    })).toEqual([]);
    expect(repeatedCalls).toBe(0);
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
    expect(await runScheduledPredictions(options)).toEqual([{
      gameweek: 1,
      trigger: "main"
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

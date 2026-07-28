import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { HttpRequest } from "../src/http.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";

const { Client } = pg;
const migrationUrl = new URL("../migrations/0001_initial.sql", import.meta.url);

describe("predicting a Gameweek", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query("drop schema public cascade; create schema public");
    await client.query(await readFile(fileURLToPath(migrationUrl), "utf8"));

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         predictions, contexts, fixtures, attempts, models, gameweeks
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'match/tracer-v1', 'entrant'
       )`
    );
  });

  test("stores the Match context and its Prediction before the Lock", async () => {
    const requests: HttpRequest[] = [];
    const clock = [
      new Date("2026-08-21T17:28:59.750Z"),
      new Date("2026-08-21T17:29:00Z")
    ];
    const context = [
      "Predict this Premier League Fixture.",
      "",
      "Fixture ID: 1",
      "Home: Arsenal",
      "Away: Coventry City",
      "Kick-off: 2026-08-21T19:00:00.000Z",
      "",
      "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
      "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers."
    ].join("\n");

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => {
        const instant = clock.shift();
        if (instant === undefined) {
          throw new Error("Unexpected clock read");
        }
        return instant;
      },
      http: async (url, options) => {
        requests.push({ url, ...options! });
        return {
          status: 200,
          body: JSON.stringify({
            id: "gen-1",
            model: "openai/gpt-5.2",
            openrouter_metadata: {
              endpoints: {
                available: [
                  {
                    provider: "Other Provider",
                    model: "openai/gpt-5.2",
                    selected: false
                  },
                  {
                    provider: "OpenAI",
                    model: "openai/gpt-5.2",
                    selected: true
                  }
                ]
              }
            },
            choices: [{
              message: {
                role: "assistant",
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6003, D: 0.2398, A: 0.1598 },
                  score: { home: 2, away: 1 },
                  rationale: "Home advantage."
                })
              }
            }],
            usage: { prompt_tokens: 83, completion_tokens: 41 }
          })
        };
      }
    });

    expect(requests).toEqual([{
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
        "X-OpenRouter-Metadata": "enabled"
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [{ role: "user", content: context }],
        stream: false
      })
    }]);

    const stored = await client.query(
      `select
         c.season, c.gw, c.track, c.fpl_id, c.body, c.hash,
         p.model_id, p.probs, p.pred_home, p.pred_away, p.rationale,
         p.attempts_used, p.predicted_at,
         f.locked_in_gw
       from predictions p
       join contexts c on c.id = p.context_id
       join fixtures f
         on f.season = p.season
        and f.fpl_id = p.fpl_id`
    );
    expect(stored.rows).toEqual([{
      season: "2026-27",
      gw: 1,
      track: "match",
      fpl_id: 1,
      body: context,
      hash: "56f537a359fafb5aa966b26be03b33f4897f4ab30f856925d529b7955df2cbdc",
      model_id: "entrant/v1",
      probs: { H: 0.6003600360036003, D: 0.23982398239823982, A: 0.15981598159815982 },
      pred_home: 2,
      pred_away: 1,
      rationale: "Home advantage.",
      attempts_used: 0,
      predicted_at: new Date("2026-08-21T17:29:00Z"),
      locked_in_gw: 1
    }]);

    const attempts = await client.query(
      `select
         model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
         resolved_provider, resolved_model, latency_ms, tokens_in, tokens_out,
         raw_response, trigger, attempted_at
       from attempts`
    );
    expect(attempts.rows).toEqual([{
      model_id: "entrant/v1",
      season: "2026-27",
      gw: 1,
      track: "match",
      fpl_id: 1,
      attempt_no: 0,
      ok: true,
      error_kind: null,
      resolved_provider: "OpenAI",
      resolved_model: "openai/gpt-5.2",
      latency_ms: 250,
      tokens_in: 83,
      tokens_out: 41,
      raw_response: JSON.stringify({
        fixture_id: 1,
        probs: { H: 0.6003, D: 0.2398, A: 0.1598 },
        score: { home: 2, away: 1 },
        rationale: "Home advantage."
      }),
      trigger: "main",
      attempted_at: new Date("2026-08-21T17:29:00Z")
    }]);
  });

  test("stores a valid Prediction when telemetry is absent", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 200,
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                fixture_id: 1,
                probs: { H: 0.6, D: 0.24, A: 0.16 },
                score: { home: 2, away: 1 },
                rationale: "Valid without telemetry."
              })
            }
          }]
        })
      })
    });

    const prediction = await client.query(
      "select fpl_id, rationale from predictions"
    );
    expect(prediction.rows).toEqual([{
      fpl_id: 1,
      rationale: "Valid without telemetry."
    }]);

    const attempt = await client.query(
      `select ok, resolved_provider, resolved_model, tokens_in, tokens_out
         from attempts`
    );
    expect(attempt.rows).toEqual([{
      ok: true,
      resolved_provider: null,
      resolved_model: null,
      tokens_in: null,
      tokens_out: null
    }]);
  });

  test("refuses a Prediction at the exact deadline and logs the attempt", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:30:00Z"),
      http: async () => ({
        status: 200,
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({
                fixture_id: 1,
                probs: { H: 0.6, D: 0.24, A: 0.16 },
                score: { home: 2, away: 1 },
                rationale: "Too late."
              })
            }
          }],
          usage: { prompt_tokens: 83, completion_tokens: 38 }
        })
      })
    });

    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select locked_in_gw from fixtures where fpl_id = 1) as locked_in_gw`
    );
    expect(stored.rows).toEqual([{ predictions: 0, locked_in_gw: 1 }]);

    const attempts = await client.query(
      `select ok, error_kind, error_detail, latency_ms, tokens_in, tokens_out,
              attempted_at
         from attempts`
    );
    expect(attempts.rows).toEqual([{
      ok: false,
      error_kind: "deadline",
      error_detail: "The Lock passed at 2026-08-21T17:30:00.000Z.",
      latency_ms: 0,
      tokens_in: 83,
      tokens_out: 38,
      attempted_at: new Date("2026-08-21T17:30:00Z")
    }]);
  });

  test("logs a rejected Entrant response without storing a Prediction", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 200,
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({
                fixture_id: 1,
                probs: { H: 0.6, D: 0.24, A: 0.15 },
                score: { home: 2, away: 1 },
                rationale: "Does not sum to one."
              })
            }
          }],
          usage: { prompt_tokens: 83, completion_tokens: 39 }
        })
      })
    });

    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select locked_in_gw from fixtures where fpl_id = 1) as locked_in_gw`
    );
    expect(stored.rows).toEqual([{ predictions: 0, locked_in_gw: 1 }]);

    const attempts = await client.query(
      `select ok, error_kind, error_detail, tokens_in, tokens_out
         from attempts`
    );
    expect(attempts.rows).toEqual([{
      ok: false,
      error_kind: "probs_sum",
      error_detail: "Probabilities H, D and A must sum to 1 within ±0.001.",
      tokens_in: 83,
      tokens_out: 39
    }]);
  });

  test("does not duplicate or replace a Prediction when the job is run twice", async () => {
    let calls = 0;
    const options = {
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => {
        calls += 1;
        return {
          status: 200,
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            choices: [{
              message: {
                role: "assistant",
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Original commitment."
                })
              }
            }],
            usage: { prompt_tokens: 83, completion_tokens: 37 }
          })
        };
      }
    };

    await predictGameweek(options);
    await predictGameweek(options);

    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select count(*)::int from contexts) as contexts,
         (select count(*)::int from attempts) as attempts,
         (select rationale from predictions) as rationale`
    );
    expect({ calls, ...stored.rows[0] }).toEqual({
      calls: 1,
      predictions: 1,
      contexts: 1,
      attempts: 1,
      rationale: "Original commitment."
    });
  });

  test("logs an unsuccessful OpenRouter call and continues without a Prediction", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 503,
        body: "{\"error\":\"provider unavailable\"}"
      })
    });

    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select locked_in_gw from fixtures where fpl_id = 1) as locked_in_gw`
    );
    expect(stored.rows).toEqual([{ predictions: 0, locked_in_gw: 1 }]);

    const attempts = await client.query(
      `select ok, error_kind, error_detail, latency_ms, tokens_in, tokens_out,
              raw_response
         from attempts`
    );
    expect(attempts.rows).toEqual([{
      ok: false,
      error_kind: "provider",
      error_detail: "OpenRouter returned HTTP 503.",
      latency_ms: 0,
      tokens_in: null,
      tokens_out: null,
      raw_response: "{\"error\":\"provider unavailable\"}"
    }]);
  });

  test("logs an unexpected OpenRouter envelope instead of aborting", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 200,
        body: "{\"unexpected\":true}"
      })
    });

    const attempts = await client.query(
      `select ok, error_kind, error_detail, raw_response
         from attempts`
    );
    expect(attempts.rows).toEqual([{
      ok: false,
      error_kind: "provider",
      error_detail: "OpenRouter returned an unexpected response shape.",
      raw_response: "{\"unexpected\":true}"
    }]);
  });

  test("logs a thrown HTTP failure and continues to every remaining Fixture", async () => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 2, 1, 'Leeds United', 'Everton',
         '2026-08-22T14:00:00Z'
       )`
    );
    let calls = 0;

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("connection reset");
        }
        return {
          status: 200,
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            choices: [{
              message: {
                role: "assistant",
                content: JSON.stringify({
                  fixture_id: 2,
                  probs: { H: 0.4, D: 0.3, A: 0.3 },
                  score: { home: 1, away: 1 },
                  rationale: "Evenly matched."
                })
              }
            }],
            usage: { prompt_tokens: 81, completion_tokens: 35 }
          })
        };
      }
    });

    const predictions = await client.query(
      "select fpl_id from predictions order by fpl_id"
    );
    expect({ calls, rows: predictions.rows }).toEqual({
      calls: 2,
      rows: [{ fpl_id: 2 }]
    });

    const attempts = await client.query(
      `select fpl_id, ok, error_kind, error_detail
         from attempts
        order by fpl_id`
    );
    expect(attempts.rows).toEqual([
      {
        fpl_id: 1,
        ok: false,
        error_kind: "provider",
        error_detail: "OpenRouter call failed: connection reset."
      },
      {
        fpl_id: 2,
        ok: true,
        error_kind: null,
        error_detail: null
      }
    ]);

    const locks = await client.query(
      "select fpl_id, locked_in_gw from fixtures order by fpl_id"
    );
    expect(locks.rows).toEqual([
      { fpl_id: 1, locked_in_gw: 1 },
      { fpl_id: 2, locked_in_gw: 1 }
    ]);
  });

  test("keeps concurrent re-runs idempotent while logging both calls", async () => {
    const firstRun = new Client({ connectionString: process.env.DATABASE_URL });
    const secondRun = new Client({ connectionString: process.env.DATABASE_URL });
    await Promise.all([firstRun.connect(), secondRun.connect()]);
    let calls = 0;
    let releaseCalls: () => void = () => undefined;
    const bothCallsStarted = new Promise<void>((resolve) => {
      releaseCalls = resolve;
    });
    const http = async () => {
      calls += 1;
      if (calls === 2) {
        releaseCalls();
      }
      await bothCallsStarted;
      return {
        status: 200,
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          choices: [{
            message: {
              role: "assistant",
              content: JSON.stringify({
                fixture_id: 1,
                probs: { H: 0.6, D: 0.24, A: 0.16 },
                score: { home: 2, away: 1 },
                rationale: "One immutable commitment."
              })
            }
          }],
          usage: { prompt_tokens: 83, completion_tokens: 37 }
        })
      };
    };
    const common = {
      season: "2026-27",
      gameweek: 1,
      entrantId: "entrant/v1",
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http
    };

    try {
      await Promise.all([
        predictGameweek({ ...common, database: firstRun }),
        predictGameweek({ ...common, database: secondRun })
      ]);
    } finally {
      await Promise.all([firstRun.end(), secondRun.end()]);
    }

    const stored = await client.query(
      `select
         (select count(*)::int from predictions) as predictions,
         (select count(*)::int from contexts) as contexts,
         (select count(*)::int from attempts) as attempts`
    );
    expect({ calls, ...stored.rows[0] }).toEqual({
      calls: 2,
      predictions: 1,
      contexts: 1,
      attempts: 2
    });
  });

  test("aborts before making more calls when the attempt ledger cannot persist", async () => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 2, 1, 'Leeds United', 'Everton',
         '2026-08-22T14:00:00Z'
       );
       create function fail_first_attempt()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.fpl_id = 1 then
           raise exception 'simulated attempt persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger attempts_fail_for_fixture_one
       before insert on attempts
       for each row execute function fail_first_attempt()`
    );
    let calls = 0;

    try {
      await expect(predictGameweek({
        database: client,
        season: "2026-27",
        gameweek: 1,
        entrantId: "entrant/v1",
        apiKey: "test-key",
        now: () => new Date("2026-08-21T17:29:00Z"),
        http: async () => {
          calls += 1;
          return {
            status: 200,
            body: JSON.stringify({
              choices: [{
                message: {
                  content: JSON.stringify({
                    fixture_id: calls,
                    probs: { H: 0.6, D: 0.24, A: 0.16 },
                    score: { home: 2, away: 1 },
                    rationale: "This call must be recorded."
                  })
                }
              }]
            })
          };
        }
      })).rejects.toThrow("simulated attempt persistence failure");
    } finally {
      await client.query(
        `drop trigger attempts_fail_for_fixture_one on attempts;
         drop function fail_first_attempt()`
      );
    }

    const stored = await client.query(
      `select
         (select count(*)::int from attempts) as attempts,
         (select count(*)::int from predictions) as predictions,
         (select count(*)::int from fixtures where locked_in_gw is not null)
           as locked_fixtures`
    );
    expect({ calls, ...stored.rows[0] }).toEqual({
      calls: 1,
      attempts: 0,
      predictions: 0,
      locked_fixtures: 0
    });
  });
});

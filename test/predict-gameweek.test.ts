import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import type { HttpRequest } from "../src/http.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";

const { Client } = pg;

function requestedFixtureId(body: {
  messages: Array<{ content: string }>;
}): number {
  const fixtureId = body.messages[0]?.content.match(
    /Fixture ID: (\d+)/
  )?.[1];
  if (fixtureId === undefined) {
    throw new Error("Request did not contain a Fixture ID");
  }
  return Number(fixtureId);
}

describe("predicting a Gameweek", () => {
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
      `truncate
         predictions, contexts, fixtures, attempts, models, gameweeks,
         historical_matches, fpl_players
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
         'match/2026-27-v1', 'entrant'
       )`
    );
  });

  test("builds the stored context from historical rows available at the Gameweek deadline", async () => {
    await client.query(
      `insert into historical_matches (
         season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values
         (
           '2025-26', 'Premier League', '2026-05-01T00:00:00Z',
           'Arsenal', 'Everton',
           3, 1
         ),
         (
           '2025-26', 'Championship', '2026-05-02T00:00:00Z',
           'Coventry', 'Hull',
           2, 0
         ),
         (
           '2026-27', 'Premier League', '2026-08-22T00:00:00Z',
           'Coventry', 'Arsenal',
           9, 9
         )`
    );
    await client.query(
      `insert into fpl_players (
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added, observed_at
       ) values
         (
           '2026-27', 1, 12, 'Arsenal', 'Saka', 'MID', 95,
           'a', null, '', null, '2026-08-21T17:00:00Z'
         ),
         (
           '2026-27', 1, 5, 'Arsenal', 'J.Timber', 'DEF', 65,
           'i', 0, 'Groin injury - Expected back 21 Aug',
           '2026-07-23T12:01:23.272Z', '2026-08-21T17:00:00Z'
         )`
    );
    let prompt = "";

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          messages: Array<{ content: string }>;
        };
        prompt = request.messages[0]?.content ?? "";
        return {
          status: 200,
          body: JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Uses historical context."
                })
              }
            }]
          })
        };
      }
    });

    expect(prompt).toContain(
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Everton | W"
    );
    expect(prompt).toContain(
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes."
    );
    expect(prompt).not.toContain("9-9");
    expect(prompt).toContain("- Saka | MID | £9.5m | status: available");
    expect(prompt).toContain(
      "- J.Timber | DEF | £6.5m | status: injured | chance of playing next round: 0%"
    );

    const stored = await client.query("select body from contexts");
    expect(stored.rows).toEqual([{ body: prompt }]);
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
      "Historical context as of 2026-08-21T17:30:00.000Z",
      "",
      "Arsenal",
      "Current-Season league position: no current-Season table yet.",
      "Prior-Season final position: no 2025-26 league data.",
      "Premier League history: none in stored data.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played: no stored matches.",
      "",
      "Coventry City",
      "Current-Season league position: no current-Season table yet.",
      "Prior-Season final position: no 2025-26 league data.",
      "Premier League history: none in stored data.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played: no stored matches.",
      "",
      "Head-to-head history:",
      "No prior meeting in stored data.",
      "",
      "FPL-derived player context",
      "",
      "Arsenal",
      "FPL player data status: no player snapshot loaded for this Gameweek.",
      "Five highest-priced players: unavailable because no snapshot was loaded.",
      "Players not fully available: unavailable because no snapshot was loaded.",
      "",
      "Coventry City",
      "FPL player data status: no player snapshot loaded for this Gameweek.",
      "Five highest-priced players: unavailable because no snapshot was loaded.",
      "Players not fully available: unavailable because no snapshot was loaded.",
      "",
      "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
      "The first character must be { and the last character must be }.",
      "Do not use Markdown or wrap the JSON in code fences.",
      "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers."
    ].join("\n");

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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
        provider: {
          order: ["openai"],
          allow_fallbacks: false
        },
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
      hash: "383d397f81c3c86061aa7bb929efa28d5f9b8eb7ff81fe938270dc71f520afa0",
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
      }),
      trigger: "main",
      attempted_at: new Date("2026-08-21T17:29:00Z")
    }]);
  });

  test("refuses an invalid concurrency before issuing a call", async () => {
    let calls = 0;

    await expect(predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 0,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => {
        calls += 1;
        return { status: 200, body: "{}" };
      }
    })).rejects.toThrow(
      "Prediction concurrency must be a positive integer"
    );

    expect(calls).toBe(0);
  });

  test("runs every Entrant concurrently while isolating a failed Entrant", async () => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 2, 1, 'Leeds United', 'Everton',
         '2026-08-22T14:00:00Z'
       );
       insert into models (
         id, name, base_model, provider, quantization, prompt_version, role
       ) values
         (
           'open-weight/v1', 'Open Weight Entrant', 'vendor/open-weight-v1',
           'pinned-open-weight', 'fp8', 'match/2026-27-v1', 'entrant'
         ),
         (
           'unavailable/v1', 'Unavailable Entrant', 'vendor/unavailable-v1',
           'pinned-unavailable', null, 'match/2026-27-v1', 'entrant'
         );
       insert into models (
         id, name, base_model, provider, prompt_version, role
       )
       select
         'entrant/' || n, 'Entrant ' || n, 'vendor/base-model-' || n,
         'provider-' || n, 'match/2026-27-v1', 'entrant'
       from generate_series(2, 7) as n`
    );
    const requestBodies: unknown[] = [];
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    let releaseFirstBatch: () => void = () => undefined;
    const firstBatchStarted = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });
    let batchReleased = false;

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 4,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async (_url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: Array<{ content: string }>;
        };
        requestBodies.push(body);
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        if (activeCalls === 4 && !batchReleased) {
          batchReleased = true;
          releaseFirstBatch();
        }
        await firstBatchStarted;
        activeCalls -= 1;

        if (body.model === "vendor/unavailable-v1") {
          return {
            status: 503,
            body: "{\"error\":\"provider unavailable\"}"
          };
        }
        const fixtureId = requestedFixtureId(body);
        return {
          status: 200,
          body: JSON.stringify({
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: `resolved:${body.model}`,
                  model: body.model,
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: fixtureId,
                  probs: { H: 0.5, D: 0.3, A: 0.2 },
                  score: { home: 1, away: 0 },
                  rationale: `Prediction from ${body.model}.`
                })
              }
            }]
          })
        };
      }
    });

    expect(maximumActiveCalls).toBe(4);
    expect(requestBodies).toHaveLength(18);
    expect(requestBodies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        model: "openai/gpt-5.2",
        provider: {
          order: ["openai"],
          allow_fallbacks: false
        }
      }),
      expect.objectContaining({
        model: "vendor/open-weight-v1",
        provider: {
          order: ["pinned-open-weight"],
          allow_fallbacks: false,
          quantizations: ["fp8"]
        }
      })
    ]));

    const predictions = await client.query(
      `select
         p.fpl_id, count(*)::int as prediction_count,
         count(distinct p.context_id)::int as context_count
         from predictions p
        group by p.fpl_id
        order by p.fpl_id`
    );
    expect(predictions.rows).toEqual([
      { fpl_id: 1, prediction_count: 8, context_count: 1 },
      { fpl_id: 2, prediction_count: 8, context_count: 1 }
    ]);

    const attempts = await client.query(
      `select
         count(*)::int as attempt_count,
         count(*) filter (where ok)::int as successful_count,
         count(*) filter (
           where model_id = 'unavailable/v1'
             and not ok
             and error_kind = 'provider'
         )::int as isolated_failure_count,
         count(*) filter (
           where ok
             and resolved_provider is not null
             and resolved_model is not null
         )::int as routed_count
       from attempts
       `
    );
    expect(attempts.rows).toEqual([{
      attempt_count: 18,
      successful_count: 16,
      isolated_failure_count: 2,
      routed_count: 16
    }]);
  });

  test("stores a valid Prediction when telemetry is absent", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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

  test("records a structured refusal with its routing telemetry", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 200,
        body: JSON.stringify({
          openrouter_metadata: {
            endpoints: {
              available: [{
                provider: "OpenAI",
                model: "openai/gpt-5.2",
                selected: true
              }]
            }
          },
          choices: [{
            message: {
              content: null,
              refusal: "I cannot provide betting predictions."
            }
          }],
          usage: { prompt_tokens: 83, completion_tokens: 0 }
        })
      })
    });

    const attempt = await client.query(
      `select
         ok, error_kind, error_detail, resolved_provider, resolved_model,
         tokens_in, tokens_out
       from attempts`
    );
    expect(attempt.rows).toEqual([{
      ok: false,
      error_kind: "refusal",
      error_detail: "I cannot provide betting predictions.",
      resolved_provider: "OpenAI",
      resolved_model: "openai/gpt-5.2",
      tokens_in: 83,
      tokens_out: 0
    }]);
  });

  test("refuses a Prediction at the exact deadline and logs the attempt", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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

  test("stops Repairs when an invalid response arrives at the Lock", async () => {
    let calls = 0;
    const clock = [
      new Date("2026-08-21T17:29:59.000Z"),
      new Date("2026-08-21T17:30:00.000Z")
    ];

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => {
        const instant = clock.shift();
        if (instant === undefined) {
          throw new Error("Repair continued after the Lock");
        }
        return instant;
      },
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
                  probs: { H: 0.6, D: 0.24, A: 0.15 },
                  score: { home: 2, away: 1 },
                  rationale: "Invalid and too late."
                })
              }
            }],
            usage: { prompt_tokens: 83, completion_tokens: 38 }
          })
        };
      }
    });

    expect(calls).toBe(1);
    const attempt = await client.query(
      `select ok, error_kind, error_detail, attempt_no
         from attempts`
    );
    expect(attempt.rows).toEqual([{
      ok: false,
      error_kind: "deadline",
      error_detail: "The Lock passed at 2026-08-21T17:30:00.000Z.",
      attempt_no: 0
    }]);
  });

  test("leaves a Gap after the third failed Repair and logs every attempt", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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
      `select attempt_no, ok, error_kind, error_detail, tokens_in, tokens_out,
              trigger
         from attempts
        order by attempt_no`
    );
    expect(attempts.rows).toEqual(
      [0, 1, 2, 3].map((attemptNo) => ({
        attempt_no: attemptNo,
        ok: false,
        error_kind: "probs_sum",
        error_detail: "Probabilities H, D and A must sum to 1 within ±0.001.",
        tokens_in: 83,
        tokens_out: 39,
        trigger: "main"
      }))
    );
  });

  test("repairs a validation failure with the fixed validator message", async () => {
    const requests: Array<{
      messages: Array<{ role: string; content: string }>;
    }> = [];
    const responses = [
      {
        content: JSON.stringify({
          fixture_id: 1,
          probs: { H: 0.6, D: 0.24, A: 0.15 },
          score: { home: 2, away: 1 },
          rationale: "Does not sum to one."
        }),
        promptTokens: 83,
        completionTokens: 39
      },
      {
        content: JSON.stringify({
          fixture_id: 1,
          probs: { H: 0.6, D: 0.24, A: 0.16 },
          score: { home: 2, away: 1 },
          rationale: "Corrected distribution."
        }),
        promptTokens: 139,
        completionTokens: 40
      }
    ];
    const clock = [
      new Date("2026-08-21T17:28:59.000Z"),
      new Date("2026-08-21T17:28:59.250Z"),
      new Date("2026-08-21T17:28:59.250Z"),
      new Date("2026-08-21T17:28:59.600Z")
    ];

    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => {
        const instant = clock.shift();
        if (instant === undefined) {
          throw new Error("Unexpected clock read");
        }
        return instant;
      },
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as {
          messages: Array<{ role: string; content: string }>;
        };
        requests.push(request);
        const response = responses.shift();
        if (response === undefined) {
          throw new Error("Unexpected OpenRouter call");
        }
        return {
          status: 200,
          body: JSON.stringify({
            model: "openai/gpt-5.2",
            choices: [{
              message: {
                role: "assistant",
                content: response.content
              }
            }],
            usage: {
              prompt_tokens: response.promptTokens,
              completion_tokens: response.completionTokens
            }
          })
        };
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages).toEqual([
      requests[0]?.messages[0],
      {
        role: "assistant",
        content: JSON.stringify({
          fixture_id: 1,
          probs: { H: 0.6, D: 0.24, A: 0.15 },
          score: { home: 2, away: 1 },
          rationale: "Does not sum to one."
        })
      },
      {
        role: "user",
        content: [
          "Your previous response was invalid:",
          "Probabilities H, D and A must sum to 1 within ±0.001.",
          "Return only corrected JSON for Fixture 1."
        ].join("\n")
      }
    ]);

    const prediction = await client.query(
      `select attempts_used, rationale, predicted_at
         from predictions`
    );
    expect(prediction.rows).toEqual([{
      attempts_used: 1,
      rationale: "Corrected distribution.",
      predicted_at: new Date("2026-08-21T17:28:59.600Z")
    }]);

    const attempts = await client.query(
      `select attempt_no, ok, error_kind, error_detail, latency_ms,
              tokens_in, tokens_out, trigger, attempted_at
         from attempts
        order by attempt_no`
    );
    expect(attempts.rows).toEqual([
      {
        attempt_no: 0,
        ok: false,
        error_kind: "probs_sum",
        error_detail: "Probabilities H, D and A must sum to 1 within ±0.001.",
        latency_ms: 250,
        tokens_in: 83,
        tokens_out: 39,
        trigger: "main",
        attempted_at: new Date("2026-08-21T17:28:59.250Z")
      },
      {
        attempt_no: 1,
        ok: true,
        error_kind: null,
        error_detail: null,
        latency_ms: 350,
        tokens_in: 139,
        tokens_out: 40,
        trigger: "main",
        attempted_at: new Date("2026-08-21T17:28:59.600Z")
      }
    ]);
  });

  test("does not duplicate or replace a Prediction when the job is run twice", async () => {
    let calls = 0;
    const options = {
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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
      concurrency: 1,
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

  test("records an OpenRouter 429 as a rate limit", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => ({
        status: 429,
        body: "{\"error\":{\"message\":\"Rate limit exceeded\"}}"
      })
    });

    const attempt = await client.query(
      "select ok, error_kind, error_detail from attempts"
    );
    expect(attempt.rows).toEqual([{
      ok: false,
      error_kind: "rate_limit",
      error_detail: "OpenRouter returned HTTP 429."
    }]);
  });

  test("records a signalled HTTP timeout separately", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T17:29:00Z"),
      http: async () => {
        const error = new Error("request timed out");
        error.name = "TimeoutError";
        throw error;
      }
    });

    const attempt = await client.query(
      "select ok, error_kind, error_detail from attempts"
    );
    expect(attempt.rows).toEqual([{
      ok: false,
      error_kind: "timeout",
      error_detail: "OpenRouter call failed: request timed out."
    }]);
  });

  test("logs an unexpected OpenRouter envelope instead of aborting", async () => {
    await predictGameweek({
      database: client,
      season: "2026-27",
      gameweek: 1,
      concurrency: 1,
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
      concurrency: 1,
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
      concurrency: 1,
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
        concurrency: 1,
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

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import type { HttpRequest } from "../src/http.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";

const { Client } = pg;
const openRouterResponseUrl = new URL(
  "./fixtures/openrouter-gpt-5.6-sol-pro-2026-07-29.base64",
  import.meta.url
);

describe("pre-flight for the Base Model roster", () => {
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
         raw_snapshots, historical_matches, fpl_players
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
       insert into historical_matches (
         season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values
         (
           '2025-26', 'Premier League', '2026-05-01T00:00:00Z',
           'Arsenal', 'Everton', 3, 1
         ),
         (
           '2025-26', 'Championship', '2026-05-02T00:00:00Z',
           'Coventry', 'Hull', 2, 0
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
         ),
         (
           '2026-27', 1, 200, 'Coventry City', 'Coventry Player', 'FWD', 60,
           'a', null, '', null, '2026-08-21T17:00:00Z'
         )`
    );
    for (let index = 1; index <= 9; index += 1) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role
         ) values ($1, $2, $3, $4, $5, 'match/2026-27-v2', 'entrant')`,
        [
          `entrant/${index}`,
          `Entrant ${index}`,
          `vendor/base-model-${index}`,
          `provider-${index}`,
          index === 1 ? "fp8" : null
        ]
      );
    }
  });

  test("calls all nine Base Models with one real Fixture prompt", async () => {
    const requests: HttpRequest[] = [];
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
      "Premier League table: no result has been played yet this Season.",
      "",
      "Arsenal",
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.",
      "Prior-Season points per game: 3.00 overall, 3.00 home, unavailable away.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played:",
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Everton | W"
        + " | xG unavailable",
      "",
      "Coventry City",
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Prior-Season points per game: 3.00 overall, 3.00 home, unavailable away.",
      "Premier League history: none in stored data; promoted from the Championship.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played:",
      "- 2025-26 Championship | 2026-05-02 | Coventry 2-0 Hull | W"
        + " | xG unavailable",
      "",
      "Head-to-head history:",
      "No prior meeting in stored data.",
      "",
      "FPL-derived player context",
      "",
      "Arsenal",
      "Five highest-priced players:",
      "- Saka | MID | £9.5m | status: available",
      "- J.Timber | DEF | £6.5m | status: injured",
      "Players not fully available:",
      "- J.Timber | DEF | £6.5m | status: injured | chance of playing next round: 0% | news: Groin injury - Expected back 21 Aug | news added: 2026-07-23T12:01:23.272Z",
      "",
      "Coventry City",
      "Five highest-priced players:",
      "- Coventry Player | FWD | £6.0m | status: available",
      "Players not fully available: none; all listed players are available.",
      "",
      "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
      "The first character must be { and the last character must be }.",
      "Do not use Markdown or wrap the JSON in code fences.",
      "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers."
    ].join("\n");

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async (url, options) => {
        requests.push({ url, ...options! });
        const request = JSON.parse(options?.body ?? "{}") as { model?: string };
        return {
          status: 200,
          body: JSON.stringify({
            model: request.model,
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: `Resolved ${request.model}`,
                  model: request.model,
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Pre-flight answer."
                })
              }
            }]
          })
        };
      }
    });

    expect(requests).toHaveLength(9);
    expect(requests[0]).toEqual({
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
        "X-OpenRouter-Metadata": "enabled"
      },
      body: JSON.stringify({
        model: "vendor/base-model-1",
        // One content block carrying the cache breakpoint every request ends
        // its first message with (spec 0010).
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: context,
            cache_control: { type: "ephemeral" }
          }]
        }],
        provider: {
          order: ["provider-1"],
          allow_fallbacks: false,
          quantizations: ["fp8"]
        },
        stream: false
      })
    });
    expect(report).toEqual({
      ok: true,
      fixture: {
        season: "2026-27",
        fplId: 1,
        gameweek: 1,
        homeTeam: "Arsenal",
        awayTeam: "Coventry City",
        kickoffAt: "2026-08-21T19:00:00.000Z"
      },
      results: Array.from({ length: 9 }, (_, offset) => {
        const index = offset + 1;
        return {
          entrantId: `entrant/${index}`,
          baseModel: `vendor/base-model-${index}`,
          status: "parseable",
          detail: null,
          resolvedProvider: `Resolved vendor/base-model-${index}`,
          resolvedModel: `vendor/base-model-${index}`,
          rawBody: null
        };
      })
    });
  });

  test("reports a refusal with its raw OpenRouter body and checks the remaining roster", async () => {
    let calls = 0;
    const refusalBody = JSON.stringify({
      model: "vendor/base-model-1",
      openrouter_metadata: {
        endpoints: {
          available: [{
            provider: "Policy Provider",
            model: "vendor/base-model-1",
            selected: true
          }]
        }
      },
      choices: [{
        message: {
          content: null,
          refusal: "I cannot provide betting predictions."
        }
      }]
    });

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 200, body: refusalBody };
        }
        return {
          status: 200,
          body: JSON.stringify({
            model: `vendor/base-model-${calls}`,
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: `Provider ${calls}`,
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Answer."
                })
              }
            }]
          })
        };
      }
    });

    expect({ calls, ok: report.ok, first: report.results[0] }).toEqual({
      calls: 9,
      ok: false,
      first: {
        entrantId: "entrant/1",
        baseModel: "vendor/base-model-1",
        status: "refusal",
        detail: "I cannot provide betting predictions.",
        resolvedProvider: "Policy Provider",
        resolvedModel: "vendor/base-model-1",
        rawBody: refusalBody
      }
    });
  });

  test("archives successful OpenRouter responses byte-for-byte", async () => {
    const bodies: string[] = [];

    await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as { model: string };
        const body = `{"model":${JSON.stringify(request.model)},"choices":[{"message":{"content":"{\\"fixture_id\\":1,\\"probs\\":{\\"H\\":0.6,\\"D\\":0.24,\\"A\\":0.16},\\"score\\":{\\"home\\":2,\\"away\\":1},\\"rationale\\":\\"Observed spacing is load-bearing.\\"}"}}],"openrouter_metadata":{"endpoints":{"available":[{"provider":"Observed Provider","selected":true}]}}}`;
        bodies.push(body);
        return { status: 200, body };
      }
    });

    const archived = await client.query(
      `select source, body
         from raw_snapshots
        order by source`
    );
    expect(archived.rows).toEqual(
      bodies.map((body, offset) => ({
        source: `openrouter-preflight:vendor/base-model-${offset + 1}`,
        body
      }))
    );
  });

  test("fails when OpenRouter omits the selected resolved model", async () => {
    const body = JSON.stringify({
      model: "vendor/request-alias",
      openrouter_metadata: {
        endpoints: {
          available: [{
            provider: "Resolved Provider",
            selected: true
          }]
        }
      },
      choices: [{
        message: {
          content: JSON.stringify({
            fixture_id: 1,
            probs: { H: 0.6, D: 0.24, A: 0.16 },
            score: { home: 2, away: 1 },
            rationale: "Valid Prediction, unresolved model."
          })
        }
      }]
    });

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async () => ({ status: 200, body })
    });

    expect(report.ok).toBe(false);
    expect(report.results[0]).toEqual({
      entrantId: "entrant/1",
      baseModel: "vendor/base-model-1",
      status: "parseable",
      detail: "OpenRouter did not identify a selected model.",
      resolvedProvider: "Resolved Provider",
      resolvedModel: null,
      rawBody: body
    });
  });

  test("fails on missing provider metadata, unparseable output, and transport errors", async () => {
    let calls = 0;
    const missingProviderBody = JSON.stringify({
      model: "vendor/base-model-1",
      provider: "Wrong Top-Level Provider",
      choices: [{
        message: {
          content: JSON.stringify({
            fixture_id: 1,
            probs: { H: 0.6, D: 0.24, A: 0.16 },
            score: { home: 2, away: 1 },
            rationale: "Valid Prediction, absent metadata."
          })
        }
      }]
    });
    const unparseableBody = JSON.stringify({
      model: "vendor/base-model-2",
      openrouter_metadata: {
        endpoints: {
          available: [{ provider: "Provider 2", selected: true }]
        }
      },
      choices: [{ message: { content: "not json" } }]
    });
    const httpErrorBody = "{\"error\":\"provider unavailable\"}";

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 200, body: missingProviderBody };
        }
        if (calls === 2) {
          return { status: 200, body: unparseableBody };
        }
        if (calls === 3) {
          return { status: 503, body: httpErrorBody };
        }
        if (calls === 4) {
          throw new Error("connection reset");
        }
        return {
          status: 200,
          body: JSON.stringify({
            model: `vendor/base-model-${calls}`,
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: `Provider ${calls}`,
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Answer."
                })
              }
            }]
          })
        };
      }
    });

    expect({ ok: report.ok, results: report.results.slice(0, 4) }).toEqual({
      ok: false,
      results: [
        {
          entrantId: "entrant/1",
          baseModel: "vendor/base-model-1",
          status: "parseable",
          detail: "OpenRouter did not identify a selected provider. OpenRouter did not identify a selected model.",
          resolvedProvider: null,
          resolvedModel: null,
          rawBody: missingProviderBody
        },
        {
          entrantId: "entrant/2",
          baseModel: "vendor/base-model-2",
          status: "unparseable",
          detail: "Response must be valid JSON. OpenRouter did not identify a selected model.",
          resolvedProvider: "Provider 2",
          resolvedModel: null,
          rawBody: unparseableBody
        },
        {
          entrantId: "entrant/3",
          baseModel: "vendor/base-model-3",
          status: "transport_error",
          detail: "OpenRouter returned HTTP 503.",
          resolvedProvider: null,
          resolvedModel: null,
          rawBody: httpErrorBody
        },
        {
          entrantId: "entrant/4",
          baseModel: "vendor/base-model-4",
          status: "transport_error",
          detail: "OpenRouter call failed: connection reset.",
          resolvedProvider: null,
          resolvedModel: null,
          rawBody: null
        }
      ]
    });
  });

  test("refuses to run when the roster does not match its configured size", async () => {
    let calls = 0;

    await expect(preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 10,
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow(
      "Pre-flight requires exactly 10 Entrants at Prompt Version "
      + "match/2026-27-v2; found 9"
    );
    expect(calls).toBe(0);
  });

  test("refuses to run when an Entrant names a different Prompt Version", async () => {
    await client.query(
      `update models
          set prompt_version = 'match/draft'
        where id = 'entrant/9'`
    );
    let calls = 0;

    // A seat whose Prompt Version is not this track's is not this track's
    // seat, so it is not reported as a mismatch any more — it is not selected
    // at all, and what is refused is the roster it leaves behind. The count is
    // what catches it either way, and catches it before the first call.
    await expect(preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow(
      "Pre-flight requires exactly 9 Entrants at Prompt Version "
      + "match/2026-27-v2; found 8"
    );
    expect(calls).toBe(0);
  });

  test("leaves the FPL track's seats out of the roster it checks", async () => {
    // The nine Match seats are already configured; nine FPL seats beside them
    // are a second track's roster, not a roster of eighteen. Counting them
    // would refuse a pre-flight that is correctly configured.
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       )
       select
         'fpl/' || n, 'FPL Seat ' || n, 'vendor/base-model-' || n,
         'provider-' || n, 'fpl/2026-27-v1', 'entrant'
       from generate_series(1, 9) as n`
    );
    const called: string[] = [];

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as { model: string };
        called.push(request.model);
        return {
          status: 200,
          body: JSON.stringify({
            model: request.model,
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: `Resolved ${request.model}`,
                  model: request.model,
                  selected: true
                }]
              }
            },
            choices: [{
              message: {
                content: JSON.stringify({
                  fixture_id: 1,
                  probs: { H: 0.6, D: 0.24, A: 0.16 },
                  score: { home: 2, away: 1 },
                  rationale: "Pre-flight answer."
                })
              }
            }]
          })
        };
      }
    });

    expect(report.ok).toBe(true);
    expect(called).toHaveLength(9);
    expect(report.results.map(({ entrantId }) => entrantId))
      .toEqual(Array.from({ length: 9 }, (_u, n) => `entrant/${n + 1}`));
  });

  test("replays a byte-exact successful OpenRouter response observed in pre-flight", async () => {
    const encoded = await readFile(openRouterResponseUrl, "utf8");
    const observedBody = Buffer.from(encoded, "base64").toString("utf8");

    expect(
      createHash("sha256").update(observedBody, "utf8").digest("hex")
    ).toBe("eabefabef0e95b2d23e79887c8f17c89374a48f36b6edf67d27884b1f29861af");

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 9,
      apiKey: "test-key",
      http: async () => ({ status: 200, body: observedBody })
    });

    expect(report.results[0]).toEqual({
      entrantId: "entrant/1",
      baseModel: "vendor/base-model-1",
      status: "parseable",
      detail: null,
      resolvedProvider: "OpenAI",
      resolvedModel: "openai/gpt-5.6-sol-pro-20260709",
      rawBody: null
    });
  });
});

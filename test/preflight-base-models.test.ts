import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { insertExhibition, resetSchema } from "./schema-fixture.js";
import type { HttpRequest } from "../src/http.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";
import {
  firstMessageText,
  type CapturedTurn
} from "./sent-context.js";

const { Client } = pg;
const openRouterResponseUrl = new URL(
  "./fixtures/openrouter-gpt-5.6-sol-pro-2026-07-29.base64",
  import.meta.url
);

/**
 * The seat number as it appears in an Entrant's id. Zero-padded because the
 * roster query orders by id, which sorts as text: an unpadded tenth seat would
 * land between the first and the second, and every assertion listing the
 * roster in order would have to say so.
 */
function seat(index: number): string {
  return String(index).padStart(2, "0");
}

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
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values
         (
           'PL', '2025-26', 'Premier League', '2026-05-01T00:00:00Z',
           'Arsenal', 'Everton', 3, 1
         ),
         (
           'PL', '2025-26', 'Championship', '2026-05-02T00:00:00Z',
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
    await client.query(
      `insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values
         (
           'PL', '2026-27', 1, 'Arsenal', 'in', 'Signed Player',
           'Newcastle United', '£92.5m', false, '2026-07-06',
           '2026-08-21T17:00:00Z'
         ),
         (
           'PL', '2026-27', 1, 'Arsenal', 'out', 'Loaned Player', 'Hull City',
           null, true, '2026-08-01', '2026-08-21T17:00:00Z'
         )`
    );
    // One club changed and the other did not, which is the section's whole
    // shape: the absence of the event is the fact, so Coventry costs no line.
    await client.query(
      `insert into head_coach_changes (
         competition, season, gw, club, direction, head_coach, manner,
         dated_on, observed_at
       ) values
         (
           'PL', '2026-27', 1, 'Arsenal', 'out', 'Departed Coach', 'Sacked',
           '2026-05-30', '2026-08-21T17:00:00Z'
         ),
         (
           'PL', '2026-27', 1, 'Arsenal', 'in', 'Arrived Coach', null,
           '2026-06-04', '2026-08-21T17:00:00Z'
         )`
    );
    for (let index = 1; index <= 9; index += 1) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role
         ) values ($1, $2, $3, $4, $5, 'match/2026-27-v2', 'entrant')`,
        [
          `entrant/${seat(index)}`,
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
      "Prior-Season base rates (2025-26 Premier League, 1 match): "
        + "home wins 100.0%, draws 0.0%, away wins 0.0%, 4.00 goals per match.",
      "",
      "Arsenal",
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.",
      "Prior-Season points per game: 3.00 overall, 3.00 home, "
        + "unavailable away; xG for and against per game unavailable overall, "
        + "unavailable home, unavailable away.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played:",
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Everton | W"
        + " | xG unavailable",
      "",
      "Coventry City",
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Prior-Season points per game: 3.00 overall, 3.00 home, "
        + "unavailable away; xG for and against per game unavailable overall, "
        + "unavailable home, unavailable away.",
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
      "Squad changes since 2 Feb 2026:",
      "",
      "Arsenal",
      "In: Signed Player (from Newcastle United, £92.5m)",
      "Out: Loaned Player (to Hull City) (loan)",
      "",
      "Coventry City",
      "In: none recorded",
      "Out: none recorded",
      "",
      "Head Coach changes this Season:",
      "",
      "Arsenal",
      "In: Arrived Coach (4 Jun 2026)",
      "Out: Departed Coach (sacked, 30 May 2026)",
      "",
      "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
      "The first character must be { and the last character must be }.",
      "Do not use Markdown or wrap the JSON in code fences.",
      "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers.",
      "score is the exact final scoreline you judge most likely — not expected goals rounded.",
      "Probabilities are scored with the ranked probability score over the ordered outcomes Home, Draw, Away; lower is better."
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
          modelId: `entrant/${seat(index)}`,
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
        modelId: "entrant/01",
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
      modelId: "entrant/01",
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
          modelId: "entrant/01",
          baseModel: "vendor/base-model-1",
          status: "parseable",
          detail: "OpenRouter did not identify a selected provider. OpenRouter did not identify a selected model.",
          resolvedProvider: null,
          resolvedModel: null,
          rawBody: missingProviderBody
        },
        {
          modelId: "entrant/02",
          baseModel: "vendor/base-model-2",
          status: "unparseable",
          detail: "Response must be valid JSON. OpenRouter did not identify a selected model.",
          resolvedProvider: "Provider 2",
          resolvedModel: null,
          rawBody: unparseableBody
        },
        {
          modelId: "entrant/03",
          baseModel: "vendor/base-model-3",
          status: "transport_error",
          detail: "OpenRouter returned HTTP 503.",
          resolvedProvider: null,
          resolvedModel: null,
          rawBody: httpErrorBody
        },
        {
          modelId: "entrant/04",
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

  test("passes at ten, and refuses eleven and twelve naming both numbers", async () => {
    // The outgoing seats are still in the table while the incoming one is
    // inserted, so the road from nine to ten passes through eleven and twelve.
    // Neither is silently swept up: the refusal names what was expected and
    // what was found, so the operator reads which way the table is wrong.
    const addEntrant = async (index: number) => {
      await client.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role
         ) values ($1, $2, $3, $4, null, 'match/2026-27-v2', 'entrant')`,
        [`entrant/${seat(index)}`, `Entrant ${index}`, `vendor/base-model-${index}`,
          `provider-${index}`]
      );
    };
    let calls = 0;
    const runExpectingTen = () => preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 10,
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    });

    // Only the finished ten passes (spec 0015, Further Notes). Every other
    // run in this file is a roster of nine, so ten is stated here or nowhere.
    await addEntrant(10);
    const finished = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      expectedEntrantCount: 10,
      apiKey: "test-key",
      http: async (_url, options) => {
        const request = JSON.parse(options?.body ?? "{}") as { model: string };
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
    expect(finished.ok).toBe(true);
    expect(finished.results.map(({ modelId }) => modelId))
      .toEqual(Array.from({ length: 10 }, (_u, n) => `entrant/${seat(n + 1)}`));

    await addEntrant(11);
    await expect(runExpectingTen()).rejects.toThrow(
      "Pre-flight requires exactly 10 Entrants at Prompt Version "
      + "match/2026-27-v2; found 11"
    );

    await addEntrant(12);
    await expect(runExpectingTen()).rejects.toThrow(
      "Pre-flight requires exactly 10 Entrants at Prompt Version "
      + "match/2026-27-v2; found 12"
    );
    expect(calls).toBe(0);
  });

  test("refuses to run when an Entrant names a different Prompt Version", async () => {
    await client.query(
      `update models
          set prompt_version = 'match/draft'
        where id = 'entrant/09'`
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
    expect(report.results.map(({ modelId }) => modelId))
      .toEqual(Array.from({ length: 9 }, (_u, n) => `entrant/${seat(n + 1)}`));
  });

  test("checks one Exhibition on its own, at the frozen Prompt Version", async () => {
    // A late-arriving Base Model joins as data — one row — and the check that
    // it will answer at all is the same check the roster passed, aimed at it.
    await insertExhibition(client, {
      provider: "late-provider",
      quantization: "fp8"
    });
    const requests: HttpRequest[] = [];

    const report = await preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      exhibitionModelId: "exhibition/late",
      apiKey: "test-key",
      http: async (url, options) => {
        requests.push({ url, ...options! });
        return {
          status: 200,
          body: JSON.stringify({
            model: "vendor/late",
            openrouter_metadata: {
              endpoints: {
                available: [{
                  provider: "Late Provider",
                  model: "vendor/late-20260901",
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

    // One call, and it is the real prompt shape against a real Fixture: the
    // nine Entrants are not called at all, so no roster is paid for.
    expect(requests).toHaveLength(1);
    const sent = JSON.parse(requests[0]!.body!) as {
      model: string;
      messages: CapturedTurn[];
      provider: unknown;
    };
    expect(sent.model).toBe("vendor/late");
    expect(sent.provider).toEqual({
      order: ["late-provider"],
      allow_fallbacks: false,
      quantizations: ["fp8"]
    });
    expect(firstMessageText(sent.messages)).toContain(
      "Fixture ID: 1\nHome: Arsenal\nAway: Coventry City"
    );
    expect(report.ok).toBe(true);
    expect(report.results).toEqual([{
      modelId: "exhibition/late",
      baseModel: "vendor/late",
      status: "parseable",
      detail: null,
      resolvedProvider: "Late Provider",
      resolvedModel: "vendor/late-20260901",
      rawBody: null
    }]);
  });

  test("refuses a targeted model that is missing or is not an Exhibition", async () => {
    let calls = 0;
    const target = async (exhibitionModelId: string) =>
      preflightBaseModels({
        database: client,
        season: "2026-27",
        fixtureId: 1,
        exhibitionModelId,
        apiKey: "test-key",
        http: async () => {
          calls += 1;
          throw new Error("HTTP must not run");
        }
      });

    // A typo must not replay the Season as a real Entrant, so the role is
    // named in the refusal rather than the id merely being reported absent.
    await expect(target("exhibition/typo")).rejects.toThrow(
      "exhibition/typo has no row in models"
    );
    await expect(target("entrant/01")).rejects.toThrow(
      "entrant/01 has role 'entrant', not 'exhibition'"
    );
    expect(calls).toBe(0);
  });

  test("refuses an Exhibition that is not at the Match Prompt Version", async () => {
    // The prompt this sends is the Season's frozen Match prompt and nothing
    // else can be configured (ADR-0001). A row saying it is at some other
    // Prompt Version would be pre-flighted at the frozen one anyway, leaving
    // the row's stated identity and the thing actually tested disagreeing.
    await insertExhibition(client, {
      id: "exhibition/fpl",
      promptVersion: "fpl/2026-27-v2"
    });
    let calls = 0;

    await expect(preflightBaseModels({
      database: client,
      season: "2026-27",
      fixtureId: 1,
      exhibitionModelId: "exhibition/fpl",
      apiKey: "test-key",
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow(
      "exhibition/fpl is at Prompt Version fpl/2026-27-v2, not "
      + "match/2026-27-v2"
    );
    expect(calls).toBe(0);
  });

  test("refuses a pre-flight that names both targets or neither", async () => {
    let calls = 0;
    const http = async () => {
      calls += 1;
      throw new Error("HTTP must not run");
    };
    const shared = {
      database: client,
      season: "2026-27",
      fixtureId: 1,
      apiKey: "test-key",
      http
    };

    // One mode or the other, never a blend: a count beside an id would be a
    // number about a roster this run is not checking, and neither would ask
    // for a roster of no stated size at all.
    await expect(preflightBaseModels({
      ...shared,
      expectedEntrantCount: 9,
      exhibitionModelId: "exhibition/late"
    } as unknown as Parameters<typeof preflightBaseModels>[0])).rejects.toThrow(
      "Pre-flight checks the roster or one Exhibition, not both"
    );
    await expect(preflightBaseModels(
      shared as unknown as Parameters<typeof preflightBaseModels>[0]
    )).rejects.toThrow(
      "Pre-flight needs an Entrant count or an Exhibition model id"
    );
    expect(calls).toBe(0);
  });

  test("leaves an Exhibition Run out of the roster it checks", async () => {
    // An Exhibition carries this track's frozen Prompt Version, so the count
    // check would read ten seats and refuse a correctly configured pre-flight
    // if the role were not what selects the roster.
    await insertExhibition(client);
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
    expect(report.results.map(({ modelId }) => modelId))
      .toEqual(Array.from({ length: 9 }, (_u, n) => `entrant/${seat(n + 1)}`));
    expect(called).not.toContain("vendor/late");
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
      modelId: "entrant/01",
      baseModel: "vendor/base-model-1",
      status: "parseable",
      detail: null,
      resolvedProvider: "OpenAI",
      resolvedModel: "openai/gpt-5.6-sol-pro-20260709",
      rawBody: null
    });
  });
});

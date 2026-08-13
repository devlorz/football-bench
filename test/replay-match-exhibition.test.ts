import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { insertExhibition, resetSchema } from "./schema-fixture.js";
import { replayMatchExhibition } from "../src/exhibition/replay-match-exhibition.js";
import { firstMessageText, type CapturedTurn } from "./sent-context.js";

const { Client } = pg;

/** Long after every deadline this replay covers, which is the whole point. */
const RAN_AT = new Date("2026-10-01T12:00:00Z");

function storedBody(fixtureId: number): string {
  return `Fixture ID: ${fixtureId}\nWhat the roster was shown, verbatim.\n`;
}

/** The hash the roster's stored row carries, and a sceptic recomputes. */
function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function answeredPrediction(fixtureId: number): string {
  return JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          fixture_id: fixtureId,
          probs: { H: 0.6, D: 0.24, A: 0.16 },
          score: { home: 2, away: 1 },
          rationale: "Replayed from the stored context."
        })
      }
    }],
    openrouter_metadata: {
      endpoints: {
        available: [{
          provider: "late-provider",
          model: "vendor/late-20260901",
          selected: true
        }]
      }
    },
    usage: { prompt_tokens: 11, completion_tokens: 7 }
  });
}

function requestedFixtureId(body: string): number {
  const sent = JSON.parse(body) as { messages: CapturedTurn[] };
  const fixtureId = firstMessageText(sent.messages).match(
    /Fixture ID: (\d+)/
  )?.[1];
  if (fixtureId === undefined) {
    throw new Error("the replayed request carried no Fixture ID");
  }
  return Number(fixtureId);
}

describe("replaying the Match track as an Exhibition Run", () => {
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
         predictions, contexts, fixtures, attempts, models, gameweeks
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z');
       insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at,
         result
       ) values
         (
           '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
           '2026-08-21T19:00:00Z',
           jsonb_build_object('home_goals', 2, 'away_goals', 1,
                              'outcome', 'H')
         ),
         (
           '2026-27', 2, 1, 1, 'Everton', 'Fulham',
           '2026-08-22T14:00:00Z',
           jsonb_build_object('home_goals', 0, 'away_goals', 0,
                              'outcome', 'D')
         ),
         (
           '2026-27', 3, 2, 2, 'Chelsea', 'Brentford',
           '2026-08-29T14:00:00Z', null
         );
       insert into contexts (season, gw, track, fpl_id, hash, body) values
         ('2026-27', 1, 'match', 1, ${quoted(sha256(storedBody(1)))}, ${quoted(storedBody(1))}),
         ('2026-27', 1, 'match', 2, ${quoted(sha256(storedBody(2)))}, ${quoted(storedBody(2))}),
         ('2026-27', 2, 'match', 3, ${quoted(sha256(storedBody(3)))}, ${quoted(storedBody(3))})`
    );
    await insertExhibition(client, {
      provider: "late-provider",
      quantization: "fp8"
    });
  });

  test("covers every contexted Fixture of a Settled Gameweek and no other", async () => {
    const sent = new Map<number, string>();

    const gameweeks = await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        const fixtureId = requestedFixtureId(options?.body ?? "{}");
        const request = JSON.parse(options!.body!) as {
          messages: CapturedTurn[];
        };
        sent.set(fixtureId, firstMessageText(request.messages));
        return { status: 200, body: answeredPrediction(fixtureId) };
      }
    });

    expect(gameweeks).toEqual([1]);
    // The stored body, byte for byte, and so hashing to what the roster's row
    // says it saw — which is the whole of a sceptic's verification.
    expect(sent.get(1)).toBe(storedBody(1));
    expect(sent.get(2)).toBe(storedBody(2));
    expect(sent.has(3)).toBe(false);
    const hashes = await client.query(
      `select c.fpl_id, c.hash
         from contexts c
         join predictions p on p.context_id = c.id
        where p.model_id = 'exhibition/late'
        order by c.fpl_id`
    );
    expect(hashes.rows).toEqual([
      { fpl_id: 1, hash: sha256(sent.get(1)!) },
      { fpl_id: 2, hash: sha256(sent.get(2)!) }
    ]);

    const predictions = await client.query(
      `select p.fpl_id, p.context_id, p.pred_home, p.pred_away,
              p.attempts_used, p.predicted_at, c.id as stored_context_id
         from predictions p
         join contexts c
           on c.season = p.season and c.track = 'match' and c.fpl_id = p.fpl_id
        where p.model_id = 'exhibition/late'
        order by p.fpl_id`
    );
    expect(predictions.rows).toEqual([
      {
        fpl_id: 1,
        context_id: "1",
        stored_context_id: "1",
        pred_home: 2,
        pred_away: 1,
        attempts_used: 0,
        predicted_at: RAN_AT
      },
      {
        fpl_id: 2,
        context_id: "2",
        stored_context_id: "2",
        pred_home: 2,
        pred_away: 1,
        attempts_used: 0,
        predicted_at: RAN_AT
      }
    ]);
  });

  test("calls the row's pinned provider and quantization, fallbacks off", async () => {
    let request: Record<string, unknown> = {};

    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        request = JSON.parse(options?.body ?? "{}") as Record<string, unknown>;
        return {
          status: 200,
          body: answeredPrediction(requestedFixtureId(options!.body!))
        };
      }
    });

    expect(request.model).toBe("vendor/late");
    expect(request.provider).toEqual({
      order: ["late-provider"],
      allow_fallbacks: false,
      quantizations: ["fp8"]
    });
  });

  test("refuses a row that is not at the Season's frozen Prompt Version", async () => {
    await insertExhibition(client, {
      id: "exhibition/fpl",
      promptVersion: "fpl/2026-27-v2"
    });

    await expect(replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/fpl",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async () => {
        throw new Error("a refused replay calls nothing");
      }
    })).rejects.toThrow(
      "exhibition/fpl is at Prompt Version fpl/2026-27-v2, "
      + "not match/2026-27-v2"
    );
  });

  test("logs every call in attempts under trigger 'manual'", async () => {
    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => ({
        status: 200,
        body: answeredPrediction(requestedFixtureId(options?.body ?? "{}"))
      })
    });

    const attempts = await client.query(
      `select fpl_id, gw, track, attempt_no, ok, error_kind, trigger,
              resolved_provider, resolved_model, latency_ms, tokens_in,
              tokens_out, raw_response is not null as archived, attempted_at
         from attempts
        where model_id = 'exhibition/late'
        order by fpl_id`
    );
    expect(attempts.rows).toEqual([1, 2].map((fplId) => ({
      fpl_id: fplId,
      gw: 1,
      track: "match",
      attempt_no: 0,
      ok: true,
      error_kind: null,
      trigger: "manual",
      resolved_provider: "late-provider",
      resolved_model: "vendor/late-20260901",
      latency_ms: 0,
      tokens_in: 11,
      tokens_out: 7,
      archived: true,
      attempted_at: RAN_AT
    })));
  });

  test("Repairs an invalid answer, as an Entrant's would be", async () => {
    let calls = 0;

    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        const fixtureId = requestedFixtureId(options?.body ?? "{}");
        calls += 1;
        // Only Fixture 1's first answer is broken, so the Repair is visible as
        // one Fixture's second attempt rather than as a run-wide retry.
        return fixtureId === 1 && calls === 1
          ? {
            status: 200,
            body: JSON.stringify({
              choices: [{ message: { content: "{\"probs\": \"soon\"}" } }]
            })
          }
          : { status: 200, body: answeredPrediction(fixtureId) };
      }
    });

    const attempts = await client.query(
      `select fpl_id, attempt_no, ok, error_kind
         from attempts
        where model_id = 'exhibition/late'
        order by fpl_id, attempt_no`
    );
    // No attempt is refused for arriving after the deadline: an Exhibition Run
    // arrives after every deadline, which is the feature (ADR-0032).
    expect(attempts.rows).toEqual([
      { fpl_id: 1, attempt_no: 0, ok: false, error_kind: "schema" },
      { fpl_id: 1, attempt_no: 1, ok: true, error_kind: null },
      { fpl_id: 2, attempt_no: 0, ok: true, error_kind: null }
    ]);
    const repaired = await client.query(
      `select attempts_used from predictions
        where model_id = 'exhibition/late' and fpl_id = 1`
    );
    expect(repaired.rows).toEqual([{ attempts_used: 1 }]);
  });

  test("records a Gap, then re-runs over neither it nor a Prediction", async () => {
    const refusing = async (_url: string, options?: { body?: string }) => {
      const fixtureId = requestedFixtureId(options?.body ?? "{}");
      return fixtureId === 2
        ? { status: 500, body: "the provider fell over" }
        : { status: 200, body: answeredPrediction(fixtureId) };
    };

    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: refusing
    });

    // The Fixture that failed is a Gap; the one beside it finished regardless.
    const afterFirstRun = await client.query(
      `select fpl_id from predictions where model_id = 'exhibition/late'`
    );
    expect(afterFirstRun.rows).toEqual([{ fpl_id: 1 }]);
    const gap = await client.query(
      `select attempt_no, ok, error_kind
         from attempts
        where model_id = 'exhibition/late' and fpl_id = 2`
    );
    expect(gap.rows).toEqual([
      { attempt_no: 0, ok: false, error_kind: "provider" }
    ]);

    const ledger = await client.query(
      `select id, model_id, fpl_id, attempt_no, attempted_at
         from attempts order by id`
    );
    let secondRunCalls = 0;
    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => new Date("2026-10-02T12:00:00Z"),
      http: async (url, options) => {
        secondRunCalls += 1;
        return refusing(url, options);
      }
    });

    expect(secondRunCalls).toBe(0);
    expect(
      (await client.query(
        `select id, model_id, fpl_id, attempt_no, attempted_at
           from attempts order by id`
      )).rows
    ).toEqual(ledger.rows);
  });

  test("passes over a Fixture that was never played", async () => {
    // Withdrawn from the calendar after the roster was shown it, so it holds a
    // stored context and will never gain a result. Unlocked, too: a replay that
    // called it would also be the run that assigned its canonical Lock, months
    // after the Gameweek it names.
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at, deferred
       ) values (
         '2026-27', 4, 1, 'Leeds', 'Burnley', '2026-08-22T16:30:00Z', true
       );
       insert into contexts (season, gw, track, fpl_id, hash, body) values
         ('2026-27', 1, 'match', 4, ${quoted(sha256(storedBody(4)))},
          ${quoted(storedBody(4))})`
    );
    const called: number[] = [];

    const gameweeks = await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        const fixtureId = requestedFixtureId(options?.body ?? "{}");
        called.push(fixtureId);
        return { status: 200, body: answeredPrediction(fixtureId) };
      }
    });

    expect(gameweeks).toEqual([1]);
    expect(called.sort()).toEqual([1, 2]);
    const unplayed = await client.query(
      `select f.locked_in_gw,
              (select count(*) from attempts a where a.fpl_id = 4) as attempts
         from fixtures f
        where f.season = '2026-27' and f.fpl_id = 4`
    );
    expect(unplayed.rows).toEqual([{ locked_in_gw: null, attempts: "0" }]);
  });

  test("resumes a Fixture whose Repairs a crash left unspent", async () => {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
         trigger, attempted_at
       ) values
         (
           'exhibition/late', '2026-27', 1, 'match', 1, 0, false, 'schema',
           'manual', '2026-09-30T12:00:00Z'
         ),
         (
           'exhibition/late', '2026-27', 1, 'match', 2, 0, false, 'provider',
           'manual', '2026-09-30T12:00:00Z'
         )`
    );
    const called: number[] = [];

    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        const fixtureId = requestedFixtureId(options?.body ?? "{}");
        called.push(fixtureId);
        return { status: 200, body: answeredPrediction(fixtureId) };
      }
    });

    // Fixture 1's stored failure is one a Repair addresses and it had Repairs
    // left, so the run still owes it an ask. Fixture 2's provider failure is
    // where the run stopped asking: a recorded Gap, never retried.
    expect(called).toEqual([1]);
    expect(
      (await client.query(
        `select fpl_id from predictions where model_id = 'exhibition/late'`
      )).rows
    ).toEqual([{ fpl_id: 1 }]);
  });

  test("leaves a Fixture alone once its Repairs are spent", async () => {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
         trigger, attempted_at
       )
       select 'exhibition/late', '2026-27', 1, 'match', 1, attempt_no, false,
              'probs_sum', 'manual', '2026-09-30T12:00:00Z'
         from generate_series(0, 3) as attempt_no`
    );
    const called: number[] = [];

    await replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        const fixtureId = requestedFixtureId(options?.body ?? "{}");
        called.push(fixtureId);
        return { status: 200, body: answeredPrediction(fixtureId) };
      }
    });

    expect(called).toEqual([2]);
  });

  test("refuses to run beside another replay", async () => {
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    let calls = 0;
    try {
      await other.query("select pg_advisory_lock(8150530)");

      await expect(replayMatchExhibition({
        database: client,
        season: "2026-27",
        exhibitionModelId: "exhibition/late",
        concurrency: 1,
        apiKey: "test-key",
        now: () => RAN_AT,
        http: async (_url, options) => {
          calls += 1;
          return {
            status: 200,
            body: answeredPrediction(requestedFixtureId(options!.body!))
          };
        }
      })).rejects.toThrow(
        "Another Exhibition replay is running; this one would pay for the "
        + "same calls twice"
      );
    } finally {
      await other.end();
    }

    expect(calls).toBe(0);
  });

  test("refuses a model id that is missing or is not an Exhibition", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'match/entrant-1', 'Seat One', 'vendor/one', 'vendor',
         'match/2026-27-v2', 'entrant'
       )`
    );
    const replay = (exhibitionModelId: string) => replayMatchExhibition({
      database: client,
      season: "2026-27",
      exhibitionModelId,
      concurrency: 1,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async () => {
        throw new Error("a refused replay calls nothing");
      }
    });

    await expect(replay("exhibition/typo")).rejects.toThrow(
      "exhibition/typo has no row in models"
    );
    await expect(replay("match/entrant-1")).rejects.toThrow(
      "match/entrant-1 has role 'entrant', not 'exhibition'"
    );
  });
});

/** A Postgres string literal, for bodies whose bytes the test asserts on. */
function quoted(body: string): string {
  return `'${body.replace(/'/g, "''")}'`;
}

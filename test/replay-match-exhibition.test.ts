import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { insertExhibition, resetSchema } from "./schema-fixture.js";
import { replayMatchExhibition } from "../src/exhibition/replay-match-exhibition.js";
import { matchPromptOf } from "../src/predictions/openrouter-entrant.js";
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

/** The roster's stored context for one Fixture, hashed as the pipeline hashes. */
async function storeContext(
  database: pg.Client,
  gameweek: number,
  fixtureId: number,
  competition = "PL"
): Promise<void> {
  await database.query(
    `insert into contexts (
       competition, season, gw, track, fixture_id, hash, body
     ) values ($1, '2026-27', $2, 'match', $3, $4, $5)`,
    [
      competition,
      gameweek,
      fixtureId,
      sha256(storedBody(fixtureId)),
      storedBody(fixtureId)
    ]
  );
}

/** The six Fixtures La Liga's Gameweek 1 Lock owned, in football-data ids. */
const LA_LIGA_GAMEWEEK_ONE = [101, 102, 103, 104, 105, 106];

/**
 * La Liga's Gameweek 1 as the record holds it: six played Fixtures and the six
 * contexts the retired `match-pd/2026-27-v1` roster was shown. The contexts
 * carry no Prompt Version — the column does not exist
 * (`migrations/0001_initial.sql`) — so they stay replayable under the standing
 * one, which is the whole reason an Exhibition can still reach them.
 */
async function seedLaLigaGameweekOne(database: pg.Client): Promise<void> {
  await database.query(
    `insert into gameweeks (competition, season, gw, deadline_at) values
       ('PD', '2026-27', 1, '2026-08-15T17:00:00Z');
     insert into fixtures (
       competition, season, fixture_id, gw, locked_in_gw, home_team, away_team,
       kickoff_at, result
     ) values
       ('PD', '2026-27', 101, 1, 1, 'Alaves', 'Getafe',
        '2026-08-15T17:30:00Z',
        jsonb_build_object('home_goals', 3, 'away_goals', 0, 'outcome', 'H')),
       ('PD', '2026-27', 102, 1, 1, 'Sevilla', 'Rayo Vallecano',
        '2026-08-15T19:30:00Z',
        jsonb_build_object('home_goals', 2, 'away_goals', 1, 'outcome', 'H')),
       ('PD', '2026-27', 103, 1, 1, 'Racing Santander', 'Villarreal',
        '2026-08-16T15:00:00Z',
        jsonb_build_object('home_goals', 2, 'away_goals', 2, 'outcome', 'D')),
       ('PD', '2026-27', 104, 1, 1, 'Espanyol', 'Levante',
        '2026-08-16T17:00:00Z',
        jsonb_build_object('home_goals', 3, 'away_goals', 0, 'outcome', 'H')),
       ('PD', '2026-27', 105, 1, 1, 'Deportivo La Coruna', 'Elche',
        '2026-08-17T19:00:00Z',
        jsonb_build_object('home_goals', 1, 'away_goals', 1, 'outcome', 'D')),
       ('PD', '2026-27', 106, 1, 1, 'Atletico Madrid', 'Malaga',
        '2026-08-19T19:00:00Z',
        jsonb_build_object('home_goals', 0, 'away_goals', 2, 'outcome', 'A'))`
  );
  for (const fixtureId of LA_LIGA_GAMEWEEK_ONE) {
    await storeContext(database, 1, fixtureId, "PD");
  }
}

/** What one replayed Fixture puts on the wire: its stored bytes, verbatim. */
function replayedBodies(fixtureIds: readonly number[]): Map<number, string> {
  return new Map(fixtureIds.map((id) => [id, storedBody(id)]));
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
         season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at,
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
         )`
    );
    await storeContext(client, 1, 1);
    await storeContext(client, 1, 2);
    await storeContext(client, 2, 3);
    await insertExhibition(client, {
      provider: "late-provider",
      quantization: "fp8"
    });
  });

  test("covers every contexted Fixture of a Settled Gameweek and no other", async () => {
    const sent = new Map<number, string>();

    const gameweeks = await replayMatchExhibition({
      database: client,
      competition: "PL",
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
    // Gameweek 2 has not settled, so its Fixture is unasked and unrecorded —
    // the second half read from the tables rather than from the calls made.
    expect(sent.has(3)).toBe(false);
    expect(
      (await client.query(
        `select
           (select count(*) from predictions where fixture_id = 3) as predictions,
           (select count(*) from attempts where fixture_id = 3) as attempts`
      )).rows
    ).toEqual([{ predictions: "0", attempts: "0" }]);
    const hashes = await client.query(
      `select c.fixture_id, c.hash
         from contexts c
         join predictions p on p.context_id = c.id
        where p.model_id = 'exhibition/late'
        order by c.fixture_id`
    );
    expect(hashes.rows).toEqual([
      { fixture_id: 1, hash: sha256(sent.get(1)!) },
      { fixture_id: 2, hash: sha256(sent.get(2)!) }
    ]);

    const predictions = await client.query(
      `select p.fixture_id, p.context_id, p.pred_home, p.pred_away,
              p.attempts_used, p.predicted_at, c.id as stored_context_id
         from predictions p
         join contexts c
           on c.season = p.season and c.track = 'match' and c.fixture_id = p.fixture_id
        where p.model_id = 'exhibition/late'
        order by p.fixture_id`
    );
    expect(predictions.rows).toEqual([
      {
        fixture_id: 1,
        context_id: "1",
        stored_context_id: "1",
        pred_home: 2,
        pred_away: 1,
        attempts_used: 0,
        predicted_at: RAN_AT
      },
      {
        fixture_id: 2,
        context_id: "2",
        stored_context_id: "2",
        pred_home: 2,
        pred_away: 1,
        attempts_used: 0,
        predicted_at: RAN_AT
      }
    ]);
  });

  test("replays La Liga's Gameweek 1 and files every write under PD", async () => {
    await seedLaLigaGameweekOne(client);
    await insertExhibition(client, {
      id: "exhibition-pd/late",
      promptVersion: matchPromptOf("PD").version,
      provider: "late-provider",
      quantization: "fp8"
    });
    const sent = new Map<number, string>();

    const gameweeks = await replayMatchExhibition({
      database: client,
      competition: "PD",
      season: "2026-27",
      exhibitionModelId: "exhibition-pd/late",
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
    // La Liga's six and nobody else's: the Premier League's own settled
    // Gameweek 1 sits in the same tables under the same number, and this run
    // is not owed an ask on any of it.
    expect(sent).toEqual(replayedBodies(LA_LIGA_GAMEWEEK_ONE));
    expect(
      (await client.query(
        `select competition, season, fixture_id, pred_home, pred_away
           from predictions
          where model_id = 'exhibition-pd/late'
          order by fixture_id`
      )).rows
    ).toEqual(LA_LIGA_GAMEWEEK_ONE.map((fixture_id) => ({
      competition: "PD",
      season: "2026-27",
      fixture_id,
      pred_home: 2,
      pred_away: 1
    })));
    expect(
      (await client.query(
        `select competition, season, gw, track, fixture_id, ok, trigger
           from attempts
          where model_id = 'exhibition-pd/late'
          order by fixture_id`
      )).rows
    ).toEqual(LA_LIGA_GAMEWEEK_ONE.map((fixture_id) => ({
      competition: "PD",
      season: "2026-27",
      gw: 1,
      track: "match",
      fixture_id,
      ok: true,
      trigger: "manual"
    })));
  });

  test("a Premier League replay sweeps no La Liga Gameweek in", async () => {
    await seedLaLigaGameweekOne(client);
    // A Gameweek number is one Competition's round (ADR-0035), and this is a
    // number the Premier League's Season does not reach: a run that reported
    // covering it read La Liga's record as its own.
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at) values
         ('PD', '2026-27', 3, '2026-08-28T15:30:00Z');
       insert into fixtures (
         competition, season, fixture_id, gw, locked_in_gw, home_team,
         away_team, kickoff_at, result
       ) values
         ('PD', '2026-27', 301, 3, 3, 'Barcelona', 'Athletic Club',
          '2026-08-29T19:00:00Z',
          jsonb_build_object('home_goals', 1, 'away_goals', 0, 'outcome', 'H'))`
    );
    await storeContext(client, 3, 301, "PD");
    const sent = new Map<number, string>();

    const gameweeks = await replayMatchExhibition({
      database: client,
      competition: "PL",
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
    expect(sent).toEqual(replayedBodies([1, 2]));
    expect(
      (await client.query(
        `select count(*) as predictions from predictions
          where competition = 'PD'`
      )).rows
    ).toEqual([{ predictions: "0" }]);
  });

  test("calls the row's pinned provider and quantization, fallbacks off", async () => {
    let request: Record<string, unknown> = {};

    await replayMatchExhibition({
      database: client,
      competition: "PL",
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
      competition: "PL",
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

  test("fans Fixtures out to the bound it was given", async () => {
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    let releaseBatch: () => void = () => undefined;
    const batchStarted = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });

    await replayMatchExhibition({
      database: client,
      competition: "PL",
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: async (_url, options) => {
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        if (activeCalls === 2) {
          releaseBatch();
        }
        // Held until both Fixtures are in flight, so a run that answered them
        // one after the other would wait here rather than pass.
        await batchStarted;
        activeCalls -= 1;
        return {
          status: 200,
          body: answeredPrediction(requestedFixtureId(options!.body!))
        };
      }
    });

    expect(maximumActiveCalls).toBe(2);
  });

  test("logs every call in attempts under trigger 'manual'", async () => {
    await replayMatchExhibition({
      database: client,
      competition: "PL",
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
      `select fixture_id, gw, track, attempt_no, ok, error_kind, trigger,
              resolved_provider, resolved_model, latency_ms, tokens_in,
              tokens_out, raw_response is not null as archived, attempted_at
         from attempts
        where model_id = 'exhibition/late'
        order by fixture_id`
    );
    expect(attempts.rows).toEqual([1, 2].map((fplId) => ({
      fixture_id: fplId,
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
      competition: "PL",
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
      `select fixture_id, attempt_no, ok, error_kind
         from attempts
        where model_id = 'exhibition/late'
        order by fixture_id, attempt_no`
    );
    // No attempt is refused for arriving after the deadline: an Exhibition Run
    // arrives after every deadline, which is the feature (ADR-0032).
    expect(attempts.rows).toEqual([
      { fixture_id: 1, attempt_no: 0, ok: false, error_kind: "schema" },
      { fixture_id: 1, attempt_no: 1, ok: true, error_kind: null },
      { fixture_id: 2, attempt_no: 0, ok: true, error_kind: null }
    ]);
    const repaired = await client.query(
      `select attempts_used from predictions
        where model_id = 'exhibition/late' and fixture_id = 1`
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
      competition: "PL",
      season: "2026-27",
      exhibitionModelId: "exhibition/late",
      concurrency: 2,
      apiKey: "test-key",
      now: () => RAN_AT,
      http: refusing
    });

    // The Fixture that failed is a Gap; the one beside it finished regardless.
    const afterFirstRun = await client.query(
      `select fixture_id from predictions where model_id = 'exhibition/late'`
    );
    expect(afterFirstRun.rows).toEqual([{ fixture_id: 1 }]);
    const gap = await client.query(
      `select attempt_no, ok, error_kind
         from attempts
        where model_id = 'exhibition/late' and fixture_id = 2`
    );
    expect(gap.rows).toEqual([
      { attempt_no: 0, ok: false, error_kind: "provider" }
    ]);

    const ledger = await client.query(
      `select id, model_id, fixture_id, attempt_no, attempted_at
         from attempts order by id`
    );
    let secondRunCalls = 0;
    await replayMatchExhibition({
      database: client,
      competition: "PL",
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
        `select id, model_id, fixture_id, attempt_no, attempted_at
           from attempts order by id`
      )).rows
    ).toEqual(ledger.rows);
  });

  test("passes over a Fixture never played, not one that merely moved", async () => {
    // Fixture 4 is off the calendar and holds no result: withdrawn after the
    // roster was shown it, so it has a stored context and nothing to be replayed
    // against. Unlocked, too — a replay that called it would also be the run
    // that assigned its canonical Lock, months after the Gameweek it names.
    //
    // Fixture 5 is the same withdrawal after FPL named a new date: `deferred`
    // stays set because it records history (ADR-0024), but it was played, it is
    // scored, and the roster answered it under this Gameweek's Lock. Skipping it
    // would leave the Exhibition short of a Fixture everyone else has.
    await client.query(
      `insert into fixtures (
         season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at,
         deferred, unscheduled, result
       ) values
         (
           '2026-27', 4, 1, null, 'Leeds', 'Burnley',
           '2026-08-22T16:30:00Z', true, true, null
         ),
         (
           '2026-27', 5, 2, 1, 'Wolves', 'Sunderland',
           '2026-08-29T18:45:00Z', true, false,
           jsonb_build_object('home_goals', 1, 'away_goals', 3,
                              'outcome', 'A')
         )`
    );
    await storeContext(client, 1, 4);
    await storeContext(client, 1, 5);
    const called: number[] = [];

    const gameweeks = await replayMatchExhibition({
      database: client,
      competition: "PL",
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
    expect(called.sort()).toEqual([1, 2, 5]);
    const unplayed = await client.query(
      `select f.locked_in_gw,
              (select count(*) from attempts a where a.fixture_id = 4) as attempts
         from fixtures f
        where f.season = '2026-27' and f.fixture_id = 4`
    );
    expect(unplayed.rows).toEqual([{ locked_in_gw: null, attempts: "0" }]);
  });

  test("asks again where a crash left an ask unfinished", async () => {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fixture_id, attempt_no, ok, error_kind,
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
      competition: "PL",
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
    // left, so the ask never finished and the run asks again. Fixture 2's
    // provider failure is where the asking stopped: a recorded Gap, never
    // retried.
    expect(called).toEqual([1]);
    expect(
      (await client.query(
        `select fixture_id from predictions where model_id = 'exhibition/late'`
      )).rows
    ).toEqual([{ fixture_id: 1 }]);
    // A new ask from the top, with its own Repairs — not a fourth turn of the
    // conversation the crash interrupted, whose assistant turn and failure
    // reason no longer exist anywhere the run can reach. The ledger says so
    // rather than hiding it: a second attempt numbered 0 beside the first.
    expect(
      (await client.query(
        `select attempt_no, ok, error_kind
           from attempts
          where model_id = 'exhibition/late' and fixture_id = 1
          order by id`
      )).rows
    ).toEqual([
      { attempt_no: 0, ok: false, error_kind: "schema" },
      { attempt_no: 0, ok: true, error_kind: null }
    ]);
  });

  test("leaves a Fixture alone once its Repairs are spent", async () => {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fixture_id, attempt_no, ok, error_kind,
         trigger, attempted_at
       )
       select 'exhibition/late', '2026-27', 1, 'match', 1, attempt_no, false,
              'probs_sum', 'manual', '2026-09-30T12:00:00Z'
         from generate_series(0, 3) as attempt_no`
    );
    const called: number[] = [];

    await replayMatchExhibition({
      database: client,
      competition: "PL",
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
        competition: "PL",
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
      competition: "PL",
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

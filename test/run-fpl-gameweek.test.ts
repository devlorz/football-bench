import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { runFplGameweek } from "../src/fpl/run-fpl-gameweek.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { DEFAULT_HTTP_TIMEOUT_MS, type HttpFetcher } from "../src/http.js";
import { FPL_POOL, type FixturePlayer } from "./fpl-pool-fixture.js";
import {
  EVERYONE_PLAYED,
  storeSettledPoints
} from "./fpl-points-fixture.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import {
  firstMessageText,
  type CapturedTurn as Turn
} from "./sent-context.js";

const { Client } = pg;

/** The nine seats ADR-0014 puts on the track, one per Base Model. */
const BASE_MODELS = Array.from(
  { length: SEASON_ROSTER_SIZE },
  (_unused, index) => `vendor/base-${index + 1}`
);

function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

/** The legal opening Squad: £95.5m spent, £4.5m left in the bank. */
const OPENING = JSON.stringify({
  transfers_in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  }
});

/** The same Team Sheet again with no Transfer: what a later Gameweek's
 * inaction is, and the legal action every test here that is not about the
 * action itself uses. */
const STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: (JSON.parse(OPENING) as { team_sheet: unknown }).team_sheet
});

/** The same action with the armband on a substitute: one rule broken, so what
 * comes back is a sentence about captaincy and nothing else. */
const CAPTAIN_ON_THE_BENCH = JSON.stringify({
  ...JSON.parse(STAND_PAT) as object,
  team_sheet: {
    ...(JSON.parse(STAND_PAT) as { team_sheet: object }).team_sheet,
    captain: 2
  }
});

function openRouterBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
    openrouter_metadata: {
      endpoints: {
        available: [
          { provider: "vendor", model: "vendor/base-x", selected: true }
        ]
      }
    },
    usage: { prompt_tokens: 4096, completion_tokens: 256 }
  });
}

interface Call {
  baseModel: string;
  messages: Turn[];
}

/**
 * Answers each Base Model's calls from its own script, so a conversation that
 * quietly picked up another Entrant's turns shows as a wrong answer rather
 * than as a passing test.
 */
function scripted(
  responses: string[],
  perEntrant: Readonly<Record<string, string[]>> = {}
): { http: HttpFetcher; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    http: async (_url, options) => {
      const { model, messages } = JSON.parse(options?.body ?? "{}") as {
        model: string;
        messages: Turn[];
      };
      const already = calls.filter(
        ({ baseModel }) => baseModel === model
      ).length;
      calls.push({ baseModel: model, messages });
      const script = perEntrant[model] ?? responses;
      const response = script[already];
      if (response === undefined) {
        throw new Error(
          `${model} was called ${already + 1} times, `
          + `but only ${script.length} responses were scripted for it`
        );
      }
      return { status: 200, body: openRouterBody(response) };
    }
  };
}

describe("running a Gameweek for the whole FPL roster", () => {
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
         predictions, contexts, fixtures, manager_states, attempts, models,
         gameweeks, fpl_players, fpl_player_points, scores
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z'),
         ('2026-27', 3, '2026-09-12T17:30:00Z')`
    );
    for (const baseModel of BASE_MODELS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [seatId(baseModel), baseModel, baseModel, FPL_PROMPT_VERSION]
      );
    }
    for (const gameweek of [1, 2, 3]) {
      await lockPool(gameweek, FPL_POOL);
    }
  });

  /** The Gameweek's pool as its Lock found it, at unmoved opening prices. */
  async function lockPool(
    gameweek: number,
    players: readonly FixturePlayer[]
  ): Promise<void> {
    for (const player of players) {
      await client.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added, observed_at
         ) values (
           '2026-27', $1, $2, $3, $4, $5, $6, 'a', null, '', null,
           '2026-08-21T17:00:00Z'
         )`,
        [
          gameweek,
          player.fplId,
          player.club,
          player.webName,
          player.position,
          player.priceTenths
        ]
      );
    }
  }

  /**
   * Opens the track for all nine at Gameweek 1, which is the only way a
   * Gameweek this function runs can have a Squad standing behind it. It goes
   * through `startFplTrack` rather than seeding rows, because the Manager
   * States a run carries forward should be the ones the opening actually
   * commits.
   */
  async function openTheTrack(gameweek = 1): Promise<void> {
    const script = scripted([OPENING]);
    const opening = await startFplTrack({
      database: client,
      season: "2026-27",
      gameweek,
      concurrency: 3,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: script.http
    });
    expect(opening.missing).toEqual([]);
  }

  /**
   * One run of the whole roster at a Gameweek, answered by the scripted
   * responses, and the calls it made.
   *
   * The defaults are the Gameweek after the opening and a clock comfortably
   * inside its deadline. A test names only what it is about.
   */
  async function run({
    gameweek = 2,
    at = "2026-08-28T11:30:00Z",
    concurrency = 3,
    responses = [STAND_PAT],
    perEntrant = {},
    http,
    now
  }: {
    gameweek?: number;
    at?: string;
    concurrency?: number;
    responses?: string[];
    perEntrant?: Readonly<Record<string, string[]>>;
    http?: HttpFetcher;
    now?: () => Date;
  } = {}): Promise<{
    outcome: Awaited<ReturnType<typeof runFplGameweek>>;
    calls: Call[];
  }> {
    const script = scripted(responses, perEntrant);
    const outcome = await runFplGameweek({
      database: client,
      season: "2026-27",
      gameweek,
      concurrency,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: now ?? (() => new Date(at)),
      http: http ?? script.http
    });
    return { outcome, calls: script.calls };
  }

  test("plays every Entrant on its own standing Manager State", async () => {
    await openTheTrack();

    const { outcome, calls } = await run();

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: BASE_MODELS.map(seatId),
      standing: [],
      missing: []
    });
    // One call apiece and one Manager State apiece, and every Entrant was
    // shown its own context: the roster gets through the Gameweek together,
    // which is the whole of what this runner adds to `openFplGameweek`.
    expect(calls.map(({ baseModel }) => baseModel).sort())
      .toEqual([...BASE_MODELS].sort());
    const states = await client.query<{ model_id: string }>(
      "select model_id from manager_states where gw = 2 order by model_id"
    );
    expect(states.rows).toEqual(
      BASE_MODELS.map((baseModel) => ({ model_id: seatId(baseModel) }))
    );
    const contexts = await client.query<{ model_id: string }>(
      `select model_id from contexts
        where gw = 2 and track = 'fpl' order by model_id`
    );
    expect(contexts.rows).toEqual(
      BASE_MODELS.map((baseModel) => ({ model_id: seatId(baseModel) }))
    );
    // Every Entrant saw the Squad it owns, priced from the Gameweek's own
    // locked pool.
    for (const { messages } of calls) {
      expect(firstMessageText(messages)).toContain("- 8 | bought for £12.0m");
    }
  });

  test("does not call an Entrant that already holds the Gameweek", async () => {
    await openTheTrack();
    await run();

    // The same Gameweek again, while its Lock still stands. Every Entrant's
    // decision is already taken, and `manager_states` refuses an update in any
    // case — so the second run makes no call at all rather than making nine
    // and throwing away nine answers.
    const { outcome, calls } = await run({ responses: [] });

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: [],
      standing: BASE_MODELS.map(seatId),
      missing: []
    });
    expect(calls).toEqual([]);
    const rows = await client.query<{ states: number; attempts: number }>(
      `select
         (select count(*)::int from manager_states where gw = 2) as states,
         (select count(*)::int from attempts where gw = 2) as attempts`
    );
    expect(rows.rows).toEqual([{ states: 9, attempts: 9 }]);
  });

  test("stays inactive before the Gameweek the track started at", async () => {
    // Nothing has opened yet, so there is no track to run.
    const before = await run({ gameweek: 1, responses: [] });
    expect(before.outcome).toEqual({ kind: "inactive", gameweek: 1 });
    expect(before.calls).toEqual([]);

    // The operator starts at Gameweek 2. Gameweek 1 does not become playable
    // retrospectively: the track joins at a Gameweek and runs forward, and a
    // Gameweek before the start has no Manager State to carry into it for
    // anybody.
    await openTheTrack(2);
    const { outcome, calls } = await run({ gameweek: 1, responses: [] });

    expect(outcome).toEqual({ kind: "inactive", gameweek: 1 });
    expect(calls).toEqual([]);
    const states = await client.query<{ gw: number }>(
      "select distinct gw from manager_states order by gw"
    );
    expect(states.rows).toEqual([{ gw: 2 }]);
    const contexts = await client.query<{ count: number }>(
      "select count(*)::int as count from contexts where gw = 1"
    );
    expect(contexts.rows).toEqual([{ count: 0 }]);
  });

  test("refuses an action that arrives at the Lock and records the attempt", async () => {
    await openTheTrack();

    // The Lock is the deadline instant itself. Every answer is legal and every
    // answer is late, so the Gameweek stores nothing for anybody — an action
    // after the deadline cannot advance a Manager State on information the
    // Entrant should not have had.
    const { outcome, calls } = await run({ at: "2026-08-28T17:30:00Z" });

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: [],
      standing: [],
      missing: BASE_MODELS.map(seatId)
    });
    expect(calls).toHaveLength(BASE_MODELS.length);
    const states = await client.query<{ count: number }>(
      "select count(*)::int as count from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([{ count: 0 }]);
    // The late attempts stay on record. What an Entrant did is measured from
    // these rows, and a Lock it missed is a thing it did.
    const late = await client.query<{ error_kind: string; count: number }>(
      `select error_kind, count(*)::int as count
         from attempts
        where gw = 2
        group by error_kind`
    );
    expect(late.rows).toEqual([{ error_kind: "deadline", count: 9 }]);
  });

  test("carries a silent Entrant forward without back-filling its Gameweek", async () => {
    await openTheTrack();
    const silent = BASE_MODELS[0]!;

    // One provider fails at Gameweek 2 and the other eight play it.
    const stumbled = await run({
      perEntrant: { [silent]: [] },
      http: async (_url, options) => {
        const { model } = JSON.parse(options?.body ?? "{}") as {
          model: string;
        };
        if (model === silent) {
          return { status: 503, body: "provider unavailable" };
        }
        return {
          status: 200,
          body: openRouterBody(STAND_PAT)
        };
      }
    });
    expect(stumbled.outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: BASE_MODELS.slice(1).map(seatId),
      standing: [],
      missing: [seatId(silent)]
    });

    // Gameweek 3 plays for all nine, including the one that was silent. Its
    // Squad did not vanish because a Gameweek passed without it, and no row
    // appears at Gameweek 2 to pretend it did not: the Gameweek stays missing
    // and the Free Transfer it granted is carried through the silence.
    const { outcome } = await run({
      gameweek: 3,
      at: "2026-09-12T11:30:00Z"
    });

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 3,
      played: BASE_MODELS.map(seatId),
      standing: [],
      missing: []
    });
    const atTwo = await client.query<{ model_id: string }>(
      "select model_id from manager_states where gw = 2 order by model_id"
    );
    expect(atTwo.rows).toEqual(
      BASE_MODELS.slice(1).map((baseModel) => ({
        model_id: seatId(baseModel)
      }))
    );
    // And the silent Gameweek still granted its Free Transfer. One accrued at
    // the opening, one across the silence and one at Gameweek 3 — the same
    // three the eight that answered every Gameweek hold. A state carried from
    // Gameweek 1 to Gameweek 3 as though no time had passed would leave this
    // Entrant on two, permanently one behind its peers for a Gameweek its
    // provider missed rather than for a decision it made.
    const carried = await client.query<{
      model_id: string;
      free_transfers: number;
    }>(
      `select model_id, free_transfers
         from manager_states
        where gw = 3 and model_id = any($1)
        order by model_id`,
      [[seatId(silent), seatId(BASE_MODELS[1]!)]]
    );
    expect(carried.rows).toEqual([
      { model_id: seatId(silent), free_transfers: 3 },
      { model_id: seatId(BASE_MODELS[1]!), free_transfers: 3 }
    ]);
  });

  test("keeps a Roll Over as a played Gameweek", async () => {
    await openTheTrack();
    const stubborn = BASE_MODELS[0]!;

    // Four invalid responses from one Entrant: the initial answer and three
    // Repairs. The action is discarded whole and the Gameweek Rolls Over onto
    // the Team Sheet already standing, which is a Manager State stored and so
    // a Gameweek played — never a Gap and never a score of zero.
    const { outcome } = await run({
      perEntrant: {
        [stubborn]: Array.from({ length: 4 }, () => CAPTAIN_ON_THE_BENCH)
      }
    });

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: BASE_MODELS.map(seatId),
      standing: [],
      missing: []
    });
    const rolled = await client.query<{
      rolled_over: boolean;
      attempts_used: number;
    }>(
      `select rolled_over, attempts_used
         from manager_states
        where gw = 2 and model_id = $1`,
      [seatId(stubborn)]
    );
    expect(rolled.rows).toEqual([{ rolled_over: true, attempts_used: 3 }]);
  });

  test("prices every Entrant from one read of the Gameweek's pool", async () => {
    await openTheTrack();
    let called = 0;

    // Palmer rises to £13.0m in the middle of the run. Nine reads of a moving
    // snapshot would be nine Entrants priced differently for the same
    // Gameweek, which is nine Entrants playing slightly different games — so
    // the pool belongs to the Gameweek and is read before the first call.
    const { outcome } = await run({
      http: async () => {
        called += 1;
        if (called === 1) {
          await client.query(
            `update fpl_players set price_tenths = 130
              where season = '2026-27' and gw = 2 and fpl_id = 8`
          );
        }
        return { status: 200, body: openRouterBody(STAND_PAT) };
      }
    });

    expect(outcome).toMatchObject({ played: BASE_MODELS.map(seatId) });
    const bodies = await client.query<{ body: string }>(
      "select distinct body from contexts where gw = 2 and track = 'fpl'"
    );
    expect(bodies.rows).toHaveLength(1);
    expect(bodies.rows[0]!.body).not.toContain("£13.0m");
  });

  test("plays the roster the opening committed and no Exhibition beside it", async () => {
    await openTheTrack();
    // An Exhibition Run replays the Season from the Gameweek the track opened
    // at, so it leaves a Manager State standing at that Gameweek too — and the
    // roster is read from `manager_states`, where nothing said which of those
    // rows was a seat. Its own carried state is not this run's business.
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'exhibition/late', 'Late Arrival', 'vendor/late', 'vendor',
         $1, 'exhibition'
       )`,
      [FPL_PROMPT_VERSION]
    );
    await client.query(
      `insert into manager_states (
         model_id, season, gw, squad, team_sheet, bank, free_transfers, hits,
         chips_used, chip_active, attempts_used, predicted_at
       )
       select
         'exhibition/late', season, gw, squad, team_sheet, bank,
         free_transfers, hits, chips_used, chip_active, attempts_used,
         '2026-09-30T11:30:00Z'
         from manager_states
        where model_id = $1 and gw = 1`,
      [seatId(BASE_MODELS[0]!)]
    );

    const { outcome, calls } = await run();

    expect(outcome).toEqual({
      kind: "played",
      gameweek: 2,
      played: BASE_MODELS.map(seatId),
      standing: [],
      missing: []
    });
    expect(calls.map(({ baseModel }) => baseModel).sort())
      .toEqual([...BASE_MODELS].sort());
    const states = await client.query<{ model_id: string }>(
      "select model_id from manager_states where gw = 2 order by model_id"
    );
    expect(states.rows).toEqual(
      BASE_MODELS.map((baseModel) => ({ model_id: seatId(baseModel) }))
    );
  });

  test("refuses a roster the opening committed but models no longer holds", async () => {
    await openTheTrack();
    // One seat leaves the FPL track's Prompt Version after opening on it. It
    // is on the Season's path and `manager_states` is insert-only, so it
    // cannot be taken off — and a run that simply skipped it would play the
    // Gameweek for eight, quietly costing the demonstration a Base Model.
    await client.query(
      `update models
          set prompt_version = 'fpl/draft'
        where id = $1`,
      [seatId(BASE_MODELS[2]!)]
    );
    let calls = 0;

    await expect(runFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 2,
      concurrency: 3,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date("2026-08-28T11:30:00Z"),
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow(
      `${seatId(BASE_MODELS[2]!)} opened the FPL track for 2026-27 but is no `
      + `longer an Entrant at Prompt Version ${FPL_PROMPT_VERSION}`
    );
    expect(calls).toBe(0);
  });

  test("stops the run when a Manager State cannot persist", async () => {
    await openTheTrack();
    await client.query(
      `create function fail_one_gameweek_state()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.model_id = 'fpl/base-4' and new.gw = 2 then
           raise exception 'simulated Manager State persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger manager_states_fail_for_one_seat
       before insert on manager_states
       for each row execute function fail_one_gameweek_state()`
    );

    try {
      // A database that cannot store a decision is not an Entrant that made
      // none. Reporting it as merely missing would hide a broken write path
      // behind a result the operator reads as an Entrant's own doing, and the
      // Gameweek would look closed when it is not.
      await expect(run()).rejects.toThrow(
        "simulated Manager State persistence failure"
      );
    } finally {
      await client.query(
        `drop trigger manager_states_fail_for_one_seat on manager_states;
         drop function fail_one_gameweek_state()`
      );
    }

    // Unlike the opening, what did commit stays committed: a later Gameweek
    // stores each Manager State as soon as it has one, and the Entrants that
    // got through are not waiting on the one that did not. Another run picks
    // up exactly what is left.
    const stored = await client.query<{ count: number }>(
      "select count(*)::int as count from manager_states where gw = 2"
    );
    expect(stored.rows[0]!.count).toBeGreaterThan(0);
    expect(stored.rows[0]!.count).toBeLessThan(BASE_MODELS.length);
  });

  test("scores a settled Gameweek without the action path's seams", async () => {
    await openTheTrack();
    await run();
    for (const gameweek of [1, 2]) {
      await storeSettledPoints(client, gameweek, EVERYONE_PLAYED);
    }

    // No `http` and no `now`: the options this takes have neither, so the
    // scorer cannot reach a provider or a clock even by accident. Once the
    // points are checked, what a Gameweek scored is a pure function of rows
    // already stored, and the run that asks for it needs nothing the run that
    // produced them needed.
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });
    const scored = await client.query<{
      model_id: string;
      gw: number;
      metric: string;
      value: number;
    }>(
      `select model_id, gw, metric, value::int as value
         from scores
        where metric in ('fpl_points', 'fpl_points_season_to_date')
        order by gw, model_id, metric`
    );
    // The opening eleven score 49, the captain adds his 9 again, and neither
    // Gameweek takes a Hit — 58 apiece, and 116 across the two.
    expect(scored.rows).toHaveLength(BASE_MODELS.length * 4);
    expect(scored.rows.filter(({ gw, metric }) =>
      gw === 2 && metric === "fpl_points_season_to_date")).toEqual(
      BASE_MODELS.map((baseModel) => ({
        model_id: seatId(baseModel),
        gw: 2,
        metric: "fpl_points_season_to_date",
        value: 116
      }))
    );

    // The action path runs again and changes nothing — every Entrant already
    // holds Gameweek 2 — and the scoring path run again upserts the same rows.
    // Neither path can disturb the other's result.
    const { calls } = await run({ responses: [] });
    expect(calls).toEqual([]);
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });
    const rescored = await client.query<{
      model_id: string;
      gw: number;
      metric: string;
      value: number;
    }>(
      `select model_id, gw, metric, value::int as value
         from scores
        where metric in ('fpl_points', 'fpl_points_season_to_date')
        order by gw, model_id, metric`
    );
    expect(rescored.rows).toEqual(scored.rows);
  });

  test("calls no more Entrants at once than the operator allowed", async () => {
    await openTheTrack();
    let active = 0;
    let peak = 0;

    // Nine seats through a pool of three. The bound is what an operator sets
    // `FPL_CONCURRENCY` for — nine simultaneous calls carrying a
    // six-hundred-player pool each is a different load on the provider from
    // three — so a pool that ignored it would spend the whole roster at once.
    await run({
      concurrency: 3,
      http: async () => {
        active += 1;
        peak = Math.max(peak, active);
        // Parked until the macrotask queue drains, so every worker the pool
        // allows is inside this call at the same moment and the peak is what
        // the bound permits rather than what the scheduling happened to do.
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        active -= 1;
        return { status: 200, body: openRouterBody(STAND_PAT) };
      }
    });

    expect(peak).toBe(3);
    const states = await client.query<{ count: number }>(
      "select count(*)::int as count from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([{ count: BASE_MODELS.length }]);
  });

  test("refuses an invalid concurrency before issuing a call", async () => {
    await openTheTrack();
    let calls = 0;

    await expect(runFplGameweek({
      database: client,
      season: "2026-27",
      gameweek: 2,
      concurrency: 0,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date("2026-08-28T11:30:00Z"),
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow("FPL run concurrency must be a positive integer");
    expect(calls).toBe(0);
  });
});

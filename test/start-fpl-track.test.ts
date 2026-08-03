import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import {
  FPL_PROMPT_VERSION,
  parseFplTrackContextPool
} from "../src/context/build-fpl-track-context.js";
import { GAMEWEEK_RULES } from "../src/fpl/apply-gameweek-action.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import type { HttpFetcher } from "../src/http.js";
import { FPL_POOL, type FixturePlayer } from "./fpl-pool-fixture.js";
import { STORED_OPENING_STATE } from "./fpl-state-fixture.js";

const { Client } = pg;

/** The nine seats ADR-0014 puts on the track, one per Base Model. */
const BASE_MODELS = Array.from(
  { length: SEASON_ROSTER_SIZE },
  (_unused, index) => `vendor/base-${index + 1}`
);

function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

const LEGAL_ACTION = JSON.stringify({
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

/**
 * The same opening with the armband on a substitute. One rule broken and only
 * one, so an Entrant answering with it is refused for captaincy rather than
 * for whichever other rule a wholly rebuilt Squad happened to break as well.
 */
const CAPTAIN_ON_THE_BENCH = JSON.stringify({
  ...JSON.parse(LEGAL_ACTION) as object,
  team_sheet: {
    ...(JSON.parse(LEGAL_ACTION) as { team_sheet: object }).team_sheet,
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

interface Turn {
  role: string;
  content: string;
}

/**
 * Holds every call until `width` of them are in flight at once, then lets all
 * of them and everything after through.
 *
 * A runner that calls one Entrant at a time never reaches the width and is
 * told so, rather than hanging until the suite gives up on it.
 */
function barrier(width: number): () => Promise<void> {
  let arrived = 0;
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= width) {
      open();
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      opened,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(
            `only ${arrived} calls were ever in flight at once, not ${width}`
          )),
          2000
        );
      })
    ]).finally(() => clearTimeout(timer));
  };
}

interface Call {
  baseModel: string;
  messages: Turn[];
}

/**
 * Answers each Base Model from its own script, so the nine conversations stay
 * nine conversations however they interleave. A Base Model with no script of
 * its own gets `otherwise`, which is what lets a test name only the Entrant it
 * is about.
 */
function scripted(
  otherwise: string[],
  responses: Readonly<Record<string, string[]>> = {}
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
      const script = responses[model] ?? otherwise;
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

describe("starting the FPL track for all nine Entrants", () => {
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
         gameweeks, fpl_players
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z')`
    );
    for (const baseModel of BASE_MODELS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [seatId(baseModel), baseModel, baseModel, FPL_PROMPT_VERSION]
      );
    }
    await lockPool(1, FPL_POOL);
    await lockPool(2, FPL_POOL);
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
   * One attempt at opening the track, answered by the scripted responses in
   * order, and the calls it made — which is where a conversation either stays
   * one Entrant's or quietly picks up another's turns.
   *
   * The defaults are the first Gameweek and a clock comfortably inside its
   * deadline. A test names only what it is about.
   */
  async function open({
    gameweek = 1,
    at = "2026-08-21T11:30:00Z",
    concurrency = 1,
    responses = [LEGAL_ACTION],
    perEntrant = {},
    beforeCall,
    http,
    now
  }: {
    gameweek?: number;
    at?: string;
    concurrency?: number;
    responses?: string[];
    perEntrant?: Readonly<Record<string, string[]>>;
    beforeCall?: () => Promise<void>;
    http?: HttpFetcher;
    now?: () => Date;
  } = {}): Promise<{
    opening: Awaited<ReturnType<typeof startFplTrack>>;
    calls: Call[];
  }> {
    const script = scripted(responses, perEntrant);
    const scriptedHttp: HttpFetcher = beforeCall === undefined
      ? script.http
      : async (url, options) => {
        await beforeCall();
        return script.http(url, options);
      };
    const opening = await startFplTrack({
      database: client,
      season: "2026-27",
      gameweek,
      concurrency,
      apiKey: "test-key",
      now: now ?? (() => new Date(at)),
      http: http ?? scriptedHttp
    });
    return { opening, calls: script.calls };
  }

  test("commits one opening Manager State per Entrant at the chosen Gameweek", async () => {
    const { opening } = await open({ gameweek: 2 });

    // The operator chose Gameweek 2, and every Entrant's first Manager State
    // says so: a track that joins late says how late rather than implying it.
    expect(opening).toEqual({ gameweek: 2, missing: [] });
    const states = await client.query<{ model_id: string; gw: number }>(
      "select model_id, gw from manager_states order by model_id"
    );
    expect(states.rows).toEqual(
      BASE_MODELS.map((baseModel) => ({ model_id: seatId(baseModel), gw: 2 }))
    );

    // And each of them is a whole opening Manager State: the fifteen at what
    // they were bought for, which is what Selling Price is later computed
    // against and what no other row records (ADR-0003).
    const first = await client.query(
      `select squad, team_sheet, bank, free_transfers, hits, chips_used,
              chip_active, rolled_over, attempts_used
         from manager_states
        where model_id = $1`,
      [seatId(BASE_MODELS[0]!)]
    );
    expect(first.rows).toEqual([STORED_OPENING_STATE]);
  });

  test("stores one opening context per Entrant, every body the same", async () => {
    const { calls } = await open();

    // One row per seat. At an opening the text says nothing about who is
    // reading it — the same seed Squad, the same locked pool — so the nine
    // bodies are identical and the hashes with them, which is what proves
    // afterwards that nobody saw a different pool from anybody else. They are
    // stored one apiece regardless, because from the next Gameweek onwards a
    // context carries its own Entrant's Squad, and one shape for the whole
    // Season beats a single Gameweek every reader has to know is different.
    const contexts = await client.query<{
      track: string;
      fpl_id: number | null;
      model_id: string;
      hash: string;
      body: string;
    }>(
      `select track, fpl_id, model_id, hash, body
         from contexts
        order by model_id`
    );
    expect(contexts.rows).toHaveLength(BASE_MODELS.length);
    expect(contexts.rows.map(({ model_id: id }) => id))
      .toEqual([...BASE_MODELS.map(seatId)].sort());
    const [context] = contexts.rows;
    for (const row of contexts.rows) {
      expect(row).toMatchObject({ track: "fpl", fpl_id: null });
      expect(row.body).toBe(context!.body);
      expect(row.hash).toBe(
        createHash("sha256").update(row.body).digest("hex")
      );
    }
    expect(calls).toHaveLength(BASE_MODELS.length);
    for (const { messages } of calls) {
      expect(messages[0]).toEqual({ role: "user", content: context!.body });
    }

    // What that one text says: nobody owns anything yet, every rule the
    // reducer can refuse an action for, and the locked pool with each player
    // pinned on one line the reducer can price from.
    expect(context!.body)
      .toContain("Squad: none yet — this is your opening Squad.");
    expect(context!.body).toContain("£100.0m");
    expect(context!.body).toContain(
      '{"id":8,"name":"Palmer","club":"Chelsea","position":"MID",'
      + '"price":"£12.0m","price_tenths":120,"status":"available"}'
    );
    for (const rule of GAMEWEEK_RULES) {
      expect(context!.body).toContain(rule);
    }
    expect(parseFplTrackContextPool(context!.body)).toEqual(
      FPL_POOL.map(({ fplId, club, position, priceTenths }) => ({
        fplId,
        club,
        position,
        priceTenths
      }))
    );
  });

  test("does not start when the Lock passes before every opening is legal", async () => {
    // Nine legal actions, all of them late. The Lock is the deadline instant
    // itself, and an action refused by it is not an opening however legal it
    // would have been in time.
    const { opening } = await open({ at: "2026-08-21T17:30:00Z" });

    expect(opening.missing).toEqual(BASE_MODELS.map(seatId));
    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);
    const attempts = await client.query<{ error_kind: string; count: number }>(
      `select error_kind, count(*)::int as count
         from attempts
        group by error_kind`
    );
    expect(attempts.rows)
      .toEqual([{ error_kind: "deadline", count: BASE_MODELS.length }]);
  });

  test("seats one Entrant per Base Model and leaves every other row alone", async () => {
    // Three rows that are not this track's seats, each for its own reason: a
    // Reference Line is not ranked and cannot manage a Squad, a Match-track
    // Entrant is a different Prompt Version's seat, and the second seat on an
    // existing Base Model is the replication ADR-0003 declined — one seat per
    // Base Model is what makes the FPL ranking a demonstration.
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values
         ('reference/home', 'Home prior', 'none', 'none', $1, 'reference'),
         ('match/base-1', 'Match seat', 'vendor/base-1', 'vendor',
          'match/2026-27-v2', 'entrant')`,
      [FPL_PROMPT_VERSION]
    );

    const { opening, calls } = await open();

    expect(opening.missing).toEqual([]);
    expect(new Set(calls.map(({ baseModel }) => baseModel)))
      .toEqual(new Set(BASE_MODELS));
    const states = await client.query<{ model_id: string }>(
      "select model_id from manager_states order by model_id"
    );
    expect(states.rows.map(({ model_id: id }) => id))
      .toEqual(BASE_MODELS.map(seatId));
  });

  test("refuses to start when one Base Model holds two seats", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'fpl/base-1-again', 'A second seat', 'vendor/base-1', 'vendor',
         $1, 'entrant'
       )`,
      [FPL_PROMPT_VERSION]
    );

    // Two season paths on one Base Model is not a longer demonstration, it is
    // a different experiment (ADR-0003). Refusing before the first call keeps
    // the roster question away from the Lock.
    await expect(open()).rejects.toThrow(
      "vendor/base-1 has more than one FPL seat: fpl/base-1, fpl/base-1-again"
    );
    const attempts = await client.query("select id from attempts");
    expect(attempts.rows).toEqual([]);
  });

  test("calls that many Entrants at once and no more", async () => {
    const arrive = barrier(3);
    let inFlight = 0;
    let mostInFlight = 0;
    const { opening } = await open({
      concurrency: 3,
      http: async () => {
        inFlight += 1;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await arrive();
        inFlight -= 1;
        return { status: 200, body: openRouterBody(LEGAL_ACTION) };
      }
    });

    // Three at once, which is both more than one — nine Entrants answered one
    // after another would not finish inside a Lock — and no more than the
    // operator asked for.
    expect(mostInFlight).toBe(3);
    expect(opening.missing).toEqual([]);
  });

  test("keeps each Entrant's Repairs its own while their calls interleave", async () => {
    // Four Entrants needing four different numbers of Repairs, all in flight
    // together. Attempts are what a violation profile is counted from, so a
    // count landing on the wrong Entrant is a wrong published result.
    const repairsWanted: Readonly<Record<string, number>> = {
      "vendor/base-2": 1,
      "vendor/base-4": 2,
      "vendor/base-6": 3,
      "vendor/base-8": 1
    };
    const arrive = barrier(4);
    const { opening, calls } = await open({
      concurrency: 4,
      perEntrant: Object.fromEntries(
        Object.entries(repairsWanted).map(([baseModel, repairs]) => [
          baseModel,
          [
            ...Array.from({ length: repairs }, () => CAPTAIN_ON_THE_BENCH),
            LEGAL_ACTION
          ]
        ])
      ),
      beforeCall: arrive
    });

    expect(opening.missing).toEqual([]);
    // Three Repairs still succeed at an opening: the allowance is the same one
    // a later Gameweek gets (ADR-0004), not a shorter one.
    const states = await client.query<{ model_id: string; attempts_used: number }>(
      "select model_id, attempts_used from manager_states order by model_id"
    );
    expect(states.rows).toEqual(BASE_MODELS.map((baseModel) => ({
      model_id: seatId(baseModel),
      attempts_used: repairsWanted[baseModel] ?? 0
    })));

    const attempts = await client.query<{ model_id: string; count: number }>(
      `select model_id, count(*)::int as count
         from attempts
        group by model_id
        order by model_id`
    );
    expect(attempts.rows).toEqual(BASE_MODELS.map((baseModel) => ({
      model_id: seatId(baseModel),
      count: (repairsWanted[baseModel] ?? 0) + 1
    })));

    // And no conversation picked up a turn belonging to another Entrant: the
    // rejected action a Repair quotes back is always the one that Entrant sent.
    for (const { baseModel, messages } of calls) {
      const said = messages.filter(({ role }) => role === "assistant");
      expect(said).toEqual(Array.from(
        { length: said.length },
        () => ({ role: "assistant", content: CAPTAIN_ON_THE_BENCH })
      ));
      expect(said.length).toBeLessThanOrEqual(repairsWanted[baseModel] ?? 0);
    }
  });

  test("stores nothing at all when one Entrant never opens legally", async () => {
    // Eight legal openings and one that is still illegal after its third
    // Repair. Committing the eight would hand them a season path a Gameweek
    // longer than the ninth's, which is the comparison this track exists to
    // make impossible.
    const { opening } = await open({
      perEntrant: {
        "vendor/base-5": Array.from({ length: 4 }, () => CAPTAIN_ON_THE_BENCH)
      }
    });

    expect(opening).toEqual({ gameweek: 1, missing: ["fpl/base-5"] });
    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);

    // The eight legal actions are thrown away; the evidence that they were
    // made is not. Repairs and the violation profile are read from these rows
    // and a refused start must not empty them.
    const attempts = await client.query<{ model_id: string; count: number }>(
      `select model_id, count(*)::int as count
         from attempts
        group by model_id
        order by model_id`
    );
    expect(attempts.rows).toEqual(BASE_MODELS.map((baseModel) => ({
      model_id: seatId(baseModel),
      count: baseModel === "vendor/base-5" ? 4 : 1
    })));
  });

  test("stores nothing at all when one Entrant's provider never answers", async () => {
    // A provider failure is not an illegal action, but it is just as much a
    // missing opening: there is no Squad to start the Season with either way.
    const { opening } = await open({
      http: async (url, options) => {
        const { model } = JSON.parse(options?.body ?? "{}") as { model: string };
        return model === "vendor/base-7"
          ? { status: 500, body: "upstream exploded" }
          : { status: 200, body: openRouterBody(LEGAL_ACTION) };
      }
    });

    expect(opening.missing).toEqual(["fpl/base-7"]);
    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);
    const failed = await client.query(
      "select error_kind from attempts where model_id = 'fpl/base-7'"
    );
    expect(failed.rows).toEqual([{ error_kind: "provider" }]);
  });

  test("stores none of the openings when one of them cannot persist", async () => {
    await client.query(
      `create function fail_the_last_opening()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.model_id = 'fpl/base-9' then
           raise exception 'simulated Manager State persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger manager_states_fail_for_the_last_seat
       before insert on manager_states
       for each row execute function fail_the_last_opening()`
    );

    try {
      // Nine legal actions and a database that refuses the ninth row. Eight
      // committed states would be eight Entrants a Gameweek ahead of the
      // ninth, so the transaction takes all nine or none.
      await expect(open()).rejects.toThrow(
        "simulated Manager State persistence failure"
      );
    } finally {
      await client.query(
        `drop trigger manager_states_fail_for_the_last_seat on manager_states;
         drop function fail_the_last_opening()`
      );
    }

    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);
    // Every Entrant answered and every answer is still on record: the
    // rollback undoes the opening, not the evidence.
    const attempts = await client.query<{ count: string }>(
      "select count(*) as count from attempts"
    );
    expect(attempts.rows[0]!.count).toBe(String(BASE_MODELS.length));
  });

  test("aborts the opening when an attempt cannot be recorded", async () => {
    await client.query(
      `create function fail_one_attempt()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.model_id = 'fpl/base-4' then
           raise exception 'simulated attempt persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger attempts_fail_for_one_seat
       before insert on attempts
       for each row execute function fail_one_attempt()`
    );

    try {
      // An Entrant whose attempts cannot be written is not an Entrant that
      // failed to open — it is a track that cannot record what happened.
      // Reporting it as merely missing would hide a broken ledger behind a
      // result the operator is meant to read as an Entrant's own doing.
      await expect(open()).rejects.toThrow(
        "simulated attempt persistence failure"
      );
    } finally {
      await client.query(
        `drop trigger attempts_fail_for_one_seat on attempts;
         drop function fail_one_attempt()`
      );
    }

    const states = await client.query("select model_id from manager_states");
    expect(states.rows).toEqual([]);
  });

  test("re-opens the same Gameweek on the context already stored", async () => {
    // Every provider fails, so the Gameweek stores its context and nothing
    // else. The operator may try the same Gameweek again while the Lock still
    // stands, which is the case the sharing rule is actually for.
    const failed = await open({
      http: async () => ({ status: 500, body: "upstream exploded" })
    });
    expect(failed.opening.missing).toEqual(BASE_MODELS.map(seatId));
    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts"
    );

    // Between the two runs the snapshot moves: Palmer rises from £12.0m to
    // £13.0m. The Entrant is judged on the text it was handed, so the second
    // run must price from the stored context and not from the pool as it now
    // stands.
    await client.query(
      `update fpl_players set price_tenths = 130
        where season = '2026-27' and gw = 1 and fpl_id = 8`
    );
    const { opening, calls } = await open();

    expect(opening.missing).toEqual([]);
    const contexts = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts"
    );
    expect(contexts.rows).toEqual(stored.rows);
    for (const { messages } of calls) {
      expect(messages[0]!.content).toBe(stored.rows[0]!.body);
    }
    expect(stored.rows[0]!.body).toContain("Palmer");
    expect(stored.rows[0]!.body).not.toContain("£13.0m");
    const states = await client.query<{ squad: { active: unknown[] } }>(
      "select squad from manager_states limit 1"
    );
    // £12.0m is what the stored context asked for and so what was paid; the
    // Squad costing £96.5m instead of £95.5m would be a Squad bought at a
    // price no Entrant was ever shown.
    expect(states.rows[0]!.squad.active).toContainEqual(
      { fplId: 8, purchasePriceTenths: 120 }
    );
  });

  test.for([
    { what: "no seats at all", seats: 0 },
    { what: "one seat short", seats: 8 },
    { what: "one seat too many", seats: 10 }
  ])("refuses to start a roster of $what", async ({ seats }) => {
    // `missing` is measured against the roster that was queried, so a roster
    // of the wrong size reports nobody missing and starts a Season that is not
    // the one ADR-0014 describes. `manager_states` is insert-only, so there is
    // no undoing it afterwards — the count is checked before the first call.
    await client.query("delete from models");
    for (let seat = 1; seat <= seats; seat += 1) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [`fpl/seat-${seat}`, `Seat ${seat}`, `vendor/seat-${seat}`,
          FPL_PROMPT_VERSION]
      );
    }

    let called = 0;
    await expect(open({
      http: async () => {
        called += 1;
        return { status: 200, body: openRouterBody(LEGAL_ACTION) };
      }
    })).rejects.toThrow(
      `the FPL track needs ${SEASON_ROSTER_SIZE} seats at Prompt Version `
      + `${FPL_PROMPT_VERSION}, but ${seats} are configured`
    );

    // Nobody was called and nothing was spent on a roster that could not have
    // started a Season.
    expect(called).toBe(0);
    const attempts = await client.query("select id from attempts");
    expect(attempts.rows).toEqual([]);
  });

  test("refuses a concurrency that would call nobody", async () => {
    await expect(open({ concurrency: 0 }))
      .rejects.toThrow("FPL opening concurrency must be a positive integer");
  });

  test("starts at a later Gameweek after an incomplete opening", async () => {
    await open({
      perEntrant: {
        "vendor/base-3": Array.from({ length: 4 }, () => CAPTAIN_ON_THE_BENCH)
      }
    });
    const { opening } = await open({
      gameweek: 2,
      at: "2026-08-28T11:30:00Z"
    });

    expect(opening).toEqual({ gameweek: 2, missing: [] });
    const states = await client.query<{ gw: number; count: number }>(
      "select gw, count(*)::int as count from manager_states group by gw"
    );
    // Gameweek 1 left nothing behind, so the earliest Gameweek the track has
    // a Manager State for is the Gameweek it actually started at — an
    // incomplete opening cannot be mistaken for a start.
    expect(states.rows).toEqual([{ gw: 2, count: BASE_MODELS.length }]);
    // And every Entrant runs the same path length from here.
    const perEntrant = await client.query<{ count: number }>(
      `select count(*)::int as count
         from manager_states
        group by model_id`
    );
    expect(perEntrant.rows).toEqual(
      BASE_MODELS.map(() => ({ count: 1 }))
    );
    // The Gameweek 1 attempts are still on record: what the track refused to
    // do with them does not unmake them.
    const attempts = await client.query<{ gw: number; count: number }>(
      "select gw, count(*)::int as count from attempts group by gw order by gw"
    );
    expect(attempts.rows).toEqual([
      { gw: 1, count: BASE_MODELS.length + 3 },
      { gw: 2, count: BASE_MODELS.length }
    ]);
  });

  test("refuses to open a track that has already started", async () => {
    await open();

    // A second opening would seed every Entrant from the empty Squad again,
    // discarding a Season already under way rather than continuing it. A
    // later Gameweek belongs to `openFplGameweek`, which carries the standing
    // Manager State into it.
    await expect(open({ gameweek: 2, at: "2026-08-28T11:30:00Z" }))
      .rejects.toThrow(
        "the FPL track for 2026-27 already started at Gameweek 1"
      );
  });
});

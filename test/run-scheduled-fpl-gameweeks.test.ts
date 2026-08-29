import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { BASE_MODELS } from "./fpl-seat-fixture.js";
import {
  runScheduledFplGameweeks
} from "../src/fpl/run-scheduled-fpl-gameweeks.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { FPL_ROSTER_SIZE } from "../src/season-roster.js";
import { DEFAULT_HTTP_TIMEOUT_MS, type HttpFetcher } from "../src/http.js";
import { FPL_POOL } from "./fpl-pool-fixture.js";

const { Client } = pg;

/**
 * The seats the FPL track opens with: the Season Roster less the three that
 * left it (ADR-0047). Sliced off `BASE_MODELS` against the track's own size
 * rather than counted out here, so the day a fourth seat is withdrawn this
 * suite seeds the roster `startFplTrack` guards for without being edited.
 */
const FPL_BASE_MODELS = BASE_MODELS.slice(0, FPL_ROSTER_SIZE);

function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

const OPENING = JSON.stringify({
  transfers_in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfers_out: [],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  },
  rationale: "The opening fifteen."
});

const STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: (JSON.parse(OPENING) as { team_sheet: unknown }).team_sheet,
  rationale: "Standing pat."
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

/** Answers every call with the same action, and counts the calls. */
function answering(content: string): {
  http: HttpFetcher;
  calls: () => number;
} {
  let calls = 0;
  return {
    calls: () => calls,
    http: async () => {
      calls += 1;
      return { status: 200, body: openRouterBody(content) };
    }
  };
}

describe("scheduled FPL Gameweek runs", () => {
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
         fpl_runs, prediction_runs, predictions, contexts, fixtures,
         manager_states, attempts, models, gameweeks, fpl_players
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z'),
         ('2026-27', 3, '2026-09-12T17:30:00Z')`
    );
    for (const baseModel of FPL_BASE_MODELS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [seatId(baseModel), baseModel, baseModel, FPL_PROMPT_VERSION]
      );
    }
    for (const gameweek of [1, 2, 3]) {
      for (const player of FPL_POOL) {
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
  });

  async function openTheTrack(gameweek = 1): Promise<void> {
    const opening = await startFplTrack({
      database: client,
      season: "2026-27",
      gameweek,
      concurrency: 3,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: answering(OPENING).http
    });
    expect(opening.missing).toEqual([]);
  }

  async function schedule({
    at,
    http,
    entrantCallTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS
  }: {
    at: string;
    http: HttpFetcher;
    entrantCallTimeoutMs?: number;
  }): Promise<
    Awaited<ReturnType<typeof runScheduledFplGameweeks>>
  > {
    return runScheduledFplGameweeks({
      database: client,
      season: "2026-27",
      concurrency: 3,
      apiKey: "test-key",
      entrantCallTimeoutMs,
      now: () => new Date(at),
      http
    });
  }

  test("gives every Entrant call the operator's timeout", async () => {
    // The weekly run reads the same knob the opening does (spec 0010), and it
    // reaches the wire through the scheduler rather than through a shortcut:
    // the seats that chew for minutes are the same seats either week.
    await openTheTrack();
    const timeouts: (number | undefined)[] = [];

    const runs = await schedule({
      at: "2026-08-28T11:30:00Z",
      entrantCallTimeoutMs: 600_000,
      http: async (_url, options) => {
        timeouts.push(options?.timeoutMs);
        return { status: 200, body: openRouterBody(STAND_PAT) };
      }
    });

    expect(runs).toHaveLength(1);
    expect(timeouts).toHaveLength(FPL_ROSTER_SIZE);
    expect(timeouts.every((timeout) => timeout === 600_000)).toBe(true);
  });

  test("queues one run per Gameweek when a second Competition shares the "
    + "numbering", async () => {
    // `gameweeks` holds one row per Competition since ADR-0035, and every
    // Competition numbers its Gameweeks from 1 -- so a queue filtered by Season
    // and Gameweek alone finds this Gameweek twice and pays for the same ten
    // Entrant calls twice. The seeded Season carries `PL` alone, which is why
    // no other test here can tell the filtered query from the unfiltered one;
    // production has seated La Liga since spec 0016.
    await openTheTrack();
    await client.query(
      "insert into competitions (competition, season) values ('PD', '2026-27')"
    );
    // La Liga's own Gameweek 2, deadline-relative to the same clock this run
    // observes: due at 11:00 and still ahead at 11:30, so it qualifies on every
    // condition the queue applies and only `competition` separates it. Given a
    // past deadline instead it would be filtered out by the ledger clause and
    // this test would pass without a fix.
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at) values
         ('PD', '2026-27', 1, '2026-08-21T17:00:00Z'),
         ('PD', '2026-27', 2, '2026-08-28T17:00:00Z')`
    );
    const script = answering(STAND_PAT);

    const runs = await schedule({
      at: "2026-08-28T11:30:00Z",
      http: script.http
    });

    expect(runs).toHaveLength(1);
    expect(runs.map(({ gameweek }) => gameweek)).toEqual([2]);
    // The count is the money: one call per seat, not two.
    expect(script.calls()).toBe(FPL_ROSTER_SIZE);
  });

  test("runs a Gameweek when its Lock is six hours away", async () => {
    await openTheTrack();
    const script = answering(STAND_PAT);

    // Gameweek 2 locks at 17:30, so it is due at 11:30 and not before.
    const early = await schedule({
      at: "2026-08-28T11:29:00Z",
      http: script.http
    });
    expect(early).toEqual([]);
    expect(script.calls()).toBe(0);

    const runs = await schedule({
      at: "2026-08-28T11:30:00Z",
      http: script.http
    });

    expect(runs).toEqual([{
      gameweek: 2,
      outcome: {
        kind: "played",
        gameweek: 2,
        played: FPL_BASE_MODELS.map(seatId),
        standing: [],
        missing: []
      }
    }]);
    expect(script.calls()).toBe(FPL_BASE_MODELS.length);
    const ledger = await client.query<{
      gw: number;
      attempt_count: number;
      completed: boolean;
      last_error: string | null;
    }>(
      `select gw, attempt_count, completed_at is not null as completed,
              last_error
         from fpl_runs
        order by gw`
    );
    expect(ledger.rows).toEqual([{
      gw: 2,
      attempt_count: 1,
      completed: true,
      last_error: null
    }]);
  });

  test("does not run a Gameweek the ledger has already completed", async () => {
    await openTheTrack();
    await schedule({
      at: "2026-08-28T11:30:00Z",
      http: answering(STAND_PAT).http
    });
    const again = answering(STAND_PAT);

    const runs = await schedule({
      at: "2026-08-28T12:00:00Z",
      http: again.http
    });

    expect(runs).toEqual([]);
    expect(again.calls()).toBe(0);
  });

  test("leaves a failed run for the next poll to retry", async () => {
    await openTheTrack();
    await client.query(
      `create function fail_one_scheduled_state()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.model_id = 'fpl/base-04' and new.gw = 2 then
           raise exception 'simulated Manager State persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger manager_states_fail_for_one_scheduled_seat
       before insert on manager_states
       for each row execute function fail_one_scheduled_state()`
    );

    try {
      await expect(schedule({
        at: "2026-08-28T11:30:00Z",
        http: answering(STAND_PAT).http
      })).rejects.toThrow("simulated Manager State persistence failure");
    } finally {
      await client.query(
        `drop trigger manager_states_fail_for_one_scheduled_seat
           on manager_states;
         drop function fail_one_scheduled_state()`
      );
    }

    // The row records the failure and stays open. The Match track's answer to
    // a Gap is a second scheduled run; here the retry is the same thing,
    // because a re-run skips every Entrant that already holds the Gameweek.
    const failed = await client.query<{
      attempt_count: number;
      completed: boolean;
      last_error: string | null;
    }>(
      `select attempt_count, completed_at is not null as completed, last_error
         from fpl_runs where gw = 2`
    );
    expect(failed.rows[0]).toMatchObject({
      attempt_count: 1,
      completed: false
    });
    expect(failed.rows[0]!.last_error)
      .toContain("simulated Manager State persistence failure");

    const retry = answering(STAND_PAT);
    const runs = await schedule({
      at: "2026-08-28T12:00:00Z",
      http: retry.http
    });

    // Only the Entrants that did not get through are called again, and the
    // ledger counts the second attempt.
    expect(runs).toHaveLength(1);
    expect(runs[0]!.outcome).toMatchObject({
      kind: "played",
      standing: FPL_BASE_MODELS
        .map(seatId)
        .filter((id) => id !== "fpl/base-04")
    });
    expect(retry.calls()).toBe(1);
    const healed = await client.query<{
      attempt_count: number;
      completed: boolean;
      last_error: string | null;
    }>(
      `select attempt_count, completed_at is not null as completed, last_error
         from fpl_runs where gw = 2`
    );
    expect(healed.rows).toEqual([{
      attempt_count: 2,
      completed: true,
      last_error: null
    }]);
  });

  test("schedules nothing while the track has not started", async () => {
    const script = answering(STAND_PAT);

    const runs = await schedule({
      at: "2026-08-28T11:30:00Z",
      http: script.http
    });

    expect(runs).toEqual([]);
    expect(script.calls()).toBe(0);
    // And no ledger row: a Gameweek recorded as completed before the operator
    // opened the track on it would never be run afterwards.
    const ledger = await client.query<{ count: number }>(
      "select count(*)::int as count from fpl_runs"
    );
    expect(ledger.rows).toEqual([{ count: 0 }]);
  });

  test("never schedules a Gameweek before the one the track started at", async () => {
    // The operator starts at Gameweek 3, and polls inside Gameweek 2's window:
    // its Lock is six hours away and has not passed, so nothing but the
    // starting Gameweek keeps it off the list. A run for it would find the
    // track inactive, and would then write a ledger row marking a Gameweek
    // completed that the track was never going to play.
    await openTheTrack(3);
    const script = answering(STAND_PAT);

    const runs = await schedule({
      at: "2026-08-28T12:00:00Z",
      http: script.http
    });

    expect(runs).toEqual([]);
    expect(script.calls()).toBe(0);
    const ledger = await client.query<{ count: number }>(
      "select count(*)::int as count from fpl_runs"
    );
    expect(ledger.rows).toEqual([{ count: 0 }]);
  });

  test("does not start a Gameweek whose Lock has already passed", async () => {
    await openTheTrack();
    const script = answering(STAND_PAT);

    // Polled after Gameweek 2's deadline, having never run it. Asking now
    // would spend ten calls on a Gameweek every one of whose answers is
    // already too late, and would record ten `deadline` attempts that say
    // only that the run was started too late to matter. Gameweek 3 is not due
    // for another fortnight, so the poll finds nothing at all.
    const runs = await schedule({
      at: "2026-08-28T18:00:00Z",
      http: script.http
    });

    expect(runs).toEqual([]);
    expect(script.calls()).toBe(0);
    const ledger = await client.query<{ count: number }>(
      "select count(*)::int as count from fpl_runs"
    );
    expect(ledger.rows).toEqual([{ count: 0 }]);
  });

  test("keeps an incomplete run open for the next poll to fill", async () => {
    await openTheTrack();
    const down = FPL_BASE_MODELS[0]!;

    // One provider fails and the rest of the roster plays. Nothing throws — a
    // that never answered is an Entrant that produced nothing, not a broken
    // run — so a rule that closed the ledger on a clean return would close
    // this Gameweek with a Gap in it, and no poll would ever ask again.
    const first = await schedule({
      at: "2026-08-28T11:30:00Z",
      http: async (_url, options) => {
        const { model } = JSON.parse(options?.body ?? "{}") as {
          model: string;
        };
        return model === down
          ? { status: 503, body: "provider unavailable" }
          : { status: 200, body: openRouterBody(STAND_PAT) };
      }
    });
    expect(first[0]!.outcome).toMatchObject({ missing: [seatId(down)] });

    const open = await client.query<{
      completed: boolean;
      last_error: string | null;
    }>(
      `select completed_at is not null as completed, last_error
         from fpl_runs where gw = 2`
    );
    expect(open.rows).toEqual([{ completed: false, last_error: null }]);

    // The next poll, still before the Lock, asks only the Entrant that
    // produced nothing — which is what a fill is, reached by re-running rather
    // than by a second scheduled trigger.
    const retry = answering(STAND_PAT);
    const second = await schedule({
      at: "2026-08-28T12:00:00Z",
      http: retry.http
    });

    expect(retry.calls()).toBe(1);
    expect(second[0]!.outcome).toMatchObject({
      played: [seatId(down)],
      missing: []
    });
    const closed = await client.query<{
      attempt_count: number;
      completed: boolean;
    }>(
      `select attempt_count, completed_at is not null as completed
         from fpl_runs where gw = 2`
    );
    expect(closed.rows).toEqual([{ attempt_count: 2, completed: true }]);
  });

  test("closes an incomplete run once its Lock has passed", async () => {
    await openTheTrack();
    await client.query(
      `insert into fpl_runs (season, gw, scheduled_for, started_at)
       values (
         '2026-27', 2, '2026-08-28T11:30:00Z', '2026-08-28T11:30:00Z'
       )`
    );
    const script = answering(STAND_PAT);

    // A run that started before the Lock and never completed is picked up
    // afterwards so the ledger closes rather than sitting open for ever. But
    // every answer it could collect would be refused by the Lock, so it spends
    // no calls collecting them: the Gameweek is decided, and what the Entrants
    // did is already in the attempts the first run recorded.
    const runs = await schedule({
      at: "2026-08-28T18:00:00Z",
      http: script.http
    });

    expect(runs).toEqual([{
      gameweek: 2,
      outcome: { kind: "locked", gameweek: 2 }
    }]);
    expect(script.calls()).toBe(0);
    const ledger = await client.query<{ gw: number; completed: boolean }>(
      `select gw, completed_at is not null as completed
         from fpl_runs order by gw`
    );
    expect(ledger.rows).toEqual([{ gw: 2, completed: true }]);
  });

  test("returns without running when another process holds the lock", async () => {
    await openTheTrack();
    const holder = new Client({
      connectionString: process.env.DATABASE_URL
    });
    await holder.connect();

    try {
      await holder.query("select pg_advisory_lock(8150529)");
      const script = answering(STAND_PAT);

      const runs = await schedule({
        at: "2026-08-28T11:30:00Z",
        http: script.http
      });

      expect(runs).toEqual([]);
      expect(script.calls()).toBe(0);
    } finally {
      await holder.query("select pg_advisory_unlock(8150529)");
      await holder.end();
    }
  });
});

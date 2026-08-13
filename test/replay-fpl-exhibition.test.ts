import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  FPL_PROMPT_VERSION,
  spliceManagerState
} from "../src/context/build-fpl-track-context.js";
import { replayFplExhibition } from "../src/exhibition/replay-fpl-exhibition.js";
import { loadManagerState } from "../src/fpl/manager-state-store.js";
import { runFplGameweek } from "../src/fpl/run-fpl-gameweek.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import { DEFAULT_HTTP_TIMEOUT_MS, type HttpFetcher } from "../src/http.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  type FixturePlayer
} from "./fpl-pool-fixture.js";
import { EVERYONE_PLAYED, storeSettledPoints } from "./fpl-points-fixture.js";
import { insertExhibition, resetSchema } from "./schema-fixture.js";
import { firstMessageText, type CapturedTurn as Turn } from "./sent-context.js";

const { Client } = pg;

const SEASON = "2026-27";
const EXHIBITION = "exhibition/late";
const EXHIBITION_BASE_MODEL = "vendor/late";

/** Long after every deadline the Season has — where an Exhibition Run lives. */
const AFTER_THE_SEASON = "2026-10-01T12:00:00Z";

const BASE_MODELS = Array.from(
  { length: SEASON_ROSTER_SIZE },
  (_unused, index) => `vendor/base-${index + 1}`
);

function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

const OPENING_SHEET = {
  starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
  bench: [2, 7, 12, 15],
  captain: 8,
  vice_captain: 13
};

/** The legal opening Squad: £95.5m spent, £4.5m left in the bank. */
const OPENING = JSON.stringify({
  transfers_in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfers_out: [],
  chip: null,
  team_sheet: OPENING_SHEET
});

/** The same Team Sheet again with no Transfer. */
const STAND_PAT = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: OPENING_SHEET
});

const TRANSFERRED_SHEET = {
  ...OPENING_SHEET,
  starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 19]
};

/**
 * Muniz out at £7.0m, Evanilson in at £6.0m: one Free Transfer, no Hit, and
 * £1.0m more in the bank. The two prices are the whole point — the Selling
 * Price comes from what its own carried state says it paid, and the purchase
 * price from the pool of the text it was shown.
 */
const TRANSFER = JSON.stringify({
  transfers_in: [19],
  transfers_out: [14],
  chip: null,
  team_sheet: TRANSFERRED_SHEET
});

/** The Team Sheet the Transfer leaves, played again with nothing done. */
const STAND_PAT_AFTER_TRANSFER = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: TRANSFERRED_SHEET
});

/**
 * Evanilson back out at Gameweek 3, where he is listed at £8.0m having been
 * bought for £6.0m, and Muniz back in at £7.0m.
 *
 * The sale is what tells the two possible rules apart. The Selling Price is
 * what this Exhibition Run paid plus half the rise — £7.0m — so the bank is
 * unmoved at £5.5m; a sale at the listed price would leave £6.5m. The purchase
 * price it is halved against is in its own carried state and nowhere else: the
 * roster never owned him.
 */
const SELL_BACK = JSON.stringify({
  transfers_in: [14],
  transfers_out: [19],
  chip: null,
  team_sheet: OPENING_SHEET
});

/** One rule broken and nothing else: the armband on a substitute. */
const CAPTAIN_ON_THE_BENCH = JSON.stringify({
  transfers_in: [],
  transfers_out: [],
  chip: null,
  team_sheet: { ...OPENING_SHEET, captain: 2 }
});

function openRouterBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
    openrouter_metadata: {
      endpoints: {
        available: [
          { provider: "vendor", model: EXHIBITION_BASE_MODEL, selected: true }
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

/** Answers each Base Model's calls from its own script, in order. */
function scripted(
  responses: string[]
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
      const response = responses[already];
      if (response === undefined) {
        throw new Error(
          `${model} was called ${already + 1} times, but only `
          + `${responses.length} responses were scripted for it`
        );
      }
      return { status: 200, body: openRouterBody(response) };
    }
  };
}

describe("replaying the FPL track as an Exhibition Run", () => {
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
    await insertExhibition(client, {
      id: EXHIBITION,
      baseModel: EXHIBITION_BASE_MODEL,
      promptVersion: FPL_PROMPT_VERSION
    });
    for (const gameweek of [1, 2, 3]) {
      await lockPool(gameweek, [...FPL_POOL, ...FPL_POOL_ALTERNATES]);
    }
    // Evanilson is £6.0m when he is bought at Gameweek 2 and £8.0m when he is
    // sold at Gameweek 3, so a sale has a rise to halve.
    await client.query(
      "update fpl_players set price_tenths = 80 where gw = 3 and fpl_id = 19"
    );
  });

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
   * The real track: nine seats opened at Gameweek 1 and carried through 2 and
   * 3, each Gameweek settling behind them. This is what an Exhibition arrives
   * to — the donor bodies and the Gameweeks that have settled are the record it
   * replays against, and seeding them by hand would be a second opinion about
   * what a played Gameweek leaves behind.
   */
  async function playTheSeason(through = 3): Promise<void> {
    const opening = await startFplTrack({
      database: client,
      season: SEASON,
      gameweek: 1,
      concurrency: 3,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: scripted([OPENING]).http
    });
    expect(opening.missing).toEqual([]);
    await storeSettledPoints(client, 1, EVERYONE_PLAYED);

    for (const gameweek of [2, 3].filter((gw) => gw <= through)) {
      const run = await runFplGameweek({
        database: client,
        season: SEASON,
        gameweek,
        concurrency: 3,
        apiKey: "test-key",
        entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
        now: () => new Date(`2026-0${gameweek === 2 ? 8 : 9}-01T11:30:00Z`),
        http: scripted([STAND_PAT]).http
      });
      expect(run).toMatchObject({ missing: [] });
      await storeSettledPoints(client, gameweek, EVERYONE_PLAYED);
    }
  }

  async function replay({
    responses,
    http
  }: {
    responses?: string[];
    http?: HttpFetcher;
  } = {}): Promise<{ covered: number[]; calls: Call[] }> {
    const script = scripted(responses ?? []);
    const covered = await replayFplExhibition({
      database: client,
      season: SEASON,
      exhibitionModelId: EXHIBITION,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      now: () => new Date(AFTER_THE_SEASON),
      http: http ?? script.http
    });
    return { covered, calls: script.calls };
  }

  async function bodyOf(modelId: string, gameweek: number): Promise<string> {
    const stored = await client.query<{ body: string; hash: string }>(
      `select body, hash from contexts
        where season = $1 and gw = $2 and track = 'fpl' and model_id = $3`,
      [SEASON, gameweek, modelId]
    );
    const [row] = stored.rows;
    expect(row).toBeDefined();
    // Hashed like every other context row, so what the Exhibition Run saw is
    // verifiable rather than merely stored.
    expect(row!.hash)
      .toBe(createHash("sha256").update(row!.body).digest("hex"));
    return row!.body;
  }

  test("plays the season path from the opening, on its own Manager State", async () => {
    await playTheSeason();
    // Evanilson rises to £13.0m after Gameweek 2's contexts were stored. The
    // Transfer below still pays £6.0m, because the pipeline prices an action
    // from the text on record rather than from a snapshot that has moved.
    await client.query(
      "update fpl_players set price_tenths = 130 where gw = 2 and fpl_id = 19"
    );

    const { covered, calls } = await replay({
      responses: [OPENING, TRANSFER, SELL_BACK]
    });

    expect(covered).toEqual([1, 2, 3]);
    expect(calls.map(({ baseModel }) => baseModel))
      .toEqual(Array.from({ length: 3 }, () => EXHIBITION_BASE_MODEL));

    // The chain carries the bank two Transfers moved: £4.5m at the opening,
    // £5.5m once £7.0m of Muniz is sold to buy £6.0m of Evanilson, and £5.5m
    // again when Evanilson goes back out. He is listed at £8.0m by then, and
    // what comes back is the £6.0m it paid plus half the rise — so a
    // sale priced from the pool instead would leave £6.5m here. Neither
    // Transfer takes a Hit.
    const chain = await client.query<{
      gw: number;
      bank: number;
      hits: number;
    }>(
      `select gw, bank, hits from manager_states
        where model_id = $1 order by gw`,
      [EXHIBITION]
    );
    expect(chain.rows).toEqual([
      { gw: 1, bank: 45, hits: 0 },
      { gw: 2, bank: 55, hits: 0 },
      { gw: 3, bank: 55, hits: 0 }
    ]);

    // Gameweek 3's body is the lowest-id Entrant's own frozen text with one
    // block replaced: every shared section is the donor's, byte for byte, and
    // the Manager State is what its own Gameweek 2 left behind.
    const donor = await bodyOf(seatId(BASE_MODELS[0]!), 3);
    const afterTwo = await loadManagerState(client, {
      entrantId: EXHIBITION,
      season: SEASON,
      gameweek: 2
    });
    const shown = await bodyOf(EXHIBITION, 3);
    expect(shown).toBe(spliceManagerState(donor, afterTwo!));
    // The purchase price it paid, beside the one the roster is still carrying.
    expect(shown).toContain("- 19 | bought for £6.0m");
    expect(donor).toContain("- 14 | bought for £7.0m");
  });

  test("refuses a Season whose FPL track never started", async () => {
    let calls = 0;
    await expect(replay({
      http: async () => {
        calls += 1;
        throw new Error("HTTP must not run");
      }
    })).rejects.toThrow(
      `the FPL track for ${SEASON} never started, so there is nothing for `
      + `${EXHIBITION} to replay`
    );
    expect(calls).toBe(0);
  });

  test("refuses to run beside another FPL replay", async () => {
    await playTheSeason();
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    let calls = 0;
    try {
      // Two of these would splice the same donor onto the same standing state
      // and pay for the same call. The second refuses rather than returning
      // quietly, so an operator who started one twice is told.
      await other.query("select pg_advisory_lock(8150531)");

      await expect(replay({
        http: async () => {
          calls += 1;
          throw new Error("HTTP must not run");
        }
      })).rejects.toThrow(
        "Another FPL Exhibition replay is running; this one would pay for the "
        + "same calls twice"
      );
    } finally {
      await other.end();
    }

    expect(calls).toBe(0);
    const stored = await client.query<{ count: number }>(
      "select count(*)::int as count from manager_states where model_id = $1",
      [EXHIBITION]
    );
    expect(stored.rows).toEqual([{ count: 0 }]);
  });

  test("refuses a row that is not at the FPL Prompt Version", async () => {
    await playTheSeason();
    await client.query(
      "update models set prompt_version = $1 where id = $2",
      [MATCH_PROMPT_VERSION, EXHIBITION]
    );

    await expect(replay()).rejects.toThrow(
      `${EXHIBITION} is at Prompt Version ${MATCH_PROMPT_VERSION}, not `
      + FPL_PROMPT_VERSION
    );
  });

  test("stops at the last Settled Gameweek and resumes rather than repeating", async () => {
    await playTheSeason();
    // Gameweek 3 was played by the roster but its points were never stored, so
    // it has not settled and the replay stops in front of it.
    await client.query("delete from fpl_player_points where gw = 3");

    const first = await replay({ responses: [OPENING, TRANSFER] });
    expect(first.covered).toEqual([1, 2]);

    // A second run makes no call at all: every Gameweek on the chain is a
    // decision already taken, and `manager_states` refuses an update in any
    // case.
    const again = await replay({ responses: [] });
    expect(again.covered).toEqual([1, 2]);
    expect(again.calls).toEqual([]);
  });

  test("consumes its Repairs and Rolls Over on a still-illegal action", async () => {
    await playTheSeason();

    const { covered } = await replay({
      responses: [
        OPENING,
        ...Array.from({ length: 4 }, () => CAPTAIN_ON_THE_BENCH),
        STAND_PAT
      ]
    });

    expect(covered).toEqual([1, 2, 3]);
    const rolled = await client.query<{
      gw: number;
      rolled_over: boolean;
      attempts_used: number;
    }>(
      `select gw, rolled_over, attempts_used from manager_states
        where model_id = $1 order by gw`,
      [EXHIBITION]
    );
    expect(rolled.rows).toEqual([
      { gw: 1, rolled_over: false, attempts_used: 0 },
      { gw: 2, rolled_over: true, attempts_used: 3 },
      { gw: 3, rolled_over: false, attempts_used: 0 }
    ]);
  });

  test("never Rolls Over an opening onto an empty Squad", async () => {
    await playTheSeason();

    // Four invalid answers at the Gameweek the track opened at. There is no
    // Team Sheet standing to Roll Over onto, and storing the empty Squad
    // instead would leave the Exhibition Run with no players for the whole
    // `manager_states` is insert-only, so there would be no way back.
    const { covered } = await replay({
      responses: Array.from({ length: 4 }, () => CAPTAIN_ON_THE_BENCH)
    });

    expect(covered).toEqual([]);
    const stored = await client.query<{ count: number }>(
      "select count(*)::int as count from manager_states where model_id = $1",
      [EXHIBITION]
    );
    expect(stored.rows).toEqual([{ count: 0 }]);

    // The four attempts stay on record, and the next run asks again.
    const asked = await client.query<{ count: number }>(
      "select count(*)::int as count from attempts where model_id = $1",
      [EXHIBITION]
    );
    expect(asked.rows).toEqual([{ count: 4 }]);
    const resumed = await replay({
      responses: [OPENING, TRANSFER, STAND_PAT_AFTER_TRANSFER]
    });
    expect(resumed.covered).toEqual([1, 2, 3]);
  });

  test("stops the chain at a Gameweek that produced nothing", async () => {
    await playTheSeason();
    let calls = 0;

    // The provider fails at Gameweek 2. The chain never skips: Gameweek 3 is
    // not attempted, because reaching it would mean inventing the Manager
    // State Gameweek 2 never produced.
    const { covered } = await replay({
      http: async (_url, options) => {
        calls += 1;
        const { messages } = JSON.parse(options?.body ?? "{}") as {
          messages: Turn[];
        };
        return firstMessageText(messages)
          .startsWith(`Fantasy Premier League — ${SEASON} Gameweek 1\n`)
          ? { status: 200, body: openRouterBody(OPENING) }
          : { status: 503, body: "provider unavailable" };
      }
    });

    expect(covered).toEqual([1]);
    expect(calls).toBe(2);
    const stored = await client.query<{ gw: number }>(
      "select gw from contexts where model_id = $1 order by gw",
      [EXHIBITION]
    );
    expect(stored.rows).toEqual([{ gw: 1 }, { gw: 2 }]);

    // And the next run picks the chain up where this one left it.
    const resumed = await replay({
      responses: [TRANSFER, STAND_PAT_AFTER_TRANSFER]
    });
    expect(resumed.covered).toEqual([1, 2, 3]);
  });

  test("refuses a Settled Gameweek that holds no Entrant context", async () => {
    await playTheSeason();
    await client.query("delete from contexts where gw = 2");

    await expect(replay({ responses: [OPENING] })).rejects.toThrow(
      `Gameweek 2 of ${SEASON} has settled but holds no Entrant FPL context `
      + "to replay from"
    );
  });

  test("records its calls as the manual run they are", async () => {
    await playTheSeason();

    await replay({ responses: [OPENING, TRANSFER, SELL_BACK] });

    // An Exhibition Run is operator-triggered and nothing about it recurs
    // (spec 0013). The roster's own calls are still the scheduled run, so the
    // ledger tells the two apart without a marker beside `models.role`.
    const ledger = await client.query<{
      exhibition: boolean;
      trigger: string;
    }>(
      `select distinct model_id = $1 as exhibition, trigger
         from attempts where track = 'fpl'
        order by 1`,
      [EXHIBITION]
    );
    expect(ledger.rows).toEqual([
      { exhibition: false, trigger: "main" },
      { exhibition: true, trigger: "manual" }
    ]);
  });

  test("answers after every deadline, which no Lock refuses", async () => {
    await playTheSeason();

    await replay({ responses: [OPENING, TRANSFER, SELL_BACK] });

    const refused = await client.query<{ count: number }>(
      `select count(*)::int as count from attempts
        where model_id = $1 and error_kind = 'deadline'`,
      [EXHIBITION]
    );
    expect(refused.rows).toEqual([{ count: 0 }]);
    // What labels the run is the stored timestamp, which post-dates every
    // deadline it covers (ADR-0032).
    const late = await client.query<{ count: number }>(
      `select count(*)::int as count
         from manager_states s
         join gameweeks g on g.season = s.season and g.gw = s.gw
        where s.model_id = $1 and s.predicted_at <= g.deadline_at`,
      [EXHIBITION]
    );
    expect(late.rows).toEqual([{ count: 0 }]);
  });
});

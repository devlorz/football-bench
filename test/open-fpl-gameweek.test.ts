import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { openFplGameweek } from "../src/fpl/open-fpl-gameweek.js";
import { storeManagerState } from "../src/fpl/manager-state-store.js";
import { parseFplTrackContextPool } from "../src/context/build-fpl-track-context.js";
import {
  ENFORCED_VIOLATIONS,
  GAMEWEEK_RULES
} from "../src/fpl/apply-gameweek-action.js";
import {
  gameweekRepairMessage,
  GAMEWEEK_ACTION_SCHEMA_MESSAGE
} from "../src/fpl/validate-gameweek-action.js";
import { DEFAULT_HTTP_TIMEOUT_MS, type HttpFetcher } from "../src/http.js";
import {
  FPL_POOL, FPL_POOL_ALTERNATES, lockPool
} from "./fpl-pool-fixture.js";
import {
  OPENING_ACTION,
  SELL_WILSON_BUY_EVANILSON
} from "./fpl-action-fixture.js";
import { storePlayerPoints } from "./fpl-points-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import { storedState } from "./fpl-state-fixture.js";
import {
  firstMessageText,
  type CapturedTurn as Turn
} from "./sent-context.js";

const { Client } = pg;

/**
 * The Team Sheet the standing Squad already plays, named again with no
 * Transfer: what a later Gameweek's inaction is, and the legal action every
 * test here that is not about an action itself uses.
 *
 * There is no opening action in this file any more. An opening is committed
 * for all nine Entrants at once or for none of them, which is
 * `startFplTrack`'s job and `test/start-fpl-track.test.ts`'s subject; what
 * `openFplGameweek` plays is always a Gameweek with a Squad already standing.
 */
const STAND_PAT = JSON.stringify({
  transfers_in: [],
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
 * The one legal Transfer these tests price: Wilson out and Evanilson in, both
 * £6.0m at their opening prices, with Evanilson taking the bench place Wilson
 * leaves. What is being proved by it is always the body the price came off,
 * so the action itself is written once.
 */
const SELL_WILSON_BUY_EVANILSON_JSON = JSON.stringify({
  transfers_in: [19],
  transfers_out: [15],
  chip: null,
  team_sheet: {
    ...(JSON.parse(STAND_PAT) as { team_sheet: { bench: number[] } })
      .team_sheet,
    bench: [2, 7, 12, 19]
  }
});

/**
 * The same action with the armband on a substitute. One rule broken and only
 * one, so what the Entrant is sent back is a sentence about captaincy rather
 * than whichever other rule a changed Squad happened to break as well.
 */
const CAPTAIN_ON_THE_BENCH = JSON.stringify({
  ...JSON.parse(STAND_PAT) as object,
  team_sheet: {
    ...(JSON.parse(STAND_PAT) as { team_sheet: object }).team_sheet,
    captain: 2
  }
});

/**
 * Enzo out for Fernandez: £9.0m received against £17.0m spent, which £4.5m in
 * the bank cannot cover. Position for position and club for club, so the only
 * rule it breaks is the budget — and it is a real Squad change, so a Manager
 * State that kept any part of it would show.
 */
const OVER_BUDGET_FERNANDEZ = JSON.stringify({
  transfers_in: [16],
  transfers_out: [9],
  chip: null,
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 16, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    vice_captain: 13
  }
});

/**
 * A Free Hit with nothing to spend it on. Every Squad and Team Sheet rule is
 * satisfied and no Transfer is made, so whether the action stands is a
 * question about the Chip and about nothing else.
 */
const IDLE_FREE_HIT = JSON.stringify({
  ...JSON.parse(STAND_PAT) as object,
  chip: "free_hit"
});

/**
 * Timber, Enzo and Wilson out for White, Caicedo and Evanilson under a Free
 * Hit: fifteen different players borrowed for one Gameweek, so the Gameweek
 * after it either gives the permanent Squad back or visibly does not.
 */
const FREE_HIT_REBUILD = JSON.stringify({
  transfers_in: [17, 18, 19],
  transfers_out: [4, 9, 15],
  chip: "free_hit",
  team_sheet: {
    starters: [1, 3, 17, 5, 6, 8, 18, 10, 11, 13, 14],
    bench: [2, 7, 12, 19],
    captain: 8,
    vice_captain: 13
  }
});

const CAPTAIN_NOT_STARTING =
  "A Team Sheet's captain and vice-captain must both be among the eleven "
  + "starters.";

function openRouterBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
    openrouter_metadata: {
      endpoints: {
        available: [
          { provider: "azure", model: "openai/gpt-5.2", selected: false },
          { provider: "openai", model: "openai/gpt-5.2-2026-05", selected: true }
        ]
      }
    },
    usage: { prompt_tokens: 4096, completion_tokens: 256 }
  });
}

/**
 * A refusal as OpenRouter actually returns one: no content, a reason, and the
 * endpoint and usage of a call that was made and billed all the same.
 */
const REFUSED = JSON.stringify({
  choices: [{ message: { content: null, refusal: "I will not." } }],
  openrouter_metadata: {
    endpoints: {
      available: [
        { provider: "openai", model: "openai/gpt-5.2-2026-05", selected: true }
      ]
    }
  },
  usage: { prompt_tokens: 4096, completion_tokens: 12 }
});

/**
 * Answers each call with the next scripted response and records the whole
 * conversation the Entrant was sent, which is where a Repair either carries
 * the reason it was given or silently loses it.
 */
function scripted(responses: string[]): {
  http: HttpFetcher;
  conversations: Turn[][];
} {
  const conversations: Turn[][] = [];
  return {
    conversations,
    http: async (_url, options) => {
      const { messages } = JSON.parse(options?.body ?? "{}") as {
        messages: Turn[];
      };
      conversations.push(messages);
      const response = responses[conversations.length - 1];
      if (response === undefined) {
        throw new Error(
          `the Entrant was called ${conversations.length} times, `
          + `but only ${responses.length} responses were scripted`
        );
      }
      return { status: 200, body: openRouterBody(response) };
    }
  };
}

describe("opening the FPL track for a Gameweek", () => {
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
         gameweeks, fpl_players, historical_matches
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    await lockPool(client, 1, FPL_POOL);
    await lockPool(client, 2, FPL_POOL);
  });

  /**
   * Stores a Manager State for an Entrant at a Gameweek, putting it on the
   * fixture Squad without playing for it. It writes a row — the name says so,
   * because a test that reads as though it were asking a question would hide
   * the one piece of setup every test in this file depends on.
   *
   * The track opens for all nine Entrants at once or for none, so an opening
   * cannot be reached one Entrant at a time from here — and every test in this
   * file is about a Gameweek *after* the opening anyway. Seeding the row
   * directly says so, and says it in one line rather than in a scripted
   * conversation whose only purpose is to leave a Squad behind.
   *
   * The state comes from the reducer over the shared opening fixture, so what
   * is stood on here is the state the reducer's own rules were proved against.
   */
  async function seedStandingManagerState(
    gameweek = 1,
    entrantId = "entrant/v1"
  ): Promise<void> {
    await storeManagerState(client, {
      entrantId,
      season: "2026-27",
      gameweek,
      state: legalStateFrom(OPENING_ACTION),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-21T11:30:00Z")
    });
  }

  /**
   * One Entrant's Gameweek, answered by the scripted responses in order, and
   * the conversations it was sent back — which is where a Repair either
   * carries the reason it was given or silently loses it.
   *
   * The defaults are the Gameweek after the opening: Gameweek 2, the one
   * Entrant, and a clock comfortably inside its deadline. A test names only
   * what it is about, and reaches for `http` or `now` only where the failure
   * it is describing is one a scripted response and a still clock cannot
   * express.
   */
  async function play({
    gameweek = 2,
    entrantId = "entrant/v1",
    at = "2026-08-28T11:30:00Z",
    responses = [],
    entrantCallTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
    http,
    now
  }: {
    gameweek?: number;
    entrantId?: string;
    at?: string;
    responses?: string[];
    entrantCallTimeoutMs?: number;
    http?: HttpFetcher;
    now?: () => Date;
  }): Promise<Turn[][]> {
    const script = scripted(responses);
    await openFplGameweek({
      database: client,
      season: "2026-27",
      gameweek,
      entrantId,
      apiKey: "test-key",
      now: now ?? (() => new Date(at)),
      http: http ?? script.http,
      entrantCallTimeoutMs
    });
    return script.conversations;
  }

  test("hands the Entrant the stored context and keeps the state it produces", async () => {
    await seedStandingManagerState();
    const [played] = await play({ responses: [STAND_PAT] });
    const prompt = firstMessageText(played!);

    const contexts = await client.query(
      "select track, fixture_id, hash, body from contexts"
    );
    expect(contexts.rows).toHaveLength(1);
    const [context] = contexts.rows as Array<{
      track: string;
      fixture_id: number | null;
      hash: string;
      body: string;
    }>;
    expect(context).toMatchObject({ track: "fpl", fixture_id: null });
    // What the Entrant saw is what was stored, and the hash proves it.
    expect(prompt).toBe(context!.body);
    expect(context!.hash).toBe(
      createHash("sha256").update(context!.body).digest("hex")
    );
    // The context carries the Entrant's own state and the locked pool, with
    // each player pinned on one line the reducer can price from.
    expect(context!.body).toContain("£100.0m");
    expect(context!.body).toContain(
      '{"id":8,"name":"Palmer","club":"Chelsea","position":"MID",'
      + '"price":"£12.0m","price_tenths":120,"status":"available"}'
    );
    // Every rule the reducer can refuse an action for is stated in the text
    // the Entrant was handed, including the two that reach past the Squad
    // itself.
    expect(context!.body).toContain(
      "Every player must be in this Gameweek's player pool."
    );
    expect(context!.body).toContain(
      "A Transfer can only sell a player your Squad owns."
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

    const states = await client.query(
      `select model_id, season, gw, squad, team_sheet, bank, free_transfers,
              hits, chips_used, chip_active, rolled_over, attempts_used
         from manager_states
        where gw = 2`
    );
    expect(states.rows).toEqual([storedState({
      model_id: "entrant/v1",
      season: "2026-27",
      gw: 2,
      // The Squad, its purchase prices, the Team Sheet and the bank all carried
      // forward whole; the one Free Transfer this Gameweek granted banked on
      // top of the one already standing is the only thing that moved.
      free_transfers: 2
    })]);
  });

  test("refuses a Gameweek for an Entrant that has never opened", async () => {
    // The bypass this refusal closes: seeding one Entrant from the empty Squad
    // here would store the earliest Manager State the Season has, which is by
    // definition the Gameweek the track started at — for one Entrant of nine,
    // permanently, because `manager_states` is insert-only. An opening is
    // `startFplTrack`'s and is committed for all nine or for none.
    let called = 0;
    await expect(play({
      responses: [STAND_PAT],
      http: async () => {
        called += 1;
        return { status: 200, body: openRouterBody(STAND_PAT) };
      }
    })).rejects.toThrow(
      "entrant/v1 has no Manager State to carry into Gameweek 2 of 2026-27; "
      + "the FPL track opens through startFplTrack"
    );

    expect(called).toBe(0);
    const states = await client.query("select gw from manager_states");
    expect(states.rows).toEqual([]);
    const contexts = await client.query("select track from contexts");
    expect(contexts.rows).toEqual([]);
  });

  test("sends an illegal action back with its reason and keeps the Repair", async () => {
    await seedStandingManagerState();
    const conversations = await play({
      responses: [CAPTAIN_ON_THE_BENCH, STAND_PAT]
    });

    // The Repair is asked for in the same conversation, not in a fresh one:
    // an Entrant handed its own rejected action and the reason it failed is
    // being measured on self-correction (ADR-0004), which is the whole point
    // of the loop. Starting over would measure a second first attempt.
    expect(conversations).toHaveLength(2);
    // Spelt out rather than copied from the first call, so the Repair is held
    // to the whole envelope: the first message carries its one cache
    // breakpoint (spec 0010) and is byte-identical to the one already sent —
    // a prefix that moved between turns is a prefix no provider can discount
    // — and the turns appended to it carry no breakpoint of their own.
    const opening = {
      role: "user",
      content: [{
        type: "text",
        text: firstMessageText(conversations[0]!),
        cache_control: { type: "ephemeral" }
      }]
    };
    expect(conversations[0]![0]).toEqual(opening);
    expect(conversations[1]).toEqual([
      opening,
      { role: "assistant", content: CAPTAIN_ON_THE_BENCH },
      { role: "user", content: gameweekRepairMessage(CAPTAIN_NOT_STARTING) }
    ]);

    const states = await client.query(
      "select attempts_used, rolled_over from manager_states"
    );
    expect(states.rows)
      .toEqual([{ attempts_used: 0, rolled_over: false },
        { attempts_used: 1, rolled_over: false }]);
  });

  test.for([0, 1, 2, 3])(
    "reaches a legal action on Repair %i and records that it took that many",
    async (repairs) => {
      // The three allowed Repairs, each exercised at the count it succeeds on.
      // Attempts-to-legal is the graded observation ADR-0004 exists to
      // produce — 0/1/2/3 or failed — so every value on the scale is driven
      // through the seam rather than assumed to follow from the one below it.
      await seedStandingManagerState();
      await play({
        responses: [
          ...Array.from({ length: repairs }, () => CAPTAIN_ON_THE_BENCH),
          STAND_PAT
        ]
      });

      const states = await client.query(
        "select attempts_used, rolled_over from manager_states where gw = 2"
      );
      expect(states.rows)
        .toEqual([{ attempts_used: repairs, rolled_over: false }]);
      const attempts = await client.query<{ count: string }>(
        "select count(*) as count from attempts"
      );
      // One row for the initial response and one for each Repair.
      expect(attempts.rows[0]!.count).toBe(String(repairs + 1));
    }
  );

  test("sends back nothing but the frozen vocabulary, whatever went wrong", async () => {
    // ADR-0004 makes the messages part of the experiment: an Entrant told
    // something more specific mid-Season is being measured on an easier task.
    // Freezing the sentences is only half of that — this is the other half,
    // that the loop quotes them rather than composing its own.
    await seedStandingManagerState();
    await lockPool(client, 2, FPL_POOL_ALTERNATES);
    const conversations = await play({
      responses: [
        "not JSON at all",
        CAPTAIN_ON_THE_BENCH,
        OVER_BUDGET_FERNANDEZ,
        STAND_PAT
      ]
    });

    const frozen = new Set([
      ...ENFORCED_VIOLATIONS.map(({ message }) => message),
      GAMEWEEK_ACTION_SCHEMA_MESSAGE
    ]);
    const asked = conversations.at(-1)!
      .slice(1)
      .filter(({ role }) => role === "user")
      .map(({ content }) => content);
    expect(asked).toHaveLength(3);
    for (const message of asked) {
      expect([...frozen].map(gameweekRepairMessage)).toContain(message);
    }
    // And the three reasons really were three different ones, so this is not
    // one sentence proved three times.
    expect(new Set(asked).size).toBe(3);
  });

  test("records every attempt with what it cost and why it was refused", async () => {
    // ADR-0004 makes Repairs the sharpest signal this track produces, and the
    // typed kind is what a violation profile is later counted from. An attempt
    // that leaves no row is an attempt that never happened.
    // Each call takes a quarter of an hour of the Gameweek, all of it before
    // the deadline: two readings per attempt, so latency is measured rather
    // than assumed to be nothing.
    const clock = [
      "2026-08-21T11:00:00Z", "2026-08-21T11:15:00Z",
      "2026-08-21T11:30:00Z", "2026-08-21T11:45:00Z",
      "2026-08-21T12:00:00Z", "2026-08-21T12:15:00Z"
    ].map((at) => new Date(at));
    let read = 0;
    await seedStandingManagerState();
    await play({
      responses: [
        "sorry, I cannot pick a Squad",
        CAPTAIN_ON_THE_BENCH,
        STAND_PAT
      ],
      now: () => {
        const at = clock[read];
        read += 1;
        if (at === undefined) {
          throw new Error(`the clock was read ${read} times, more than scripted`);
        }
        return at;
      }
    });

    const attempts = await client.query(
      `select model_id, season, gw, track, fixture_id, attempt_no, ok, error_kind,
              error_detail, resolved_provider, resolved_model, latency_ms,
              tokens_in, tokens_out, trigger, attempted_at
         from attempts
        order by attempt_no`
    );
    expect(attempts.rows).toEqual([
      {
        model_id: "entrant/v1",
        season: "2026-27",
        gw: 2,
        track: "fpl",
        // An FPL action is one Gameweek's, not one Fixture's.
        fixture_id: null,
        attempt_no: 0,
        ok: false,
        // Not a rule of the game broken — no action was returned at all.
        error_kind: "schema",
        error_detail: "Response must be JSON matching the Gameweek action schema.",
        resolved_provider: "openai",
        resolved_model: "openai/gpt-5.2-2026-05",
        latency_ms: 900_000,
        tokens_in: 4096,
        tokens_out: 256,
        trigger: "main",
        attempted_at: new Date("2026-08-21T11:15:00Z")
      },
      {
        model_id: "entrant/v1",
        season: "2026-27",
        gw: 2,
        track: "fpl",
        fixture_id: null,
        attempt_no: 1,
        ok: false,
        error_kind: "captain",
        error_detail: CAPTAIN_NOT_STARTING,
        resolved_provider: "openai",
        resolved_model: "openai/gpt-5.2-2026-05",
        latency_ms: 900_000,
        tokens_in: 4096,
        tokens_out: 256,
        trigger: "main",
        attempted_at: new Date("2026-08-21T11:45:00Z")
      },
      {
        model_id: "entrant/v1",
        season: "2026-27",
        gw: 2,
        track: "fpl",
        fixture_id: null,
        attempt_no: 2,
        ok: true,
        error_kind: null,
        error_detail: null,
        resolved_provider: "openai",
        resolved_model: "openai/gpt-5.2-2026-05",
        latency_ms: 900_000,
        tokens_in: 4096,
        tokens_out: 256,
        trigger: "main",
        attempted_at: new Date("2026-08-21T12:15:00Z")
      }
    ]);

    // The raw response is kept whole, not just the sentence read out of it.
    const raw = await client.query<{ raw_response: string }>(
      "select raw_response from attempts order by attempt_no limit 1"
    );
    expect(raw.rows[0]!.raw_response)
      .toBe(openRouterBody("sorry, I cannot pick a Squad"));

    const states = await client.query(
      "select attempts_used from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([{ attempts_used: 2 }]);
  });

  test("stores no Manager State for an action completed on the deadline", async () => {
    await seedStandingManagerState();
    await play({
      responses: [STAND_PAT],
      // The Lock is the deadline instant itself, not the moment after it.
      at: "2026-08-28T17:30:00Z"
    });

    const states = await client.query(
      "select model_id from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([]);
    // The context is built before any action, so it is stored either way.
    const contexts = await client.query("select track from contexts");
    expect(contexts.rows).toEqual([{ track: "fpl" }]);
    // The attempt happened and is recorded, but the Lock — not the rules —
    // is what refused it. Recording it as a legal action would say a Manager
    // State should exist, and recording it as a violation would put a
    // punctuality failure into the profile of how a Squad is managed.
    const attempts = await client.query(
      "select attempt_no, ok, error_kind, error_detail from attempts"
    );
    expect(attempts.rows).toEqual([{
      attempt_no: 0,
      ok: false,
      error_kind: "deadline",
      error_detail: "The Lock passed at 2026-08-28T17:30:00.000Z."
    }]);
  });

  test("Rolls the Gameweek over when the third Repair is still illegal", async () => {
    // Fernandez is in the second Gameweek's pool, which is what lets the
    // rejected action be a real Squad change rather than a malformed one.
    await lockPool(client, 2, FPL_POOL_ALTERNATES);
    await seedStandingManagerState();
    // Four responses, all the same illegal action: the initial one and three
    // Repairs. Nothing after the fourth is scripted, so a fifth call fails the
    // test rather than passing silently.
    await play({
      responses: Array.from({ length: 4 }, () => OVER_BUDGET_FERNANDEZ)
    });

    const states = await client.query(
      `select gw, squad, team_sheet, bank, free_transfers, hits, chips_used,
              chip_active, rolled_over, attempts_used
         from manager_states
        order by gw`
    );
    const [standingOn, rolled] = states.rows as Array<Record<string, unknown>>;
    expect(rolled).toEqual({
      gw: 2,
      // Not one player of the rejected action, and not one penny of it: the
      // action is discarded whole (ADR-0004), Fernandez was never bought and
      // Enzo was never sold.
      squad: standingOn!.squad,
      team_sheet: standingOn!.team_sheet,
      bank: 45,
      // Accrued exactly as an untouched Gameweek's would be.
      free_transfers: 2,
      hits: 0,
      chips_used: { firstHalf: [], secondHalf: [] },
      chip_active: null,
      rolled_over: true,
      // All three Repairs were used, and `rolled_over` is what says they
      // failed — the fifth value on ADR-0004's scale.
      attempts_used: 3
    });

    const attempts = await client.query(
      `select attempt_no, ok, error_kind
         from attempts
        where gw = 2
        order by attempt_no`
    );
    expect(attempts.rows).toEqual([0, 1, 2, 3].map((attempt_no) => ({
      attempt_no,
      ok: false,
      error_kind: "budget"
    })));
  });

  test.for([
    {
      what: "a provider that answered with an error",
      http: (async () => ({ status: 500, body: "upstream exploded" })) as HttpFetcher,
      kind: "provider",
      detail: "OpenRouter returned HTTP 500.",
      raw: "upstream exploded",
      // Nothing was resolved and nothing was counted, and a zero would
      // say otherwise.
      resolvedProvider: null,
      tokensIn: null
    },
    {
      what: "a provider that rate-limited the call",
      http: (async () => ({ status: 429, body: "slow down" })) as HttpFetcher,
      kind: "rate_limit",
      detail: "OpenRouter returned HTTP 429.",
      raw: "slow down",
      // Nothing was resolved and nothing was counted, and a zero would
      // say otherwise.
      resolvedProvider: null,
      tokensIn: null
    },
    {
      what: "a call that timed out",
      http: (async () => {
        const error = new Error("the request took too long");
        error.name = "TimeoutError";
        throw error;
      }) as HttpFetcher,
      kind: "timeout",
      detail: "OpenRouter call failed: the request took too long.",
      raw: null,
      // Nothing was resolved and nothing was counted, and a zero would
      // say otherwise.
      resolvedProvider: null,
      tokensIn: null
    },
    {
      what: "a Base Model that refused to answer",
      http: (async () => ({ status: 200, body: REFUSED })) as HttpFetcher,
      kind: "refusal",
      detail: "I will not.",
      raw: REFUSED,
      // A refusal is a call that was made, resolved and billed. Its telemetry
      // exists and is what the per-call cost is measured from, so recording it
      // as unknown would lose the very numbers spec 0003 says to read the FPL
      // track's cost from after the first Gameweek.
      resolvedProvider: "openai",
      tokensIn: 4096
    },
    {
      what: "a response of a shape nothing can read",
      http: (async () => ({ status: 200, body: "{}" })) as HttpFetcher,
      kind: "provider",
      detail: "OpenRouter returned an unexpected response shape.",
      raw: "{}",
      resolvedProvider: null,
      tokensIn: null
    }
  ])("records $what and asks for no Repair", async (scenario) => {
    // A provider failure is not an illegal action: the Entrant never answered,
    // so there is nothing to send back and nothing to correct. The attempt is
    // recorded — every attempt is — and the loop stops, leaving no Manager
    // State rather than a Roll Over the Entrant never earned.
    await seedStandingManagerState();
    await play({ http: scenario.http });

    const attempts = await client.query(
      `select attempt_no, ok, error_kind, error_detail, raw_response,
              resolved_provider, tokens_in
         from attempts`
    );
    expect(attempts.rows).toEqual([{
      attempt_no: 0,
      ok: false,
      error_kind: scenario.kind,
      error_detail: scenario.detail,
      raw_response: scenario.raw,
      resolved_provider: scenario.resolvedProvider,
      tokens_in: scenario.tokensIn
    }]);
    const states = await client.query(
      "select gw from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([]);
  });

  test.for([1, 2])(
    "banks the Free Transfer each of %i silent Gameweeks granted",
    async (silent) => {
      // Two counts, not one: a fold that ran once however long the silence
      // lasted would be right for a single Gameweek and wrong for every longer
      // gap, and one case cannot tell those apart.
      const resumes = silent + 2;
      for (let gameweek = 3; gameweek <= resumes; gameweek += 1) {
        await client.query(
          `insert into gameweeks (season, gw, deadline_at)
           values ('2026-27', $1, $2)`,
          [
            gameweek,
            new Date(
              Date.parse("2026-08-21T17:30:00Z")
              + (gameweek - 1) * 7 * 24 * 60 * 60 * 1000
            )
          ]
        );
        await lockPool(client, gameweek, FPL_POOL);
      }
      // The default clock is comfortably before every deadline above.
      await seedStandingManagerState();
      // These Gameweeks store nothing at all: the provider never answered, so
      // there is no action to judge and no Roll Over the Entrant earned.
      for (let gameweek = 2; gameweek < resumes; gameweek += 1) {
        await play({
          gameweek,
          http: async () => ({ status: 503, body: "no answer" })
        });
      }
      await play({ gameweek: resumes, responses: [STAND_PAT] });

      const states = await client.query(
        "select gw, free_transfers from manager_states order by gw"
      );
      // A Gameweek happened whether or not anyone answered for it, and granted
      // its Free Transfer like any other: one after the opening, one for each
      // silent Gameweek, and one more when the Gameweek that resumes grants
      // its own. Reading the opening row as though nothing had passed would
      // leave two however long the silence.
      expect(states.rows).toEqual([
        { gw: 1, free_transfers: 1 },
        { gw: resumes, free_transfers: silent + 2 }
      ]);
    }
  );

  test("lets a Free Hit stand a Gameweek after a silent one", async () => {
    // The rule is that a Free Hit cannot follow a Free Hit, and `chipActive`
    // on the stored row is the whole history it reads. A silent Gameweek in
    // between is a Gameweek in which the Chip was not active — so reading the
    // Gameweek 19 row directly at Gameweek 21 would refuse a Free Hit the
    // rules allow, three Repairs later and a Roll Over after that.
    for (const [gameweek, deadline] of [
      [18, "2026-12-26T17:30:00Z"],
      [19, "2026-12-30T17:30:00Z"],
      [20, "2027-01-02T17:30:00Z"],
      [21, "2027-01-09T17:30:00Z"]
    ] as Array<[number, string]>) {
      await client.query(
        "insert into gameweeks (season, gw, deadline_at) values ('2026-27', $1, $2)",
        [gameweek, deadline]
      );
    }
    for (const gameweek of [18, 19, 21]) {
      await lockPool(client, gameweek, FPL_POOL);
    }
    // The track joins at Gameweek 18 and the first half's Free Hit is played
    // in Gameweek 19, the last Gameweek that half's set is reachable in.
    await seedStandingManagerState(18);
    await play({
      gameweek: 19,
      at: "2026-12-30T11:30:00Z",
      responses: [IDLE_FREE_HIT]
    });
    // Gameweek 20 is silent, and Gameweek 21 reaches into the second half's
    // set — a different Free Hit, one Gameweek clear of the first.
    await play({
      gameweek: 21,
      at: "2027-01-09T11:30:00Z",
      responses: [IDLE_FREE_HIT]
    });

    const states = await client.query(
      `select gw, free_transfers, chips_used, chip_active, rolled_over
         from manager_states
        order by gw`
    );
    expect(states.rows).toEqual([
      {
        gw: 18,
        free_transfers: 1,
        chips_used: { firstHalf: [], secondHalf: [] },
        chip_active: null,
        rolled_over: false
      },
      {
        gw: 19,
        free_transfers: 1,
        chips_used: { firstHalf: ["free_hit"], secondHalf: [] },
        chip_active: "free_hit",
        rolled_over: false
      },
      {
        gw: 21,
        // The silent Gameweek granted one, and a Free Hit leaves the count as
        // it found it.
        free_transfers: 2,
        chips_used: { firstHalf: ["free_hit"], secondHalf: ["free_hit"] },
        chip_active: "free_hit",
        rolled_over: false
      }
    ]);
  });

  test("shows a later Gameweek the Squad the Entrant is standing on", async () => {
    await seedStandingManagerState();
    const [laterCall] = await play({ responses: [STAND_PAT] });

    const later = firstMessageText(laterCall!);
    // Its own fifteen at what it paid for them, which is what a Transfer is
    // priced against and what a Team Sheet must be picked from. An Entrant
    // shown an empty Squad and judged on a full one would spend a Repair on a
    // rule it could not have seen.
    expect(later).toContain("Squad, with what you paid for each player:");
    expect(later).toContain("- 8 | bought for £12.0m");
    expect(later).toContain("Bank: £4.5m");
    expect(later).toContain("Free Transfers: 1");
  });

  test("gives back what a Free Hit borrowed when the next Gameweek Rolls Over", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 3, '2026-09-04T17:30:00Z')`
    );
    await lockPool(client, 2, FPL_POOL_ALTERNATES);
    await lockPool(client, 3, [...FPL_POOL, ...FPL_POOL_ALTERNATES]);

    await seedStandingManagerState();
    await play({ responses: [FREE_HIT_REBUILD] });
    await play({
      gameweek: 3,
      at: "2026-09-04T11:30:00Z",
      responses: Array.from({ length: 4 }, () => OVER_BUDGET_FERNANDEZ)
    });

    const states = await client.query(
      `select gw, squad, team_sheet, bank, free_transfers, chips_used,
              chip_active, rolled_over
         from manager_states
        order by gw`
    );
    const [permanent, borrowed, rolled] =
      states.rows as Array<Record<string, unknown>>;
    // The Free Hit really did displace the Squad, so what follows is a claim
    // about the reversion rather than about a Gameweek that changed nothing.
    expect(borrowed!.squad).not.toEqual(permanent!.squad);

    expect(rolled).toEqual({
      gw: 3,
      // A Roll Over reverts before it stores: three failed Repairs after a
      // Free Hit must not be what makes a one-week Squad permanent (ADR-0017).
      squad: permanent!.squad,
      team_sheet: permanent!.team_sheet,
      bank: 45,
      free_transfers: 2,
      // Spent when it was played. A Gameweek that Rolls Over gives nothing
      // back, and plays nothing of its own.
      chips_used: { firstHalf: ["free_hit"], secondHalf: [] },
      chip_active: null,
      rolled_over: true
    });
  });

  test("re-runs a Gameweek on the Entrant's own stored context", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    await lockPool(
      client, 2, FPL_POOL_ALTERNATES.filter(({ fplId }) => fplId === 19)
    );
    await seedStandingManagerState();
    await storeManagerState(client, {
      entrantId: "entrant/v2",
      season: "2026-27",
      gameweek: 1,
      state: legalStateFrom(
        SELL_WILSON_BUY_EVANILSON,
        legalStateFrom(OPENING_ACTION)
      ),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-21T11:30:00Z")
    });

    const standPatOnEvanilson = JSON.stringify({
      ...JSON.parse(STAND_PAT) as object,
      team_sheet: {
        ...(JSON.parse(STAND_PAT) as { team_sheet: object }).team_sheet,
        bench: [2, 7, 12, 19]
      }
    });
    await play({ responses: [STAND_PAT] });
    // The second Entrant's provider fails, so its Gameweek stores a context
    // and nothing else — the case a second run over the same Gameweek is for.
    // It is the *second* Entrant that re-runs deliberately: `contexts_identity`
    // orders by `model_id`, so a read-back that forgot whose context it wanted
    // would reach the first Entrant's row and be right by accident if the two
    // were the other way round.
    await play({
      entrantId: "entrant/v2",
      responses: [standPatOnEvanilson],
      http: async () => ({ status: 500, body: "upstream exploded" })
    });
    const stored = await client.query<{ model_id: string; body: string }>(
      `select model_id, body
         from contexts
        where gw = 2 and track = 'fpl'
        order by model_id`
    );
    const [first, second] = stored.rows;

    // And between the runs the snapshot moves: Palmer rises to £13.0m. What
    // the Entrant is judged on is the text it was handed, so the second run
    // must hand back the stored row rather than rebuild one from a pool that
    // has moved since — and it must hand back *this* Entrant's row.
    await client.query(
      `update fpl_players set price_tenths = 130
        where season = '2026-27' and gw = 2 and fpl_id = 8`
    );
    const [rerun] = await play({
      entrantId: "entrant/v2",
      responses: [standPatOnEvanilson]
    });

    expect(firstMessageText(rerun!)).toBe(second!.body);
    expect(second!.body).not.toBe(first!.body);
    expect(second!.body).not.toContain("£13.0m");
    const after = await client.query<{ model_id: string; body: string }>(
      `select model_id, body
         from contexts
        where gw = 2 and track = 'fpl'
        order by model_id`
    );
    expect(after.rows).toEqual(stored.rows);
  });

  test("gives a second Entrant its own context rather than the first's", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    // Evanilson joins the Gameweek's pool because the second Entrant owns him:
    // a player in a Squad is a player the Gameweek prices, and a pool without
    // him would refuse that Squad rather than the action being tested.
    await lockPool(
      client, 2, FPL_POOL_ALTERNATES.filter(({ fplId }) => fplId === 19)
    );
    await seedStandingManagerState();
    // The second Entrant stands one Transfer from the first: Wilson sold and
    // Evanilson bought, so a context built for either of them names a player
    // the other does not own and is visibly wrong rather than accidentally
    // right.
    await storeManagerState(client, {
      entrantId: "entrant/v2",
      season: "2026-27",
      gameweek: 1,
      state: legalStateFrom(
        SELL_WILSON_BUY_EVANILSON,
        legalStateFrom(OPENING_ACTION)
      ),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-21T11:30:00Z")
    });

    // Each stands pat on the Squad it actually owns. The second's Team Sheet
    // benches Evanilson where the first's benches Wilson, which is the whole
    // reason the two cannot share one context: an action legal for one of them
    // names a player the other never bought.
    const standPatOnEvanilson = JSON.stringify({
      ...JSON.parse(STAND_PAT) as object,
      team_sheet: {
        ...(JSON.parse(STAND_PAT) as { team_sheet: { bench: number[] } })
          .team_sheet,
        bench: [2, 7, 12, 19]
      }
    });

    await play({ responses: [STAND_PAT] });
    await play({ entrantId: "entrant/v2", responses: [standPatOnEvanilson] });

    // One row apiece, and each carries the Squad its own Entrant owns. Sharing
    // the row would have shown the second fifteen players it does not own and
    // then judged it on the ones it does.
    const contexts = await client.query<{ model_id: string; body: string }>(
      `select model_id, body
         from contexts
        where gw = 2 and track = 'fpl'
        order by model_id`
    );
    expect(contexts.rows.map(({ model_id: id }) => id))
      .toEqual(["entrant/v1", "entrant/v2"]);
    const [first, second] = contexts.rows;
    expect(first!.body).toContain("- 15 | bought for");
    expect(first!.body).not.toContain("- 19 | bought for");
    expect(second!.body).toContain("- 19 | bought for");
    expect(second!.body).not.toContain("- 15 | bought for");

    // And both played, which is the whole point of the widening: a Gameweek
    // the roster can get through rather than one that stops at the second seat.
    const states = await client.query(
      "select model_id from manager_states where gw = 2 order by model_id"
    );
    expect(states.rows).toEqual([
      { model_id: "entrant/v1" },
      { model_id: "entrant/v2" }
    ]);
  });

  /**
   * One Fixture in every Gameweek from 1 to 8, so both edges of the window a
   * Gameweek 2 context reads are real rows: Gameweek 1 is behind it, and
   * Gameweek 8 is one past the fifth Gameweek ahead of it.
   *
   * Gameweek 2's pair is stored latest kickoff first, so the order the section
   * renders in is the schedule's rather than the order the table was filled in.
   */
  const SCHEDULED_FIXTURES = [
    { fplId: 101, gw: 1, home: "Arsenal", away: "Chelsea", at: "2026-08-22T14:00:00Z" },
    { fplId: 102, gw: 2, home: "Everton", away: "Fulham", at: "2026-08-30T16:30:00Z" },
    { fplId: 103, gw: 2, home: "Chelsea", away: "Brentford", at: "2026-08-29T14:00:00Z" },
    { fplId: 104, gw: 3, home: "Fulham", away: "Arsenal", at: "2026-09-19T14:00:00Z" },
    { fplId: 105, gw: 4, home: "Brentford", away: "Everton", at: "2026-09-26T14:00:00Z" },
    { fplId: 106, gw: 5, home: "Arsenal", away: "Fulham", at: "2026-10-03T14:00:00Z" },
    { fplId: 107, gw: 6, home: "Chelsea", away: "Everton", at: "2026-10-10T14:00:00Z" },
    { fplId: 108, gw: 7, home: "Everton", away: "Arsenal", at: "2026-10-17T14:00:00Z" },
    { fplId: 109, gw: 8, home: "Fulham", away: "Chelsea", at: "2026-10-24T14:00:00Z" }
  ];

  /** Gameweeks 3 to 8 scheduled, and the Fixtures above stored against them. */
  async function seedSchedule(): Promise<void> {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       select '2026-27', gw,
              timestamptz '2026-08-28T17:30:00Z' + (gw * interval '7 days')
         from generate_series(3, 8) as gw
       on conflict do nothing`
    );
    for (const fixture of SCHEDULED_FIXTURES) {
      await client.query(
        `insert into fixtures (
           season, fixture_id, gw, home_team, away_team, kickoff_at
         ) values ('2026-27', $1, $2, $3, $4, $5)`,
        [fixture.fplId, fixture.gw, fixture.home, fixture.away, fixture.at]
      );
    }
  }

  test("carries this Gameweek and the five ahead on the body it stores", async () => {
    await seedSchedule();
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts where gw = 2 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    expect(stored.rows[0]!.hash).toBe(
      createHash("sha256").update(body).digest("hex")
    );
    expect(body).toContain([
      "Fixtures, this Gameweek and the five ahead:",
      "Gameweek 2",
      "- Chelsea v Brentford | 2026-08-29",
      "- Everton v Fulham | 2026-08-30",
      "Gameweek 3",
      "- Fulham v Arsenal | 2026-09-19",
      "Gameweek 4",
      "- Brentford v Everton | 2026-09-26",
      "Gameweek 5",
      "- Arsenal v Fulham | 2026-10-03",
      "Gameweek 6",
      "- Chelsea v Everton | 2026-10-10",
      "Gameweek 7",
      "- Everton v Arsenal | 2026-10-17"
    ].join("\n"));
    // The window's two edges, named by the one thing each Fixture holds alone:
    // Gameweek 1 is played and gone, and Gameweek 8 is a Gameweek too far.
    expect(body).not.toContain("2026-08-22");
    expect(body).not.toContain("2026-10-24");
  });

  test("leaves an Unscheduled Fixture out, and the Blank unremarked", async () => {
    await seedSchedule();
    // Chelsea v Brentford withdrawn from Gameweek 2's calendar. Chelsea's
    // other Fixture is in Gameweek 6, so Gameweek 2 is a Blank for it and the
    // section has one club fewer rather than one row of nothing.
    await client.query(
      "update fixtures set unscheduled = true where fixture_id = 103"
    );
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts where gw = 2 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    expect(stored.rows[0]!.hash).toBe(
      createHash("sha256").update(body).digest("hex")
    );
    expect(body).toContain([
      "Fixtures, this Gameweek and the five ahead:",
      "Gameweek 2",
      "- Everton v Fulham | 2026-08-30",
      "Gameweek 3",
      "- Fulham v Arsenal | 2026-09-19"
    ].join("\n"));
    // Absence is the whole statement: the match is gone from the list and
    // nothing anywhere says why (ADR 0021).
    expect(body).not.toContain("Chelsea v Brentford");
    expect(body).not.toContain("2026-08-29");
    // A Blank and not a club struck off: Chelsea is missing from Gameweek 2's
    // list and present in Gameweek 6's, in this same body.
    expect(body).toContain("- Chelsea v Everton | 2026-10-10");
    expect(body.toLowerCase()).not.toContain("postponed");
    expect(body.toLowerCase()).not.toContain("unscheduled");
  });

  test("lists a restored Fixture under its new Gameweek, Double and all", async () => {
    await seedSchedule();
    // The row as a restoration leaves it: a new date in Gameweek 6, where
    // Chelsea already plays Everton, and the Unscheduled mark cleared. The
    // clearing itself is the fetch's, and is proved there; what is read here
    // is that such a row rejoins the schedule, as the Double it makes.
    await client.query(
      `update fixtures
          set gw = 6, kickoff_at = '2026-10-11T14:00:00Z', unscheduled = false
        where fixture_id = 103`
    );
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string }>(
      "select body from contexts where gw = 2 and track = 'fpl'"
    );
    expect(stored.rows[0]!.body).toContain([
      "Gameweek 6",
      "- Chelsea v Everton | 2026-10-10",
      "- Chelsea v Brentford | 2026-10-11",
      "Gameweek 7"
    ].join("\n"));
  });

  /**
   * A scripted opening month of the Season, hand-summed into the table the
   * context must show. Six clubs, four rounds, every club playing once a
   * round, with Wolves and Chelsea meeting home and away and drawing both.
   *
   * Both ties the ordering rule exists for are built in, and both are placed
   * where no other rule would produce the same order. Everton finishes above
   * Brentford on goal difference (+4 against +3) while scoring fewer goals
   * than it and following it alphabetically; Wolves finishes above Chelsea on
   * goals scored (4 against 3) while matching it on points and goal difference
   * and following it alphabetically. Either tiebreak dropped, and the table
   * comes out in a different order rather than the same one by luck.
   */
  const PLAYED_RESULTS: {
    on: string;
    home: string;
    away: string;
    goals: [number, number];
  }[] = [
    { on: "2026-08-15T14:00:00Z", home: "Arsenal", away: "Everton", goals: [2, 0] },
    { on: "2026-08-15T14:00:00Z", home: "Brentford", away: "Fulham", goals: [4, 1] },
    { on: "2026-08-15T16:30:00Z", home: "Wolves", away: "Chelsea", goals: [1, 1] },
    { on: "2026-08-22T14:00:00Z", home: "Arsenal", away: "Brentford", goals: [3, 0] },
    { on: "2026-08-22T14:00:00Z", home: "Everton", away: "Fulham", goals: [3, 0] },
    { on: "2026-08-22T16:30:00Z", home: "Chelsea", away: "Wolves", goals: [1, 1] },
    { on: "2026-08-25T19:00:00Z", home: "Everton", away: "Wolves", goals: [1, 0] },
    { on: "2026-08-25T19:00:00Z", home: "Fulham", away: "Brentford", goals: [1, 3] },
    { on: "2026-08-25T19:45:00Z", home: "Arsenal", away: "Chelsea", goals: [2, 1] },
    { on: "2026-08-29T14:00:00Z", home: "Arsenal", away: "Wolves", goals: [3, 2] },
    { on: "2026-08-29T14:00:00Z", home: "Fulham", away: "Everton", goals: [0, 2] },
    { on: "2026-08-29T16:30:00Z", home: "Brentford", away: "Chelsea", goals: [1, 0] }
  ];

  async function storeResult(
    season: string,
    division: string,
    result: { on: string; home: string; away: string; goals: [number, number] }
  ): Promise<void> {
    await client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values ('PL', $1, $2, $3, $4, $5, $6, $7)`,
      [
        season,
        division,
        result.on,
        result.home,
        result.away,
        result.goals[0],
        result.goals[1]
      ]
    );
  }

  test("sums the current Season's results into the table it stores", async () => {
    await seedSchedule();
    for (const result of PLAYED_RESULTS) {
      await storeResult("2026-27", "Premier League", result);
    }
    // Neither of these may reach the table. Last Season's rout would put three
    // more goals on Arsenal and a fourth match on its record; the Championship
    // result is the latest stored of all, so a division boundary that leaked
    // would show in the coverage date as well as in two clubs that have played
    // no Premier League match at all.
    await storeResult("2025-26", "Premier League", {
      on: "2026-05-10T15:00:00Z", home: "Arsenal", away: "Chelsea", goals: [5, 0]
    });
    await storeResult("2026-27", "Championship", {
      on: "2026-09-05T14:00:00Z", home: "Coventry", away: "Hull", goals: [2, 1]
    });
    // Two clubs the same context shows on the schedule ahead, with nothing
    // played behind them — the opening Fixture postponed, or a Gameweek 1 they
    // both blanked. A side joins the table when it has a stored result, not
    // when it has been scheduled, so neither may reach it.
    await client.query(
      `insert into fixtures (
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values ('2026-27', 201, 3, 'Sunderland', 'Leeds', $1)`,
      ["2026-09-19T16:30:00Z"]
    );
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts where gw = 2 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    expect(stored.rows[0]!.hash).toBe(
      createHash("sha256").update(body).digest("hex")
    );
    expect(body).toContain([
      "Premier League table, from results through 2026-08-29:",
      "- 1 Arsenal | 4 played, 4W 0D 0L, GF 10, GA 3, 12 pts",
      "- 2 Everton | 4 played, 3W 0D 1L, GF 6, GA 2, 9 pts",
      "- 3 Brentford | 4 played, 3W 0D 1L, GF 8, GA 5, 9 pts",
      "- 4 Wolves | 4 played, 0W 2D 2L, GF 4, GA 6, 2 pts",
      "- 5 Chelsea | 4 played, 0W 2D 2L, GF 3, GA 5, 2 pts",
      "- 6 Fulham | 4 played, 0W 0D 4L, GF 2, GA 12, 0 pts",
      ""
    ].join("\n"));
    expect(body).not.toContain("Coventry");
    expect(body).not.toContain("Hull");
    // The table above closes on Fulham's line and a blank, so it has six rows
    // and no seventh. These two are in the same body, on the schedule ahead —
    // scheduled, unplayed, and off the table.
    expect(body).toContain("- Sunderland v Leeds | 2026-09-19");
  });

  test("announces the empty table a Season with no result has", async () => {
    await seedSchedule();
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string }>(
      "select body from contexts where gw = 2 and track = 'fpl'"
    );
    expect(stored.rows[0]!.body).toContain(
      "Premier League table: no result has been played yet this Season."
    );
  });

  test("shows what is left of the window at the calendar's end", async () => {
    // Gameweek 7 with a calendar that ends at 8: the five Gameweeks ahead are
    // one Gameweek and then nothing, and the section is simply shorter. A
    // window that announced its own truncation would be inventing a fact about
    // the season that the schedule already states by stopping.
    await seedSchedule();
    await lockPool(client, 7, FPL_POOL);
    await seedStandingManagerState(6);
    await play({
      gameweek: 7,
      at: "2026-10-15T11:30:00Z",
      responses: [STAND_PAT]
    });

    const stored = await client.query<{ body: string }>(
      "select body from contexts where gw = 7 and track = 'fpl'"
    );
    expect(stored.rows[0]!.body).toContain([
      "Fixtures, this Gameweek and the five ahead:",
      "Gameweek 7",
      "- Everton v Arsenal | 2026-10-17",
      "Gameweek 8",
      "- Fulham v Chelsea | 2026-10-24",
      ""
    ].join("\n"));
  });

  /**
   * Palmer's Settled Gameweeks behind Gameweek 8, as a table the expected
   * totals below are computed from by hand.
   *
   * Gameweek 4 is absent on purpose: no stored rows is what an unsettled
   * Gameweek looks like, so it contributes to neither window and the five most
   * recent Settled Gameweeks are 2, 3, 5, 6 and 7 — which leaves Gameweek 1 in
   * the Season's window and out of the last five, where its goal, its two
   * bonus points and its clean sheet would show if the boundary slipped.
   *
   * Gameweek 5 he missed, with a stored zero row. Gameweek 6 was a Double, and
   * the table is keyed by Gameweek, so its two Fixtures arrive as one row of
   * 180 minutes: one appearance, filling one of the five.
   */
  const PALMER_GAMEWEEKS = [
    {
      gameweek: 1, minutes: 90, total_points: 9, goals_scored: 1, assists: 1,
      bonus: 2, expected_goals: 0.5, expected_assists: 0.3,
      expected_goals_conceded: 1
    },
    {
      gameweek: 2, minutes: 90, total_points: 2, expected_goals: 0.1,
      expected_assists: 0.2, expected_goals_conceded: 2
    },
    {
      gameweek: 3, minutes: 60, total_points: 5, goals_scored: 1,
      yellow_cards: 1, expected_goals: 0.4, expected_assists: 0.1,
      expected_goals_conceded: 1
    },
    { gameweek: 5 },
    {
      gameweek: 6, minutes: 180, total_points: 14, goals_scored: 2, assists: 1,
      bonus: 3, expected_goals: 1.2, expected_assists: 0.4
    },
    {
      gameweek: 7, minutes: 90, total_points: 6, assists: 1, clean_sheets: 1,
      expected_goals: 0.2, expected_assists: 0.6
    }
  ];

  /** Gameweeks 3 to 8 scheduled, and the Settled points table above stored. */
  async function seedSettledSeason(): Promise<void> {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       select '2026-27', gw,
              timestamptz '2026-08-28T17:30:00Z' + (gw * interval '7 days')
         from generate_series(3, 8) as gw`
    );
    await lockPool(client, 8, FPL_POOL);
    for (const gameweek of PALMER_GAMEWEEKS) {
      await storePlayerPoints(client, { fplId: 8, ...gameweek });
    }
    // Gameweek 5 is Settled whether or not Palmer played it, and Raya's row is
    // what says so. Left to Palmer's own zero row, a window that took the five
    // most recent Gameweeks the *player* appeared in would look right here.
    await storePlayerPoints(client, {
      gameweek: 5,
      fplId: 1,
      minutes: 90,
      total_points: 2
    });
    // Wilson played the Season's first Gameweek and nothing since: every
    // Settled minute he has falls outside the five most recent, so he carries
    // a season block and no last5 block at all.
    await storePlayerPoints(client, {
      gameweek: 1,
      fplId: 15,
      minutes: 90,
      total_points: 3
    });
  }

  test("carries both Settled windows on every pool line it stores", async () => {
    await seedSettledSeason();
    await seedStandingManagerState(7);
    await play({
      gameweek: 8,
      at: "2026-10-20T11:30:00Z",
      responses: [STAND_PAT]
    });

    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts where gw = 8 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    // Everything below is asserted against the row on record, and the hash is
    // what makes that row the text the Entrant was judged on.
    expect(stored.rows[0]!.hash).toBe(
      createHash("sha256").update(body).digest("hex")
    );
    // The Gameweek the windows run through is named rather than inferred: the
    // Gameweek being played is 8, and 7 is the last one FPL settled.
    expect(body).toContain(
      "Performance below runs through Settled Gameweek 7."
    );
    expect(body).toContain("Stat keys: pts = points, min = minutes,");
    // Summed from the table above: the Season over six Settled Gameweeks, the
    // last five over 2, 3, 5, 6 and 7. Five appearances against four is
    // Gameweek 5, and 510 minutes against 420 is Gameweek 1.
    expect(body).toContain(JSON.stringify({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "available",
      season: {
        pts: 36, min: 510, app: 5, g: 4, a: 3, cs: 1, b: 5, yc: 1,
        xg: "2.40", xa: "1.60", xgc: "4.00"
      },
      last5: {
        pts: 27, min: 420, app: 4, g: 3, a: 2, cs: 1, b: 3, yc: 1,
        xg: "1.90", xa: "1.30", xgc: "3.00"
      }
    }));
    // One Settled Gameweek inside the last five, so both windows are the same
    // Gameweek — and every stat he did not record is left out of both.
    expect(body).toContain(JSON.stringify({
      id: 1,
      name: "Raya",
      club: "Arsenal",
      position: "GKP",
      price: "£4.5m",
      price_tenths: 45,
      status: "available",
      season: { pts: 2, min: 90, app: 1 },
      last5: { pts: 2, min: 90, app: 1 }
    }));
    // Settled minutes in the Season and none in the last five: one block, and
    // the absent one is the statement that he has not played since.
    expect(body).toContain(JSON.stringify({
      id: 15,
      name: "Wilson",
      club: "Fulham",
      position: "FWD",
      price: "£6.0m",
      price_tenths: 60,
      status: "available",
      season: { pts: 3, min: 90, app: 1 }
    }));
    // A player the points table has never heard of carries no block at all.
    expect(body).toContain(JSON.stringify({
      id: 3,
      name: "Saliba",
      club: "Arsenal",
      position: "DEF",
      price: "£6.0m",
      price_tenths: 60,
      status: "available"
    }));
  });

  test("says so plainly when no Gameweek has settled yet", async () => {
    await seedStandingManagerState();
    await play({ responses: [STAND_PAT] });

    const stored = await client.query<{ body: string }>(
      "select body from contexts where gw = 2 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    // Gameweek 1's normal case, and the track's opening one: the points table
    // is empty, so the pool carries no block and the Entrant is told why
    // rather than left to wonder what the missing numbers meant.
    expect(body).toContain(
      "No Gameweek has settled yet, so no player performance appears below."
    );
    expect(body).not.toContain('"season":{');
    expect(body).not.toContain('"last5":{');
  });

  test("prices a Transfer from the stat blocks' own context body", async () => {
    await seedSettledSeason();
    // Evanilson joins Gameweek 8's pool because the Transfer buys him, and a
    // player the pool does not carry cannot be bought at any price.
    await lockPool(client, 8, FPL_POOL_ALTERNATES.filter(({ fplId }) => fplId === 19));
    await seedStandingManagerState(7);

    await play({
      gameweek: 8,
      at: "2026-10-20T11:30:00Z",
      responses: [SELL_WILSON_BUY_EVANILSON_JSON]
    });

    // The readback that prices this action reads a v2 body — every line
    // carrying stat blocks it has no use for. Evanilson bought at the £6.0m
    // that body pinned is the whole proof: a parser that refused the new
    // fields would have thrown before any Transfer was priced.
    const states = await client.query<{
      squad: { active: { fplId: number; purchasePriceTenths: number }[] };
    }>("select squad from manager_states where gw = 8");
    const active = states.rows[0]!.squad.active;
    expect(active).toContainEqual({ fplId: 19, purchasePriceTenths: 60 });
    expect(active.map(({ fplId }) => fplId)).not.toContain(15);
  });

  test("prices a Transfer from a body carrying the pool's flags", async () => {
    // Evanilson joins the Gameweek's pool because the Transfer buys him.
    await lockPool(client, 2, FPL_POOL_ALTERNATES.filter(({ fplId }) => fplId === 19));
    // The two shapes FPL's feed sends: a percentage against Palmer, and a flag
    // on Wilson with none. Everyone else is left as the fetch locked them —
    // status 'a', no percentage, empty news.
    await client.query(
      `update fpl_players
          set status = 'd', chance_of_playing_next_round = 25,
              news = 'Knee injury - expected back 21 Sep'
        where season = '2026-27' and gw = 2 and fpl_id = 8`
    );
    await client.query(
      `update fpl_players
          set status = 'd', chance_of_playing_next_round = null,
              news = 'Knock - assessed ahead of Saturday'
        where season = '2026-27' and gw = 2 and fpl_id = 15`
    );
    await seedStandingManagerState();

    await play({ responses: [SELL_WILSON_BUY_EVANILSON_JSON] });

    const stored = await client.query<{ body: string }>(
      "select body from contexts where gw = 2 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    expect(body).toContain("Availability keys: chance = ");
    expect(body).toContain(JSON.stringify({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "doubtful",
      chance: 25,
      news: "Knee injury - expected back 21 Sep"
    }));
    expect(body).toContain(JSON.stringify({
      id: 15,
      name: "Wilson",
      club: "Fulham",
      position: "FWD",
      price: "£6.0m",
      price_tenths: 60,
      status: "doubtful",
      news: "Knock - assessed ahead of Saturday"
    }));
    // And a player with nothing flagged is on the line he has always been on.
    expect(body).toContain(JSON.stringify({
      id: 2,
      name: "Kelleher",
      club: "Brentford",
      position: "GKP",
      price: "£4.0m",
      price_tenths: 40,
      status: "available"
    }));
    // The readback priced this Transfer off that same body: a parser that
    // refused the new keys would have thrown before Evanilson was bought, and
    // the flagged player sold is the one the pricing turned on.
    const states = await client.query<{
      squad: { active: { fplId: number; purchasePriceTenths: number }[] };
    }>("select squad from manager_states where gw = 2");
    const active = states.rows[0]!.squad.active;
    expect(active).toContainEqual({ fplId: 19, purchasePriceTenths: 60 });
    expect(active.map(({ fplId }) => fplId)).not.toContain(15);
  });

  test("stores one body carrying every v2 section at once", async () => {
    // Spec 0006's closing promise is not four sections in four tests but one
    // stored text: the schedule ahead, the table so far, the windows behind
    // and the pool's flags, under the one hash the Entrant was judged on.
    await seedSettledSeason();
    await seedSchedule();
    for (const result of PLAYED_RESULTS) {
      await storeResult("2026-27", "Premier League", result);
    }
    await client.query(
      `update fpl_players
          set status = 'd', chance_of_playing_next_round = 25,
              news = 'Knee injury - expected back 21 Sep'
        where season = '2026-27' and gw = 8 and fpl_id = 8`
    );
    await seedStandingManagerState(7);
    await play({
      gameweek: 8,
      at: "2026-10-20T11:30:00Z",
      responses: [STAND_PAT]
    });

    const stored = await client.query<{ body: string; hash: string }>(
      "select body, hash from contexts where gw = 8 and track = 'fpl'"
    );
    const body = stored.rows[0]!.body;
    expect(stored.rows[0]!.hash).toBe(
      createHash("sha256").update(body).digest("hex")
    );
    // Each section, by the line only it carries.
    expect(body).toContain(
      "Fixtures, this Gameweek and the five ahead:\n"
      + "Gameweek 8\n"
      + "- Fulham v Chelsea | 2026-10-24"
    );
    expect(body).toContain(
      "Premier League table, from results through 2026-08-29:"
    );
    expect(body).toContain(
      "Performance below runs through Settled Gameweek 7."
    );
    // And the one pool line that crosses every slice: Palmer flagged and
    // windowed on the same line the reducer prices from.
    expect(body).toContain(JSON.stringify({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "doubtful",
      chance: 25,
      news: "Knee injury - expected back 21 Sep",
      season: {
        pts: 36, min: 510, app: 5, g: 4, a: 3, cs: 1, b: 5, yc: 1,
        xg: "2.40", xa: "1.60", xgc: "4.00"
      },
      last5: {
        pts: 27, min: 420, app: 4, g: 3, a: 2, cs: 1, b: 3, yc: 1,
        xg: "1.90", xa: "1.30", xgc: "3.00"
      }
    }));
    // The body carrying everything still prices: the readback sees the same
    // pool it always did.
    expect(parseFplTrackContextPool(body)).toEqual(
      FPL_POOL.map(({ fplId, club, position, priceTenths }) => ({
        fplId,
        club,
        position,
        priceTenths
      }))
    );
  });

  test("hands every Entrant of the Gameweek the same windows", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    await seedSettledSeason();
    await seedStandingManagerState(7);
    await seedStandingManagerState(7, "entrant/v2");

    await play({
      gameweek: 8,
      at: "2026-10-20T11:30:00Z",
      responses: [STAND_PAT]
    });
    await play({
      gameweek: 8,
      entrantId: "entrant/v2",
      at: "2026-10-20T11:30:00Z",
      responses: [STAND_PAT]
    });

    // Two Entrants on the same Squad, so the only thing that could differ
    // between their contexts is the performance record — and Paired
    // Differences measure Base Models only while it does not.
    const stored = await client.query<{ body: string }>(
      `select body
         from contexts
        where gw = 8 and track = 'fpl'
        order by model_id`
    );
    const [first, second] = stored.rows;
    expect(first!.body).toContain('"season":{"pts":36,"min":510,"app":5');
    expect(second!.body).toBe(first!.body);
  });
});

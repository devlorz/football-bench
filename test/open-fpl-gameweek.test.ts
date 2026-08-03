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
import type { HttpFetcher } from "../src/http.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  type FixturePlayer
} from "./fpl-pool-fixture.js";
import { OPENING_ACTION } from "./fpl-action-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import { storedState } from "./fpl-state-fixture.js";

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

interface Turn {
  role: string;
  content: string;
}

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
         gameweeks, fpl_players
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
    await lockPool(1, FPL_POOL);
    await lockPool(2, FPL_POOL);
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
    http,
    now
  }: {
    gameweek?: number;
    entrantId?: string;
    at?: string;
    responses?: string[];
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
      http: http ?? script.http
    });
    return script.conversations;
  }

  test("hands the Entrant the stored context and keeps the state it produces", async () => {
    await seedStandingManagerState();
    const [played] = await play({ responses: [STAND_PAT] });
    const prompt = played![0]!.content;

    const contexts = await client.query(
      "select track, fpl_id, hash, body from contexts"
    );
    expect(contexts.rows).toHaveLength(1);
    const [context] = contexts.rows as Array<{
      track: string;
      fpl_id: number | null;
      hash: string;
      body: string;
    }>;
    expect(context).toMatchObject({ track: "fpl", fpl_id: null });
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
    expect(conversations[1]).toEqual([
      { role: "user", content: conversations[0]![0]!.content },
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
    await lockPool(2, FPL_POOL_ALTERNATES);
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
      `select model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
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
        fpl_id: null,
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
        fpl_id: null,
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
        fpl_id: null,
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
    await lockPool(2, FPL_POOL_ALTERNATES);
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
        await lockPool(gameweek, FPL_POOL);
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
      await lockPool(gameweek, FPL_POOL);
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

    const later = laterCall![0]!.content;
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
    await lockPool(2, FPL_POOL_ALTERNATES);
    await lockPool(3, [...FPL_POOL, ...FPL_POOL_ALTERNATES]);

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

  test("refuses to hand a second Entrant a context built from another's Squad", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-opus-5', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    await seedStandingManagerState();
    await seedStandingManagerState(1, "entrant/v2");

    await play({ responses: [STAND_PAT] });

    // `contexts_identity` allows one FPL context per Gameweek, and every
    // Gameweek this function plays is one where each Entrant's context carries
    // its own Squad. Handing this one the row already there would show it
    // fifteen players it does not own and then judge it on the ones it does.
    // Per-Entrant context rows belong to "Run the FPL track under the shared
    // Lock"; until they exist this must fail loudly rather than quietly.
    await expect(play({
      entrantId: "entrant/v2",
      responses: [STAND_PAT]
    })).rejects.toThrow(/already another Entrant's/);

    const states = await client.query(
      "select model_id from manager_states where gw = 2"
    );
    expect(states.rows).toEqual([{ model_id: "entrant/v1" }]);
  });
});

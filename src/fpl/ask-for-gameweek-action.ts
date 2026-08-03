import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher, HttpResponse } from "../http.js";
import {
  openRouterRequest,
  parseOpenRouterResponse,
  type OpenRouterMessage
} from "../predictions/openrouter-entrant.js";
import { MAX_REPAIRS } from "../repairs.js";
import {
  applyGameweekAction,
  type ManagerState,
  type PoolPlayer,
  type ViolationKind
} from "./apply-gameweek-action.js";
import {
  gameweekRepairMessage,
  validateGameweekAction,
  GAMEWEEK_ACTION_SCHEMA_KIND
} from "./validate-gameweek-action.js";

type Database = Pick<Client, "query">;

/** The Base Model one seat calls, and how it is pinned. */
export interface GameweekEntrant {
  id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
}

export interface AskForGameweekActionOptions {
  database: Database;
  season: string;
  gameweek: number;
  entrant: GameweekEntrant;
  /** The exact text the Entrant is handed, as it is on record. */
  body: string;
  /** What the Entrant carries into this Gameweek. */
  previous: ManagerState;
  /** The Gameweek's pool, priced as the stored context prices it. */
  pool: PoolPlayer[];
  deadline: Date;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * What one Entrant's whole conversation came to.
 *
 * `action` is a legal action and the Manager State it produces. `exhausted` is
 * the fourth invalid response — the point ADR-0004 discards the action and a
 * Gameweek Rolls Over, if there is a Team Sheet standing to roll onto.
 * `silent` is every way an Entrant produced no action at all: a provider that
 * failed or refused, a response nothing could read, a Lock already passed.
 *
 * The caller decides what to persist, because the answer differs: a later
 * Gameweek stores its own state as soon as it has one, while an opening holds
 * every Entrant's back until all of them are legal.
 */
export type GameweekActionOutcome =
  | {
    kind: "action";
    state: ManagerState;
    repairsUsed: number;
    receivedAt: Date;
  }
  | { kind: "exhausted"; receivedAt: Date }
  | { kind: "silent" };

/**
 * What one Entrant response is worth: the Manager State it produces, or the
 * one frozen sentence it is sent back with.
 *
 * Both boundaries answer here because the loop treats them alike — a response
 * that is not an action and an action the rules refuse both cost a Repair and
 * both are recorded, and only their kind tells them apart afterwards. Keeping
 * the two apart in the loop would mean writing the Repair, the record and the
 * fourth-failure rule twice.
 */
type JudgedResponse =
  | { state: ManagerState }
  | { kind: ViolationKind | typeof GAMEWEEK_ACTION_SCHEMA_KIND; reason: string };

function judgeGameweekResponse(
  content: string,
  previous: ManagerState,
  pool: PoolPlayer[],
  gameweek: number
): JudgedResponse {
  const validation = validateGameweekAction(content);
  if (!validation.ok) {
    return { kind: validation.kind, reason: validation.message };
  }
  const outcome = applyGameweekAction(
    previous,
    validation.action,
    pool,
    gameweek
  );
  return "violation" in outcome
    ? { kind: outcome.violation.kind, reason: outcome.violation.message }
    : outcome;
}

/**
 * One row per call to the Entrant, whatever became of it. The row is the only
 * record an attempt leaves — a Manager State is written once and says nothing
 * about the three responses that may have preceded it — so what is stored here
 * is what the Repair count and the violation profile are later read from.
 *
 * FPL rows carry no `fpl_id`: a Gameweek action is one Gameweek's, not one
 * Fixture's, which is the distinction the column exists to draw.
 *
 * `failure` is null only for an action that was legal and in time. Everything
 * else — a rule broken, a response that was not an action, a Lock already
 * passed, a provider that never answered — is one row with one kind, because
 * the Repair count and the violation profile are both read from these rows and
 * neither can count what was never written.
 */
interface RecordedAttempt {
  entrantId: string;
  season: string;
  gameweek: number;
  attemptNo: number;
  failure: { kind: string; reason: string } | null;
  rawResponse: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  attemptedAt: Date;
}

/**
 * An attempt with nothing resolved and nothing counted, for the failures that
 * never reached a Base Model. Null rather than zero throughout: a token count
 * of zero would claim a call that was made and cost nothing.
 */
function blankAttempt(
  entrantId: string,
  season: string,
  gameweek: number,
  attemptNo: number
): Omit<RecordedAttempt, "failure" | "latencyMs" | "attemptedAt"> {
  return {
    entrantId,
    season,
    gameweek,
    attemptNo,
    rawResponse: null,
    resolvedProvider: null,
    resolvedModel: null,
    tokensIn: null,
    tokensOut: null
  };
}

/** Whether the provider answered at all, and what to call it if it did not. */
function failedUpstream(
  response: HttpResponse
): { kind: string; reason: string } | null {
  if (response.status >= 200 && response.status < 300) {
    return null;
  }
  return {
    kind: response.status === 429 ? "rate_limit" : "provider",
    reason: `OpenRouter returned HTTP ${response.status}.`
  };
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function elapsed(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

async function recordAttempt(
  database: Database,
  attempt: RecordedAttempt
): Promise<void> {
  await database.query(
    `insert into attempts (
       model_id, season, gw, track, attempt_no, ok, error_kind, error_detail,
       resolved_provider, resolved_model, latency_ms, tokens_in, tokens_out,
       raw_response, trigger, attempted_at
     ) values (
       $1, $2, $3, 'fpl', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       'main', $14
     )`,
    [
      attempt.entrantId,
      attempt.season,
      attempt.gameweek,
      attempt.attemptNo,
      attempt.failure === null,
      attempt.failure?.kind ?? null,
      attempt.failure?.reason ?? null,
      attempt.resolvedProvider,
      attempt.resolvedModel,
      attempt.latencyMs,
      attempt.tokensIn,
      attempt.tokensOut,
      attempt.rawResponse,
      attempt.attemptedAt
    ]
  );
}

/**
 * One Entrant's Gameweek, from the context it is handed to the action it ends
 * up with — the initial response and up to three Repairs, all in one
 * conversation (ADR-0004), with every call recorded as it happens.
 *
 * Every attempt is written before the outcome is returned, so a caller that
 * discards the outcome still leaves the record of how the Entrant behaved.
 * That is what lets an opening throw away eight legal actions because a ninth
 * was never legal, without throwing away the evidence of any of them.
 */
export async function askForGameweekAction({
  database,
  season,
  gameweek,
  entrant,
  body,
  previous,
  pool,
  deadline,
  apiKey,
  http,
  now
}: AskForGameweekActionOptions): Promise<GameweekActionOutcome> {
  // The one conversation the whole Gameweek is played in. A Repair is asked
  // for by appending the rejected action and the reason it failed (ADR-0004),
  // so the Entrant is measured on correcting its own answer rather than on
  // answering afresh three more times.
  const messages: OpenRouterMessage[] = [{ role: "user", content: body }];

  for (let attemptNo = 0; attemptNo <= MAX_REPAIRS; attemptNo += 1) {
    const { url, ...request } = openRouterRequest(
      apiKey,
      {
        baseModel: entrant.base_model,
        provider: entrant.provider,
        quantization: entrant.quantization
      },
      messages
    );
    const startedAt = now();
    let response: HttpResponse;
    let receivedAt: Date;
    try {
      response = await http(url, request);
      // The action is received the moment the response lands. Reading the
      // clock after parsing and validating would let slow processing miss a
      // Lock the Entrant made in time.
      receivedAt = now();
    } catch (error) {
      receivedAt = now();
      await recordAttempt(database, {
        ...blankAttempt(entrant.id, season, gameweek, attemptNo),
        failure: {
          kind: isTimeoutError(error) ? "timeout" : "provider",
          reason: `OpenRouter call failed: ${errorText(error)}.`
        },
        latencyMs: elapsed(startedAt, receivedAt),
        attemptedAt: receivedAt
      });
      return { kind: "silent" };
    }

    // Every path below leaves one row, and only the first of them is an
    // Entrant's answer at all. A provider that errored, rate-limited or
    // refused never produced an action, so there is nothing to send back and
    // nothing to correct: the Gameweek stops here with no Manager State,
    // rather than Rolling Over on a failure the Entrant did not make.
    const providerFailure = failedUpstream(response);
    if (providerFailure !== null) {
      await recordAttempt(database, {
        ...blankAttempt(entrant.id, season, gameweek, attemptNo),
        failure: providerFailure,
        rawResponse: response.body,
        latencyMs: elapsed(startedAt, receivedAt),
        attemptedAt: receivedAt
      });
      return { kind: "silent" };
    }

    const parsed = parseOpenRouterResponse(response.body);
    if (parsed === null || parsed.content === null) {
      await recordAttempt(database, {
        ...blankAttempt(entrant.id, season, gameweek, attemptNo),
        failure: {
          kind: parsed?.refusal === null || parsed?.refusal === undefined
            ? "provider"
            : "refusal",
          reason: parsed?.refusal
            ?? "OpenRouter returned an unexpected response shape.",
        },
        rawResponse: response.body,
        // A refusal is a call that was made, resolved and billed, and its
        // endpoint and token counts are on the response like any other. They
        // are what the per-call cost is measured from (spec 0003), so the row
        // keeps whatever the response carried and falls back to null only for
        // a body nothing could read.
        resolvedProvider: parsed?.resolvedProvider ?? null,
        resolvedModel: parsed?.resolvedModel ?? null,
        tokensIn: parsed?.tokensIn ?? null,
        tokensOut: parsed?.tokensOut ?? null,
        latencyMs: elapsed(startedAt, receivedAt),
        attemptedAt: receivedAt
      });
      return { kind: "silent" };
    }
    const content = parsed.content;

    const judged = judgeGameweekResponse(content, previous, pool, gameweek);
    // An attempt that lands at or after the Lock is recorded as refused by the
    // Lock whatever the rules made of it, matching the Match track. Recording
    // a late legal action as legal would claim a Manager State that was never
    // stored, and recording it as a violation would put a failure of
    // punctuality into the profile of how an Entrant manages a Squad.
    const beforeLock = receivedAt < deadline;
    await recordAttempt(database, {
      entrantId: entrant.id,
      season,
      gameweek,
      attemptNo,
      failure: !beforeLock
        ? {
          kind: "deadline",
          reason: `The Lock passed at ${deadline.toISOString()}.`
        }
        : "state" in judged
          ? null
          : judged,
      rawResponse: response.body,
      resolvedProvider: parsed.resolvedProvider,
      resolvedModel: parsed.resolvedModel,
      tokensIn: parsed.tokensIn,
      tokensOut: parsed.tokensOut,
      latencyMs: elapsed(startedAt, receivedAt),
      attemptedAt: receivedAt
    });
    if (!beforeLock) {
      return { kind: "silent" };
    }
    if ("state" in judged) {
      return {
        kind: "action",
        state: judged.state,
        repairsUsed: attemptNo,
        receivedAt
      };
    }
    if (attemptNo === MAX_REPAIRS) {
      return { kind: "exhausted", receivedAt };
    }
    messages.push(
      { role: "assistant", content },
      { role: "user", content: gameweekRepairMessage(judged.reason) }
    );
  }
  // The loop returns from inside on every path an attempt can take, and the
  // Roll Over branch above always claims the last one.
  return { kind: "silent" };
}

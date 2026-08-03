import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  type FplTrackPlayer
} from "../context/build-fpl-track-context.js";
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
  openingManagerState,
  rolledOverState,
  type ManagerState,
  type PoolPlayer,
  type Position,
  type ViolationKind
} from "./apply-gameweek-action.js";
import {
  loadStandingManagerState,
  storeManagerState
} from "./manager-state-store.js";
import {
  gameweekRepairMessage,
  validateGameweekAction,
  GAMEWEEK_ACTION_SCHEMA_KIND
} from "./validate-gameweek-action.js";

type Database = Pick<Client, "query">;

/**
 * One Entrant per call. Gathering all nine and committing them atomically is
 * the "Start all nine Entrants together" ticket's job; opening them one at a
 * time from here would leave a partial start behind.
 */
export interface OpenFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  entrantId: string;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

interface PoolRow {
  fpl_id: number;
  team_name: string;
  web_name: string;
  position: Position;
  price_tenths: number;
  status: string;
}

interface EntrantRow {
  id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
}

/**
 * Stores the Gameweek's one FPL context and returns the body that is on
 * record. A later caller gets the stored text back rather than the one it just
 * built, so a player snapshot that moves between two Entrants cannot hand the
 * second of them a text the stored hash does not cover.
 *
 * That sharing is sound only while the text says nothing about which Entrant
 * is reading it, and `shared` is where the caller states that it does not. At
 * an opening every Entrant is handed the same seed state, so one row is one
 * Entrant's context and every Entrant's at once. Once any Manager State has
 * been stored, each Entrant's context carries its own Squad, and
 * `contexts_identity` — unique on (season, gw, track, fpl_id) — has room for
 * only one of them.
 */
async function storeFplContext(
  database: Database,
  season: string,
  gameweek: number,
  body: string,
  shared: boolean
): Promise<string> {
  const inserted = await database.query<{ body: string }>(
    `insert into contexts (season, gw, track, hash, body)
     values ($1, $2, 'fpl', $3, $4)
     on conflict (season, gw, track, (coalesce(fpl_id, -1))) do nothing
     returning body`,
    [season, gameweek, createHash("sha256").update(body).digest("hex"), body]
  );
  const insertedBody = inserted.rows[0]?.body;
  if (insertedBody !== undefined) {
    return insertedBody;
  }

  // The row that is already there belongs to another Entrant, and handing it
  // over would show this one a Squad it does not own and then judge it on the
  // Squad it does. Refusing loudly is the honest behaviour until per-Entrant
  // context rows exist — that belongs to "Run the FPL track under the shared
  // Lock", which is where the migration that widens the key belongs too.
  if (!shared) {
    throw new Error(
      `the FPL context for Gameweek ${gameweek} of ${season} is already `
      + "another Entrant's, and one Gameweek can hold only one"
    );
  }

  const stored = await database.query<{ body: string }>(
    `select body
       from contexts
      where season = $1 and gw = $2 and track = 'fpl'`,
    [season, gameweek]
  );
  const storedBody = stored.rows[0]?.body;
  if (storedBody === undefined) {
    throw new Error(
      `FPL context for Gameweek ${gameweek} of ${season} was not stored`
    );
  }
  return storedBody;
}

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

export async function openFplGameweek({
  database,
  season,
  gameweek,
  entrantId,
  apiKey,
  http,
  now
}: OpenFplGameweekOptions): Promise<void> {
  const gameweekResult = await database.query<{ deadline_at: Date }>(
    "select deadline_at from gameweeks where season = $1 and gw = $2",
    [season, gameweek]
  );
  const [gameweekRow] = gameweekResult.rows;
  if (gameweekRow === undefined) {
    throw new Error(`Gameweek ${gameweek} of ${season} is not scheduled`);
  }
  const deadline = gameweekRow.deadline_at;

  const poolResult = await database.query<PoolRow>(
    `select fpl_id, team_name, web_name, position, price_tenths, status
       from fpl_players
      where season = $1 and gw = $2
      order by fpl_id`,
    [season, gameweek]
  );
  const contextPool: FplTrackPlayer[] = poolResult.rows.map((row) => ({
    fplId: row.fpl_id,
    webName: row.web_name,
    club: row.team_name,
    position: row.position,
    priceTenths: row.price_tenths,
    status: row.status
  }));

  const entrantResult = await database.query<EntrantRow>(
    `select id, base_model, provider, quantization
       from models
      where id = $1 and role = 'entrant'`,
    [entrantId]
  );
  const [entrant] = entrantResult.rows;
  if (entrant === undefined) {
    throw new Error(`${entrantId} is not an Entrant`);
  }

  // What the Entrant carries in. Nothing stored yet is what makes a Gameweek
  // an opening, and it is also what decides whether a failed Gameweek can Roll
  // Over: there is no standing Team Sheet to roll onto before the first one.
  const standing = await loadStandingManagerState(database, {
    entrantId,
    season,
    before: gameweek
  });
  const previous = standing ?? openingManagerState();

  // Whether this Gameweek's context says anything about who is reading it.
  // It does not while every Entrant is still at its opening seed, and the
  // question is about every Entrant rather than this one: an Entrant that has
  // stored nothing yet would otherwise be handed a context built from someone
  // else's Squad and judged on the empty Squad it actually has.
  const started = await database.query(
    `select 1
       from manager_states
      where season = $1 and gw < $2
      limit 1`,
    [season, gameweek]
  );
  const body = await storeFplContext(
    database,
    season,
    gameweek,
    buildFplTrackContext({
      season,
      gameweek,
      state: previous,
      pool: contextPool
    }),
    started.rows.length === 0
  );
  // Priced from the context on record, never from a snapshot that may have
  // moved since it was stored.
  const pool = parseFplTrackContextPool(body);

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
      return;
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
      return;
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
        latencyMs: elapsed(startedAt, receivedAt),
        attemptedAt: receivedAt
      });
      return;
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
      return;
    }
    if ("state" in judged) {
      await storeManagerState(database, {
        entrantId: entrant.id,
        season,
        gameweek,
        state: judged.state,
        attemptsUsed: attemptNo,
        predictedAt: receivedAt
      });
      return;
    }
    if (attemptNo === MAX_REPAIRS) {
      // The fourth invalid response. The action is discarded whole and the
      // Gameweek Rolls Over onto the Team Sheet already standing (ADR-0004) —
      // never a score of zero, because zero is a punishment large enough to
      // drown out every other signal this track produces.
      //
      // Unless there is nothing standing. An Entrant that never produced a
      // legal opening has no Squad to play, and inventing one is not a thing
      // the rules can do; what happens to the Gameweek then belongs to "Start
      // all nine Entrants together", where the whole opening is committed or
      // none of it is.
      if (standing !== null) {
        await storeManagerState(database, {
          entrantId: entrant.id,
          season,
          gameweek,
          state: rolledOverState(standing),
          attemptsUsed: MAX_REPAIRS,
          rolledOver: true,
          predictedAt: receivedAt
        });
      }
      return;
    }
    messages.push(
      { role: "assistant", content },
      { role: "user", content: gameweekRepairMessage(judged.reason) }
    );
  }
}

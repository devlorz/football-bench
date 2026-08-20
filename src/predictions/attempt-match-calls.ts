import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher, HttpResponse } from "../http.js";
import { MAX_REPAIRS } from "../repairs.js";
import {
  openRouterRequest,
  parseOpenRouterResponse,
  TRUNCATED_AT_CEILING,
  type OpenRouterMessage
} from "./openrouter-entrant.js";
import {
  predictionRepairMessage,
  validatePrediction,
  type PredictionValidation
} from "./validate-prediction.js";
import type { AttemptTrigger } from "./prediction-trigger.js";
import type { ModelRole } from "../season-roster.js";

type Database = Pick<Client, "query">;

/** A stored `contexts` row: the id a Prediction cites and the bytes sent. */
export interface StoredContext {
  id: number;
  body: string;
}

/**
 * One call this engine will make: a row in `models` shown one Fixture's stored
 * context. `role` travels with it because the Lock is read off the role and
 * nothing else — see `recordPredictionResult`.
 */
export interface MatchCall {
  model_id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  role: ModelRole;
  fixture_id: number;
  context: StoredContext;
}

export interface AttemptMatchCallsOptions {
  database: Database;
  competition: string;
  season: string;
  gameweek: number;
  concurrency: number;
  apiKey: string;
  /** How long one Entrant may think here. Stated by every caller: a window
   * that defaults quietly is a window some path never reaches. */
  entrantCallTimeoutMs: number;
  http: HttpFetcher;
  now: () => Date;
  trigger: AttemptTrigger;
  calls: readonly MatchCall[];
}

/**
 * Refused at each entry point rather than inside the loop below, so no context
 * is stored and no row is called for a run that cannot fan out at all. A bound
 * of zero would otherwise start no worker and report a run that did nothing as
 * a run with nothing to do.
 */
export function requireCallConcurrency(concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Prediction concurrency must be a positive integer");
  }
}

interface AttemptTelemetry {
  latencyMs: number;
  rawResponse: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  attemptedAt: Date;
}

type ProviderFailureKind =
  | "provider"
  | "refusal"
  | "rate_limit"
  | "timeout";

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function elapsedMilliseconds(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

async function assignCanonicalLock(
  database: Database,
  competition: string,
  season: string,
  fixtureId: number,
  gameweek: number
): Promise<void> {
  await database.query(
    `update fixtures
        set locked_in_gw = coalesce(locked_in_gw, $4)
      where competition = $1 and season = $2 and fixture_id = $3`,
    [competition, season, fixtureId, gameweek]
  );
}

async function recordProviderFailure(options: {
  database: Database;
  modelId: string;
  competition: string;
  season: string;
  gameweek: number;
  fixtureId: number;
  attemptNo: number;
  trigger: AttemptTrigger;
  kind: ProviderFailureKind;
  detail: string;
  telemetry: AttemptTelemetry;
}): Promise<void> {
  const {
    database,
    modelId,
    competition,
    season,
    gameweek,
    fixtureId,
    attemptNo,
    trigger,
    kind,
    detail,
    telemetry
  } = options;
  await database.query("begin");
  try {
    await assignCanonicalLock(
      database,
      competition,
      season,
      fixtureId,
      gameweek
    );
    await database.query(
      `insert into attempts (
         model_id, competition, season, gw, track, fixture_id, attempt_no, ok,
         error_kind, error_detail, resolved_provider, resolved_model,
         latency_ms, tokens_in, tokens_out, raw_response, trigger, attempted_at
       ) values (
         $1, $2, $3, $4, 'match', $5, $6, false, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16
       )`,
      [
        modelId,
        competition,
        season,
        gameweek,
        fixtureId,
        attemptNo,
        kind,
        detail,
        telemetry.resolvedProvider,
        telemetry.resolvedModel,
        telemetry.latencyMs,
        telemetry.tokensIn,
        telemetry.tokensOut,
        telemetry.rawResponse,
        trigger,
        telemetry.attemptedAt
      ]
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

/**
 * Records the attempt and, when it stands, the Prediction — returning whether
 * the caller may still Repair.
 *
 * The Lock is asked of the role, not of a parameter. An Entrant answering after
 * its deadline has missed it, and the attempt says so with `error_kind`
 * `'deadline'` and no Prediction; an Exhibition Run answers after every
 * deadline by construction, which is the feature and not a miss (ADR-0032).
 * Honesty there rests on `predicted_at` and `attempted_at` post-dating the
 * deadlines they cover, which is what derives the "ran after Gameweek N"
 * label downstream — so a Lock refusal would refuse the whole feature, and a
 * boolean asking to skip it would be a second place for the role to be
 * contradicted.
 */
async function recordPredictionResult(options: {
  database: Database;
  call: MatchCall;
  competition: string;
  season: string;
  gameweek: number;
  attemptNo: number;
  trigger: AttemptTrigger;
  validation: PredictionValidation;
  telemetry: AttemptTelemetry;
}): Promise<boolean> {
  const {
    database,
    call,
    competition,
    season,
    gameweek,
    attemptNo,
    trigger,
    validation,
    telemetry
  } = options;
  const fixtureId = call.fixture_id;
  await database.query("begin");
  try {
    await assignCanonicalLock(
      database, competition, season, fixtureId, gameweek
    );
    const lockResult = await database.query<{ deadline_at: Date }>(
      `select g.deadline_at
         from fixtures f
         join gameweeks g
           on g.competition = f.competition
          and g.season = f.season
          and g.gw = f.locked_in_gw
        where f.competition = $1 and f.season = $2 and f.fixture_id = $3`,
      [competition, season, fixtureId]
    );
    const deadline = lockResult.rows[0]?.deadline_at;
    if (deadline === undefined) {
      throw new Error(`Fixture ${fixtureId} has no Lock`);
    }
    const missedLock = telemetry.attemptedAt.getTime() >= deadline.getTime()
      && call.role !== "exhibition";
    const attemptOk = validation.ok && !missedLock;
    const errorKind = missedLock
      ? "deadline"
      : validation.ok
        ? null
        : validation.kind;
    const errorDetail = missedLock
      ? `The Lock passed at ${deadline.toISOString()}.`
      : validation.ok
        ? null
        : validation.message;
    await database.query(
      `insert into attempts (
         model_id, competition, season, gw, track, fixture_id, attempt_no, ok,
         error_kind, error_detail, resolved_provider, resolved_model,
         latency_ms, tokens_in, tokens_out, raw_response, trigger,
         attempted_at
       ) values (
         $1, $2, $3, $4, 'match', $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17
       )`,
      [
        call.model_id,
        competition,
        season,
        gameweek,
        fixtureId,
        attemptNo,
        attemptOk,
        errorKind,
        errorDetail,
        telemetry.resolvedProvider,
        telemetry.resolvedModel,
        telemetry.latencyMs,
        telemetry.tokensIn,
        telemetry.tokensOut,
        telemetry.rawResponse,
        trigger,
        telemetry.attemptedAt
      ]
    );
    if (attemptOk) {
      await database.query(
        `insert into predictions (
           model_id, competition, season, fixture_id, probs, pred_home,
           pred_away, context_id, rationale, attempts_used, predicted_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (model_id, competition, season, fixture_id) do nothing`,
        [
          call.model_id,
          competition,
          season,
          fixtureId,
          validation.prediction.probs,
          validation.prediction.score.home,
          validation.prediction.score.away,
          call.context.id,
          validation.prediction.rationale,
          attemptNo,
          telemetry.attemptedAt
        ]
      );
    }
    await database.query("commit");
    return !missedLock;
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

/**
 * Calls every prepared (row, Fixture) pair, Repairing an invalid answer up to
 * `MAX_REPAIRS` times and recording every call in `attempts`.
 *
 * `eachBounded` deliberately is not used here. This loop stops early on a
 * persistence failure rather than running to the end, because an attempt
 * ledger that cannot be written makes every remaining call unrecordable.
 */
export async function attemptMatchCalls({
  database,
  competition,
  season,
  gameweek,
  concurrency,
  apiKey,
  entrantCallTimeoutMs,
  http,
  now,
  trigger,
  calls
}: AttemptMatchCallsOptions): Promise<void> {
  let persistenceTail: Promise<void> = Promise.resolve();
  function persist<T>(operation: () => Promise<T>): Promise<T> {
    const result = persistenceTail.then(operation);
    persistenceTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  let nextCall = 0;
  let persistenceFailure: unknown;
  async function persistProviderFailure(options: {
    call: MatchCall;
    attemptNo: number;
    kind: ProviderFailureKind;
    detail: string;
    telemetry: AttemptTelemetry;
  }): Promise<void> {
    const { call, attemptNo, kind, detail, telemetry } = options;
    try {
      await persist(() => recordProviderFailure({
        database,
        modelId: call.model_id,
        competition,
        season,
        gameweek,
        fixtureId: call.fixture_id,
        attemptNo,
        trigger,
        kind,
        detail,
        telemetry
      }));
    } catch (error) {
      persistenceFailure ??= error;
    }
  }

  async function worker(): Promise<void> {
    while (persistenceFailure === undefined) {
      const call = calls[nextCall];
      nextCall += 1;
      if (call === undefined) {
        return;
      }
      const messages: OpenRouterMessage[] = [{
        role: "user",
        content: call.context.body
      }];
      for (let attemptNo = 0; attemptNo <= MAX_REPAIRS; attemptNo += 1) {
        const startedAt = now();
        const request = openRouterRequest(
          apiKey,
          {
            baseModel: call.base_model,
            provider: call.provider,
            quantization: call.quantization
          },
          messages
        );
        const { url, ...requestOptions } = request;
        requestOptions.timeoutMs = entrantCallTimeoutMs;
        let response: HttpResponse;
        let completedAt: Date;
        try {
          response = await http(url, requestOptions);
          completedAt = now();
        } catch (error) {
          completedAt = now();
          await persistProviderFailure({
            call,
            attemptNo,
            kind: isTimeoutError(error) ? "timeout" : "provider",
            detail: `OpenRouter call failed: ${errorText(error)}.`,
            telemetry: {
              latencyMs: elapsedMilliseconds(startedAt, completedAt),
              rawResponse: null,
              resolvedProvider: null,
              resolvedModel: null,
              tokensIn: null,
              tokensOut: null,
              attemptedAt: completedAt
            }
          });
          break;
        }
        if (response.status < 200 || response.status >= 300) {
          await persistProviderFailure({
            call,
            attemptNo,
            kind: response.status === 429 ? "rate_limit" : "provider",
            detail: `OpenRouter returned HTTP ${response.status}.`,
            telemetry: {
              latencyMs: elapsedMilliseconds(startedAt, completedAt),
              rawResponse: response.body,
              resolvedProvider: null,
              resolvedModel: null,
              tokensIn: null,
              tokensOut: null,
              attemptedAt: completedAt
            }
          });
          break;
        }

        const parsedResponse = parseOpenRouterResponse(response.body);
        if (parsedResponse === null || parsedResponse.content === null) {
          await persistProviderFailure({
            call,
            attemptNo,
            kind: parsedResponse?.refusal === null
              || parsedResponse?.refusal === undefined
              ? "provider"
              : "refusal",
            detail: parsedResponse?.refusal
              ?? "OpenRouter returned an unexpected response shape.",
            telemetry: {
              latencyMs: elapsedMilliseconds(startedAt, completedAt),
              rawResponse: response.body,
              resolvedProvider: parsedResponse?.resolvedProvider ?? null,
              resolvedModel: parsedResponse?.resolvedModel ?? null,
              tokensIn: parsedResponse?.tokensIn ?? null,
              tokensOut: parsedResponse?.tokensOut ?? null,
              attemptedAt: completedAt
            }
          });
          break;
        }
        // Before the answer is judged, because a fragment cannot be judged and
        // must not be Repaired: the Repair would be cut at the same ceiling.
        if (parsedResponse.finishReason === "length") {
          await persistProviderFailure({
            call,
            attemptNo,
            kind: "provider",
            detail: TRUNCATED_AT_CEILING,
            telemetry: {
              latencyMs: elapsedMilliseconds(startedAt, completedAt),
              rawResponse: response.body,
              resolvedProvider: parsedResponse.resolvedProvider,
              resolvedModel: parsedResponse.resolvedModel,
              tokensIn: parsedResponse.tokensIn,
              tokensOut: parsedResponse.tokensOut,
              attemptedAt: completedAt
            }
          });
          break;
        }
        const responseContent = parsedResponse.content;
        const validation = validatePrediction(responseContent, call.fixture_id);
        let mayRepair = false;
        try {
          mayRepair = await persist(() => recordPredictionResult({
            database,
            call,
            competition,
            season,
            gameweek,
            attemptNo,
            trigger,
            validation,
            telemetry: {
              latencyMs: elapsedMilliseconds(startedAt, completedAt),
              rawResponse: response.body,
              resolvedProvider: parsedResponse.resolvedProvider,
              resolvedModel: parsedResponse.resolvedModel,
              tokensIn: parsedResponse.tokensIn,
              tokensOut: parsedResponse.tokensOut,
              attemptedAt: completedAt
            }
          }));
        } catch (error) {
          persistenceFailure ??= error;
        }
        if (
          persistenceFailure !== undefined
          || validation.ok
          || !mayRepair
          || attemptNo === MAX_REPAIRS
        ) {
          break;
        }
        messages.push(
          { role: "assistant", content: responseContent },
          {
            role: "user",
            content: predictionRepairMessage(
              validation.message,
              call.fixture_id
            )
          }
        );
      }
    }
  }

  const workerCount = Math.min(concurrency, calls.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );
  if (persistenceFailure !== undefined) {
    throw persistenceFailure;
  }
}

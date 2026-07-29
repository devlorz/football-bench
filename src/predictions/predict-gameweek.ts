import { createHash } from "node:crypto";
import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher, HttpResponse } from "../http.js";
import {
  buildMatchContext,
  loadMatchContextData
} from "./build-match-context.js";
import {
  MATCH_PROMPT_VERSION,
  openRouterRequest,
  parseOpenRouterResponse,
  type MatchPromptFixture,
  type OpenRouterMessage
} from "./openrouter-entrant.js";
import {
  predictionRepairMessage,
  validatePrediction,
  type PredictionValidation
} from "./validate-prediction.js";
import type { AttemptTrigger } from "./prediction-trigger.js";
import {
  readGapAlert,
  type GapAlert
} from "./gap-alert.js";

type Database = Pick<Client, "query">;

export interface PredictGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
  trigger?: AttemptTrigger;
}

type FixtureRow = MatchPromptFixture;

interface EntrantRow {
  id: string;
  base_model: string;
  provider: string;
  prompt_version: string;
  quantization: string | null;
}

interface WorkItemRow extends FixtureRow {
  entrant_id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
}

interface StoredContext {
  id: number;
  body: string;
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

const MAX_REPAIRS = 3;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function storeContext(
  database: Database,
  season: string,
  gameweek: number,
  fixture: FixtureRow,
  body: string
): Promise<StoredContext> {
  const inserted = await database.query<{ id: number }>(
    `insert into contexts (season, gw, track, fpl_id, hash, body)
     values ($1, $2, 'match', $3, $4, $5)
     on conflict (season, gw, track, (coalesce(fpl_id, -1))) do nothing
     returning id`,
    [season, gameweek, fixture.fpl_id, sha256(body), body]
  );
  const id = inserted.rows[0]?.id;
  if (id !== undefined) {
    return { id, body };
  }

  const stored = await database.query<{ id: number; body: string }>(
    `select id, body
       from contexts
      where season = $1
        and gw = $2
        and track = 'match'
        and fpl_id = $3`,
    [season, gameweek, fixture.fpl_id]
  );
  const context = stored.rows[0];
  if (context === undefined) {
    throw new Error(`Match context for Fixture ${fixture.fpl_id} was not stored`);
  }
  return context;
}

async function loadStoredContext(
  database: Database,
  season: string,
  gameweek: number,
  fixtureId: number,
  trigger: Exclude<AttemptTrigger, "main">
): Promise<StoredContext> {
  const stored = await database.query<{ id: number; body: string }>(
    `select id, body
       from contexts
      where season = $1
        and gw = $2
        and track = 'match'
        and fpl_id = $3`,
    [season, gameweek, fixtureId]
  );
  const context = stored.rows[0];
  if (context === undefined) {
    const runName = trigger === "fill" ? "Fill" : "Manual fill";
    throw new Error(
      `${runName} requires a stored Match context for Fixture ${fixtureId}`
    );
  }
  return context;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function elapsedMilliseconds(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

async function assignCanonicalLock(
  database: Database,
  season: string,
  fixtureId: number,
  gameweek: number
): Promise<void> {
  await database.query(
    `update fixtures
        set locked_in_gw = coalesce(locked_in_gw, $3)
      where season = $1 and fpl_id = $2`,
    [season, fixtureId, gameweek]
  );
}

async function recordProviderFailure(options: {
  database: Database;
  entrantId: string;
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
    entrantId,
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
      season,
      fixtureId,
      gameweek
    );
    await database.query(
      `insert into attempts (
         model_id, season, gw, track, fpl_id, attempt_no, ok,
         error_kind, error_detail, resolved_provider, resolved_model,
         latency_ms, tokens_in, tokens_out, raw_response, trigger, attempted_at
       ) values (
         $1, $2, $3, 'match', $4, $5, false, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15
       )`,
      [
        entrantId,
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

async function recordPredictionResult(options: {
  database: Database;
  entrantId: string;
  season: string;
  gameweek: number;
  fixtureId: number;
  contextId: number;
  attemptNo: number;
  trigger: AttemptTrigger;
  validation: PredictionValidation;
  telemetry: AttemptTelemetry;
}): Promise<boolean> {
  const {
    database,
    entrantId,
    season,
    gameweek,
    fixtureId,
    contextId,
    attemptNo,
    trigger,
    validation,
    telemetry
  } = options;
  await database.query("begin");
  try {
    await assignCanonicalLock(database, season, fixtureId, gameweek);
    const lockResult = await database.query<{ deadline_at: Date }>(
      `select g.deadline_at
         from fixtures f
         join gameweeks g
           on g.season = f.season
          and g.gw = f.locked_in_gw
        where f.season = $1 and f.fpl_id = $2`,
      [season, fixtureId]
    );
    const deadline = lockResult.rows[0]?.deadline_at;
    if (deadline === undefined) {
      throw new Error(`Fixture ${fixtureId} has no Lock`);
    }
    const beforeLock = telemetry.attemptedAt.getTime() < deadline.getTime();
    const attemptOk = validation.ok && beforeLock;
    const errorKind = !beforeLock
      ? "deadline"
      : validation.ok
        ? null
        : validation.kind;
    const errorDetail = !beforeLock
      ? `The Lock passed at ${deadline.toISOString()}.`
      : validation.ok
        ? null
        : validation.message;
    await database.query(
      `insert into attempts (
         model_id, season, gw, track, fpl_id, attempt_no, ok,
         error_kind, error_detail, resolved_provider, resolved_model,
         latency_ms, tokens_in, tokens_out, raw_response, trigger,
         attempted_at
       ) values (
         $1, $2, $3, 'match', $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16
       )`,
      [
        entrantId,
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
           model_id, season, fpl_id, probs, pred_home, pred_away,
           context_id, rationale, attempts_used, predicted_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (model_id, season, fpl_id) do nothing`,
        [
          entrantId,
          season,
          fixtureId,
          validation.prediction.probs,
          validation.prediction.score.home,
          validation.prediction.score.away,
          contextId,
          validation.prediction.rationale,
          attemptNo,
          telemetry.attemptedAt
        ]
      );
    }
    await database.query("commit");
    return beforeLock;
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

export async function predictGameweek({
  database,
  season,
  gameweek,
  concurrency,
  apiKey,
  http,
  now,
  trigger = "main"
}: PredictGameweekOptions): Promise<GapAlert | null> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Prediction concurrency must be a positive integer");
  }

  const entrantResult = await database.query<EntrantRow>(
    `select id, base_model, provider, quantization, prompt_version
       from models
      where role = 'entrant'
      order by id`
  );
  if (entrantResult.rows.length === 0) {
    throw new Error("No Entrants are configured");
  }
  const mismatchedPrompt = entrantResult.rows.find(
    ({ prompt_version: promptVersion }) =>
      promptVersion !== MATCH_PROMPT_VERSION
  );
  if (mismatchedPrompt !== undefined) {
    throw new Error(
      `Entrant ${mismatchedPrompt.id} uses Prompt Version `
      + `${mismatchedPrompt.prompt_version}; `
      + `expected ${MATCH_PROMPT_VERSION}`
    );
  }

  const work = await database.query<WorkItemRow>(
    `select
       f.fpl_id, f.home_team, f.away_team, f.kickoff_at,
       m.id as entrant_id, m.base_model, m.provider, m.quantization
      from fixtures f
      cross join models m
      where f.season = $1
        and coalesce(f.locked_in_gw, f.gw) = $2
        and m.role = 'entrant'
        and not exists (
          select 1
            from predictions p
           where p.model_id = m.id
             and p.season = f.season
             and p.fpl_id = f.fpl_id
        )
      order by f.fpl_id, m.id`,
    [season, gameweek]
  );

  const contextData = trigger === "main"
    ? await loadMatchContextData(database, season, gameweek)
    : null;

  const contexts = new Map<number, StoredContext>();
  for (const item of work.rows) {
    if (!contexts.has(item.fpl_id)) {
      contexts.set(
        item.fpl_id,
        trigger === "main"
          ? await storeContext(
            database,
            season,
            gameweek,
            item,
            buildMatchContext(item, contextData!)
          )
          : await loadStoredContext(
            database,
            season,
            gameweek,
            item.fpl_id,
            trigger
          )
      );
    }
  }

  let persistenceTail: Promise<void> = Promise.resolve();
  function persist<T>(operation: () => Promise<T>): Promise<T> {
    const result = persistenceTail.then(operation);
    persistenceTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  let nextItem = 0;
  let persistenceFailure: unknown;
  async function persistProviderFailure(options: {
    item: WorkItemRow;
    attemptNo: number;
    kind: ProviderFailureKind;
    detail: string;
    telemetry: AttemptTelemetry;
  }): Promise<void> {
    const { item, attemptNo, kind, detail, telemetry } = options;
    try {
      await persist(() => recordProviderFailure({
        database,
        entrantId: item.entrant_id,
        season,
        gameweek,
        fixtureId: item.fpl_id,
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
      const item = work.rows[nextItem];
      nextItem += 1;
      if (item === undefined) {
        return;
      }
      const context = contexts.get(item.fpl_id);
      if (context === undefined) {
        throw new Error(
          `Match context for Fixture ${item.fpl_id} was not prepared`
        );
      }
      const entrantId = item.entrant_id;
      const messages: OpenRouterMessage[] = [{
        role: "user",
        content: context.body
      }];
      for (let attemptNo = 0; attemptNo <= MAX_REPAIRS; attemptNo += 1) {
        const startedAt = now();
        const request = openRouterRequest(
          apiKey,
          {
            baseModel: item.base_model,
            provider: item.provider,
            quantization: item.quantization
          },
          messages
        );
        const { url, ...requestOptions } = request;
        let response: HttpResponse;
        let completedAt: Date;
        try {
          response = await http(url, requestOptions);
          completedAt = now();
        } catch (error) {
          completedAt = now();
          await persistProviderFailure({
            item,
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
            item,
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
            item,
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
        const responseContent = parsedResponse.content;
        const validation = validatePrediction(responseContent, item.fpl_id);
        let beforeLock = false;
        try {
          beforeLock = await persist(() => recordPredictionResult({
            database,
            entrantId,
            season,
            gameweek,
            fixtureId: item.fpl_id,
            contextId: context.id,
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
          || !beforeLock
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
              item.fpl_id
            )
          }
        );
      }
    }
  }

  const workerCount = Math.min(concurrency, work.rows.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );
  if (persistenceFailure !== undefined) {
    throw persistenceFailure;
  }
  return readGapAlert(database, season, gameweek, now);
}

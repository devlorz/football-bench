import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { HttpFetcher, HttpResponse } from "../http.js";
import {
  MATCH_PROMPT_VERSION,
  matchContext,
  openRouterRequest,
  parseOpenRouterResponse,
  type MatchPromptFixture
} from "./openrouter-entrant.js";
import { validatePrediction } from "./validate-prediction.js";

type Database = Pick<Client, "query">;

export interface PredictGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  entrantId: string;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

type FixtureRow = MatchPromptFixture;

interface EntrantRow {
  base_model: string;
  provider: string;
  prompt_version: string;
  quantization: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function storeContext(
  database: Database,
  season: string,
  gameweek: number,
  fixture: FixtureRow
): Promise<{ id: number; body: string }> {
  const body = matchContext(fixture);
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  detail: string;
  latencyMs: number;
  rawResponse: string | null;
  attemptedAt: Date;
}): Promise<void> {
  const {
    database,
    entrantId,
    season,
    gameweek,
    fixtureId,
    detail,
    latencyMs,
    rawResponse,
    attemptedAt
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
         error_kind, error_detail, latency_ms, raw_response, trigger,
         attempted_at
       ) values (
         $1, $2, $3, 'match', $4, 0, false, 'provider', $5, $6, $7,
         'main', $8
       )`,
      [
        entrantId,
        season,
        gameweek,
        fixtureId,
        detail,
        latencyMs,
        rawResponse,
        attemptedAt
      ]
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

export async function predictGameweek({
  database,
  season,
  gameweek,
  entrantId,
  apiKey,
  http,
  now
}: PredictGameweekOptions): Promise<void> {
  const entrantResult = await database.query<EntrantRow>(
    `select base_model, provider, quantization, prompt_version
       from models
      where id = $1
        and role = 'entrant'`,
    [entrantId]
  );
  const entrant = entrantResult.rows[0];
  if (entrant === undefined) {
    throw new Error(`Entrant ${entrantId} does not exist`);
  }
  if (entrant.prompt_version !== MATCH_PROMPT_VERSION) {
    throw new Error(
      `Entrant ${entrantId} uses Prompt Version ${entrant.prompt_version}; `
      + `expected ${MATCH_PROMPT_VERSION}`
    );
  }

  const fixtures = await database.query<FixtureRow>(
    `select fpl_id, home_team, away_team, kickoff_at
       from fixtures f
      where season = $1
        and gw = $2
        and not exists (
          select 1
            from predictions p
           where p.model_id = $3
             and p.season = f.season
             and p.fpl_id = f.fpl_id
        )
      order by fpl_id`,
    [season, gameweek, entrantId]
  );

  for (const fixture of fixtures.rows) {
    const context = await storeContext(database, season, gameweek, fixture);
    const startedAt = now();
    const request = openRouterRequest(
      apiKey,
      {
        baseModel: entrant.base_model,
        provider: entrant.provider,
        quantization: entrant.quantization
      },
      context.body
    );
    const { url, ...requestOptions } = request;
    let response: HttpResponse;
    let completedAt: Date;
    try {
      response = await http(url, requestOptions);
      completedAt = now();
    } catch (error) {
      completedAt = now();
      await recordProviderFailure({
        database,
        entrantId,
        season,
        gameweek,
        fixtureId: fixture.fpl_id,
        detail: `OpenRouter call failed: ${errorText(error)}.`,
        latencyMs: Math.max(
          0,
          completedAt.getTime() - startedAt.getTime()
        ),
        rawResponse: null,
        attemptedAt: completedAt
      });
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      const latencyMs = Math.max(
        0,
        completedAt.getTime() - startedAt.getTime()
      );
      await recordProviderFailure({
        database,
        entrantId,
        season,
        gameweek,
        fixtureId: fixture.fpl_id,
        detail: `OpenRouter returned HTTP ${response.status}.`,
        latencyMs,
        rawResponse: response.body,
        attemptedAt: completedAt
      });
      continue;
    }

    const parsedResponse = parseOpenRouterResponse(response.body);
    if (parsedResponse === null || parsedResponse.content === null) {
      await recordProviderFailure({
        database,
        entrantId,
        season,
        gameweek,
        fixtureId: fixture.fpl_id,
        detail: "OpenRouter returned an unexpected response shape.",
        latencyMs: Math.max(
          0,
          completedAt.getTime() - startedAt.getTime()
        ),
        rawResponse: response.body,
        attemptedAt: completedAt
      });
      continue;
    }
    const responseContent = parsedResponse.content;
    const validation = validatePrediction(responseContent, fixture.fpl_id);
    const predictedAt = completedAt;
    const rawEntrantResponse = responseContent;
    const latencyMs = Math.max(
      0,
      predictedAt.getTime() - startedAt.getTime()
    );
    await database.query("begin");
    try {
      await assignCanonicalLock(
        database,
        season,
        fixture.fpl_id,
        gameweek
      );
      const lockResult = await database.query<{ deadline_at: Date }>(
        `select g.deadline_at
           from fixtures f
           join gameweeks g
             on g.season = f.season
            and g.gw = f.locked_in_gw
          where f.season = $1 and f.fpl_id = $2`,
        [season, fixture.fpl_id]
      );
      const deadline = lockResult.rows[0]?.deadline_at;
      if (deadline === undefined) {
        throw new Error(`Fixture ${fixture.fpl_id} has no Lock`);
      }
      const beforeLock = predictedAt.getTime() < deadline.getTime();
      const attemptOk = validation.ok && beforeLock;
      const errorKind = !validation.ok
        ? validation.kind
        : beforeLock
          ? null
          : "deadline";
      const errorDetail = !validation.ok
        ? validation.message
        : beforeLock
          ? null
          : `The Lock passed at ${deadline.toISOString()}.`;
      await database.query(
        `insert into attempts (
           model_id, season, gw, track, fpl_id, attempt_no, ok,
           error_kind, error_detail, resolved_provider, resolved_model,
           latency_ms, tokens_in, tokens_out, raw_response, trigger,
           attempted_at
         ) values (
           $1, $2, $3, 'match', $4, 0, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, 'main', $14
         )`,
        [
          entrantId,
          season,
          gameweek,
          fixture.fpl_id,
          attemptOk,
          errorKind,
          errorDetail,
          parsedResponse.resolvedProvider,
          parsedResponse.resolvedModel,
          latencyMs,
          parsedResponse.tokensIn,
          parsedResponse.tokensOut,
          rawEntrantResponse,
          predictedAt
        ]
      );
      if (!attemptOk) {
        await database.query("commit");
        continue;
      }
      await database.query(
        `insert into predictions (
           model_id, season, fpl_id, probs, pred_home, pred_away,
           context_id, rationale, attempts_used, predicted_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
         on conflict (model_id, season, fpl_id) do nothing`,
        [
          entrantId,
          season,
          fixture.fpl_id,
          validation.prediction.probs,
          validation.prediction.score.home,
          validation.prediction.score.away,
          context.id,
          validation.prediction.rationale,
          predictedAt
        ]
      );
      await database.query("commit");
    } catch (error) {
      await database.query("rollback");
      throw error;
    }
  }
}

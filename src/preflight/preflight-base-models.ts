import { createHash } from "node:crypto";
import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";
import {
  MATCH_PROMPT_VERSION,
  openRouterRequest,
  parseOpenRouterResponse,
  type MatchPromptFixture
} from "../predictions/openrouter-entrant.js";
import {
  buildMatchContext,
  loadMatchContextData,
  type MatchContextData
} from "../predictions/build-match-context.js";
import { validatePrediction } from "../predictions/validate-prediction.js";
import {
  loadExhibition,
  type CalledRow
} from "../exhibition/load-exhibition.js";

type Database = Pick<Client, "query">;

interface FixtureRow extends MatchPromptFixture {
  gw: number;
}

export type PreflightStatus =
  | "parseable"
  | "refusal"
  | "unparseable"
  | "transport_error";

export interface PreflightResult {
  modelId: string;
  baseModel: string;
  status: PreflightStatus;
  detail: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  rawBody: string | null;
}

export interface PreflightReport {
  ok: boolean;
  fixture: {
    season: string;
    fplId: number;
    gameweek: number;
    homeTeam: string;
    awayTeam: string;
    kickoffAt: string;
  };
  results: PreflightResult[];
}

/**
 * What one pre-flight is aimed at: the whole roster, counted, or one
 * Exhibition model by id (ADR-0032). A late-arriving Base Model should surface
 * a content-policy refusal before a Season's worth of calls is paid for, and
 * it is not on the roster to be swept up by the scheduled check.
 *
 * Exactly one of the two, which is what the union says: a count beside an id
 * is a number about a roster this run is not checking, and neither is a roster
 * of no stated size. The absent side is spelled out as `undefined` so that
 * naming both is a type error rather than a silently ignored field.
 */
export type PreflightTarget =
  | { expectedEntrantCount: number; exhibitionModelId?: undefined }
  | { exhibitionModelId: string; expectedEntrantCount?: undefined };

export type PreflightBaseModelsOptions = {
  database: Database;
  season: string;
  fixtureId: number;
  apiKey: string;
  http: HttpFetcher;
} & PreflightTarget;

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function joinDetails(...details: Array<string | null>): string | null {
  const present = details.filter((detail): detail is string => detail !== null);
  return present.length === 0 ? null : present.join(" ");
}

function metadataDetail(
  resolvedProvider: string | null,
  resolvedModel: string | null
): string | null {
  return joinDetails(
    resolvedProvider === null
      ? "OpenRouter did not identify a selected provider."
      : null,
    resolvedModel === null
      ? "OpenRouter did not identify a selected model."
      : null
  );
}

async function archiveResponse(
  database: Database,
  baseModel: string,
  body: string
): Promise<void> {
  await database.query(
    `insert into raw_snapshots (source, sha256, body)
     values ($1, $2, $3)
     on conflict (source, sha256)
     do update set last_seen_at = now()`,
    [`openrouter-preflight:${baseModel}`, sha256(body), body]
  );
}

async function callBaseModel(options: {
  database: Database;
  model: CalledRow;
  fixture: FixtureRow;
  contextData: MatchContextData;
  apiKey: string;
  http: HttpFetcher;
}): Promise<PreflightResult> {
  const { database, model, fixture, contextData, apiKey, http } = options;
  const request = openRouterRequest(
    apiKey,
    {
      baseModel: model.base_model,
      provider: model.provider,
      quantization: model.quantization
    },
    buildMatchContext(fixture, contextData)
  );
  const { url, ...requestOptions } = request;

  let status: number;
  let body: string;
  try {
    const response = await http(url, requestOptions);
    status = response.status;
    body = response.body;
  } catch (error) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "transport_error",
      detail: `OpenRouter call failed: ${errorText(error)}.`,
      resolvedProvider: null,
      resolvedModel: null,
      rawBody: null
    };
  }

  if (status < 200 || status >= 300) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "transport_error",
      detail: `OpenRouter returned HTTP ${status}.`,
      resolvedProvider: null,
      resolvedModel: null,
      rawBody: body
    };
  }

  await archiveResponse(database, model.base_model, body);

  const parsed = parseOpenRouterResponse(body);
  if (parsed === null) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "transport_error",
      detail: "OpenRouter returned an unexpected response shape.",
      resolvedProvider: null,
      resolvedModel: null,
      rawBody: body
    };
  }

  const resolvedProvider = parsed.resolvedProvider;
  const resolvedModel = parsed.resolvedModel;
  const routingDetail = metadataDetail(resolvedProvider, resolvedModel);
  if (parsed.refusal !== null) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "refusal",
      detail: joinDetails(parsed.refusal, routingDetail),
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }
  if (parsed.content === null) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "unparseable",
      detail: joinDetails(
        "OpenRouter returned no message content.",
        routingDetail
      ),
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }
  const validation = validatePrediction(
    parsed.content,
    fixture.fpl_id
  );

  if (!validation.ok) {
    return {
      modelId: model.id,
      baseModel: model.base_model,
      status: "unparseable",
      detail: joinDetails(validation.message, routingDetail),
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }

  return {
    modelId: model.id,
    baseModel: model.base_model,
    status: "parseable",
    detail: routingDetail,
    resolvedProvider,
    resolvedModel,
    rawBody: routingDetail === null ? null : body
  };
}

export async function preflightBaseModels({
  database,
  season,
  fixtureId,
  expectedEntrantCount,
  exhibitionModelId,
  apiKey,
  http
}: PreflightBaseModelsOptions): Promise<PreflightReport> {
  // The union says one target or the other, and this says it again at the
  // boundary. Not for the CLI, which refuses both and neither while reading
  // the environment: for a programmatic caller reaching this directly, where
  // an ignored count or an unstated roster size would otherwise be silent.
  if (expectedEntrantCount !== undefined && exhibitionModelId !== undefined) {
    throw new Error(
      "Pre-flight checks the roster or one Exhibition, not both"
    );
  }
  if (expectedEntrantCount === undefined && exhibitionModelId === undefined) {
    throw new Error(
      "Pre-flight needs an Entrant count or an Exhibition model id"
    );
  }

  const fixtureResult = await database.query<FixtureRow>(
    `select fpl_id, gw, home_team, away_team, kickoff_at
       from fixtures
      where season = $1 and fpl_id = $2`,
    [season, fixtureId]
  );
  const fixture = fixtureResult.rows[0];
  if (fixture === undefined) {
    throw new Error(`Fixture ${fixtureId} does not exist in Season ${season}`);
  }

  // Either the roster, or the one Exhibition the operator aimed this at. The
  // prompt, the Fixture and the call path are the same either way — what an
  // Exhibition changes is only which rows are called, never how.
  let checked: CalledRow[];
  if (exhibitionModelId !== undefined) {
    checked = [await loadExhibition(database, exhibitionModelId)];
  } else {
    // The Match track's seats, told from the FPL track's by Prompt Version:
    // both mark a competitor with `role = 'entrant'` in the same table. The
    // count is still checked, and against the same number as before, so a
    // roster short of a Base Model is still refused before the first call.
    const entrants = await database.query<CalledRow>(
      `select id, base_model, provider, quantization, prompt_version
         from models
        where role = 'entrant' and prompt_version = $1
        order by id`,
      [MATCH_PROMPT_VERSION]
    );
    if (entrants.rows.length !== expectedEntrantCount) {
      throw new Error(
        `Pre-flight requires exactly ${expectedEntrantCount} Entrants at `
        + `Prompt Version ${MATCH_PROMPT_VERSION}; `
        + `found ${entrants.rows.length}`
      );
    }
    checked = entrants.rows;
  }

  const contextData = await loadMatchContextData(
    database,
    season,
    fixture.gw
  );
  const results: PreflightResult[] = [];
  for (const model of checked) {
    results.push(await callBaseModel({
      database,
      model,
      fixture,
      contextData,
      apiKey,
      http
    }));
  }

  return {
    ok: results.every((result) =>
      result.status === "parseable"
      && result.resolvedProvider !== null
      && result.resolvedModel !== null
    ),
    fixture: {
      season,
      fplId: fixture.fpl_id,
      gameweek: fixture.gw,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      kickoffAt: fixture.kickoff_at.toISOString()
    },
    results
  };
}

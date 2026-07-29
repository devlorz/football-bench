import { createHash } from "node:crypto";
import type { Client } from "pg";
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

type Database = Pick<Client, "query">;

interface FixtureRow extends MatchPromptFixture {
  gw: number;
}

interface EntrantRow {
  id: string;
  base_model: string;
  provider: string;
  prompt_version: string;
  quantization: string | null;
}

export type PreflightStatus =
  | "parseable"
  | "refusal"
  | "unparseable"
  | "transport_error";

export interface PreflightResult {
  entrantId: string;
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

export interface PreflightBaseModelsOptions {
  database: Database;
  season: string;
  fixtureId: number;
  expectedEntrantCount: number;
  apiKey: string;
  http: HttpFetcher;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  entrant: EntrantRow;
  fixture: FixtureRow;
  contextData: MatchContextData;
  apiKey: string;
  http: HttpFetcher;
}): Promise<PreflightResult> {
  const { database, entrant, fixture, contextData, apiKey, http } = options;
  const request = openRouterRequest(
    apiKey,
    {
      baseModel: entrant.base_model,
      provider: entrant.provider,
      quantization: entrant.quantization
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
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "transport_error",
      detail: `OpenRouter call failed: ${errorText(error)}.`,
      resolvedProvider: null,
      resolvedModel: null,
      rawBody: null
    };
  }

  if (status < 200 || status >= 300) {
    return {
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "transport_error",
      detail: `OpenRouter returned HTTP ${status}.`,
      resolvedProvider: null,
      resolvedModel: null,
      rawBody: body
    };
  }

  await archiveResponse(database, entrant.base_model, body);

  const parsed = parseOpenRouterResponse(body);
  if (parsed === null) {
    return {
      entrantId: entrant.id,
      baseModel: entrant.base_model,
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
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "refusal",
      detail: joinDetails(parsed.refusal, routingDetail),
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }
  if (parsed.content === null) {
    return {
      entrantId: entrant.id,
      baseModel: entrant.base_model,
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
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "unparseable",
      detail: joinDetails(validation.message, routingDetail),
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }

  return {
    entrantId: entrant.id,
    baseModel: entrant.base_model,
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
  apiKey,
  http
}: PreflightBaseModelsOptions): Promise<PreflightReport> {
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

  const entrants = await database.query<EntrantRow>(
    `select id, base_model, provider, quantization, prompt_version
       from models
      where role = 'entrant'
      order by id`
  );
  if (entrants.rows.length !== expectedEntrantCount) {
    throw new Error(
      `Pre-flight requires exactly ${expectedEntrantCount} Entrants; `
      + `found ${entrants.rows.length}`
    );
  }
  const mismatchedPrompt = entrants.rows.find(
    ({ prompt_version: promptVersion }) =>
      promptVersion !== MATCH_PROMPT_VERSION
  );
  if (mismatchedPrompt !== undefined) {
    throw new Error(
      `Pre-flight requires Prompt Version ${MATCH_PROMPT_VERSION}; `
      + `${mismatchedPrompt.id} uses ${mismatchedPrompt.prompt_version}`
    );
  }

  const contextData = await loadMatchContextData(
    database,
    season,
    fixture.gw
  );
  const results: PreflightResult[] = [];
  for (const entrant of entrants.rows) {
    results.push(await callBaseModel({
      database,
      entrant,
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

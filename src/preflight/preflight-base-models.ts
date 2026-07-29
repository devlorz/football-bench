import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import {
  MATCH_PROMPT_VERSION,
  matchContext,
  openRouterRequest,
  parseOpenRouterResponse,
  type MatchPromptFixture
} from "../predictions/openrouter-entrant.js";
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
  apiKey: string;
  http: HttpFetcher;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
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
  apiKey: string;
  http: HttpFetcher;
}): Promise<PreflightResult> {
  const { database, entrant, fixture, apiKey, http } = options;
  const request = openRouterRequest(
    apiKey,
    {
      baseModel: entrant.base_model,
      provider: entrant.provider,
      quantization: entrant.quantization
    },
    matchContext(fixture)
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
  if (parsed.refusal !== null) {
    return {
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "refusal",
      detail: parsed.refusal,
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
      detail: "OpenRouter returned no message content.",
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }
  const validation = validatePrediction(
    parsed.content,
    fixture.fpl_id
  );
  const metadataDetail = resolvedProvider === null
    ? "OpenRouter did not identify a selected provider."
    : null;

  if (!validation.ok) {
    return {
      entrantId: entrant.id,
      baseModel: entrant.base_model,
      status: "unparseable",
      detail: metadataDetail ?? validation.message,
      resolvedProvider,
      resolvedModel,
      rawBody: body
    };
  }

  return {
    entrantId: entrant.id,
    baseModel: entrant.base_model,
    status: "parseable",
    detail: metadataDetail,
    resolvedProvider,
    resolvedModel,
    rawBody: metadataDetail === null ? null : body
  };
}

export async function preflightBaseModels({
  database,
  season,
  fixtureId,
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
  if (entrants.rows.length !== 9) {
    throw new Error(
      `Pre-flight requires exactly nine Entrants; found ${entrants.rows.length}`
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

  const results: PreflightResult[] = [];
  for (const entrant of entrants.rows) {
    results.push(await callBaseModel({
      database,
      entrant,
      fixture,
      apiKey,
      http
    }));
  }

  return {
    ok: results.every((result) =>
      result.status === "parseable"
      && result.resolvedProvider !== null
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

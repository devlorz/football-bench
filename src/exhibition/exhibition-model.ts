import type { Client } from "pg";
import { MATCH_PROMPT_VERSION } from "../predictions/openrouter-entrant.js";

type Database = Pick<Client, "query">;

/**
 * One `models` row a run will call. Deliberately not named for a role: the
 * same shape carries an Entrant of the roster and an Exhibition Run, and an
 * Exhibition is not a competitor on the leaderboard.
 */
export interface CalledRow {
  id: string;
  base_model: string;
  provider: string;
  prompt_version: string;
  quantization: string | null;
}

/**
 * The one Exhibition row the operator named, or a refusal saying which of the
 * three things is wrong with the id: no such row, a row that is not an
 * Exhibition, or one that is not at the Prompt Version the caller sends. A
 * typo must not put an Entrant through this door, and a row cannot claim one
 * Prompt Version while being called at another — the frozen Match prompt is
 * the only thing the Match track builds and there is no way to configure it
 * (ADR-0001).
 */
export async function loadExhibition(
  database: Database,
  modelId: string
): Promise<CalledRow> {
  const result = await database.query<CalledRow & { role: string }>(
    `select id, base_model, provider, quantization, prompt_version, role
       from models
      where id = $1`,
    [modelId]
  );
  const model = result.rows[0];
  if (model === undefined) {
    throw new Error(`${modelId} has no row in models`);
  }
  if (model.role !== "exhibition") {
    throw new Error(
      `${modelId} has role '${model.role}', not 'exhibition'`
    );
  }
  if (model.prompt_version !== MATCH_PROMPT_VERSION) {
    throw new Error(
      `${modelId} is at Prompt Version ${model.prompt_version}, `
      + `not ${MATCH_PROMPT_VERSION}`
    );
  }
  return model;
}

import type { Client } from "pg";
import type { FPL_PROMPT_VERSION } from "../context/build-fpl-track-context.js";
import type { MATCH_PROMPT_VERSION } from "../predictions/openrouter-entrant.js";
import type { ModelRole } from "../season-roster.js";

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
  /**
   * The stored role, carried rather than left behind once checked: what a call
   * is entitled to — the Lock above all — is decided by this column, and a
   * caller restating it as a literal would be a second place for it to be
   * wrong.
   */
  role: ModelRole;
}

/**
 * The frozen Prompt Versions a run can be at — which is the same thing as
 * which track it is. Named as the two constants rather than as `string`, so a
 * caller cannot ask this door to admit a version nothing builds.
 *
 * Narrower than that since ADR-0038: the match track now builds one Prompt
 * Version per Competition, and this admits only the Premier League's. Left
 * narrow deliberately — an Exhibition Run replays one Competition's stored
 * contexts under that Competition's version (ADR-0038's own consequence), and
 * deciding what that means is the work that should widen this, not a `string`
 * here ahead of it. Until then a non-`PL` Exhibition is unsayable rather than
 * silently replayed under the wrong league's prompt.
 */
type FrozenPromptVersion =
  | typeof MATCH_PROMPT_VERSION
  | typeof FPL_PROMPT_VERSION;

/**
 * The one Exhibition row the operator named, or a refusal saying which of the
 * three things is wrong with the id: no such row, a row that is not an
 * Exhibition, or one that is not at the frozen Prompt Version the caller
 * builds. A typo must not put an Entrant through this door, and a row cannot
 * claim one Prompt Version while being called at another.
 *
 * The version is the caller's because it says which track it is: a Match replay
 * and an FPL replay build different frozen prompts, and each has exactly one it
 * can build with no way to configure another (ADR-0001). Reading it off the row
 * instead would make this check agree with whatever it found.
 */
export async function loadExhibition(
  database: Database,
  modelId: string,
  promptVersion: FrozenPromptVersion
): Promise<CalledRow> {
  const result = await database.query<CalledRow>(
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
  if (model.prompt_version !== promptVersion) {
    throw new Error(
      `${modelId} is at Prompt Version ${model.prompt_version}, `
      + `not ${promptVersion}`
    );
  }
  return model;
}

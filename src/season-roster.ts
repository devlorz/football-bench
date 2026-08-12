import type { Client as PgClient } from "pg";
import { MATCH_PROMPT_VERSION } from "./predictions/openrouter-entrant.js";

type Database = Pick<PgClient, "query">;

/**
 * How many Entrants a Season is run with (ADR-0014): three frontier Base
 * Models, one more first-party and five open-weight.
 *
 * It is a fixed number rather than whatever the `models` table happens to
 * hold, because the roster size is a recorded decision and half the results
 * are read against it — ADR-0011's complete-case intersection, ADR-0016's
 * eight comparisons against the leader, and the FPL track's demonstration of
 * one season path per Base Model. A track that quietly started eight would
 * produce all of those numbers and none of them would mean what they say.
 */
export const SEASON_ROSTER_SIZE = 9;

/** Where a Base Model comes from (CONTEXT.md, ADR-0009, ADR-0014). */
type BaseModelClass = "Frontier" | "First-party" | "Open-weight";

export interface Entrant {
  id: string;
  name: string;
  /**
   * What goes on the wire as OpenRouter's `model`. Undated on purpose: the
   * dated id is the *resolved* model OpenRouter reports back, and pinning the
   * request to it would remove the thing ADR-0009 relies on — a vendor moving
   * the snapshot under a stable name is detectable only if the name is stable.
   * The dated id it must resolve to is `canonicalSlug`.
   */
  baseModel: string;
  /** OpenRouter provider slug, pinned with fallbacks off (ADR-0009). */
  provider: string;
  /**
   * Pinned on the open-weight seats and null on the rest (ADR-0009,
   * ADR-0014): a served open-weight Base Model is a different model at a
   * different precision, so an unpinned one is not one Entrant across a
   * Season. A first-party seat has nothing to pin.
   */
  quantization: string | null;
  /** The dated model every pre-flight has observed this seat resolving to. */
  canonicalSlug: string;
  baseModelClass: BaseModelClass;
}

/**
 * The nine seats of ADR-0014, as they stand in the production `models` table.
 *
 * Read off the live table on 2026-08-12 and agreeing, field for field, with
 * the roster-resolution tables of the three pre-flight reports in
 * `docs/reports` — every `canonicalSlug` is that report's resolved model and
 * every `provider` is the slug behind its resolved provider's display name.
 * Until now the roster existed only as rows somebody typed at deploy time;
 * this is the written record. `src/seed-season.ts` holds a different nine on
 * purpose — the design mock's placeholders — and is not a source for these.
 */
export const SEASON_ROSTER: readonly Entrant[] = [
  {
    id: "match/claude-opus-5", name: "Claude Opus 5",
    baseModel: "anthropic/claude-opus-5", provider: "anthropic",
    quantization: null,
    canonicalSlug: "anthropic/claude-opus-5-20260723",
    baseModelClass: "Frontier"
  },
  {
    id: "match/gpt-5.6-sol-pro", name: "GPT-5.6 Sol Pro",
    baseModel: "openai/gpt-5.6-sol-pro", provider: "openai",
    quantization: null,
    canonicalSlug: "openai/gpt-5.6-sol-pro-20260709",
    baseModelClass: "Frontier"
  },
  {
    id: "match/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview",
    baseModel: "google/gemini-3.1-pro-preview", provider: "google-ai-studio",
    quantization: null,
    canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
    baseModelClass: "Frontier"
  },
  {
    id: "match/grok-4.5", name: "Grok 4.5",
    baseModel: "x-ai/grok-4.5", provider: "xai",
    quantization: null,
    canonicalSlug: "x-ai/grok-4.5-20260708",
    baseModelClass: "First-party"
  },
  {
    id: "match/kimi-k3", name: "Kimi K3",
    baseModel: "moonshotai/kimi-k3", provider: "moonshotai",
    quantization: "mxfp4",
    canonicalSlug: "moonshotai/kimi-k3-20260715",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/glm-5.2", name: "GLM 5.2",
    baseModel: "z-ai/glm-5.2", provider: "z-ai",
    quantization: "fp8",
    canonicalSlug: "z-ai/glm-5.2-20260616",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/deepseek-v4-pro", name: "DeepSeek V4 Pro",
    baseModel: "deepseek/deepseek-v4-pro", provider: "novita",
    quantization: "fp8",
    canonicalSlug: "deepseek/deepseek-v4-pro-20260423",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/qwen3.7-max", name: "Qwen3.7 Max",
    baseModel: "qwen/qwen3.7-max", provider: "alibaba",
    // The one open-weight seat with no quantization pin, and it is not a
    // weakening of ADR-0009. OpenRouter lists exactly one endpoint for this
    // Base Model -- Alibaba's -- and its published quantization moved from
    // `fp8` to `unknown` between 2026-07-29 and 2026-08-12, so an `fp8`
    // filter now matches nothing and the seat answers HTTP 404 rather than
    // serving. Where a Base Model has a single endpoint the provider pin
    // already fixes the precision the pin was there to fix; pin it again the
    // day a second endpoint appears.
    quantization: null,
    canonicalSlug: "qwen/qwen3.7-max-20260520",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/minimax-m3", name: "MiniMax M3",
    baseModel: "minimax/minimax-m3", provider: "minimax",
    quantization: "fp8",
    canonicalSlug: "minimax/minimax-m3-20260531",
    baseModelClass: "Open-weight"
  }
];

/** When the operator last checked these seats against OpenRouter's catalog. */
const CATALOG_CHECKED_AT = "2026-08-12";

/**
 * Upserts the nine Entrant rows for `season`'s Prompt Version, and nothing
 * else — no Fixtures, no Predictions.
 *
 * `config` is merged rather than replaced: these rows were hand-entered, so
 * the table may carry a key this module has never heard of, and a re-entry
 * that dropped it would destroy the only copy.
 */
export async function enterSeasonRoster(
  database: Database,
  season: string
): Promise<readonly string[]> {
  // The models table has no Season column — a seat belongs to a Season only
  // through its Prompt Version. So the operator's SEASON and the frozen
  // version have to name the same Season, or this writes the wrong roster
  // into a database that will never say so.
  if (!MATCH_PROMPT_VERSION.startsWith(`match/${season}-`)) {
    throw new Error(
      `SEASON ${season} does not own Prompt Version ${MATCH_PROMPT_VERSION}`
    );
  }
  if (SEASON_ROSTER.length !== SEASON_ROSTER_SIZE) {
    throw new Error(
      `The roster holds ${SEASON_ROSTER.length} Entrants, not `
      + `${SEASON_ROSTER_SIZE} (ADR-0014)`
    );
  }

  await database.query("begin");
  try {
    for (const entrant of SEASON_ROSTER) {
      await database.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role,
           config
         ) values ($1, $2, $3, $4, $5, $6, 'entrant', $7)
         on conflict (id) do update set
           name = excluded.name,
           base_model = excluded.base_model,
           provider = excluded.provider,
           quantization = excluded.quantization,
           prompt_version = excluded.prompt_version,
           role = excluded.role,
           config = models.config || excluded.config`,
        [
          entrant.id,
          entrant.name,
          entrant.baseModel,
          entrant.provider,
          entrant.quantization,
          MATCH_PROMPT_VERSION,
          JSON.stringify({
            baseModelClass: entrant.baseModelClass,
            canonical_slug: entrant.canonicalSlug,
            catalog_checked_at: CATALOG_CHECKED_AT
          })
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }

  return SEASON_ROSTER.map(({ id }) => id);
}

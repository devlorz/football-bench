import type { Client as PgClient } from "pg";
import { MATCH_PROMPT_VERSION } from "./predictions/openrouter-entrant.js";

type Database = Pick<PgClient, "query">;

/**
 * How many Entrants a Season is run with (ADR-0034): three frontier Base
 * Models, two first-party and five open-weight.
 *
 * It is a fixed number rather than whatever the `models` table happens to
 * hold, because the roster size is a recorded decision and half the results
 * are read against it — ADR-0011's complete-case intersection, ADR-0016's
 * nine comparisons against the leader, and the FPL track's demonstration of
 * one season path per Base Model. A track that quietly started nine would
 * produce all of those numbers and none of them would mean what they say.
 */
export const SEASON_ROSTER_SIZE = 10;

/**
 * What a `models` row is for, as its check constraint admits (migrations 0001
 * and 0019): a competitor on a leaderboard, a Reference Line, or a
 * retrospective Exhibition Run.
 *
 * All three and not just the two that predict, because this is what the column
 * holds rather than what any one reader wants of it — a query that filters the
 * role down still reads rows of this type, and what a Reference Line may do is
 * decided by asking, not by being unsayable.
 */
export type ModelRole = "entrant" | "reference" | "exhibition";

/** Where a Base Model comes from (CONTEXT.md, ADR-0009, ADR-0034). */
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
   * ADR-0034): a served open-weight Base Model is a different Base Model at a
   * different precision, so an unpinned one is not one Entrant across a
   * Season. A first-party seat has nothing to pin.
   */
  quantization: string | null;
  /**
   * The dated Base Model every pre-flight has observed this seat resolving to.
   */
  canonicalSlug: string;
  baseModelClass: BaseModelClass;
  /**
   * When the operator last checked *this* seat against OpenRouter's catalog.
   *
   * Per seat rather than one date over the roster, because the roster is no
   * longer entered all at once: a check that looked at three arriving Base
   * Models did not look at Kimi, and stamping its date on Kimi's row would
   * record an observation nobody made.
   */
  catalogCheckedAt: string;
}

/**
 * The ten seats of ADR-0034: ADR-0014's nine with the Qwen and Grok seats
 * passed to their successors and Muse Spark 1.2 added.
 *
 * All ten agree, field for field, with the roster-resolution table of
 * `docs/reports/2026-08-15-ten-entrant-roster-preflight.md`: every
 * `canonicalSlug` is that report's resolved model and every `provider` is the
 * slug behind its resolved provider's display name. The three arriving seats
 * were entered on ADR-0034's catalog expectation and the pre-flight resolved
 * each to exactly that, so the values did not move — what moved is what stands
 * behind them, from an expectation to an observation.
 * `src/seed-season.ts` holds a different nine on purpose — the design mock's
 * placeholders — and is not a source for these.
 */
export const SEASON_ROSTER: readonly Entrant[] = [
  {
    id: "match/claude-opus-5", name: "Claude Opus 5",
    baseModel: "anthropic/claude-opus-5", provider: "anthropic",
    quantization: null,
    canonicalSlug: "anthropic/claude-opus-5-20260723",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Frontier"
  },
  {
    id: "match/gpt-5.6-sol-pro", name: "GPT-5.6 Sol Pro",
    baseModel: "openai/gpt-5.6-sol-pro", provider: "openai",
    quantization: null,
    canonicalSlug: "openai/gpt-5.6-sol-pro-20260709",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Frontier"
  },
  {
    id: "match/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview",
    baseModel: "google/gemini-3.1-pro-preview", provider: "google-ai-studio",
    quantization: null,
    canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Frontier"
  },
  {
    id: "match/grok-4.6", name: "Grok 4.6",
    baseModel: "x-ai/grok-4.6", provider: "xai",
    quantization: null,
    canonicalSlug: "x-ai/grok-4.6-20260810",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "First-party"
  },
  {
    id: "match/muse-spark-1.2", name: "Muse Spark 1.2",
    baseModel: "meta/muse-spark-1.2", provider: "meta",
    // First-party by CONTEXT.md's criterion — Meta serves its own Base Model
    // as the sole endpoint — so the provider pin is the whole of it and there
    // is no precision to fix.
    quantization: null,
    canonicalSlug: "meta/muse-spark-1.2-20260805",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "First-party"
  },
  {
    id: "match/kimi-k3", name: "Kimi K3",
    baseModel: "moonshotai/kimi-k3", provider: "moonshotai",
    quantization: "mxfp4",
    canonicalSlug: "moonshotai/kimi-k3-20260715",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/glm-5.2", name: "GLM 5.2",
    baseModel: "z-ai/glm-5.2", provider: "z-ai",
    quantization: "fp8",
    canonicalSlug: "z-ai/glm-5.2-20260616",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/deepseek-v4-pro", name: "DeepSeek V4 Pro",
    baseModel: "deepseek/deepseek-v4-pro", provider: "novita",
    quantization: "fp8",
    canonicalSlug: "deepseek/deepseek-v4-pro-20260423",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/qwen3.8-max", name: "Qwen3.8 Max",
    baseModel: "qwen/qwen3.8-max", provider: "alibaba",
    // The one open-weight seat with no quantization pin, and it is not a
    // weakening of ADR-0009. The justification carries over from Qwen3.7 Max
    // with the succession (ADR-0034): OpenRouter lists exactly one endpoint
    // for this Base Model -- Alibaba's -- at quantization `unknown`, so an
    // `fp8` filter matches nothing and the seat answers HTTP 404 rather than
    // serving. Where a Base Model has a single endpoint the provider pin
    // already fixes the precision the pin was there to fix; pin it again the
    // day a second endpoint appears.
    quantization: null,
    canonicalSlug: "qwen/qwen3.8-max-20260803",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Open-weight"
  },
  {
    id: "match/minimax-m3", name: "MiniMax M3",
    baseModel: "minimax/minimax-m3", provider: "minimax",
    quantization: "fp8",
    canonicalSlug: "minimax/minimax-m3-20260531",
    catalogCheckedAt: "2026-08-15",
    baseModelClass: "Open-weight"
  }
];

/**
 * Upserts the ten Entrant rows for `season`'s Prompt Version, and nothing
 * else — no Fixtures, no Predictions.
 *
 * `config` is merged rather than replaced: these rows were hand-entered, so
 * the table may carry a key this module has never heard of, and a re-entry
 * that dropped it would destroy the only copy.
 *
 * `roster` defaults to the roster of record and exists so that the size guard
 * below can be walked into. A guard that only the constant beside it can reach
 * is a guard nothing has ever seen bite, and this one stands between a
 * careless edit and a Season entered at the wrong size.
 */
export async function enterSeasonRoster(
  database: Database,
  season: string,
  roster: readonly Entrant[] = SEASON_ROSTER
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
  if (roster.length !== SEASON_ROSTER_SIZE) {
    throw new Error(
      `The roster holds ${roster.length} Entrants, not `
      + `${SEASON_ROSTER_SIZE} (ADR-0034)`
    );
  }

  await database.query("begin");
  try {
    for (const entrant of roster) {
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
            catalog_checked_at: entrant.catalogCheckedAt
          })
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }

  return roster.map(({ id }) => id);
}

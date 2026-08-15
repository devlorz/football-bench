import type { Client as PgClient } from "pg";
import {
  MATCH_PROMPT_VERSIONS,
  matchPromptOf
} from "./predictions/openrouter-entrant.js";

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
 * The prefix a Competition's seat ids take, read off the Prompt Version its
 * seats are entered under, having first refused a version that is not this
 * Season's match track.
 *
 * The `models` table has no Season, Competition or track column — a seat
 * belongs to all three only through its Prompt Version — so both halves of the
 * string are load-bearing: the leading segment becomes the seat's id, and the
 * trailing one names the Season.
 *
 * The track segment is checked and not merely read, because it is what the
 * upsert keys on: a `MATCH_PROMPTS` entry whose version began `fpl/` would
 * build ten `fpl/…` ids and overwrite the FPL track's ten seats in silence.
 * Story 25 extends the Season-prefix rule to carry the Competition — extends,
 * so the track it was scoped to has to stay named. **Found by review.**
 *
 * Exported so the refusals can be walked into: neither is reachable through
 * `MATCH_PROMPTS` as it stands, and a guard nothing has ever seen bite is the
 * kind that turns out not to.
 */
export function seatPrefixOf(version: string, season: string): string {
  const [seatPrefix = "", seasonSegment = ""] = version.split("/");
  if (seatPrefix !== "match" && !seatPrefix.startsWith("match-")) {
    throw new Error(`Prompt Version ${version} is not the match track's`);
  }
  if (!seasonSegment.startsWith(`${season}-`)) {
    throw new Error(`SEASON ${season} does not own Prompt Version ${version}`);
  }
  return seatPrefix;
}

/**
 * What a seat is entered as, as opposed to what has been observed about it.
 *
 * `catalogCheckedAt` is deliberately not among them: it records when an
 * operator last looked at the seat, so a re-check must be writable without
 * being a new Entrant. Everything else is the Base Model the Season was run
 * with, and `baseModel` is the string that goes on the wire.
 */
function identityOfEntrant(entrant: Entrant): Record<string, string | null> {
  return {
    name: entrant.name,
    base_model: entrant.baseModel,
    provider: entrant.provider,
    quantization: entrant.quantization,
    canonical_slug: entrant.canonicalSlug,
    baseModelClass: entrant.baseModelClass
  };
}

interface StoredSeat {
  id: string;
  name: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  config: { canonical_slug?: unknown; baseModelClass?: unknown };
}

function identityOfSeat(seat: StoredSeat): Record<string, string | null> {
  return {
    name: seat.name,
    base_model: seat.base_model,
    provider: seat.provider,
    quantization: seat.quantization,
    canonical_slug: String(seat.config.canonical_slug ?? ""),
    baseModelClass: String(seat.config.baseModelClass ?? "")
  };
}

/** Everything after the Competition prefix: `match-pd/kimi-k3` is `kimi-k3`. */
function seatSlug(id: string): string {
  return id.slice(id.indexOf("/") + 1);
}

/**
 * The Season Roster that stood at the Season's first Lock is recorded in the
 * database, not in this file: the Match seats already stored are what it was.
 *
 * Comparing the constant against itself proves nothing across a deployment.
 * `SEASON_ROSTER` is editable, and an edit that kept the ids while moving a
 * Base Model behind one would be invisible to a guard that reads the constant
 * twice — the Competition seated afterwards would get the new Base Model, and
 * re-running an already-seated Competition would rewrite its stored identity
 * through the upsert. ADR-0034 closes the roster at the first Lock and sends
 * every arrival after it to an Exhibition Run; ADR-0038 says a Competition
 * opening later seats that same roster whenever it opens. Neither is a claim
 * about one process's memory. **Found by review.**
 *
 * Every Competition's seats are read, not this Competition's: the ten are one
 * roster across the leagues (ADR-0038), so the Premier League's stored seats
 * are the record La Liga's are checked against.
 */
async function refuseARosterTheRecordDisagreesWith(
  database: Database,
  roster: readonly Entrant[]
): Promise<void> {
  const stored = await database.query<StoredSeat>(
    `select id, name, base_model, provider, quantization, config
       from models
      where role = 'entrant' and prompt_version = any($1)
      order by id`,
    [MATCH_PROMPT_VERSIONS]
  );
  const bySlug = new Map(
    roster.map((entrant) => [seatSlug(entrant.id), entrant])
  );
  for (const seat of stored.rows) {
    const entrant = bySlug.get(seatSlug(seat.id));
    if (entrant === undefined) {
      throw new Error(
        `Seat ${seat.id} is stored at a Match Prompt Version and is not in `
        + `the roster being entered; the Season Roster closed at the Season's `
        + `first Lock (ADR-0034)`
      );
    }
    const was = identityOfSeat(seat);
    const now = identityOfEntrant(entrant);
    const changed = Object.keys(now).filter(
      (field) => now[field] !== was[field]
    );
    if (changed.length > 0) {
      throw new Error(
        `Seat ${seat.id} is stored as a different Base Model and the Season `
        + `Roster closed at the Season's first Lock: `
        + `${changed.map((field) => `${field} ${was[field]} -> ${now[field]}`)
          .join(", ")} (ADR-0034)`
      );
    }
  }
}

/**
 * Upserts the ten Entrant rows for `competition`'s Prompt Version, and nothing
 * else — no Fixtures, no Predictions.
 *
 * `config` is merged rather than replaced: these rows were hand-entered, so
 * the table may carry a key this module has never heard of, and a re-entry
 * that dropped it would destroy the only copy.
 *
 * `roster` defaults to the roster of record and exists so that the guard below
 * can be walked into. A guard that only the constant beside it can reach is a
 * guard nothing has ever seen bite, and this one stands between a careless
 * edit and a Season entered at the wrong size.
 */
export async function enterSeasonRoster(
  database: Database,
  competition: string,
  season: string,
  roster: readonly Entrant[] = SEASON_ROSTER
): Promise<readonly string[]> {
  const { version } = matchPromptOf(competition);
  const seatPrefix = seatPrefixOf(version, season);
  // Whole identities and not merely the count or the ids (ADR-0034,
  // ADR-0038): a Competition opening after the Season's first Lock must seat
  // the roster that stood at that Lock, and the substitution the cutoff exists
  // to shut out is the one that keeps both — a seat whose id and name are the
  // roster's while the Base Model, the provider, the precision or the resolved
  // slug behind it is a Base Model that missed the Season. The count alone
  // misses a swap; the ids alone miss a transplant.
  //
  // Every field, `catalogCheckedAt` included, and comparing it refuses nothing
  // legitimate: a re-checked seat moves in the constant, which is the record
  // both sides are read from.
  const identityOf = (entrant: Entrant): string =>
    JSON.stringify(Object.entries(entrant).sort());
  const ofRecord = SEASON_ROSTER.map(identityOf);
  const seated = roster.map(identityOf);
  if (seated.length !== ofRecord.length) {
    throw new Error(
      `${competition} would be seated with ${roster.length} Entrants, not the `
      + `${SEASON_ROSTER_SIZE} of the Season Roster (ADR-0034)`
    );
  }
  const substituted = seated.findIndex((seat, at) => seat !== ofRecord[at]);
  if (substituted !== -1) {
    // Which fields, not which id: a transplant leaves the id standing, so a
    // message that named it would say a seat is not itself.
    const expected = SEASON_ROSTER[substituted];
    const given = roster[substituted];
    const changed = Object.keys({ ...expected, ...given }).filter(
      (field) => JSON.stringify(given?.[field as keyof Entrant])
        !== JSON.stringify(expected?.[field as keyof Entrant])
    );
    throw new Error(
      `${competition} seat ${substituted + 1} (${expected?.id}) disagrees `
      + `with the Season Roster as it stood at the Season's first Lock on `
      + `${changed.join(", ")} (ADR-0034)`
    );
  }

  await refuseARosterTheRecordDisagreesWith(database, roster);

  // A seat is a `models` row and `id` is its primary key, so ten seats per
  // Competition need ten ids per Competition. The Prompt Version's leading
  // segment is the prefix — `match/claude-opus-5` gains
  // `match-pd/claude-opus-5` — which leaves the Premier League's ten ids
  // exactly where they are and puts the seat and its version under one name.
  // It is not a Track: a Track is `match` or `fpl` and nothing else
  // (CONTEXT.md), and ADR-0035 refused representing a Competition as one.
  const seats = roster.map((entrant) => ({
    ...entrant,
    id: entrant.id.replace(/^match\//, `${seatPrefix}/`)
  }));

  await database.query("begin");
  try {
    for (const entrant of seats) {
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
          version,
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

  return seats.map(({ id }) => id);
}

/**
 * Ten seats in every Competition the Season lists, read from `competitions`
 * rather than from a job's configuration — the same shape the scheduler, the
 * scorer and the daily fetch take, so opening a league is an insert here too.
 *
 * One transaction per Competition rather than one over all of them: a
 * Competition whose Prompt Version has not been frozen yet must fail by name
 * and leave the leagues already seated seated.
 */
export async function enterActiveCompetitionRosters(
  database: Database,
  season: string
): Promise<readonly string[]> {
  const active = await database.query<{ competition: string }>(
    `select competition from competitions
      where season = $1 order by competition`,
    [season]
  );
  const entered: string[] = [];
  const seated: string[] = [];
  for (const { competition } of active.rows) {
    try {
      entered.push(...await enterSeasonRoster(database, competition, season));
      seated.push(competition);
    } catch (error) {
      // What was already seated, in the message: the leagues before the
      // failing one keep their seats, and an operator reading only the
      // refusal would otherwise have no way to tell whether any landed.
      throw new Error(
        `${competition} was refused after seating `
        + `${seated.join(", ") || "no Competition"}`,
        { cause: error }
      );
    }
  }
  return entered;
}

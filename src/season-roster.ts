import type { Client as PgClient } from "pg";
import { FPL_PROMPT_VERSION } from "./context/build-fpl-track-context.js";
import {
  MATCH_PROMPT_COMPETITIONS,
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
 *
 * The match track's size, since ADR-0047. It was both tracks' until three Base
 * Models left the FPL track on the evening before the Season's first Lock; the
 * FPL track's own is `FPL_ROSTER_SIZE` below, and a new call site has to say
 * which of the two it means rather than inheriting the old assumption that one
 * number served the record.
 */
export const SEASON_ROSTER_SIZE = 10;

/**
 * The seats that left the FPL track's Season Roster, and the whole of where
 * their ids appear: the entry door stamps from this list, the opening's guard
 * is sized from it, and the tests read it rather than restating it.
 *
 * Each carries the ground it left on, because they are not the same ground and
 * a list that flattened them would be a false finding about a Base Model
 * (ADR-0047). Two of these seats never produced a legal opening in four
 * attempts. The third produced one and was judged too slow to carry, which is a
 * decision about wall clock and not about what the Base Model can do.
 *
 * The match track keeps all ten of these Base Models. A withdrawal is a fact
 * about one track's row.
 */
/**
 * `withdrawnAt` is a UTC instant rather than a calendar date, because the
 * column is
 * a `timestamptz`: a bare date is read in whatever timezone the session holds,
 * and this record dated three departures to the 19th when written from Bangkok.
 * The instant is when the fourth opening's last attempt landed, which is when
 * the list stopped changing.
 */
export const FPL_WITHDRAWALS: readonly {
  id: string;
  withdrawnAt: string;
  ground: string;
}[] = [
  {
    id: "fpl/glm-5.3",
    withdrawnAt: "2026-08-20T19:33:06Z",
    ground: "No legal opening in four attempts, and never measured: its four "
      + "figures are 300,008ms, 300,013ms, 600,011ms and 600,017ms, every one "
      + "of them the call window it was given rather than its own time."
  },
  {
    id: "fpl/minimax-m3",
    withdrawnAt: "2026-08-20T19:33:06Z",
    ground: "No legal opening in four attempts. It answered inside the clock "
      + "every time and spent the whole output ceiling on reasoning — 16,000 "
      + "of 16,000, then 32,000 of 32,000 twice — returning no content."
  },
  {
    id: "fpl/qwen3.8-max",
    withdrawnAt: "2026-08-20T19:33:06Z",
    ground: "Opened legally in 358,189ms when called alone, after three "
      + "refusals ten seats wide. Withdrawn on wall clock rather than on "
      + "capability: six minutes for one seat's opening is too much of a Lock."
  }
];

/**
 * What a `models` row is for, as its check constraint admits (migrations 0001,
 * 0019 and 0038): a competitor on a leaderboard, a Reference Line, a
 * retrospective Exhibition Run, or a Shadow Seat that asks unranked
 * (ADR-0055).
 *
 * All four and not just the two that predict, because this is what the column
 * holds rather than what any one reader wants of it — a query that filters the
 * role down still reads rows of this type, and what a Reference Line may do is
 * decided by asking, not by being unsayable.
 */
export type ModelRole = "entrant" | "reference" | "exhibition" | "shadow";

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
    // The roster window ADR-0042 reopened, used once. GLM 5.3 was published
    // 2026-08-18T20:57Z -- inside ADR-0034's arrival cutoff of 2026-08-19 by
    // some twenty-seven hours, which is the edge that decides whether a Base
    // Model may join a Season at all, and it is not a close call in the
    // direction that matters. Z.AI is its only endpoint and serves it at the
    // same fp8 the outgoing seat was pinned to, so the swap moves the Base
    // Model and nothing else about how it is reached.
    id: "match/glm-5.3", name: "GLM 5.3",
    baseModel: "z-ai/glm-5.3", provider: "z-ai",
    quantization: "fp8",
    canonicalSlug: "z-ai/glm-5.3-20260816",
    catalogCheckedAt: "2026-08-19",
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
 * What the FPL track opens with: the Season Roster less the seats that left it.
 *
 * Derived rather than written, so that the day a fourth seat is withdrawn — or
 * a third turns out to have been withdrawn on a measurement that moved — the
 * guard cannot be left describing a roster that does not exist.
 *
 * From `SEASON_ROSTER` itself and not from `SEASON_ROSTER_SIZE`: the FPL door
 * seats one row per entry of that list, so the list's length is what the track
 * actually holds. The constant is a separate literal, and a roster that gained
 * a Base Model without it would leave this guard expecting a seat short.
 */
export const FPL_ROSTER_SIZE =
  SEASON_ROSTER.length - FPL_WITHDRAWALS.length;

/**
 * A seat the Season Roster holds that a Competition does not seat, with the
 * ground it is left out on (ADR-0060).
 *
 * `FPL_WITHDRAWALS`' shape, one door along: a withdrawal is a seat that was
 * entered and then stopped, stamped with a `withdrawn_at` on its own row; an
 * exclusion is a seat that is never entered, so it has no row at all and
 * nothing to stamp. The ground is per id for the same reason a withdrawal's
 * is — a list that flattened them would be a false finding about a Base Model.
 */
interface MatchExclusion {
  id: string;
  ground: string;
}

/**
 * A seat that stands in another's place: the Season Roster id it replaces, and
 * the whole Entrant that takes it (ADR-0060).
 *
 * A whole identity rather than a slug and a wire name, because the identity
 * check ADR-0034 asks for compares every field — a substitute described by
 * half of one could not be checked, and the Competition's class mix and count
 * are read off these rows rather than declared beside them.
 */
interface MatchSubstitution {
  replaces: string;
  ground: string;
  entrant: Entrant;
}

/**
 * Which Season Roster seats a Competition does not seat. `UNL` names three
 * (ADR-0060); every league names none, which is what "per Competition" means
 * and why a league reads an empty list rather than a special case.
 *
 * The ground is standing and ADR-0060 refuses to dress it as cost or
 * reliability — the cheapest seat on the track is one of these three and none
 * of them Gaps more than the roster does — so the figure each carries is its
 * Season-to-date total across the five leagues, which is the whole of what
 * singles it out.
 */
export const MATCH_EXCLUSIONS:
  Readonly<Record<string, readonly MatchExclusion[]>> = {
  UNL: [
    {
      id: "match/deepseek-v4-pro",
      ground: "Eighth of ten on Season-to-date Match + Bet Points across the "
        + "five leagues, 1,292 to the leader's 1,435, read 2026-09-22."
    },
    {
      id: "match/minimax-m3",
      ground: "Ninth of ten on Season-to-date Match + Bet Points across the "
        + "five leagues, 1,277 to the leader's 1,435, read 2026-09-22."
    },
    {
      id: "match/qwen3.8-max",
      ground: "Tenth of ten on Season-to-date Match + Bet Points across the "
        + "five leagues, 1,263 to the leader's 1,435, read 2026-09-22."
    }
  ]
};

/**
 * Which Season Roster seats a Competition seats somebody else in place of.
 * `UNL` names two (ADR-0060, amended 2026-09-22); every league names none.
 *
 * A second decision with a different ground from the exclusions above, and
 * kept a separate list so the two are not read as one: nothing was measured
 * against GPT-5.6 Sol Pro or Grok 4.6, which stand fourth and fifth of ten.
 * The operator wanted the one Competition that has not opened to seat the
 * newest Base Model of each house.
 *
 * Both substitutes were released after ADR-0034's 2026-08-19 arrival cutoff,
 * which ADR-0061 rule 4 admits for a Competition whose first Lock has not
 * passed. Both carry the catalog's word and not a pre-flight's observation —
 * `canonicalSlug` is what OpenRouter listed on 2026-09-22, to be confirmed or
 * refused by the pre-flight the operator runs before the insert (ticket 0076),
 * exactly as ADR-0034's three arriving seats were entered.
 */
export const MATCH_SUBSTITUTIONS:
  Readonly<Record<string, readonly MatchSubstitution[]>> = {
  UNL: [
    {
      replaces: "match/gpt-5.6-sol-pro",
      ground: "Its house shipped a successor, listed 2026-09-04, and the cup "
        + "seats the newest of each house rather than August's freeze "
        + "(ADR-0060). Nothing is measured against the seat it replaces.",
      entrant: {
        id: "match/gpt-6-astra", name: "GPT-6 Astra",
        baseModel: "openai/gpt-6-astra", provider: "openai",
        // `unknown` on every endpoint in the catalog, which is nothing to pin
        // — and a Frontier seat has nothing to pin in any case (ADR-0009).
        quantization: null,
        canonicalSlug: "openai/gpt-6-astra-20260903",
        catalogCheckedAt: "2026-09-22",
        baseModelClass: "Frontier"
      }
    },
    {
      replaces: "match/grok-4.6",
      ground: "Its house shipped a successor, listed 2026-09-21, and the cup "
        + "seats the newest of each house rather than August's freeze "
        + "(ADR-0060). Nothing is measured against the seat it replaces.",
      entrant: {
        id: "match/grok-4.7", name: "Grok 4.7",
        baseModel: "x-ai/grok-4.7", provider: "xai",
        quantization: null,
        canonicalSlug: "x-ai/grok-4.7-20260916",
        catalogCheckedAt: "2026-09-22",
        baseModelClass: "First-party"
      }
    }
  ]
};

/**
 * A Competition's roster of record: the Season Roster in its own order, less
 * the seats it excludes, with the seats it substitutes standing where the
 * seats they replace stood.
 *
 * Derived and never written down as a second list of seats, so that the size,
 * the order and the Base Model Class mix are facts about `SEASON_ROSTER` and
 * these two lists rather than a third thing that can disagree with both. A
 * league names neither list and gets `SEASON_ROSTER` back, entry for entry.
 *
 * Both lists are refused by name against the Season Roster, because both make
 * a claim about one of its seats: an id that is not there is a typo in the
 * list, and the roster it would silently produce is one seat short or one seat
 * unsubstituted — neither of which any downstream count could tell from the
 * decision.
 *
 * `excludes` and `substitutes` default to the constants and exist so those
 * refusals can be walked into, the same reason `enterSeasonRoster` takes a
 * roster.
 */
export function matchRosterOf(
  competition: string,
  excludes: readonly MatchExclusion[] = MATCH_EXCLUSIONS[competition] ?? [],
  substitutes: readonly MatchSubstitution[] =
    MATCH_SUBSTITUTIONS[competition] ?? []
): readonly Entrant[] {
  const seats = (id: string): boolean =>
    SEASON_ROSTER.some((entrant) => entrant.id === id);
  for (const { id } of excludes) {
    if (!seats(id)) {
      throw new Error(
        `${competition} excludes ${id}, which the Season Roster does not seat`
      );
    }
  }
  for (const { replaces } of substitutes) {
    if (!seats(replaces)) {
      throw new Error(
        `${competition} substitutes for ${replaces}, which the Season Roster `
        + "does not seat"
      );
    }
  }
  return SEASON_ROSTER
    .filter((entrant) => !excludes.some(({ id }) => id === entrant.id))
    .map((entrant) =>
      substitutes.find(({ replaces }) => replaces === entrant.id)?.entrant
        ?? entrant);
}

/**
 * How many seats a Competition seats: ten for a league and seven for the cup,
 * computed rather than written, so a fourth exclusion moves every reader of it
 * at once. The dashboard's loading skeleton is the one that would otherwise go
 * stale in silence.
 */
export function matchRosterSizeOf(competition: string): number {
  return matchRosterOf(competition).length;
}

/**
 * What a Competition whose roster of record is not the Season Roster owes a
 * reader, stated wherever its ranking is shown (ADR-0060).
 *
 * A constant keyed by Competition rather than a sentence derived from the two
 * lists above: what it says is a decision's reasoning — which standings cut
 * the field, and that two seats have no league record to be read against — and
 * a sentence assembled from counts would say none of that. ADR-0060 froze it,
 * and nothing about a Season can change it, which is the same ground
 * `EXHIBITION_CAVEAT` is a constant on.
 *
 * Keyed rather than a `UNL` literal at the one call site, so the next
 * Competition that opens with a cut roster adds its own opening decision's
 * sentence here instead of teaching the read API a second Competition's name.
 */
export const ROSTER_CAVEATS: Readonly<Record<string, string>> = {
  UNL:
    "The Nations League seats seven Base Models where each league seats ten. "
    + "Its field was cut by the leagues' standings before its first Lock — the "
    + "three lowest on Season-to-date points across the five leagues were "
    + "never entered here — and two of its seven are Base Models no league "
    + "seats, entered for this Competition alone and with no league record to "
    + "be read against. Nothing ranked here is the field a league's table "
    + "ranks (ADR-0060)."
};

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
  prompt_version: string;
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

/**
 * Everything after the Competition prefix: `match-pd/kimi-k3` is `kimi-k3`,
 * and so is `match-pd/2026-27-v2/kimi-k3`, the shape a restart gives a seat
 * whose plain id belongs to a retired version (ADR-0042). A Base Model slug
 * carries no slash, so the last one ends the prefix however long it is.
 *
 * `entrantSlug` in `dashboard/src/entrant-link.ts` is this function again, for
 * the `?entrant=` a reader copies. Ticket 0020's slice 4 edited both at once
 * — `indexOf` to `lastIndexOf`, twice, by hand — and the twins were kept
 * anyway. Merging them means moving that module into `src/`, and the module's
 * own rule is that it imports nothing a browser cannot have: it is bundled and
 * shipped to every reader, and it sat in `competition-view.ts` until fifty
 * kilobytes of `zod` and frozen Prompt Versions rode six lines of string
 * handling into the page. What keeps that rule today is the distance — there
 * is no server module next to it to reach for. In `src/` there is nothing but,
 * and one import added a year from now by someone who never read this puts the
 * roster's dependencies back in the browser. That is the trade the merge asks
 * for, and one line of duplication is the cheaper side of it.
 *
 * Exported for the parity test that stands in the merge's place: divergence
 * between the twins now fails a build rather than a reader.
 */
export function seatSlug(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
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
 * Every Prompt Version's seats are read and not just the one being entered:
 * the leagues are one roster across the five (ADR-0038), so the Premier
 * League's stored seats are the record La Liga's are checked against.
 *
 * But each stored seat is checked against **its own** Prompt Version's roster
 * of record, keyed by version and not pooled, because a roster is a fact about
 * one Competition's rows (ADR-0047). Pooled — one slug map over every
 * Competition's seats at once — a `match-unl/deepseek-v4-pro` would find the
 * leagues' DeepSeek and pass, and a `match/gpt-6-astra` would find the cup's
 * and pass, which are exactly the two rows that must not exist. Each is now
 * refused by name against the roster its own version seats. **Found by
 * review.**
 *
 * Which Prompt Versions those are, and what each seats, is the caller's,
 * because a track's seats are the record only of that track: the FPL door
 * reads the FPL seats, whose ids no Competition prefixes, and reading the
 * match track's there would check a roster against rows its own upsert never
 * touches.
 */
async function refuseARosterTheRecordDisagreesWith(
  database: Database,
  rosterOfVersion: ReadonlyMap<string, readonly Entrant[]>
): Promise<void> {
  const stored = await database.query<StoredSeat>(
    `-- roster: both tracks' stored seats, and it must see a withdrawn one:
     -- this guard refuses a seat re-entered as a different Base Model, and
     -- a withdrawn row is still a row a Season path points at.
     select id, prompt_version, name, base_model, provider, quantization,
            config
       from models
      where role = 'entrant' and prompt_version = any($1)
      order by id`,
    [[...rosterOfVersion.keys()]]
  );
  for (const seat of stored.rows) {
    const bySlug = new Map(
      (rosterOfVersion.get(seat.prompt_version) ?? []).map(
        (entrant) => [seatSlug(entrant.id), entrant] as const
      )
    );
    const entrant = bySlug.get(seatSlug(seat.id));
    if (entrant === undefined) {
      throw new Error(
        `Seat ${seat.id} is stored at Prompt Version `
        + `${seat.prompt_version} and is not in that Prompt Version's roster `
        + `of record; the Season Roster closed at the Season's first Lock `
        + `(ADR-0034)`
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
 * Upserts one Entrant row per seat of `competition`'s roster of record under
 * its Prompt Version, and nothing else — no Fixtures, no Predictions. Ten for
 * a league, seven for the Nations League (ADR-0060).
 *
 * `roster` defaults to that roster of record and exists so that the guard below
 * can be walked into. A guard that only the constant beside it can reach is a
 * guard nothing has ever seen bite, and this one stands between a careless
 * edit and a Season entered at the wrong size.
 */
export async function enterSeasonRoster(
  database: Database,
  competition: string,
  season: string,
  roster: readonly Entrant[] = matchRosterOf(competition)
): Promise<readonly string[]> {
  const { version } = matchPromptOf(competition);
  // The list this Competition is checked against: the Season Roster for a
  // league, and the Season Roster less its exclusions plus its substitutions
  // for a Competition that named either (ADR-0060). The check below does not
  // weaken -- it gains a second roster of record, and a league handed one of
  // the cup's substitutes is refused by it exactly as before.
  const rosterOfRecord = matchRosterOf(competition);
  const seatPrefix = seatPrefixOf(version, season);
  // Refused by name, ahead of the identity check below, rather than left to
  // surface as an unnamed field disagreeing with the roster of record: an
  // Entrant is called through OpenRouter alone (ADR-0009), and a `typesafe`
  // row joins the record only as an Exhibition Run, inserted by the operator
  // (ADR-0059) — never through this door.
  const typesafeSeat = roster.find((entrant) => entrant.provider === "typesafe");
  if (typesafeSeat !== undefined) {
    throw new Error(
      `${typesafeSeat.id} names provider 'typesafe', which is not an `
      + "Entrant's wire (ADR-0009); it may join only as an Exhibition Run, "
      + "inserted by the operator (ADR-0059)"
    );
  }
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
  const identitiesOfRecord = rosterOfRecord.map(identityOf);
  const seated = roster.map(identityOf);
  if (seated.length !== identitiesOfRecord.length) {
    throw new Error(
      `${competition} would be seated with ${roster.length} Entrants, not the `
      + `${identitiesOfRecord.length} of its roster of record (ADR-0034)`
    );
  }
  const substituted = seated.findIndex(
    (seat, at) => seat !== identitiesOfRecord[at]
  );
  if (substituted !== -1) {
    // Which fields, not which id: a transplant leaves the id standing, so a
    // message that named it would say a seat is not itself.
    const expected = rosterOfRecord[substituted];
    const given = roster[substituted];
    const changed = Object.keys({ ...expected, ...given }).filter(
      (field) => JSON.stringify(given?.[field as keyof Entrant])
        !== JSON.stringify(expected?.[field as keyof Entrant])
    );
    throw new Error(
      `${competition} seat ${substituted + 1} (${expected?.id}) disagrees `
      + `with its roster of record on `
      + `${changed.join(", ")} (ADR-0034)`
    );
  }

  // Every match Prompt Version and what each one seats, because the stored
  // seats this reads span all of them — the cup's two substitutes and the
  // leagues' five excluded seats are all rows it must be able to place, and
  // each against its own Competition's roster and no other (ADR-0047).
  //
  // Read from the constants rather than from `roster`, so a walked-in roster
  // cannot answer the guard with its own copy of the fact it is being checked
  // against.
  await refuseARosterTheRecordDisagreesWith(
    database,
    new Map(MATCH_PROMPT_COMPETITIONS.map((listed) => [
      matchPromptOf(listed).version, matchRosterOf(listed)
    ]))
  );

  // A seat is a `models` row and `id` is its primary key, so a Competition's
  // seats need a Competition's ids. The Prompt Version's leading segment is
  // the prefix — `match/claude-opus-5` gains `match-pd/claude-opus-5` — which
  // leaves the Premier League's ten ids exactly where they are and puts the
  // seat and its version under one name.
  // It is not a Track: a Track is `match` or `fpl` and nothing else
  // (CONTEXT.md), and ADR-0035 refused representing a Competition as one.
  const plain = roster.map((entrant) => ({
    ...entrant,
    id: entrant.id.replace(/^match\//, `${seatPrefix}/`)
  }));

  // A restarted Competition keeps its retired seats standing (ADR-0042): those
  // rows hold the Predictions of every Gameweek asked under the old question,
  // and this upsert would rewrite their `prompt_version` to the standing one
  // and relabel the record. So a plain id already stored under another version
  // is not taken -- the whole roster moves under the Prompt Version's own
  // segment instead, `match-pd/2026-27-v2/claude-opus-5`, and the retired ten
  // are left exactly as the Gameweek they played left them.
  //
  // Read from the record rather than switched on the version string, because
  // no version tells the two cases apart: `match/2026-27-v2` is the Premier
  // League's first-used version and keeps the plain ids, `match-pd/2026-27-v2`
  // follows a v1 that ran. Whole roster and not seat by seat: a Competition's
  // seats under one version are one shape, and a half-qualified roster is a
  // Competition whose seats no longer sort together.
  //
  // ponytail: select-then-upsert, not one statement. Two operators seeding the
  // same Competition at once could read "not taken" together and race; the
  // door is run by hand, one operator, a few times a Season. A single
  // statement that qualified the id in SQL is the upgrade if that stops being
  // true.
  const retired = await database.query<{ id: string }>(
    `-- roster: both tracks', by id, looking for a seat under another version.
     select id from models
      where id = any($1) and prompt_version <> $2`,
    [plain.map(({ id }) => id), version]
  );
  const seats = retired.rows.length === 0 ? plain : plain.map((entrant) => ({
    ...entrant,
    id: `${version}/${seatSlug(entrant.id)}`
  }));

  await upsertSeats(database, seats, version);

  return seats.map(({ id }) => id);
}

/**
 * The write both doors are: a `models` row per seat under one Prompt Version,
 * in one transaction, so a roster half-entered is a roster not entered.
 *
 * One copy rather than one per track, because what a seat's row holds is a
 * decision about seats and not about the track it plays in — a column added to
 * it is added to all twenty at once, and two upserts would be two places to
 * add it and one place to forget.
 *
 * `config` is merged rather than replaced: these rows were hand-entered, so
 * the table may carry a key this module has never heard of, and a re-entry
 * that dropped it would destroy the only copy.
 */
async function upsertSeats(
  database: Database,
  seats: readonly Entrant[],
  version: string
): Promise<void> {
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
}

/**
 * Upserts the FPL track's ten seats — `fpl/kimi-k3` beside the match track's
 * `match/kimi-k3`, one per Base Model of the Season Roster — and nothing else.
 *
 * No Competition, because the FPL track has none: an Entrant runs one squad
 * down one Season path (ADR-0003), so the track segment is the whole of a
 * seat's id prefix and `FPL_PROMPT_VERSION` is the whole of what makes the
 * seat this Season's.
 *
 * Deliberately not `enterSeasonRoster` with an FPL Prompt Version. That door
 * builds its ids out of the version's leading segment, so an `fpl/` version
 * handed to it would write these same ten ids while carrying the match track's
 * Competition rules — which is the refusal in `seatPrefixOf`, and this is the
 * door it refuses on behalf of.
 */
export async function enterFplRoster(
  database: Database,
  season: string
): Promise<readonly string[]> {
  // The half of `seatPrefixOf` that still applies: the track segment is this
  // module's own constant and cannot be wrong, but the Season is read from the
  // environment, and a door run under next Season's SEASON would otherwise
  // seat this Season's roster under this Season's version and report success.
  const [, seasonSegment = ""] = FPL_PROMPT_VERSION.split("/");
  if (!seasonSegment.startsWith(`${season}-`)) {
    throw new Error(
      `SEASON ${season} does not own Prompt Version ${FPL_PROMPT_VERSION}`
    );
  }

  // The same guard the match door runs, against the FPL track's own stored
  // seats (ADR-0034): these rows are what `manager_states` point at, and that
  // table is insert-only, so a seat re-entered as a different Base Model would
  // relabel a Season path already played with no way back.
  await refuseARosterTheRecordDisagreesWith(
    database, new Map([[FPL_PROMPT_VERSION, SEASON_ROSTER]])
  );

  const seats = SEASON_ROSTER.map((entrant) => ({
    ...entrant,
    id: `fpl/${seatSlug(entrant.id)}`
  }));
  await upsertSeats(database, seats, FPL_PROMPT_VERSION);

  // The withdrawal is stamped here rather than in the migration, because this
  // door is what a fresh database and production both walk: a data statement in
  // 0034 would date the departure on whichever of them ran it and leave the
  // other's rows standing. Written after the upsert, which never mentions the
  // column, so a re-seat cannot reinstate a Base Model the Season removed
  // (ADR-0047).
  //
  // `is null` in the predicate is what makes a second run a no-op instead of a
  // re-dating: the date on record is when the seat left, not when the door last
  // ran.
  for (const { id, withdrawnAt } of FPL_WITHDRAWALS) {
    await database.query(
      `update models set withdrawn_at = $2::timestamptz
        where id = $1 and prompt_version = $3 and withdrawn_at is null`,
      [id, withdrawnAt, FPL_PROMPT_VERSION]
    );
  }

  return seats.map(({ id }) => id);
}

/**
 * Every listed Competition's roster of record — ten seats in a league and
 * seven in the Nations League (ADR-0060) — read from `competitions`
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

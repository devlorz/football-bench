/**
 * What the FPL track's stored record is made of: the metric names the `scores`
 * table holds it under, and the sentence that says what its ranking is worth.
 *
 * Kept apart from the module that reads and writes those rows because the
 * names and the qualification are the record's definition, while gathering
 * Manager States and player points from Postgres is how one Gameweek's copy of
 * it is arrived at. `score-team-sheet.ts` and `score-fpl-gameweek.ts` are split
 * along the same line.
 */
import { MAX_REPAIRS } from "../repairs.js";
import { VIOLATION_KINDS } from "./apply-gameweek-action.js";

/**
 * The FPL points ranking is a demonstration, and the label is not decoration.
 * One seat per Base Model means one Season path each (ADR-0003), so a ranking
 * of nine paths is a sample of one apiece — it shows the track ran, not that
 * the Base Model on top manages a Squad better than the one beneath it.
 *
 * The sentence is stored in the detail of every row a ranking could be read
 * off rather than added at publication, so that a value cannot reach a reader
 * without it. Frozen for the Season like the Entrant-facing messages are: a
 * qualification that changed mid-Season would leave the earlier Gameweeks
 * carrying a different claim from the later ones.
 */
export const DEMONSTRATION_QUALIFICATION =
  "One seat per Base Model means one Season path each, so this ranking "
  + "demonstrates that the FPL track ran rather than showing that one Base "
  + "Model manages a Squad better than another.";

/** The metric one Gameweek's FPL points are stored under. */
export const FPL_POINTS_METRIC = "fpl_points";

/**
 * The cumulative points through the same Gameweek, under the `_season_to_date`
 * suffix spec 0002 fixes for every cumulative metric, so that the Gameweek's
 * own value and the Season's coexist at one `gw` without a sentinel Gameweek.
 */
export const FPL_POINTS_SEASON_TO_DATE_METRIC = "fpl_points_season_to_date";

/** The Repairs one Gameweek's action cost before it was legal, or gave up at. */
export const REPAIRS_METRIC = "repairs";

/**
 * The mean Repairs per Gameweek so far, with the distribution beneath it. The
 * mean alone cannot tell an Entrant that needs one Repair every Gameweek from
 * one that needs none for three and then Rolls Over, and those are different
 * Base Models — so the value is the mean and the detail is the shape.
 */
export const REPAIRS_SEASON_TO_DATE_METRIC = "repairs_season_to_date";

/**
 * Every bucket a Gameweek's Repair count can land in: none used through all
 * three, and then `failed` for the fourth invalid response that Rolled Over.
 *
 * Counted off `MAX_REPAIRS` rather than written out, so the distribution gains
 * a column if ADR-0010's allowance ever changes instead of quietly dropping
 * the Gameweeks that no longer fit.
 *
 * `failed` is its own bucket and not the top of the count because a Gameweek
 * that used all three Repairs and reached a legal action is not the Gameweek
 * that used all three and did not — they share a number and nothing else.
 */
export const REPAIR_BUCKETS: readonly string[] = [
  ...Array.from({ length: MAX_REPAIRS + 1 }, (_, used) => String(used)),
  "failed"
];

/**
 * Whether this Gameweek Rolled Over: 1 or 0, so that the same metric name
 * carries one Gameweek and the Season's fraction of them.
 *
 * The row keeps no detail. Its value is `manager_states.rolled_over` and
 * nothing else, and the `repairs` row stored beside it already gives the same
 * Gameweek's own account of how it got there — a detail here would be a second
 * copy of one flag rather than a trace of anything.
 */
export const ROLL_OVER_RATE_METRIC = "roll_over_rate";

/** The fraction of Gameweeks so far that Rolled Over, and which ones did. */
export const ROLL_OVER_RATE_SEASON_TO_DATE_METRIC =
  "roll_over_rate_season_to_date";

/**
 * How many rules of the game an Entrant broke in one Gameweek, with the typed
 * breakdown in detail.
 *
 * Only the seven `VIOLATION_KINDS` count. A response that was not a Gameweek
 * action carries its own `schema` kind, and a provider that failed, refused or
 * arrived after the Lock carries one of its own too — none of them is a rule
 * of the game the Entrant broke, and counting a failure to return JSON beside
 * a club-limit breach would make a Base Model that cannot hold a format look
 * like one that cannot count to three players per club (spec 0003).
 *
 * That is why the profile names the kinds it counts rather than counting every
 * attempt that was not `ok`: the kinds a rule can produce are a closed tuple,
 * and the kinds an attempt row can carry are not.
 */
export const VIOLATION_PROFILE_METRIC = "violation_profile";

/** The same counts over every Gameweek from the start of the track. */
export const VIOLATION_PROFILE_SEASON_TO_DATE_METRIC =
  "violation_profile_season_to_date";

/** The profile before any attempt is counted: every kind at zero. */
export function emptyViolationProfile(): Record<string, number> {
  return Object.fromEntries(VIOLATION_KINDS.map((kind) => [kind, 0]));
}

export function repairBucket(repairs: number, rolledOver: boolean): string {
  return rolledOver ? "failed" : String(repairs);
}

/** The distribution before any Gameweek is counted: every bucket at zero. */
export function emptyRepairDistribution(): Record<string, number> {
  return Object.fromEntries(REPAIR_BUCKETS.map((bucket) => [bucket, 0]));
}

import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";

/**
 * One fabricated Base Model per seat the Season Roster holds, which is how a
 * suite gets a roster of the right size without naming real vendors.
 *
 * Numbered from `01` so the ids sort the way they are written. Rows come back
 * ordered by `model_id`, and an unpadded roster of ten puts `base-10` between
 * `base-1` and `base-2` — which is a suite failing on the day the roster grows
 * rather than on anything it was written to check.
 */
export const BASE_MODELS = Array.from(
  { length: SEASON_ROSTER_SIZE },
  (_unused, index) => `vendor/base-${String(index + 1).padStart(2, "0")}`
);

/**
 * The FPL seat id a Base Model is entered under, which is the suffix of its
 * slug behind `fpl/` — the shape `run-fpl-rehearsal` writes and
 * `verify-rehearsal` reads back.
 *
 * Here rather than in each suite because three of them derived it identically:
 * the run, the track start and the Exhibition replay. A seat id computed one
 * way in one file and another way in the next would let a suite go on passing
 * against seats the pipeline would never select.
 */
export function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

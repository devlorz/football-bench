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

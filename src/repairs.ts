/**
 * How many Repairs an invalid response is given before the track stops asking.
 * One number for both tracks, because ADR-0010 fixes one: "prompt-only JSON
 * with three repairs on both tracks". A Match track that asked twice and an
 * FPL track that asked four times would make the two Repair counts
 * incomparable while both were being reported as Repairs.
 *
 * What a fourth failure costs differs by track — a Match track Gap, an FPL
 * track Roll Over (ADR-0004) — and that belongs to each track. How many
 * chances precede it does not.
 */
export const MAX_REPAIRS = 3;

/**
 * Every bucket a Repair count can land in: none used through all three, and
 * then `failed` for the fourth invalid response that reached nothing valid.
 *
 * Counted off `MAX_REPAIRS` rather than written out, so the distribution gains
 * a column if ADR-0010's allowance ever changes instead of quietly dropping the
 * counts that no longer fit.
 *
 * `failed` is its own bucket and not the top of the count because an ask that
 * used all three Repairs and reached a valid answer is not the ask that used
 * all three and did not — they share a number and nothing else. Both tracks
 * bucket the same way; what a failure is called is each track's own.
 */
export const REPAIR_BUCKETS: readonly string[] = [
  ...Array.from({ length: MAX_REPAIRS + 1 }, (_, used) => String(used)),
  "failed"
];

/** The distribution before anything is counted: every bucket at zero. */
export function emptyRepairDistribution(): Record<string, number> {
  return Object.fromEntries(REPAIR_BUCKETS.map((bucket) => [bucket, 0]));
}

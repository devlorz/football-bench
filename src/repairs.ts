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

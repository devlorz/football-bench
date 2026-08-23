/**
 * What an Exhibition Run's figures cannot be, stated wherever they are shown.
 *
 * A constant of this module rather than a string in the record. The two
 * qualifications the scorer writes are stored in the `detail` of every row a
 * ranking is read off, because each qualifies a number that the scoring run
 * computed beside it and could in principle differ by Season or by run. This
 * one qualifies no number: it says what an Exhibition Run *is*, ADR-0032 froze
 * it, and nothing about a Season can change it. Storing it would be writing one
 * constant into every row and then proving it survived the database.
 *
 * The wording accepts spec 0001's objection rather than softening it: a Base
 * Model shown a Gameweek that has already been played may remember how it
 * ended, and no figure taken over that answer can tell recall from skill.
 */
export const EXHIBITION_CAVEAT =
  "An Exhibition Run answered Gameweeks that had already been played, so its "
  + "Base Model may already know the results. Its figures cannot tell "
  + "forecasting skill from recall and support no claim of either, and they "
  + "enter no Comparison Anchor, complete case or published interval.";

/**
 * The standard prefix for an Exhibition Run's derived label across Match track
 * surfaces (ADR-0032, ADR-0052).
 */
export const EXHIBITION_LABEL_PREFIX = "ran after Gameweek ";

/**
 * The standard label for an Exhibition Run's derived qualification on Match
 * track surfaces, naming the Gameweek the run answered after (ADR-0032, ADR-0052).
 */
export function exhibitionLabel(ranAfterGw: number): string {
  return `${EXHIBITION_LABEL_PREFIX}${ranAfterGw}`;
}

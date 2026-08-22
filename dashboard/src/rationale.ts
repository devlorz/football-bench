/**
 * The disclosure both tracks print around a Rationale, spelled once.
 *
 * One constant for each sentence because two pages carry them — the Fixtures
 * page's Predictions since spec 0011 and the squads page's Team Sheet since
 * ticket 0047 — and two wordings of one rule on one dashboard is a page that
 * cannot decide what it is showing. The Fixtures page passes them into its
 * inline script through `define:vars`, which is the only import path an
 * `is:inline` script has.
 *
 * What the label states is ADR-0041's boundary: a Rationale is part of the
 * record and nothing else — stored, never scored, and never shown back to any
 * Entrant in a later context. The last clause is about what reaches an
 * Entrant; a human reading a page is not a context.
 */

/** What the sentence is, and the thing it may never be mistaken for. */
export const RATIONALE_LABEL = "Rationale · display only, never scored";

/**
 * The provenance line's tail: the sentence was stored before the deadline,
 * which is what makes it a forecast the Lock vouches for rather than an
 * alibi written after the matches.
 */
export const RATIONALE_META = "stored before the deadline";

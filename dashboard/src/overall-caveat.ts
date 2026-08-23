/**
 * What the combined ranking's total is not, stated wherever it is shown.
 *
 * A constant of its own module rather than a row the scorer writes, for the
 * reason `EXHIBITION_CAVEAT` (`src/exhibition/recall-caveat.ts`) is one: every
 * other figure this dashboard publishes reads its qualification back out of
 * the row the scorer wrote it into, and this total has no row to read it
 * from — it is computed in a browser from four rows that each carry their
 * own. Writing one would put two Competitions in one call to obtain a
 * string, which is the property ADR-0051 spends its length protecting.
 */
const COMBINED_RANKING_PREFACE =
  "This total is a raw sum of season-to-date Match Points and Bet Points "
  + "across every league covered here, not an average or a rate: a league "
  + "with more settled Fixtures weighs more in the total than one with "
  + "fewer. The leagues also run under their own Prompt Versions, a "
  + "confound for any comparison across them (ADR-0038).";

const COMBINED_RANKING_CLOSING = "Ranks, does not prove.";

/**
 * The fourth clause added to the combined ranking qualification when at least
 * one Exhibition Run is present in the table (ADR-0052, spec 0026).
 */
export const COMBINED_RANKING_EXHIBITION_CLAUSE =
  "An Exhibition Run's total may be over fewer Fixtures, and in fewer "
  + "leagues, than the rows it is ranked beside, and the sum does not "
  + "correct for it.";

export const COMBINED_RANKING_QUALIFICATION =
  `${COMBINED_RANKING_PREFACE} ${COMBINED_RANKING_CLOSING}`;

export const COMBINED_RANKING_QUALIFICATION_WITH_EXHIBITION =
  `${COMBINED_RANKING_PREFACE} ${COMBINED_RANKING_EXHIBITION_CLAUSE} ${COMBINED_RANKING_CLOSING}`;

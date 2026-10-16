/**
 * What the combined ranking's total is not, stated wherever it is shown.
 *
 * A constant of its own module rather than a row the scorer writes, for the
 * reason `EXHIBITION_CAVEAT` (`src/exhibition/recall-caveat.ts`) is one: every
 * other figure this dashboard publishes reads its qualification back out of
 * the row the scorer wrote it into, and this total has no row to read it
 * from — it is computed in a browser from one row per covered Competition,
 * each carrying its own. Writing one would put two Competitions in one call
 * to obtain a string, which is the property ADR-0051 spends its length
 * protecting.
 */
/** What every combined total is, opening the qualification. */
export const COMBINED_RANKING_PREFACE =
  "This total is a raw sum of season-to-date Match Points and Bet Points "
  + "across every Competition covered here, not an average or a rate: a "
  + "Competition with more settled Fixtures weighs more in the total than "
  + "one with fewer. The Competitions also run under their own Prompt "
  + "Versions, a confound for any comparison across them (ADR-0038).";

/** The qualification's last sentence, after every clause a row adds. */
export const COMBINED_RANKING_CLOSING = "Ranks, does not prove.";

/**
 * The fourth clause added to the combined ranking qualification when at least
 * one Exhibition Run is present in the table (ADR-0052, spec 0026).
 */
export const COMBINED_RANKING_EXHIBITION_CLAUSE =
  "An Exhibition Run's total may be over fewer Fixtures, and in fewer "
  + "Competitions, than the rows it is ranked beside, and the sum does not "
  + "correct for it.";

/**
 * The clause a Guest Seat adds, after the Exhibition's when both are ranked
 * (ADR-0064, spec 0029). Its own sentence beside the one ADR-0052 froze rather
 * than a rewrite of it: a Guest is no replay, and its total is short only
 * because it was seated late or in fewer Competitions.
 */
export const COMBINED_RANKING_GUEST_CLAUSE =
  "A Guest's total may be over fewer Fixtures, and in fewer Competitions, "
  + "than the rows it is ranked beside, and the sum does not correct for it.";

export const COMBINED_RANKING_QUALIFICATION =
  `${COMBINED_RANKING_PREFACE} ${COMBINED_RANKING_CLOSING}`;

/**
 * Why the cup is in no Edition set's sum (ADR-0060, ADR-0061), closing the
 * clause that names the set. The set's Edition and Competitions are figures
 * and arrive with the bodies; this is the part that is not.
 */
export const COMBINED_RANKING_CUP_CLAUSE =
  "the Nations League is not in it, because its roster is not the leagues' "
  + "(ADR-0060).";

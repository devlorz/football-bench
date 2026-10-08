/**
 * What an earlier Edition's pages say about where it ends (ADR-0061).
 *
 * Imports nothing, for `entrant-link.ts`'s reason: a page's bundled script
 * reaches this module, and everything it reaches is shipped to every reader.
 */

/** A closed Edition of the five leagues, and the decision that closed it. */
export interface ClosedEdition {
  number: number;
  /** The ADR that opened the next Edition, as the frozen sentence names it. */
  openedBy: string;
}

/**
 * Every closed Edition of the leagues, in order. A constant and not a read of
 * `editions`: the sentence an earlier Edition's pages open with names the ADR
 * that opened the next one, so a boundary is a deploy whatever the switcher
 * reads, and the routes are built from the same list as the sentence.
 */
export const CLOSED_LEAGUE_EDITIONS: readonly ClosedEdition[] = [];

/** The part of an `EditionScope` the note reads; a type here imports nothing. */
interface Scope {
  number: number;
  firstGameweek: number;
  lastGameweek: number | null;
}

/** The ADR-frozen tail both notes share: why the Edition ends and what stays. */
const rule = ({ number, openedBy }: ClosedEdition, whose: string): string =>
  `which ADR-0061 allows once in a Season and ${openedBy} named. ${whose} `
  + "Gameweeks stay here whole, ranked by the roster that played them, and "
  + `none of them counts in Edition ${number + 1}.`;

/**
 * A league page's label and sentence, numbers from the body; null while the
 * body's Edition has no last Gameweek, because then it is still playing.
 */
export const editionNote = (
  scope: Scope, closed: ClosedEdition
): { label: string; sentence: string } | null =>
  scope.lastGameweek === null ? null : {
    label: `Edition ${scope.number} · Gameweek ${scope.firstGameweek}–${scope.lastGameweek}`,
    sentence: `Edition ${scope.number} ends at Gameweek ${scope.lastGameweek}. `
      + `From Gameweek ${scope.lastGameweek + 1} this Competition is played by `
      + `a new roster, ${rule(closed, "Its")}`
  };

/**
 * `/overall`'s, which names no Gameweek: each league may close at its own,
 * and its own page says which.
 */
export const overallEditionNote = (
  closed: ClosedEdition
): { label: string; sentence: string } => ({
  label: `Edition ${closed.number}`,
  sentence: `Edition ${closed.number} of each league ends at the Gameweek its `
    + "own page names. From the next one each league is played by a new "
    + `roster, ${rule(closed, "Their")}`
});

/**
 * The scorelines the rehearsal settles the archived Gameweek with, written by
 * hand rather than derived from the Fixture.
 *
 * Derived outcomes would make every expected metric a restatement of the same
 * rule the scorer applies, and the rehearsal would then agree with itself
 * whatever it computed. These are ten scorelines a person chose: four Home
 * wins, three Draws and three Away wins, so that no metric can be right by
 * accident of a single outcome dominating the Gameweek.
 */
export const REHEARSED_RESULTS: ReadonlyMap<number, [number, number]> = new Map([
  [1, [2, 0]],
  [2, [1, 1]],
  [3, [0, 1]],
  [4, [1, 3]],
  [5, [2, 2]],
  [6, [3, 1]],
  [7, [0, 0]],
  [8, [4, 0]],
  [9, [1, 2]],
  [10, [2, 1]]
]);

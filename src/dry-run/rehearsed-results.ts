/**
 * The scorelines the rehearsal settles the rehearsed Gameweek with, written by
 * hand rather than derived from the Fixture.
 *
 * Derived outcomes would make every expected metric a restatement of the same
 * rule the scorer applies, and the rehearsal would then agree with itself
 * whatever it computed. These are ten scorelines a person chose: four Home
 * wins, three Draws and three Away wins, so that no metric can be right by
 * accident of a single outcome dominating the Gameweek.
 *
 * In the order of the rehearsed Gameweek's Fixtures by id, whichever Gameweek
 * that is: keyed by id they could only ever settle Gameweek 1.
 */
export const REHEARSED_RESULTS: readonly [number, number][] = [
  [2, 0],
  [1, 1],
  [0, 1],
  [1, 3],
  [2, 2],
  [3, 1],
  [0, 0],
  [4, 0],
  [1, 2],
  [2, 1]
];

import type { GameweekAction } from "../src/fpl/apply-gameweek-action.js";

/**
 * The Gameweek actions the reducer and the persistence tests share, over the
 * players in `fpl-pool-fixture.ts`. They live in their own module rather than
 * beside either suite so that the states the store round-trips are the states
 * the reducer rules were proved against, and neither suite can drift onto a
 * scenario the other has never seen.
 */

/** The legal opening Squad: £95.5m spent, £4.5m left in the bank. */
export const OPENING_ACTION: GameweekAction = {
  transfersIn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  transfersOut: [],
  chip: null,
  teamSheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    viceCaptain: 13
  }
};

/**
 * One Transfer, Wilson out and Evanilson in, both £6.0m at their opening
 * prices. Wilson is the one the Selling Price tests move the price of, so what
 * the Entrant receives for him is the only thing that changes the bank.
 */
export const SELL_WILSON_BUY_EVANILSON: GameweekAction = {
  transfersIn: [19],
  transfersOut: [15],
  chip: null,
  teamSheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 19],
    captain: 8,
    viceCaptain: 13
  }
};

/** The same Team Sheet with no Transfer: what an Entrant sending nothing does. */
export const STAND_PAT: GameweekAction = {
  transfersIn: [],
  transfersOut: [],
  chip: null,
  teamSheet: OPENING_ACTION.teamSheet
};

/**
 * Enzo and Wilson out, Caicedo and Evanilson in. Two Transfers rather than one
 * deliberately: against a single banked Free Transfer the second costs a Hit,
 * so the Free Transfer count and the Hit both move. With one Transfer a
 * reloaded count of zero and a reloaded count of one both leave one Free
 * Transfer and no Hit, and a persistence test could not tell a dropped column
 * from a kept one.
 */
export const TWO_TRANSFERS: GameweekAction = {
  transfersIn: [18, 19],
  transfersOut: [9, 15],
  chip: null,
  teamSheet: {
    starters: [1, 3, 4, 5, 6, 8, 18, 10, 11, 13, 14],
    bench: [2, 7, 12, 19],
    captain: 8,
    viceCaptain: 13
  }
};

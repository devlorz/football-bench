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

/**
 * Three Transfers in one Gameweek: Timber out for White, Enzo out for Caicedo
 * and Wilson out for Evanilson. Position for position and club for club, so a
 * Squad that was legal stays legal, and £5.5m + £9.0m + £6.0m received against
 * £5.0m + £5.0m + £6.0m spent takes the bank from £4.5m to £9.0m.
 *
 * Three deliberately: against one banked Free Transfer the plain action below
 * costs two Hits, so a Chip that forgives them moves a number no other rule
 * moves, and a Chip that forgives only the first would still be caught.
 */
const REBUILD = {
  transfersIn: [17, 18, 19],
  transfersOut: [4, 9, 15],
  teamSheet: {
    starters: [1, 3, 17, 5, 6, 8, 18, 10, 11, 13, 14],
    bench: [2, 7, 12, 19],
    captain: 8,
    viceCaptain: 13
  }
} as const satisfies Omit<GameweekAction, "chip">;

/** The three Transfers with nothing to forgive them: two Hits, eight points. */
export const PAID_REBUILD: GameweekAction = { ...REBUILD, chip: null };

/** The same three Transfers, made permanent by a Wildcard. */
export const WILDCARD_REBUILD: GameweekAction = { ...REBUILD, chip: "wildcard" };

/** The same three Transfers, lasting one Gameweek under a Free Hit. */
export const FREE_HIT_REBUILD: GameweekAction = { ...REBUILD, chip: "free_hit" };

/**
 * The rebuilt Squad standing pat. It names White, Caicedo and Evanilson, so it
 * is legal only where the rebuild lasted — which is what tells a Wildcard's
 * permanent rebuild apart from a Free Hit's borrowed one.
 */
export const REBUILT_STAND_PAT: GameweekAction = {
  transfersIn: [],
  transfersOut: [],
  chip: null,
  teamSheet: REBUILD.teamSheet
};

/**
 * A second Wildcard on the Squad the rebuild left, with nothing to spend it
 * on. Every Squad and Team Sheet rule is satisfied, so whether the action
 * stands is a question about the Chip and about nothing else.
 */
export const SECOND_WILDCARD: GameweekAction = {
  transfersIn: [],
  transfersOut: [],
  chip: "wildcard",
  teamSheet: REBUILD.teamSheet
};

/**
 * A second Free Hit, likewise with nothing to spend it on. It stands on the
 * opening Team Sheet rather than the rebuild's, because the Gameweek after a
 * Free Hit is played on the permanent Squad the Chip gave back.
 */
export const SECOND_FREE_HIT: GameweekAction = {
  transfersIn: [],
  transfersOut: [],
  chip: "free_hit",
  teamSheet: OPENING_ACTION.teamSheet
};

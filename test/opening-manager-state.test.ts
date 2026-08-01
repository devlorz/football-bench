import { describe, expect, test } from "vitest";
import {
  applyGameweekAction,
  openingManagerState,
  type GameweekAction
} from "../src/fpl/apply-gameweek-action.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  poolPlayers
} from "./fpl-pool-fixture.js";

const POOL = poolPlayers([...FPL_POOL, ...FPL_POOL_ALTERNATES]);

/** The legal opening of the test above, with `swap` applied player-for-player. */
function opening(swap: Record<number, number> = {}): GameweekAction {
  const replace = (fplId: number): number => swap[fplId] ?? fplId;
  return {
    transfersIn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      .map(replace),
    transfersOut: [],
    chip: null,
    teamSheet: {
      starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14].map(replace),
      bench: [2, 7, 12, 15].map(replace),
      captain: replace(8),
      viceCaptain: replace(13)
    }
  };
}

describe("Opening Manager State", () => {
  test("accepts two goalkeepers, five defenders, five midfielders and three forwards within budget", () => {
    const result = applyGameweekAction(openingManagerState(), opening(), POOL);

    expect(result).toMatchObject({
      state: {
        squad: {
          active: [
            { fplId: 1, purchasePriceTenths: 45 },
            { fplId: 2, purchasePriceTenths: 40 },
            { fplId: 3, purchasePriceTenths: 60 },
            { fplId: 4, purchasePriceTenths: 55 },
            { fplId: 5, purchasePriceTenths: 50 },
            { fplId: 6, purchasePriceTenths: 45 },
            { fplId: 7, purchasePriceTenths: 40 },
            { fplId: 8, purchasePriceTenths: 120 },
            { fplId: 9, purchasePriceTenths: 90 },
            { fplId: 10, purchasePriceTenths: 75 },
            { fplId: 11, purchasePriceTenths: 55 },
            { fplId: 12, purchasePriceTenths: 45 },
            { fplId: 13, purchasePriceTenths: 105 },
            { fplId: 14, purchasePriceTenths: 70 },
            { fplId: 15, purchasePriceTenths: 60 }
          ],
          free_hit_stash: null
        },
        bankTenths: 45
      }
    });
  });

  test("rejects an opening Squad costing more than £100.0m", () => {
    // The legal Squad costs £95.5m; swapping a £12.0m midfielder for a
    // £17.0m one takes it to £100.5m.
    expect(applyGameweekAction(openingManagerState(), opening({ 8: 16 }), POOL))
      .toEqual({
        violation: {
          kind: "budget",
          message: "A Squad must cost no more than £100.0m."
        }
      });
  });

  test("rejects selling a player the Squad does not own", () => {
    // The opening Squad is empty, so there is nothing that can be sold —
    // whatever else the action gets right.
    expect(applyGameweekAction(openingManagerState(), {
      ...opening(),
      transfersOut: [999]
    }, POOL)).toEqual({
      violation: {
        kind: "unknown_player",
        message: "A Transfer can only sell a player your Squad owns."
      }
    });
  });

  test("rejects a Squad that buys one player twice to fill fifteen slots", () => {
    // Player 8 twice and player 9 never: fourteen real players, but every
    // count still reads two, five, five, three, three per club and £98.5m.
    // The four left out cannot be a four-player bench, only a three-player one.
    expect(applyGameweekAction(openingManagerState(), {
      transfersIn: [1, 2, 3, 4, 5, 6, 7, 8, 8, 10, 11, 12, 13, 14, 15],
      transfersOut: [],
      chip: null,
      teamSheet: {
        starters: [1, 3, 4, 5, 6, 8, 10, 11, 13, 14, 15],
        bench: [2, 7, 12],
        captain: 8,
        viceCaptain: 13
      }
    }, POOL)).toEqual({
      violation: {
        kind: "squad_quota",
        message: "A Squad must name fifteen different players."
      }
    });
  });

  test("rejects a Squad outside the two, five, five, three quota", () => {
    // A defender swapped for a midfielder: four defenders and six midfielders,
    // at £96.5m and still three per club, so only the quota is broken.
    expect(applyGameweekAction(openingManagerState(), opening({ 7: 18 }), POOL))
      .toEqual({
        violation: {
          kind: "squad_quota",
          message: "A Squad must contain exactly two goalkeepers, five "
            + "defenders, five midfielders and three forwards."
        }
      });
  });

  test("rejects more than three players from one club", () => {
    // A Chelsea defender swapped for an Arsenal one: four Arsenal players,
    // at £96.5m and still two, five, five, three.
    expect(applyGameweekAction(openingManagerState(), opening({ 7: 17 }), POOL))
      .toEqual({
        violation: {
          kind: "club_limit",
          message: "A Squad must contain no more than three players from "
            + "one club."
        }
      });
  });

  test("rejects a player outside the locked Gameweek's player pool", () => {
    expect(applyGameweekAction(openingManagerState(), opening({ 7: 999 }), POOL))
      .toEqual({
        violation: {
          kind: "unknown_player",
          message: "Every player must be in this Gameweek's player pool."
        }
      });
  });

  test("rejects a starting eleven that is not a legal formation", () => {
    // Both goalkeepers start, so the outfield shape cannot be legal whatever
    // the rest of the eleven is.
    expect(applyGameweekAction(openingManagerState(), {
      ...opening(),
      teamSheet: {
        starters: [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14],
        bench: [6, 7, 12, 15],
        captain: 8,
        viceCaptain: 13
      }
    }, POOL)).toEqual({
      violation: {
        kind: "formation",
        message: "A Team Sheet must start eleven players in a legal "
          + "formation: one goalkeeper, at least three defenders, at least "
          + "two midfielders and at least one forward."
      }
    });
  });

  test("rejects a bench that is not the four Squad members left out", () => {
    // A legal eleven, but the bench repeats one substitute and leaves the
    // fifteenth player of the Squad unseated.
    expect(applyGameweekAction(openingManagerState(), {
      ...opening(),
      teamSheet: { ...opening().teamSheet, bench: [2, 7, 12, 12] }
    }, POOL)).toEqual({
      violation: {
        kind: "formation",
        message: "A Team Sheet must name, in order, the four Squad members "
          + "who do not start."
      }
    });
  });

  test("rejects a captain who does not start", () => {
    expect(applyGameweekAction(openingManagerState(), {
      ...opening(),
      teamSheet: { ...opening().teamSheet, captain: 2 }
    }, POOL)).toEqual({
      violation: {
        kind: "captain",
        message: "A Team Sheet's captain and vice-captain must both be among "
          + "the eleven starters."
      }
    });
  });

  test("rejects one player named as both captain and vice-captain", () => {
    expect(applyGameweekAction(openingManagerState(), {
      ...opening(),
      teamSheet: { ...opening().teamSheet, captain: 8, viceCaptain: 8 }
    }, POOL)).toEqual({
      violation: {
        kind: "captain",
        message: "A Team Sheet's captain and vice-captain must be two "
          + "different players."
      }
    });
  });

  test("records one Free Transfer and both half-Season Chip sets unspent", () => {
    // The real game grants the first Free Transfer for the Gameweek after the
    // opening one, and no Chip can have been spent before the Season starts.
    expect(applyGameweekAction(openingManagerState(), opening(), POOL))
      .toMatchObject({
        state: {
          freeTransfers: 1,
          chipsUsed: { firstHalf: [], secondHalf: [] },
          chipActive: null
        }
      });
  });
});

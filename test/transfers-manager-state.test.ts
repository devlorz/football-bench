import { describe, expect, test } from "vitest";
import {
  applyGameweekAction,
  openingManagerState,
  type GameweekAction,
  type GameweekOutcome,
  type PoolPlayer
} from "../src/fpl/apply-gameweek-action.js";
import { LOCKED_POOL as POOL } from "./fpl-pool-fixture.js";
import {
  OPENING_ACTION as OPENING,
  SELL_WILSON_BUY_EVANILSON,
  STAND_PAT,
  TWO_TRANSFERS
} from "./fpl-action-fixture.js";

/**
 * A sequence is the unit of test here (spec 0003, §Testing Decisions), so this
 * folds the reducer over a list of actions and stops at the first violation.
 * It stays in the test suite deliberately: production has no consumer for a
 * replay yet, and an exported helper with no caller would be an interface
 * invented by its tests.
 */
function replay(
  actions: readonly GameweekAction[],
  pools: readonly PoolPlayer[][] = []
): GameweekOutcome {
  return actions.reduce<GameweekOutcome>(
    (outcome, action, gameweek) => "violation" in outcome
      ? outcome
      : applyGameweekAction(outcome.state, action, pools[gameweek] ?? POOL),
    { state: openingManagerState() }
  );
}

/** The pool as a later Gameweek's Lock would find it, with prices moved. */
function repriced(moves: Record<number, number>): PoolPlayer[] {
  return POOL.map((player) => ({
    ...player,
    priceTenths: moves[player.fplId] ?? player.priceTenths
  }));
}

describe("Carrying Manager State through a Gameweek without Transfers", () => {
  test("carries the Squad and every purchase price forward untouched", () => {
    expect(replay([OPENING, STAND_PAT])).toMatchObject({
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

  test("banks unused Free Transfers up to five and no further", () => {
    // The opening Gameweek grants the Free Transfer for the one after it, so
    // six further Gameweeks without a Transfer would accrue seven by simple
    // counting: 1, 2, 3, 4, 5, then two that the cap must swallow.
    const standingPat = Array.from({ length: 6 }, () => STAND_PAT);

    expect(replay([OPENING, ...standingPat])).toMatchObject({
      state: { freeTransfers: 5 }
    });
  });
});

describe("Selling Price", () => {
  test("pays the purchase price plus half of an odd rise, rounded down", () => {
    // Wilson was bought at £6.0m and is locked at £6.5m: a rise of £0.5m,
    // which is five tenths and cannot be halved evenly. The Entrant receives
    // 60 + 2 = 62, not 63 and not the 65 the pool now asks. Evanilson costs
    // 60, so the £4.5m bank becomes 45 + 62 - 60 = 47.
    expect(replay(
      [OPENING, SELL_WILSON_BUY_EVANILSON],
      [POOL, repriced({ 15: 65 })]
    )).toMatchObject({ state: { bankTenths: 47 } });
  });

  test("passes on a price fall in full rather than halving it", () => {
    // Wilson was bought at £6.0m and is locked at £5.7m. A fall is not a rise
    // to be halved: the Entrant receives the £5.7m the pool now asks, so the
    // bank becomes 45 + 57 - 60 = 42 and the £0.3m loss is real.
    expect(replay(
      [OPENING, SELL_WILSON_BUY_EVANILSON],
      [POOL, repriced({ 15: 57 })]
    )).toMatchObject({ state: { bankTenths: 42 } });
  });
});

describe("Hits", () => {
  test("charges four points for each Transfer beyond the banked allowance", () => {
    // Gameweek 1 grants one Free Transfer for Gameweek 2. Two Transfers there
    // spend it and pay for the second: one Hit, four points.
    expect(replay([OPENING, TWO_TRANSFERS]))
      .toMatchObject({ state: { hits: 4 } });
  });

  test("charges no Hit for the fifteen players of an opening Squad", () => {
    // Nothing is owned before the Season, so the opening fifteen are not
    // Transfers beyond an allowance — they are how the allowance starts.
    expect(replay([OPENING])).toMatchObject({ state: { hits: 0 } });
  });
});

describe("Replaying a sequence", () => {
  test("folds to the same state as applying each action in turn", () => {
    const first = applyGameweekAction(openingManagerState(), OPENING, POOL);
    if ("violation" in first) {
      throw new Error("the opening of every other test must be legal here");
    }
    const second = applyGameweekAction(first.state, STAND_PAT, POOL);
    if ("violation" in second) {
      throw new Error("standing pat on a legal Squad must stay legal");
    }
    const third = applyGameweekAction(second.state, TWO_TRANSFERS, POOL);

    expect(replay([OPENING, STAND_PAT, TWO_TRANSFERS])).toEqual(third);
  });

  test("carries the Squad, purchase prices, bank and Free Transfers of a paid Gameweek", () => {
    // Two Free Transfers have banked by Gameweek 3, so two Transfers there are
    // free: Enzo out at his unchanged £9.0m and Wilson out at £6.0m fund
    // Caicedo at £5.0m and Evanilson at £6.0m, leaving 45 + 150 - 110 = 85.
    // Spending both leaves none, and the Gameweek after grants one.
    expect(replay([OPENING, STAND_PAT, TWO_TRANSFERS])).toMatchObject({
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
            { fplId: 10, purchasePriceTenths: 75 },
            { fplId: 11, purchasePriceTenths: 55 },
            { fplId: 12, purchasePriceTenths: 45 },
            { fplId: 13, purchasePriceTenths: 105 },
            { fplId: 14, purchasePriceTenths: 70 },
            { fplId: 18, purchasePriceTenths: 50 },
            { fplId: 19, purchasePriceTenths: 60 }
          ],
          free_hit_stash: null
        },
        bankTenths: 85,
        freeTransfers: 1,
        hits: 0
      }
    });
  });
});

describe("A Squad still bound by every rule after a Transfer", () => {
  /** Alcaraz out, and one player of the caller's choosing in his place. */
  function swapAlcarazFor(fplId: number): GameweekAction {
    return {
      transfersIn: [fplId],
      transfersOut: [12],
      chip: null,
      teamSheet: { ...OPENING.teamSheet, bench: [2, 7, fplId, 15] }
    };
  }

  test("rejects a Transfer that cannot be afforded", () => {
    // Alcaraz sells for his unchanged £4.5m, so the bank offers £9.0m against
    // Dewsbury-Hall's £17.0m. Both are Everton midfielders, so nothing else
    // about the Squad changes.
    expect(replay([OPENING, swapAlcarazFor(20)])).toEqual({
      violation: {
        kind: "budget",
        message: "A Squad must cost no more than £100.0m."
      }
    });
  });

  test("rejects a Transfer that breaks the two, five, five, three quota", () => {
    // A midfielder out for a defender: six defenders and four midfielders,
    // at £4.5m for £4.5m and still three Everton players.
    expect(replay([OPENING, swapAlcarazFor(21)])).toEqual({
      violation: {
        kind: "squad_quota",
        message: "A Squad must contain exactly two goalkeepers, five "
          + "defenders, five midfielders and three forwards."
      }
    });
  });

  test("rejects a Transfer that puts a fourth player of one club in the Squad", () => {
    // An Everton midfielder out for a Chelsea one: four Chelsea players, at
    // £5.0m against £4.5m in the bank and still two, five, five, three.
    expect(replay([OPENING, swapAlcarazFor(18)])).toEqual({
      violation: {
        kind: "club_limit",
        message: "A Squad must contain no more than three players from "
          + "one club."
      }
    });
  });

  test("rejects selling one player twice to conjure money", () => {
    // Selling Price is paid per named sale but the Squad loses the player
    // once, so an unchecked repeat pays £6.0m twice for one Wilson: the bank
    // would reach £10.5m and the fifteen that remain would pass every other
    // rule. Nothing about the resulting Squad reveals it, so the pairing has
    // to be refused before any money is counted.
    expect(replay([OPENING, {
      transfersIn: [19],
      transfersOut: [15, 15],
      chip: null,
      teamSheet: { ...OPENING.teamSheet, bench: [2, 7, 12, 19] }
    }])).toEqual({
      violation: {
        kind: "unknown_player",
        message: "A Transfer can only sell a player once."
      }
    });
  });

  test("rejects buying a player the Squad already owns", () => {
    // A Transfer buys an unowned player (CONTEXT.md, Transfer). Wilson out for
    // a second Muniz leaves fifteen entries of which two are the same player,
    // and every count still reads two, five, five, three with three Fulham
    // players — only fourteen distinct men, seated by a fourteen-man Team
    // Sheet that the bench rule accepts because it counts the Squad it was
    // given.
    expect(replay([OPENING, {
      transfersIn: [14],
      transfersOut: [15],
      chip: null,
      teamSheet: { ...OPENING.teamSheet, bench: [2, 7, 12] }
    }])).toEqual({
      violation: {
        kind: "unknown_player",
        message: "A Transfer can only buy a player your Squad does not own."
      }
    });
  });

  test("rejects selling a player and buying him straight back", () => {
    // Wilson out and Wilson in at his risen £6.5m would leave the Squad as it
    // was but reset what he cost from £6.0m to £6.5m — buying away a price
    // rise the Entrant is supposed to be carrying. The same rule refuses it.
    expect(replay(
      [OPENING, {
        transfersIn: [15],
        transfersOut: [15],
        chip: null,
        teamSheet: OPENING.teamSheet
      }],
      [POOL, repriced({ 15: 65 })]
    )).toEqual({
      violation: {
        kind: "unknown_player",
        message: "A Transfer can only buy a player your Squad does not own."
      }
    });
  });

  test("rejects a sale with nothing bought to replace it", () => {
    // No separate rule counts Transfers in against Transfers out: once sales
    // are distinct, any imbalance leaves a Squad that is not fifteen, and a
    // Squad that is not fifteen cannot be two, five, five and three. Wilson
    // out and no one in leaves fourteen players and two forwards.
    expect(replay([OPENING, {
      transfersIn: [],
      transfersOut: [15],
      chip: null,
      teamSheet: { ...OPENING.teamSheet, bench: [2, 7, 12] }
    }])).toEqual({
      violation: {
        kind: "squad_quota",
        message: "A Squad must contain exactly two goalkeepers, five "
          + "defenders, five midfielders and three forwards."
      }
    });
  });

  test("rejects a mixed legal and illegal action whole", () => {
    // Evanilson for Wilson is legal on its own and would leave the bank at
    // £4.5m; pairing it with a player who is not in the pool must cost the
    // Entrant the legal half too — no Transfer, no bank movement, no Hit and
    // no partial Manager State, only the violation.
    expect(replay([OPENING, {
      transfersIn: [19, 999],
      transfersOut: [15, 14],
      chip: null,
      teamSheet: { ...OPENING.teamSheet, bench: [2, 7, 12, 19] }
    }])).toEqual({
      violation: {
        kind: "unknown_player",
        message: "Every player must be in this Gameweek's player pool."
      }
    });
  });
});

import { describe, expect, test } from "vitest";
import {
  applyGameweekAction,
  type GameweekAction
} from "../src/fpl/apply-gameweek-action.js";
import { LOCKED_POOL as POOL } from "./fpl-pool-fixture.js";
import { legalStateFrom, replay, repriced } from "./fpl-replay.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION as OPENING,
  PAID_REBUILD,
  REBUILT_STAND_PAT,
  SECOND_FREE_HIT,
  SECOND_WILDCARD,
  SELL_WILSON_BUY_EVANILSON,
  STAND_PAT,
  WILDCARD_REBUILD
} from "./fpl-action-fixture.js";

describe("Wildcard", () => {
  test("charges no Hit however many Transfers the Gameweek makes", () => {
    // Gameweek 1 grants one Free Transfer for Gameweek 2, so three Transfers
    // there would ordinarily leave two beyond the allowance and eight points
    // owed. The Wildcard is the whole difference.
    expect(replay([OPENING, WILDCARD_REBUILD]))
      .toMatchObject({ state: { hits: 0 } });
  });

  test("leaves banked Free Transfers exactly as it found them", () => {
    // "When playing a Wildcard, any saved free transfers are maintained. If
    // you had 2 saved free transfers, you will still have 2 saved free
    // transfers the following Gameweek" (official FPL FAQ). Two are banked by
    // Gameweek 3, the three Transfers made there take none of them, and the
    // Gameweek after opens on the same two: maintained is the whole rule, and
    // the Gameweek's own grant goes with the Chip.
    expect(replay([OPENING, STAND_PAT, WILDCARD_REBUILD]))
      .toMatchObject({ state: { freeTransfers: 2 } });
    // Normal accrual resumes immediately afterwards.
    expect(replay([OPENING, STAND_PAT, WILDCARD_REBUILD, REBUILT_STAND_PAT]))
      .toMatchObject({ state: { freeTransfers: 3 } });
  });

  test("makes its rebuild permanent, unlike the Squad a Free Hit borrows", () => {
    // Standing pat the Gameweek after names White, Caicedo and Evanilson, so
    // it is legal only if the rebuild kept them. The identical three actions
    // with a Free Hit in place of the Wildcard are refused, because that Squad
    // went back the moment the Gameweek ended.
    expect(replay([OPENING, WILDCARD_REBUILD, REBUILT_STAND_PAT]))
      .toMatchObject({
        state: {
          squad: {
            active: [
              { fplId: 1, purchasePriceTenths: 45 },
              { fplId: 2, purchasePriceTenths: 40 },
              { fplId: 3, purchasePriceTenths: 60 },
              { fplId: 5, purchasePriceTenths: 50 },
              { fplId: 6, purchasePriceTenths: 45 },
              { fplId: 7, purchasePriceTenths: 40 },
              { fplId: 8, purchasePriceTenths: 120 },
              { fplId: 10, purchasePriceTenths: 75 },
              { fplId: 11, purchasePriceTenths: 55 },
              { fplId: 12, purchasePriceTenths: 45 },
              { fplId: 13, purchasePriceTenths: 105 },
              { fplId: 14, purchasePriceTenths: 70 },
              { fplId: 17, purchasePriceTenths: 50 },
              { fplId: 18, purchasePriceTenths: 50 },
              { fplId: 19, purchasePriceTenths: 60 }
            ],
            free_hit_stash: null
          },
          bankTenths: 90
        }
      });

    expect(replay([OPENING, FREE_HIT_REBUILD, REBUILT_STAND_PAT])).toEqual({
      violation: {
        kind: "formation",
        message: "A Team Sheet must name, in order, the four Squad members "
          + "who do not start."
      }
    });
  });

  test("spends the same three Transfers for two Hits without the Chip", () => {
    // The contrast that makes both assertions above mean something: the same
    // three Transfers, the same Gameweek, the same one banked Free Transfer,
    // and only the Chip removed.
    expect(replay([OPENING, PAID_REBUILD]))
      .toMatchObject({ state: { hits: 8, freeTransfers: 1 } });
  });
});

describe("A Chip whose effect the rules cannot yet carry out", () => {
  const NOT_AVAILABLE = {
    kind: "chip_unavailable",
    message: "This Chip is not available in this Gameweek."
  };

  test.for(["triple_captain", "bench_boost"] as const)(
    "refuses %s rather than spending it for nothing",
    (chip) => {
      // Both Chips change how a Gameweek scores, and nothing scores them yet —
      // that is the "Play Triple Captain and Bench Boost" ticket. Accepting one
      // meanwhile would spend one of an Entrant's eight Chips for the Season
      // and leave the Gameweek scoring exactly as it would have.
      expect(replay([OPENING, { ...STAND_PAT, chip }]))
        .toEqual({ violation: NOT_AVAILABLE });
    }
  );

  test("leaves the refused Chip in its half-Season set", () => {
    // Refused before anything is counted, so the inventory the Season is
    // planned with is the one it started the Gameweek with.
    expect(applyGameweekAction(
      legalStateFrom(OPENING),
      { ...STAND_PAT, chip: "triple_captain" },
      POOL,
      2
    )).toEqual({ violation: NOT_AVAILABLE });

    expect(replay([OPENING, STAND_PAT])).toMatchObject({
      state: { chipsUsed: { firstHalf: [], secondHalf: [] } }
    });
  });
});

describe("Free Hit", () => {
  test("stashes the permanent Squad, Team Sheet and bank beside the temporary one", () => {
    // ADR-0017: the stored row is the whole input to the next reducer step, so
    // what the Free Hit displaces travels in the row rather than being looked
    // up afterwards. Timber, Enzo and Wilson leave the active Squad for one
    // Gameweek and stay in the stash at the £5.5m, £9.0m and £6.0m they cost.
    expect(replay([OPENING, FREE_HIT_REBUILD])).toMatchObject({
      state: {
        squad: {
          active: [
            { fplId: 1, purchasePriceTenths: 45 },
            { fplId: 2, purchasePriceTenths: 40 },
            { fplId: 3, purchasePriceTenths: 60 },
            { fplId: 5, purchasePriceTenths: 50 },
            { fplId: 6, purchasePriceTenths: 45 },
            { fplId: 7, purchasePriceTenths: 40 },
            { fplId: 8, purchasePriceTenths: 120 },
            { fplId: 10, purchasePriceTenths: 75 },
            { fplId: 11, purchasePriceTenths: 55 },
            { fplId: 12, purchasePriceTenths: 45 },
            { fplId: 13, purchasePriceTenths: 105 },
            { fplId: 14, purchasePriceTenths: 70 },
            { fplId: 17, purchasePriceTenths: 50 },
            { fplId: 18, purchasePriceTenths: 50 },
            { fplId: 19, purchasePriceTenths: 60 }
          ],
          free_hit_stash: {
            squad: [
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
            team_sheet: OPENING.teamSheet,
            bank: 45
          }
        },
        // The temporary Squad's own bank and Team Sheet, which is what the
        // Gameweek is scored from.
        bankTenths: 90,
        teamSheet: FREE_HIT_REBUILD.teamSheet,
        chipActive: "free_hit",
        hits: 0
      }
    });
  });

  test("reverts to the stashed Squad, Team Sheet and bank the Gameweek after", () => {
    // The Gameweek-1 Team Sheet is the one the Free Hit displaced, and it names
    // the fifteen players the Free Hit sent away. Standing pat on it the
    // Gameweek after is legal only if all fifteen are back.
    expect(replay([OPENING, FREE_HIT_REBUILD, STAND_PAT])).toMatchObject({
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
        bankTenths: 45,
        teamSheet: OPENING.teamSheet,
        chipActive: null
      }
    });
  });

  test("passes banked Free Transfers through and consumes the Gameweek's own", () => {
    // Two are banked by Gameweek 3. The three Transfers the Free Hit makes
    // take none of them, and playing the Chip costs the Free Transfer that
    // Gameweek would otherwise have granted — so Gameweek 4 opens on the same
    // two, and the Gameweek after that accrues normally to three.
    expect(replay([OPENING, STAND_PAT, FREE_HIT_REBUILD]))
      .toMatchObject({ state: { freeTransfers: 2 } });
    expect(replay([OPENING, STAND_PAT, FREE_HIT_REBUILD, STAND_PAT]))
      .toMatchObject({ state: { freeTransfers: 3 } });
  });

  test("prices a later sale from the permanent purchase price, not the Free Hit's", () => {
    // Wilson was bought at £6.0m in Gameweek 1, sent away by the Free Hit in
    // Gameweek 2, and is back for Gameweek 3, where the pool asks £6.5m. He
    // sells for 60 + floor(5 / 2) = 62, so the restored £4.5m bank becomes
    // 45 + 62 - 60 = 47. A reversion that restored the players but not what
    // they cost would pay the full £6.5m and leave 50.
    expect(replay(
      [OPENING, FREE_HIT_REBUILD, SELL_WILSON_BUY_EVANILSON],
      { pools: [POOL, POOL, repriced({ 15: 65 })] }
    )).toMatchObject({ state: { bankTenths: 47 } });
  });
});

describe("A Chip action that breaks a Squad rule", () => {
  /** Alcaraz out at £4.5m for Dewsbury-Hall at £17.0m against a £4.5m bank. */
  const OVERSPENDING_WILDCARD: GameweekAction = {
    transfersIn: [20],
    transfersOut: [12],
    chip: "wildcard",
    teamSheet: { ...OPENING.teamSheet, bench: [2, 7, 20, 15] }
  };

  /** The Squad the opening left, which every action below is judged against. */
  const opened = legalStateFrom(OPENING);

  test("is rejected whole, by the rule it broke rather than by the Chip", () => {
    // A Wildcard buys unlimited Transfers, not an unlimited budget: "when
    // using a Wildcard, you must remain within your current budget" (official
    // FPL FAQ).
    expect(applyGameweekAction(opened, OVERSPENDING_WILDCARD, POOL, 2))
      .toEqual({
        violation: {
          kind: "budget",
          message: "A Squad must cost no more than £100.0m."
        }
      });
  });

  test("is rejected whole when it is the Team Sheet that is illegal", () => {
    // The Free Hit's three Transfers are legal and its Squad is legal; the
    // eleven it names hold two goalkeepers. A Chip buys unlimited Transfers,
    // not a lineup the game would not put out.
    expect(applyGameweekAction(
      opened,
      {
        ...FREE_HIT_REBUILD,
        teamSheet: {
          starters: [1, 2, 17, 5, 6, 8, 18, 10, 11, 13, 14],
          bench: [3, 7, 12, 19],
          captain: 8,
          viceCaptain: 13
        }
      },
      POOL,
      2
    )).toEqual({
      violation: {
        kind: "formation",
        message: "A Team Sheet must start eleven players in a legal formation: "
          + "one goalkeeper, at least three defenders, at least two midfielders "
          + "and at least one forward."
      }
    });
  });

  test("leaves the Chip unspent, because a refusal returns no state at all", () => {
    // The identical Manager State, the identical Gameweek, and a Wildcard that
    // breaks nothing: it is spendable, so the refusal above took nothing.
    expect(
      applyGameweekAction(opened, { ...STAND_PAT, chip: "wildcard" }, POOL, 2)
    ).toMatchObject({
      state: { chipsUsed: { firstHalf: ["wildcard"], secondHalf: [] } }
    });
  });
});

describe("Two Free Hits in a row", () => {
  // The only place two Free Hits can meet: the last Gameweek of the first
  // half-Season and the first of the second, one from each set.
  const OPENING_GAMEWEEK = 18;

  test("refuses the second, played the Gameweek straight after the first", () => {
    // "If you use your first Free Hit chip in Gameweek 19, you can't then play
    // the second one the following week in Gameweek 20" (Premier League,
    // 2026/27 Chips announcement).
    expect(replay(
      [OPENING, FREE_HIT_REBUILD, SECOND_FREE_HIT],
      { openingGameweek: OPENING_GAMEWEEK }
    )).toEqual({
      violation: {
        kind: "chip_unavailable",
        message: "A Free Hit cannot be played in the Gameweek straight after "
          + "a Free Hit."
      }
    });
  });

  test("allows the second once a Gameweek has passed between them", () => {
    // The same two Free Hits from the same two sets, with one ordinary
    // Gameweek between them — so adjacency is the whole difference, not the
    // second-half set being out of reach.
    expect(replay(
      [OPENING, FREE_HIT_REBUILD, STAND_PAT, SECOND_FREE_HIT],
      { openingGameweek: OPENING_GAMEWEEK }
    )).toMatchObject({
      state: {
        chipActive: "free_hit",
        chipsUsed: { firstHalf: ["free_hit"], secondHalf: ["free_hit"] }
      }
    });
  });
});

describe("The opening Gameweek", () => {
  const OPENING_GAMEWEEK_CHIP = {
    kind: "chip_unavailable",
    message: "A Wildcard or Free Hit cannot be played in the Gameweek the "
      + "track opens on, where every Transfer is already free."
  };

  test("refuses a Wildcard, which would buy what the opening already gives", () => {
    // "Free Hit and Wildcard chips are unavailable in your opening Gameweek
    // because you have infinite transfers in this Gameweek" (official FPL FAQ).
    expect(replay([{ ...OPENING, chip: "wildcard" }]))
      .toEqual({ violation: OPENING_GAMEWEEK_CHIP });
  });

  test("refuses a Free Hit, which would have no Squad to revert to", () => {
    expect(replay([{ ...OPENING, chip: "free_hit" }]))
      .toEqual({ violation: OPENING_GAMEWEEK_CHIP });
  });

  test("is the Gameweek the track opened on, not the first of the Season", () => {
    // ADR-0003 lets the track join at a Gameweek and run forward, so an
    // Entrant's opening Squad need not be Gameweek 1's. The reason the FAQ
    // gives is about the opening, not about the calendar: an Entrant opening
    // at Gameweek 18 has the same infinite Transfers and the same nothing to
    // revert to, and gets the same refusal.
    expect(replay([{ ...OPENING, chip: "wildcard" }], { openingGameweek: 18 }))
      .toEqual({ violation: OPENING_GAMEWEEK_CHIP });
  });
});

describe("One set of Chips for each half of the Season", () => {
  /** Open, spend the Wildcard the Gameweek after, and reach for it again. */
  const TWICE = [OPENING, WILDCARD_REBUILD, SECOND_WILDCARD];

  test("records a played Chip against the half-Season it was played in", () => {
    expect(replay([OPENING, WILDCARD_REBUILD])).toMatchObject({
      state: { chipsUsed: { firstHalf: ["wildcard"], secondHalf: [] } }
    });
  });

  test("refuses a Chip already spent from this half-Season's set", () => {
    // Gameweeks 1, 2 and 3: both Wildcards would come from the first-half set,
    // and that set holds one.
    expect(replay(TWICE)).toEqual({
      violation: {
        kind: "chip_unavailable",
        message: "A Chip can only be played once in each half of the Season."
      }
    });
  });

  test("hands the second half a fresh set the Gameweek after the nineteenth", () => {
    // The identical three actions, moved so that they fall in Gameweeks 18, 19
    // and 20. The first-half Wildcard is spent at the last deadline it can be,
    // and the Gameweek after opens the second-half set — so the half boundary
    // is the whole difference between this and the refusal above.
    expect(replay(TWICE, { openingGameweek: 18 })).toMatchObject({
      state: { chipsUsed: { firstHalf: ["wildcard"], secondHalf: ["wildcard"] } }
    });
  });

  test("carries nothing unspent out of the first half and into the second", () => {
    // Gameweeks 18 and 19 spend no Chip at all, so the whole first-half set
    // goes unplayed. The second half is still one Wildcard, not two: the
    // Gameweek 20 Wildcard takes it and the Gameweek 21 one is refused.
    // "No chips can be carried over from the first half of the season to the
    // second" (official FPL FAQ).
    expect(replay(
      [OPENING, STAND_PAT, WILDCARD_REBUILD, SECOND_WILDCARD],
      { openingGameweek: 18 }
    )).toEqual({
      violation: {
        kind: "chip_unavailable",
        message: "A Chip can only be played once in each half of the Season."
      }
    });
  });
});

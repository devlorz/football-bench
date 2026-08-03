import { describe, expect, test } from "vitest";
import {
  MAX_FREE_TRANSFERS,
  rolledOverState
} from "../src/fpl/apply-gameweek-action.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION,
  PAID_REBUILD,
  STAND_PAT
} from "./fpl-action-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";

describe("A Gameweek that Rolls Over", () => {
  test("keeps the standing Squad and Team Sheet and accrues a Free Transfer", () => {
    // The opening Gameweek leaves fifteen players, £4.5m banked and one Free
    // Transfer. Rolling the next Gameweek over discards the action and nothing
    // else: the same Squad plays the same Team Sheet, and the Free Transfer the
    // Gameweek grants is banked exactly as it would have been (ADR-0004).
    const standing = legalStateFrom(OPENING_ACTION);

    expect(rolledOverState(standing)).toEqual({
      squad: { active: standing.squad.active, free_hit_stash: null },
      teamSheet: OPENING_ACTION.teamSheet,
      bankTenths: 45,
      freeTransfers: 2,
      hits: 0,
      chipsUsed: { firstHalf: [], secondHalf: [] },
      chipActive: null
    });
  });

  test("gives back what a Free Hit stashed rather than keeping the borrowed Squad", () => {
    // The case ADR-0017 put the stash in the row for. A Free Hit lasts one
    // Gameweek, and the Gameweek after it is the one that may Roll Over — so
    // the borrowed fifteen and the borrowed bank must go back before anything
    // is stored, or a Free Hit followed by three failed Repairs would make a
    // one-week Squad permanent.
    const opening = legalStateFrom(OPENING_ACTION);
    const borrowed = legalStateFrom(FREE_HIT_REBUILD, opening, 2);
    expect(borrowed.squad.free_hit_stash).not.toBeNull();

    expect(rolledOverState(borrowed)).toEqual({
      squad: { active: opening.squad.active, free_hit_stash: null },
      teamSheet: OPENING_ACTION.teamSheet,
      // The permanent £4.5m, not the £9.0m the rebuild left in the borrowed one.
      bankTenths: 45,
      // A Free Hit leaves the count as it found it, and this Gameweek grants one.
      freeTransfers: 2,
      hits: 0,
      // Spent when it was played; a Gameweek that Rolls Over gives nothing back.
      chipsUsed: { firstHalf: ["free_hit"], secondHalf: [] },
      chipActive: null
    });
  });

  test("does not owe the previous Gameweek's Hit a second time", () => {
    // Hits are deducted in the Gameweek they were taken (spec 0003). Carrying
    // the previous Gameweek's eight points into a Gameweek that made no
    // Transfer at all would charge for them twice.
    const paid = legalStateFrom(PAID_REBUILD, legalStateFrom(OPENING_ACTION), 2);
    expect(paid.hits).toBe(8);

    expect(rolledOverState(paid)).toMatchObject({ hits: 0 });
  });

  test("banks the Gameweek's Free Transfer no further than the cap", () => {
    // Rolling over is not a way past the ceiling an active Gameweek stops at.
    const banked = Array.from({ length: MAX_FREE_TRANSFERS + 2 }).reduce<
      ReturnType<typeof legalStateFrom>
    >(
      (state, _, played) => legalStateFrom(STAND_PAT, state, played + 2),
      legalStateFrom(OPENING_ACTION)
    );
    expect(banked.freeTransfers).toBe(MAX_FREE_TRANSFERS);

    expect(rolledOverState(banked))
      .toMatchObject({ freeTransfers: MAX_FREE_TRANSFERS });
  });
});

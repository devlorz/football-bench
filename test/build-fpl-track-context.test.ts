import { describe, expect, test } from "vitest";
import { buildFplTrackContext } from "../src/context/build-fpl-track-context.js";
import {
  openingManagerState,
  type ChipsUsed,
  type ManagerState
} from "../src/fpl/apply-gameweek-action.js";
import { FPL_POOL, FPL_POOL_ALTERNATES } from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION,
  STAND_PAT
} from "./fpl-action-fixture.js";

const POOL = [...FPL_POOL, ...FPL_POOL_ALTERNATES].map(
  (player) => ({ ...player, status: "a" })
);

function contextFor(chipsUsed: ChipsUsed, gameweek = 2): string {
  const state: ManagerState = { ...openingManagerState(), chipsUsed };
  return buildFplTrackContext({
    season: "2026-27",
    gameweek,
    state,
    pool: POOL
  });
}

/** The one line of the context that reports a half-Season's Chip set. */
function chipLine(body: string, half: "first" | "second"): string {
  const heading = `Chips unspent, ${half} half`;
  const line = body.split("\n").find((at) => at.startsWith(heading));
  if (line === undefined) {
    throw new Error(`the context has no "${heading}" line`);
  }
  return line;
}

describe("The Manager State the FPL context reports", () => {
  test("reverts a Free Hit before showing the Squad and bank it opens on", () => {
    // The reducer reverts a Free Hit before it judges the next action, so a
    // context built from the same stored row has to revert it too. Showing the
    // borrowed Squad would have the Entrant pick a Team Sheet from fifteen
    // players it no longer owns, and price Transfers against £9.0m it no
    // longer has — then be refused for both.
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);
    const onFreeHit = legalStateFrom(FREE_HIT_REBUILD, opened, 2);

    const body = buildFplTrackContext({
      season: "2026-27",
      gameweek: 3,
      state: onFreeHit,
      pool: POOL
    });

    expect(body).toContain("Bank: £4.5m");
    expect(body).not.toContain("Bank: £9.0m");
    // Timber, Enzo and Wilson are back at what they cost; White, Caicedo and
    // Evanilson went with the Free Hit.
    for (const owned of [
      "- 4 | bought for £5.5m",
      "- 9 | bought for £9.0m",
      "- 15 | bought for £6.0m"
    ]) {
      expect(body).toContain(owned);
    }
    for (const borrowed of ["- 17 |", "- 18 |", "- 19 |"]) {
      expect(body).not.toContain(borrowed);
    }
  });
});

describe("The Chips the FPL context says can be played now", () => {
  /** The one line naming what this Gameweek will actually accept. */
  function playableLine(body: string): string {
    const heading = "Chips you can play this Gameweek";
    const line = body.split("\n").find((at) => at.startsWith(heading));
    if (line === undefined) {
      throw new Error(`the context has no "${heading}" line`);
    }
    return line;
  }

  test("withholds a Free Hit in the Gameweek straight after a Free Hit", () => {
    // A Free Hit at Gameweek 19 and the second-half set untouched at Gameweek
    // 20: every "unspent" count says the Chip is there, and the reducer will
    // refuse it anyway. Left to work that out from the rule text alone, an
    // Entrant spends a Repair discovering it.
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 18);
    const onFreeHit = legalStateFrom(FREE_HIT_REBUILD, opened, 19);

    const body = buildFplTrackContext({
      season: "2026-27",
      gameweek: 20,
      state: onFreeHit,
      pool: POOL
    });

    expect(playableLine(body)).toBe(
      "Chips you can play this Gameweek: wildcard, triple_captain, bench_boost"
    );
    // The set itself is still whole — the Chip is withheld for this Gameweek,
    // not spent.
    expect(chipLine(body, "second")).toBe(
      "Chips unspent, second half (from Gameweek 20): wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("offers the Free Hit again once a Gameweek has passed", () => {
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 18);
    const onFreeHit = legalStateFrom(FREE_HIT_REBUILD, opened, 19);
    const afterwards = legalStateFrom(STAND_PAT, onFreeHit, 20);

    expect(playableLine(buildFplTrackContext({
      season: "2026-27",
      gameweek: 21,
      state: afterwards,
      pool: POOL
    }))).toBe(
      "Chips you can play this Gameweek: wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("drops a Chip this half of the Season has already spent", () => {
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);

    expect(playableLine(buildFplTrackContext({
      season: "2026-27",
      gameweek: 5,
      state: {
        ...opened,
        chipsUsed: { firstHalf: ["wildcard"], secondHalf: [] }
      },
      pool: POOL
    }))).toBe(
      "Chips you can play this Gameweek: free_hit, triple_captain, bench_boost"
    );
  });

  test("offers the scoring Chips in the Gameweek the track opens on", () => {
    // The transfer Chips are barred there and these two are not, so the line
    // that asks the rules rather than restating them says so without anyone
    // having written this Gameweek down anywhere.
    const body = buildFplTrackContext({
      season: "2026-27",
      gameweek: 1,
      state: openingManagerState(),
      pool: POOL
    });

    expect(playableLine(body)).toBe(
      "Chips you can play this Gameweek: triple_captain, bench_boost"
    );
    expect(chipLine(body, "first")).toBe(
      "Chips unspent, first half (through Gameweek 19): wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("says so plainly when this Gameweek will accept none", () => {
    // The half-Season set is spent out, so there is nothing left to offer. An
    // empty list after a colon reads as an omission rather than as an answer.
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);

    expect(playableLine(buildFplTrackContext({
      season: "2026-27",
      gameweek: 5,
      state: {
        ...opened,
        chipsUsed: {
          firstHalf: ["wildcard", "free_hit", "triple_captain", "bench_boost"],
          secondHalf: []
        }
      },
      pool: POOL
    }))).toBe("Chips you can play this Gameweek: none");
  });
});

describe("The Chips the FPL context reports", () => {
  test("offers both full sets to an Entrant that has spent nothing", () => {
    const body = contextFor({ firstHalf: [], secondHalf: [] });

    expect(chipLine(body, "first")).toBe(
      "Chips unspent, first half (through Gameweek 19): wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
    expect(chipLine(body, "second")).toBe(
      "Chips unspent, second half (from Gameweek 20): wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("drops a spent Chip from its own half and leaves the other whole", () => {
    // ADR-0004: an Entrant is refused for reaching for a spent Chip, so it has
    // to be shown which ones it still holds — and shown that the two sets are
    // counted apart.
    const body = contextFor({
      firstHalf: ["wildcard", "bench_boost"],
      secondHalf: []
    });

    expect(chipLine(body, "first")).toBe(
      "Chips unspent, first half (through Gameweek 19): free_hit, "
      + "triple_captain"
    );
    expect(chipLine(body, "second")).toBe(
      "Chips unspent, second half (from Gameweek 20): wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("says so plainly when a half-Season's set is spent out", () => {
    // An empty list after a colon reads as an omission. A Gameweek in which
    // no Chip can be played has to say that it is one.
    const body = contextFor({
      firstHalf: ["wildcard", "free_hit", "triple_captain", "bench_boost"],
      secondHalf: []
    });

    expect(chipLine(body, "first")).toBe(
      "Chips unspent, first half (through Gameweek 19): none"
    );
  });
});

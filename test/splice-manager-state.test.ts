import { describe, expect, test } from "vitest";
import {
  buildFplTrackContext,
  spliceManagerState,
  type BuildFplTrackContextOptions
} from "../src/context/build-fpl-track-context.js";
import {
  openingManagerState,
  type ManagerState
} from "../src/fpl/apply-gameweek-action.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  trackPool
} from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import { FREE_HIT_REBUILD, OPENING_ACTION } from "./fpl-action-fixture.js";

/**
 * Everything the donor and the spliced body hold in common — the sections the
 * splice must carry over untouched. Each is given something to say, because a
 * section left empty would pass the equality whether it was copied or rebuilt.
 */
const SHARED: Omit<BuildFplTrackContextOptions, "state"> = {
  season: "2026-27",
  gameweek: 8,
  pool: trackPool([...FPL_POOL, ...FPL_POOL_ALTERNATES]),
  schedule: [
    {
      gameweek: 8,
      homeClub: "Arsenal",
      awayClub: "Chelsea",
      kickoff: new Date("2026-10-24T14:00:00Z")
    },
    {
      gameweek: 9,
      homeClub: "Chelsea",
      awayClub: "Bournemouth",
      kickoff: new Date("2026-10-31T14:00:00Z")
    }
  ],
  league: {
    through: new Date("2026-10-18T16:30:00Z"),
    rows: [
      {
        club: "Arsenal",
        played: 7,
        wins: 5,
        draws: 1,
        losses: 1,
        goalsFor: 14,
        goalsAgainst: 6,
        points: 16
      },
      {
        club: "Chelsea",
        played: 7,
        wins: 4,
        draws: 2,
        losses: 1,
        goalsFor: 12,
        goalsAgainst: 7,
        points: 14
      }
    ]
  },
  performance: [
    {
      fplId: 8,
      season: {
        points: 32,
        minutes: 630,
        appearances: 7,
        goals: 2,
        assists: 2,
        cleanSheets: 0,
        bonus: 3,
        yellowCards: 1,
        redCards: 0,
        saves: 0,
        expectedGoals: "2.30",
        expectedAssists: "1.80",
        expectedGoalsConceded: "9.80"
      }
    }
  ],
  settledThrough: 7
};

function body(state: ManagerState): string {
  return buildFplTrackContext({ ...SHARED, state });
}

/** A seat that bought its Squad in Gameweek 1 and has held it since. */
const OPENED = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);

/**
 * A seat whose last Gameweek was a Free Hit: a borrowed Squad and a borrowed
 * bank stashed over its own, and one Chip fewer than the donor holds.
 */
const ON_FREE_HIT = legalStateFrom(FREE_HIT_REBUILD, OPENED, 2);

describe("spliceManagerState", () => {
  test("renders what the builder renders for the spliced state", () => {
    expect(spliceManagerState(body(OPENED), ON_FREE_HIT))
      .toBe(body(ON_FREE_HIT));
  });

  test("counts the Chips the spliced state holds, not the donor's", () => {
    const spliced = spliceManagerState(body(OPENED), ON_FREE_HIT);

    expect(spliced).toContain(
      "Chips unspent, first half (through Gameweek 19): "
      + "wildcard, triple_captain, bench_boost"
    );
    expect(body(OPENED)).toContain(
      "Chips unspent, first half (through Gameweek 19): "
      + "wildcard, free_hit, triple_captain, bench_boost"
    );
  });

  test("reverts the spliced state's Free Hit before showing it", () => {
    const spliced = spliceManagerState(body(OPENED), ON_FREE_HIT);

    // The permanent Squad and its bank, not the borrowed pair the row stores.
    expect(spliced).toContain("Bank: £4.5m");
    expect(spliced).not.toContain("Bank: £9.0m");
    expect(spliced).toContain("- 4 | bought for £5.5m");
  });

  test("carries the shared sections over byte for byte", () => {
    const donor = body(OPENED);
    // Everything from the schedule down: Fixtures, table, performance windows
    // and the pool block the purchase prices are read out of.
    const shared = (at: string): string =>
      at.slice(at.indexOf("\nFixtures, this Gameweek"));

    expect(shared(spliceManagerState(donor, ON_FREE_HIT))).toBe(shared(donor));
  });

  test("refuses a body it cannot find the block in", () => {
    const headed = "Fantasy Premier League — 2026-27 Gameweek 8";

    expect(() => spliceManagerState(`${headed}\n\nYour Squad\n\nFixtures`, OPENED))
      .toThrow(/Your Manager State/);
    // A body of some other Prompt Version — the Match track's, or an FPL body
    // whose heading a later version rewrites.
    expect(() => spliceManagerState(body(OPENED).replace(headed, "Gameweek 8"), OPENED))
      .toThrow(/donor is not a/);
  });
});

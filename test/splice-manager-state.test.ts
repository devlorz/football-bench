import { describe, expect, test } from "vitest";
import {
  buildFplTrackContext,
  spliceManagerState,
  type BuildFplTrackContextOptions,
  type OwnRecord
} from "../src/context/build-fpl-track-context.js";
import {
  CHIPS,
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
  settledThrough: 7,
  ownRecord: null
};

function body(state: ManagerState): string {
  return buildFplTrackContext({ ...SHARED, state });
}

/** A Manager State that bought its Squad in Gameweek 1 and has held it since. */
const OPENED = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);

/**
 * A Manager State whose last Gameweek was a Free Hit: a borrowed Squad and a
 * borrowed bank stashed over its own, and one Chip fewer than the donor holds.
 */
const ON_FREE_HIT = legalStateFrom(FREE_HIT_REBUILD, OPENED, 2);

/** The Manager State block as the splice finds it: heading to blank line. */
function stateBlock(body: string): string[] {
  const lines = body.split("\n");
  const opens = lines.indexOf("Your Manager State");
  return lines.slice(opens, lines.indexOf("", opens));
}

describe("A stored FPL context with another Manager State spliced in", () => {
  test("renders what the builder renders for the spliced state", () => {
    expect(spliceManagerState(body(OPENED), ON_FREE_HIT, null))
      .toBe(body(ON_FREE_HIT));
  });

  test("counts the Chips the spliced state holds, not the donor's", () => {
    const spliced = spliceManagerState(body(OPENED), ON_FREE_HIT, null);

    expect(spliced).toContain(
      "Chips unspent, first half (through Gameweek 19): "
      + "wildcard, triple_captain, bench_boost"
    );
    expect(body(OPENED)).toContain(
      "Chips unspent, first half (through Gameweek 19): "
      + "wildcard, free_hit, triple_captain, bench_boost"
    );
    // The line the rules are actually read off (spec 0013, story 15): the
    // donor offers the Free Hit, and the state spliced in has spent it.
    expect(spliced).toContain(
      "Chips you can play this Gameweek: "
      + "wildcard, triple_captain, bench_boost"
    );
    expect(body(OPENED)).toContain(
      "Chips you can play this Gameweek: "
      + "wildcard, free_hit, triple_captain, bench_boost"
    );
  });

  test("closes the block on the own record's last line, in every Manager State", () => {
    // The splice takes the first blank line after the heading as the end of
    // the block, which is only the end of it while the block holds no blank
    // line of its own. Stated here so a section that grows one fails loudly
    // rather than leaving the donor's own-record lines under a spliced block.
    const spent = [...CHIPS];
    for (const state of [
      openingManagerState(),
      OPENED,
      ON_FREE_HIT,
      { ...OPENED, chipsUsed: { firstHalf: spent, secondHalf: spent } }
    ]) {
      expect(stateBlock(body(state)).at(-1)).toBe(
        "Your own record: no Gameweek has settled yet."
      );
    }

    // The harder case: a settled own record renders several lines, and none
    // of them may be blank without truncating the block early.
    const SETTLED: OwnRecord = {
      gameweek: 7,
      starters: [{ fplId: 1, points: 6 }],
      bench: [{ fplId: 2, points: 0 }],
      armband: { fplId: 1, points: 6, multiplier: 2, contribution: 12 },
      seasonPoints: 54
    };
    const settled = buildFplTrackContext({
      ...SHARED,
      state: OPENED,
      ownRecord: SETTLED
    });
    expect(stateBlock(settled).at(-1)).toBe("Season points to date: 54");
    expect(stateBlock(settled)).toContain(
      "Your own record, from Gameweek 7, the latest Settled Gameweek:"
    );
  });

  test("reverts the spliced state's Free Hit before showing it", () => {
    const spliced = spliceManagerState(body(OPENED), ON_FREE_HIT, null);

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

    expect(shared(spliceManagerState(donor, ON_FREE_HIT, null))).toBe(shared(donor));
  });

  test("refuses a body it cannot find the block in", () => {
    const headed = "Fantasy Premier League — 2026-27 Gameweek 8";

    expect(() => spliceManagerState(`${headed}\n\nYour Squad\n\nFixtures`, OPENED, null))
      .toThrow(/Your Manager State/);
    // A body of some other Prompt Version — the Match track's, or an FPL body
    // whose heading a later version rewrites.
    expect(() => spliceManagerState(body(OPENED).replace(headed, "Gameweek 8"), OPENED, null))
      .toThrow(/donor is not a/);
  });
});

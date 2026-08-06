import { describe, expect, test } from "vitest";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  type BuildFplTrackContextOptions,
  type FplFixture,
  type FplPlayerPerformance
} from "../src/context/build-fpl-track-context.js";
import {
  openingManagerState,
  type ChipsUsed,
  type ManagerState
} from "../src/fpl/apply-gameweek-action.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  LOCKED_POOL
} from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION,
  STAND_PAT
} from "./fpl-action-fixture.js";

const POOL = [...FPL_POOL, ...FPL_POOL_ALTERNATES].map(
  (player) => ({ ...player, status: "a" })
);

/**
 * A context a Gameweek into the Season, with everything a test is not about
 * left at its quietest: the opening Squad, nothing scheduled ahead and nothing
 * Settled behind. Each test overrides the one input it is about, so what it is
 * asserting is what it names.
 */
function context(
  overrides: Partial<BuildFplTrackContextOptions> = {}
): string {
  return buildFplTrackContext({
    season: "2026-27",
    gameweek: 8,
    state: openingManagerState(),
    pool: POOL,
    schedule: [],
    performance: [],
    settledThrough: null,
    ...overrides
  });
}

function contextFor(chipsUsed: ChipsUsed, gameweek = 2): string {
  const state: ManagerState = { ...openingManagerState(), chipsUsed };
  return context({ gameweek, state });
}

/**
 * Palmer's seven Settled Gameweeks, summed by hand into the two windows the
 * opening flow will hand the builder:
 *
 * | GW | pts | min | g | a | cs | b | yc | xG   | xA   | xGC  |
 * |  1 |  12 |  90 | 1 | 1 |  0 | 2 |  0 | 0.60 | 0.40 | 1.20 |
 * |  2 |   9 |  90 | 1 | 0 |  0 | 1 |  1 | 0.50 | 0.30 | 1.50 |
 * |  3 |   2 |  90 | 0 | 0 |  0 | 0 |  0 | 0.20 | 0.10 | 2.00 |
 * |  4 |   2 |  90 | 0 | 0 |  0 | 0 |  0 | 0.30 | 0.20 | 1.10 |
 * |  5 |   3 |  90 | 0 | 1 |  0 | 0 |  0 | 0.10 | 0.50 | 0.90 |
 * |  6 |   2 |  90 | 0 | 0 |  0 | 0 |  0 | 0.40 | 0.10 | 1.80 |
 * |  7 |   2 |  90 | 0 | 0 |  0 | 0 |  0 | 0.20 | 0.20 | 1.30 |
 *
 * A hot opening and then five quiet Gameweeks, so the two windows disagree on
 * every line that matters — which is the whole reason both are shown.
 */
const PALMER: FplPlayerPerformance = {
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
  },
  lastFive: {
    points: 11,
    minutes: 450,
    appearances: 5,
    goals: 0,
    assists: 1,
    cleanSheets: 0,
    bonus: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    expectedGoals: "1.20",
    expectedAssists: "1.10",
    expectedGoalsConceded: "7.10"
  }
};

/** One player's pool line, read back as the Entrant reads it. */
function poolLine(body: string, fplId: number): Record<string, unknown> {
  const line = body.split("\n").find((at) =>
    at.startsWith(`{"id":${fplId},`)
  );
  if (line === undefined) {
    throw new Error(`the pool has no line for player ${fplId}`);
  }
  return JSON.parse(line) as Record<string, unknown>;
}

/**
 * Six Gameweeks of a scripted four-club schedule, in the order the opening
 * flow reads it out of `fixtures`: by Gameweek, then by kickoff.
 *
 * Gameweek 9 is Chelsea's Double — two lines in one Gameweek — and Gameweek 10
 * its Blank, where the club appears nowhere. Neither is written down; both are
 * read off the list.
 */
const SCHEDULE: FplFixture[] = [
  {
    gameweek: 8,
    homeClub: "Arsenal",
    awayClub: "Chelsea",
    kickoff: new Date("2026-10-24T11:30:00Z")
  },
  {
    gameweek: 8,
    homeClub: "Brentford",
    awayClub: "Everton",
    kickoff: new Date("2026-10-25T14:00:00Z")
  },
  {
    gameweek: 9,
    homeClub: "Chelsea",
    awayClub: "Brentford",
    kickoff: new Date("2026-10-31T14:00:00Z")
  },
  {
    gameweek: 9,
    homeClub: "Everton",
    awayClub: "Chelsea",
    kickoff: new Date("2026-11-01T16:30:00Z")
  },
  {
    gameweek: 10,
    homeClub: "Arsenal",
    awayClub: "Everton",
    kickoff: new Date("2026-11-07T14:00:00Z")
  },
  {
    gameweek: 11,
    homeClub: "Arsenal",
    awayClub: "Brentford",
    kickoff: new Date("2026-11-21T14:00:00Z")
  },
  {
    gameweek: 11,
    homeClub: "Chelsea",
    awayClub: "Everton",
    kickoff: new Date("2026-11-22T16:30:00Z")
  },
  {
    gameweek: 12,
    homeClub: "Brentford",
    awayClub: "Chelsea",
    kickoff: new Date("2026-11-28T14:00:00Z")
  },
  {
    gameweek: 12,
    homeClub: "Everton",
    awayClub: "Arsenal",
    kickoff: new Date("2026-11-29T16:30:00Z")
  },
  {
    gameweek: 13,
    homeClub: "Arsenal",
    awayClub: "Chelsea",
    kickoff: new Date("2026-12-05T14:00:00Z")
  },
  {
    gameweek: 13,
    homeClub: "Brentford",
    awayClub: "Everton",
    kickoff: new Date("2026-12-06T16:30:00Z")
  }
];

/** The context's Fixtures section, from its heading to the blank line. */
function fixturesShown(body: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((at) => at.startsWith("Fixtures"));
  if (start === -1) {
    throw new Error("the context has no Fixtures section");
  }
  return lines.slice(start, lines.indexOf("", start));
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

    const body = context({
      gameweek: 3,
      state: onFreeHit
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

    const body = context({
      gameweek: 20,
      state: onFreeHit
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

    expect(playableLine(context({
      gameweek: 21,
      state: afterwards
    }))).toBe(
      "Chips you can play this Gameweek: wildcard, free_hit, "
      + "triple_captain, bench_boost"
    );
  });

  test("drops a Chip this half of the Season has already spent", () => {
    const opened = legalStateFrom(OPENING_ACTION, openingManagerState(), 1);

    expect(playableLine(context({
      gameweek: 5,
      state: {
        ...opened,
        chipsUsed: { firstHalf: ["wildcard"], secondHalf: [] }
      }
    }))).toBe(
      "Chips you can play this Gameweek: free_hit, triple_captain, bench_boost"
    );
  });

  test("offers the scoring Chips in the Gameweek the track opens on", () => {
    // The transfer Chips are barred there and these two are not, so the line
    // that asks the rules rather than restating them says so without anyone
    // having written this Gameweek down anywhere.
    const body = context({
      gameweek: 1,
      state: openingManagerState()
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

    expect(playableLine(context({
      gameweek: 5,
      state: {
        ...opened,
        chipsUsed: {
          firstHalf: ["wildcard", "free_hit", "triple_captain", "bench_boost"],
          secondHalf: []
        }
      }
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

describe("The Fixtures the FPL context lists", () => {
  test("groups six Gameweeks of raw lines, home side first", () => {
    // A Double is Chelsea twice in Gameweek 9 and a Blank is Chelsea nowhere in
    // Gameweek 10 — repetition and absence, with nothing said about either.
    expect(fixturesShown(context({ schedule: SCHEDULE }))).toEqual([
      "Fixtures, this Gameweek and the five ahead:",
      "Gameweek 8",
      "- Arsenal v Chelsea | 2026-10-24",
      "- Brentford v Everton | 2026-10-25",
      "Gameweek 9",
      "- Chelsea v Brentford | 2026-10-31",
      "- Everton v Chelsea | 2026-11-01",
      "Gameweek 10",
      "- Arsenal v Everton | 2026-11-07",
      "Gameweek 11",
      "- Arsenal v Brentford | 2026-11-21",
      "- Chelsea v Everton | 2026-11-22",
      "Gameweek 12",
      "- Brentford v Chelsea | 2026-11-28",
      "- Everton v Arsenal | 2026-11-29",
      "Gameweek 13",
      "- Arsenal v Chelsea | 2026-12-05",
      "- Brentford v Everton | 2026-12-06"
    ]);
  });

  test("stops at the last Gameweek the calendar has, saying nothing", () => {
    // Three Gameweeks from the end of a Season: the window is what the schedule
    // holds, and a shorter horizon is a fact of the calendar rather than
    // something to announce.
    expect(fixturesShown(context({
      schedule: SCHEDULE.filter(({ gameweek }) => gameweek < 11)
    }))).toEqual([
      "Fixtures, this Gameweek and the five ahead:",
      "Gameweek 8",
      "- Arsenal v Chelsea | 2026-10-24",
      "- Brentford v Everton | 2026-10-25",
      "Gameweek 9",
      "- Chelsea v Brentford | 2026-10-31",
      "- Everton v Chelsea | 2026-11-01",
      "Gameweek 10",
      "- Arsenal v Everton | 2026-11-07"
    ]);
  });

  test("marks no Fixture as hard, easy or anything else", () => {
    // ADR-0018 and ADR-0021: FPL's Fixture Difficulty Rating and team strength
    // are the digested versions of the schedule, and their absence is what
    // leaves the reading of a Fixture to the Entrant.
    const body = context({ schedule: SCHEDULE });

    for (const digested of [
      /difficulty/i,
      /\bfdr\b/i,
      /strength/i,
      /\belo\b/i,
      /\brating\b/i
    ]) {
      expect(body).not.toMatch(digested);
    }
  });
});

describe("The performance windows the FPL pool carries", () => {
  test("gives a player with Settled minutes a season and a last-five block", () => {
    const body = context({ performance: [PALMER], settledThrough: 7 });

    expect(poolLine(body, 8).season).toEqual({
      pts: 32,
      min: 630,
      app: 7,
      g: 2,
      a: 2,
      b: 3,
      yc: 1,
      xg: "2.30",
      xa: "1.80",
      xgc: "9.80"
    });
    expect(poolLine(body, 8).last5).toEqual({
      pts: 11,
      min: 450,
      app: 5,
      a: 1,
      xg: "1.20",
      xa: "1.10",
      xgc: "7.10"
    });
  });

  test("drops the block for a window the player has no Settled minutes in", () => {
    // Wilson started the Season and then stopped being picked: three Settled
    // Gameweeks of minutes, none of them in the last five. The absent block is
    // the statement — an all-zero one would read as "played and did nothing".
    const wilson: FplPlayerPerformance = {
      fplId: 15,
      season: {
        points: 14,
        minutes: 210,
        appearances: 3,
        goals: 1,
        assists: 0,
        cleanSheets: 0,
        bonus: 1,
        yellowCards: 0,
        redCards: 0,
        saves: 0,
        expectedGoals: "0.90",
        expectedAssists: "0.30",
        expectedGoalsConceded: "3.40"
      },
      lastFive: {
        points: 0,
        minutes: 0,
        appearances: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        bonus: 0,
        yellowCards: 0,
        redCards: 0,
        saves: 0,
        expectedGoals: "0.00",
        expectedAssists: "0.00",
        expectedGoalsConceded: "0.00"
      }
    };

    const body = context({ performance: [wilson], settledThrough: 7 });

    expect(poolLine(body, 15).season).toEqual({
      pts: 14,
      min: 210,
      app: 3,
      g: 1,
      b: 1,
      xg: "0.90",
      xa: "0.30",
      xgc: "3.40"
    });
    expect(poolLine(body, 15)).not.toHaveProperty("last5");
    // And Kelleher, who has not played a Settled minute all Season, is on the
    // line the pool has always shown him on. He is still buyable: the pool is
    // the priced universe of legal Transfers, never a shortlist.
    expect(poolLine(body, 2)).toEqual({
      id: 2,
      name: "Kelleher",
      club: "Brentford",
      position: "GKP",
      price: "£4.0m",
      price_tenths: 40,
      status: "available"
    });
  });

  test("defines every abbreviated key exactly once above the pool", () => {
    // Raya keeps a clean sheet and gets sent off; Palmer scores and assists.
    // Between them every key a block can carry is on a line, so the legend is
    // checked against what the pool actually renders rather than against a
    // list written twice.
    const raya: FplPlayerPerformance = {
      fplId: 1,
      season: {
        points: 41,
        minutes: 630,
        appearances: 7,
        goals: 0,
        assists: 1,
        cleanSheets: 3,
        bonus: 4,
        yellowCards: 1,
        redCards: 1,
        saves: 21,
        expectedGoals: "0.00",
        expectedAssists: "0.10",
        expectedGoalsConceded: "8.70"
      },
      lastFive: {
        points: 28,
        minutes: 450,
        appearances: 5,
        goals: 0,
        assists: 1,
        cleanSheets: 2,
        bonus: 3,
        yellowCards: 0,
        redCards: 1,
        saves: 15,
        expectedGoals: "0.00",
        expectedAssists: "0.10",
        expectedGoalsConceded: "6.20"
      }
    };

    const body = context({ performance: [PALMER, raya], settledThrough: 7 });
    const lines = body.split("\n");
    const legend = lines.find((at) => at.startsWith("Stat keys: "));
    if (legend === undefined) {
      throw new Error("the context has no legend line");
    }

    // Above the pool, so the keys are defined before the first line using them.
    expect(lines.indexOf(legend)).toBeLessThan(
      lines.findIndex((at) => at.startsWith("{\"id\":"))
    );
    const defined = legend
      .replace("Stat keys: ", "")
      .replace(/\.$/, "")
      .split(", ")
      .map((entry) => entry.split(" = ")[0]);
    const rendered = [1, 8].flatMap((fplId) => [
      ...Object.keys(poolLine(body, fplId).season as object),
      ...Object.keys(poolLine(body, fplId).last5 as object)
    ]);

    expect(new Set(defined)).toEqual(new Set(rendered));
    expect(defined.length).toBe(new Set(defined).size);
  });

  test("announces the Settled Gameweek the windows run through", () => {
    expect(context({ performance: [PALMER], settledThrough: 7 })).toContain(
      "Performance below runs through Settled Gameweek 7."
    );
  });

  test("says plainly when no Gameweek has settled yet", () => {
    // Gameweek 1's normal case, and the track's first context: no window to
    // show, and a line saying so rather than a pool that is quietly bare. The
    // legend goes with it — keys nothing below uses define nothing.
    const body = context({ performance: [], settledThrough: null });

    expect(body).toContain(
      "No Gameweek has settled yet, so no player performance appears below."
    );
    expect(body).not.toContain("Stat keys: ");
    expect(poolLine(body, 8)).not.toHaveProperty("season");
    expect(poolLine(body, 8)).not.toHaveProperty("last5");
  });

  test("carries no digested number anywhere in the context", () => {
    // ADR-0018: form, ICT, expected points and ownership are FPL's own
    // ratings, forecasts and crowd wisdom. Their absence is the feature — any
    // forecast in the answer has to be the Entrant's own.
    const body = context({ performance: [PALMER], settledThrough: 7 });

    for (const digested of [
      /\bform\b/i,
      /\bict\b/i,
      /ict_index/i,
      /ep_next/i,
      /selected_by/i,
      /ownership/i,
      /expected points/i
    ]) {
      expect(body).not.toMatch(digested);
    }
  });

  test("reads the priced pool back out of a v2 body, stat blocks and all", () => {
    // The stored body is what an action is priced from, so a body carrying
    // everything v2 shows — a schedule ahead of the pool and stats on its
    // lines — has to come back as the same priced players it always was.
    const body = context({
      schedule: SCHEDULE,
      performance: [PALMER],
      settledThrough: 7
    });

    expect(parseFplTrackContextPool(body)).toEqual(LOCKED_POOL);
    // And the fields it prices from are still checked: a price the reducer
    // cannot do arithmetic on is refused rather than tolerated alongside the
    // stats.
    expect(() => parseFplTrackContextPool(
      body.replace('"price_tenths":120', '"price_tenths":"120"')
    )).toThrow("malformed player pool line");
  });
});


import { describe, expect, test } from "vitest";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  type BuildFplTrackContextOptions,
  type FplFixture,
  type FplLeagueTable,
  type FplPlayerPerformance,
  type OwnRecord
} from "../src/context/build-fpl-track-context.js";
import {
  openingManagerState,
  type ChipsUsed,
  type ManagerState
} from "../src/fpl/apply-gameweek-action.js";
import {
  FPL_POOL,
  FPL_POOL_ALTERNATES,
  LOCKED_POOL,
  trackPool
} from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import {
  FREE_HIT_REBUILD,
  OPENING_ACTION,
  STAND_PAT
} from "./fpl-action-fixture.js";
import {
  GAMEWEEK_ACTION_SCHEMA_KIND,
  validateGameweekAction
} from "../src/fpl/validate-gameweek-action.js";

const POOL = trackPool([...FPL_POOL, ...FPL_POOL_ALTERNATES]);

/**
 * A context a Gameweek into the Season, with everything a test is not about
 * left at its quietest: the opening Squad, nothing scheduled ahead, no result
 * played and nothing Settled behind. Each test overrides the one input it is
 * about, so what it is asserting is what it names.
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
    league: null,
    performance: [],
    settledThrough: null,
    ownRecord: null,
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

/**
 * The current Season's table as the opening flow hands it over: summed,
 * ordered by the competition's rule, and dated by the latest result in it.
 * The same table `test/open-fpl-gameweek.test.ts` sums out of Postgres, so
 * what the builder renders and what the flow computes are one table.
 *
 * Both ties the rule exists for are in it, and both are placed so that no
 * other rule would produce the same order. Everton is above Brentford on goal
 * difference (+4 against +3) while trailing it on goals scored and following
 * it alphabetically; Wolves is above Chelsea on goals scored (4 against 3)
 * while matching it on points and goal difference and following it
 * alphabetically.
 */
const LEAGUE: FplLeagueTable = {
  through: new Date("2026-08-29T16:30:00Z"),
  rows: [
    { club: "Arsenal", played: 4, wins: 4, draws: 0, losses: 0, goalsFor: 10, goalsAgainst: 3, points: 12 },
    { club: "Everton", played: 4, wins: 3, draws: 0, losses: 1, goalsFor: 6, goalsAgainst: 2, points: 9 },
    { club: "Brentford", played: 4, wins: 3, draws: 0, losses: 1, goalsFor: 8, goalsAgainst: 5, points: 9 },
    { club: "Wolves", played: 4, wins: 0, draws: 2, losses: 2, goalsFor: 4, goalsAgainst: 6, points: 2 },
    { club: "Chelsea", played: 4, wins: 0, draws: 2, losses: 2, goalsFor: 3, goalsAgainst: 5, points: 2 },
    { club: "Fulham", played: 4, wins: 0, draws: 0, losses: 4, goalsFor: 2, goalsAgainst: 12, points: 0 }
  ]
};

/**
 * One section of the context, from the line that opens it to the blank line
 * that closes it. The sections are separated by blank lines and nothing else,
 * so finding one is finding where it starts.
 */
function sectionShown(body: string, heading: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((at) => at.startsWith(heading));
  if (start === -1) {
    throw new Error(`the context has no "${heading}" section`);
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
  test("tells the opening Squad how to be bought, and only that one", () => {
    // An empty Squad is the only Gameweek where every player has to arrive
    // through transfers_in, and the seats that read the old line kept sending
    // a transfers_out they had nothing to fill (spec 0010).
    const opening = context({ gameweek: 1 });

    expect(opening).toContain(
      "Squad: none yet — this is your opening Squad. Buy all fifteen players "
      + "through transfers_in; transfers_out stays empty."
    );

    const bought = context({
      gameweek: 2,
      state: legalStateFrom(OPENING_ACTION)
    });

    expect(bought).not.toContain("none yet");
    expect(bought).toContain("Squad, with what you paid for each player:");
  });

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
    expect(sectionShown(context({ schedule: SCHEDULE }), "Fixtures")).toEqual([
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
    expect(sectionShown(context({
      schedule: SCHEDULE.filter(({ gameweek }) => gameweek < 11)
    }), "Fixtures")).toEqual([
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
    // leaves the reading of a Fixture to the Entrant. The table is in the body
    // too, because it is the other half of the same temptation: summing
    // results is allowed, rating the sides is not.
    const body = context({ schedule: SCHEDULE, league: LEAGUE });

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

describe("The league table the FPL context carries", () => {
  test("shows each side's record in rule order, dated by its latest result", () => {
    expect(
      sectionShown(context({ league: LEAGUE }), "Premier League table")
    ).toEqual([
      "Premier League table, from results through 2026-08-29:",
      "- 1 Arsenal | 4 played, 4W 0D 0L, GF 10, GA 3, 12 pts",
      "- 2 Everton | 4 played, 3W 0D 1L, GF 6, GA 2, 9 pts",
      "- 3 Brentford | 4 played, 3W 0D 1L, GF 8, GA 5, 9 pts",
      "- 4 Wolves | 4 played, 0W 2D 2L, GF 4, GA 6, 2 pts",
      "- 5 Chelsea | 4 played, 0W 2D 2L, GF 3, GA 5, 2 pts",
      "- 6 Fulham | 4 played, 0W 0D 4L, GF 2, GA 12, 0 pts"
    ]);
  });

  test("announces an empty table rather than leaving it out", () => {
    // Gameweek 1's normal case. A section that simply vanished would leave an
    // Entrant unable to tell "nothing has been played" from "nobody told me".
    expect(
      sectionShown(context({ league: null }), "Premier League table")
    ).toEqual([
      "Premier League table: no result has been played yet this Season."
    ]);
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
    // everything v2 shows — a schedule and a table ahead of the pool and stats
    // on its lines — has to come back as the same priced players it always was.
    const body = context({
      schedule: SCHEDULE,
      league: LEAGUE,
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

/**
 * The pool with two flags on it, in the two shapes FPL's own feed sends:
 * Palmer doubtful with a percentage published against him, Wilson flagged with
 * none. Everyone else is unflagged, which is most of a pool most weeks.
 */
const FLAGGED_POOL = POOL.map((player) => {
  if (player.fplId === 8) {
    return {
      ...player,
      status: "d",
      chanceOfPlaying: 25,
      news: "Knee injury - expected back 21 Sep"
    };
  }
  if (player.fplId === 15) {
    return {
      ...player,
      status: "d",
      chanceOfPlaying: null,
      news: "Knock - assessed ahead of Saturday"
    };
  }
  return player;
});

describe("The availability detail the FPL pool carries", () => {
  test("puts percentage and news on a flag, and neither key on none", () => {
    const body = context({ pool: FLAGGED_POOL });

    // 25% doubtful and 75% doubtful are the same word in `status` and
    // different bets, which is the whole reason the percentage is here.
    expect(poolLine(body, 8)).toEqual({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "doubtful",
      chance: 25,
      news: "Knee injury - expected back 21 Sep"
    });
    // And an unflagged player carries neither key rather than a pair of empty
    // ones: absence keeps meaning "nothing to report", on six hundred lines.
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

  test("gives news alone to a flag FPL sends no percentage with", () => {
    const body = context({ pool: FLAGGED_POOL });

    expect(poolLine(body, 15)).toEqual({
      id: 15,
      name: "Wilson",
      club: "Fulham",
      position: "FWD",
      price: "£6.0m",
      price_tenths: 60,
      status: "doubtful",
      news: "Knock - assessed ahead of Saturday"
    });
    expect(poolLine(body, 15)).not.toHaveProperty("chance");
  });

  test("leaves the legend out of a pool with nothing flagged at all", () => {
    // Most Gameweeks flag someone, so this is the quiet week rather than the
    // normal one — and on it the keys define nothing, exactly as the stat
    // legend defines nothing in a Season that has settled nothing.
    expect(context()).not.toContain("Availability keys: ");
  });

  test("keeps a percentage FPL left on a recovered player as it stands", () => {
    // FPL puts chance back to 100 when a player recovers and clears the news,
    // and the snapshot keeps the number. Verbatim means the line keeps it:
    // reading 100 as "nothing to report" would be this context's own verdict
    // rather than FPL's (ADR-0018), and the legend appears because a line
    // below does use a key.
    const body = context({
      pool: POOL.map((player) => player.fplId === 8
        ? { ...player, chanceOfPlaying: 100 }
        : player)
    });

    expect(poolLine(body, 8)).toEqual({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "available",
      chance: 100
    });
    expect(poolLine(body, 8)).not.toHaveProperty("news");
    expect(body).toContain("Availability keys: ");
  });

  test("defines both availability keys exactly once above the pool", () => {
    // Nothing has settled, so the stat legend is not there to define them:
    // availability is on the pool from Gameweek 1, and so is what it means.
    const body = context({ pool: FLAGGED_POOL });
    const lines = body.split("\n");
    const defined = lines.filter((at) => at.startsWith("Availability keys: "));

    expect(body).not.toContain("Stat keys: ");
    expect(defined).toHaveLength(1);
    expect(defined[0]).toContain("chance = ");
    expect(defined[0]).toContain("news = ");
    expect(lines.indexOf(defined[0]!)).toBeLessThan(
      lines.findIndex((at) => at.startsWith("{\"id\":"))
    );
  });

  test("prints the snapshot's own words, and a nil chance as a number", () => {
    // Zero is FPL saying he will not play, not FPL saying nothing — a line
    // that dropped it for being falsy would turn a ruled-out player into an
    // unflagged one. The news goes through verbatim, quotes and all: no
    // verdict of the context's own is anywhere on the line (ADR-0018).
    const ruledOut = 'Ankle injury - "no return date", ruled out';
    const body = context({
      pool: POOL.map((player) => player.fplId === 8
        ? { ...player, status: "i", chanceOfPlaying: 0, news: ruledOut }
        : player)
    });

    expect(poolLine(body, 8)).toEqual({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "injured",
      chance: 0,
      news: ruledOut
    });
  });

  test("reads the priced pool back out of a body carrying the flags", () => {
    const body = context({
      pool: FLAGGED_POOL,
      schedule: SCHEDULE,
      league: LEAGUE,
      performance: [PALMER],
      settledThrough: 7
    });

    expect(parseFplTrackContextPool(body)).toEqual(LOCKED_POOL);
    // Tolerant of the new keys, strict about the ones it prices from: a price
    // the reducer cannot do arithmetic on is still refused.
    expect(() => parseFplTrackContextPool(
      body.replace('"price_tenths":120', '"price_tenths":"120"')
    )).toThrow("malformed player pool line");
  });
});

/**
 * The pool with one club's known takers on it, in the shape FPL's own feed
 * sends: two of the three orders named, the third left silent — which is not
 * the same as a zero.
 */
const DUTY_POOL = POOL.map((player) => player.fplId === 8
  ? { ...player, penaltyOrder: 1, directFreeKickOrder: 2, cornerOrder: null }
  : player);

describe("The duties the FPL pool carries", () => {
  test("puts each published order on its own key, and none where FPL is silent", () => {
    const body = context({ pool: DUTY_POOL });

    expect(poolLine(body, 8)).toEqual({
      id: 8,
      name: "Palmer",
      club: "Chelsea",
      position: "MID",
      price: "£12.0m",
      price_tenths: 120,
      status: "available",
      pen: 1,
      fk: 2
    });
    // A player FPL names no taker for renders exactly as today: the source's
    // own silence, not a null dressed up as a fact.
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

  test("leaves the legend out of a pool FPL names no taker in", () => {
    expect(context()).not.toContain("Duty keys: ");
  });

  test("defines the duty keys exactly once, above the pool, once any is named", () => {
    const body = context({ pool: DUTY_POOL });
    const lines = body.split("\n");
    const defined = lines.filter((at) => at.startsWith("Duty keys: "));

    expect(defined).toHaveLength(1);
    expect(defined[0]).toContain("pen = ");
    expect(defined[0]).toContain("fk = ");
    expect(defined[0]).toContain("corners = ");
    expect(lines.indexOf(defined[0]!)).toBeLessThan(
      lines.findIndex((at) => at.startsWith("{\"id\":"))
    );
  });

  test("reads the priced pool back out of a body carrying duties", () => {
    const body = context({ pool: DUTY_POOL, schedule: SCHEDULE, league: LEAGUE });

    expect(parseFplTrackContextPool(body)).toEqual(LOCKED_POOL);
  });
});

/**
 * A latest Settled Gameweek's own record, arbitrary in every number so a test
 * reading one back proves it read the right one rather than a coincidence.
 */
const SETTLED_OWN_RECORD: OwnRecord = {
  gameweek: 7,
  starters: [
    { fplId: 1, points: 6 },
    { fplId: 8, points: 9 }
  ],
  bench: [
    { fplId: 2, points: 0 }
  ],
  armband: { fplId: 8, points: 9, multiplier: 2, contribution: 18 },
  seasonPoints: 54
};

describe("The Entrant's own record the FPL context carries", () => {
  test("announces plainly that nothing has settled yet", () => {
    // The opening's own state: no Gameweek behind it, so nothing is folded
    // and nothing to fold with it — the same emptiness a Season records for
    // every ten Entrants at once (`startFplTrack`).
    expect(
      sectionShown(context({ ownRecord: null }), "Your own record")
    ).toEqual(["Your own record: no Gameweek has settled yet."]);
  });

  test("names the Gameweek it reads, and shows every stored fact beside it", () => {
    // After a Gap the latest Settled Gameweek sits further back than the one
    // being played, and the block names it rather than saying "last
    // Gameweek" — the same rule the performance heading follows. This same
    // block shape is what a Rolled Over Gameweek renders too: the Team Sheet
    // it names is read verbatim off the stored row, and a Roll Over's row
    // holds the standing Sheet unchanged (`rolledOverState`) — so there is no
    // second branch here for a Roll Over to take.
    const body = context({
      gameweek: 9,
      ownRecord: { ...SETTLED_OWN_RECORD, gameweek: 4 }
    });

    expect(sectionShown(body, "Your own record")).toEqual([
      "Your own record, from Gameweek 4, the latest Settled Gameweek:",
      "Starters, with what each returned:",
      "- 1 | 6 pts",
      "- 8 | 9 pts",
      "Bench, with what each returned:",
      "- 2 | 0 pts",
      "Armband: 8 | 9 pts x2 = 18 pts",
      "Season points to date: 54"
    ]);
  });

  test("says plainly when nobody wore the armband", () => {
    // Neither the captain nor the vice played — not a nought, nobody wore it.
    const body = context({
      ownRecord: { ...SETTLED_OWN_RECORD, armband: null }
    });

    expect(sectionShown(body, "Your own record")).toEqual([
      "Your own record, from Gameweek 7, the latest Settled Gameweek:",
      "Starters, with what each returned:",
      "- 1 | 6 pts",
      "- 8 | 9 pts",
      "Bench, with what each returned:",
      "- 2 | 0 pts",
      "Armband: nobody wore it.",
      "Season points to date: 54"
    ]);
  });

  test("gives the Season's points to date, and no other seat's", () => {
    const body = context({ ownRecord: SETTLED_OWN_RECORD });

    expect(body).toContain("Season points to date: 54");
    // No other seat's totals, no ranking, no digest of the numbers.
    expect(body).not.toMatch(/\brank\b/i);
  });

  test("holds no blank line inside the block, whatever it renders", () => {
    // The Exhibition splice finds the block's end at the first blank line, so
    // the own record must never hand it one before the block is meant to
    // close. The range checked is found independently of any blank line —
    // "Season points to date" is a fixed string, not `indexOf("", opens)` —
    // so a stray blank earlier in the block cannot truncate the check before
    // it and hide itself behind a slice that stopped short of it.
    const lines = context({ ownRecord: SETTLED_OWN_RECORD }).split("\n");
    const opens = lines.indexOf("Your Manager State");
    const lastContent = lines.indexOf("Season points to date: 54");

    expect(lastContent).toBeGreaterThan(opens);
    expect(lines.slice(opens, lastContent + 1)).not.toContain("");
    // And the block really does close right after it, proving `lastContent`
    // is the block's true last line and not merely one that precedes it.
    expect(lines[lastContent + 1]).toBe("");
  });

  test("asks for the Rationale the schema already requires, to the byte", () => {
    // The shape line's own key — read off it rather than assumed — so a
    // rename on either side of the pair fails this test rather than passing
    // it by coincidence.
    const shapeLine = context().split("\n").at(-1)!;
    const shape = JSON.parse(shapeLine) as Record<string, unknown>;
    const key = Object.keys(shape).find((at) => /rationale/i.test(at));
    expect(key).toBe("rationale");

    // A fully legal action, built independently of the shape line, carrying
    // the exact key it asks for: the schema accepts it with the key present
    // and refuses it, as the schema kind, with the key gone — proving the two
    // agree on this key and not merely on every other one.
    const legal = {
      transfers_in: OPENING_ACTION.transfersIn,
      transfers_out: OPENING_ACTION.transfersOut,
      chip: OPENING_ACTION.chip,
      team_sheet: {
        starters: OPENING_ACTION.teamSheet.starters,
        bench: OPENING_ACTION.teamSheet.bench,
        captain: OPENING_ACTION.teamSheet.captain,
        vice_captain: OPENING_ACTION.teamSheet.viceCaptain
      },
      [key!]: "Standing pat."
    };
    expect(validateGameweekAction(JSON.stringify(legal)))
      .toMatchObject({ ok: true, rationale: "Standing pat." });

    const { [key!]: _dropped, ...withoutIt } = legal;
    expect(validateGameweekAction(JSON.stringify(withoutIt)))
      .toMatchObject({ ok: false, kind: GAMEWEEK_ACTION_SCHEMA_KIND });
  });
});


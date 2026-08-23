import { describe, expect, test } from "vitest";
import { COMBINED_RANKING_QUALIFICATION } from "../dashboard/src/overall-caveat.js";
import {
  overallRanking, type CompetitionLeaderboard
} from "../dashboard/src/overall-view.js";

/**
 * The combined ranking's arithmetic, with no DOM, no database and no fetch:
 * hand-built `LeaderboardBody` values in, the ranked rows and the state out.
 * Every rule under test renders perfectly while being wrong (spec 0025).
 */

const body = (over: Partial<CompetitionLeaderboard["body"]> = {}) => ({
  season: "2026-27",
  active: true,
  throughGw: 5,
  nextLock: null,
  settledFixtures: 10,
  matchPointsQualification: null,
  betPointsQualification: null,
  exhibitionCaveat: null,
  entrants: [],
  ...over
});

const entrant = (over: Partial<CompetitionLeaderboard["body"]["entrants"][number]> = {}) => ({
  id: "match/claude-opus-5",
  name: "Claude Opus 5",
  baseModelClass: "frontier",
  matchPoints: 10,
  betPoints: 4,
  n: 5,
  exhibition: null,
  ...over
});

describe("the qualification", () => {
  test("states the raw sum, the Fixture weighting and the Prompt Version confound", () => {
    expect(COMBINED_RANKING_QUALIFICATION).toContain("raw sum");
    expect(COMBINED_RANKING_QUALIFICATION).toContain("weighs more");
    expect(COMBINED_RANKING_QUALIFICATION).toContain("Prompt Version");
  });
});

describe("which Competitions are covered", () => {
  test("nothing-covered is its own state, not an empty ranking", () => {
    const result = overallRanking([]);
    expect(result.kind).toBe("nothing-covered");
  });

  test("excludes a Competition nobody has opened", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      { competition: "PL", body: body({ active: false, throughGw: null }) }
    ];
    expect(overallRanking(leaderboards).kind).toBe("nothing-covered");
  });

  test("excludes an opened Competition that has scored nothing, separately", () => {
    // Active alone must not be enough -- a league open with a null
    // `throughGw` would otherwise contribute a nought that reads as a score.
    const leaderboards: CompetitionLeaderboard[] = [
      { competition: "SA", body: body({ active: true, throughGw: null }) }
    ];
    const result = overallRanking(leaderboards);
    expect(result.kind).toBe("nothing-covered");
  });
});

describe("the covered set and its totals", () => {
  const leaderboards: CompetitionLeaderboard[] = [
    {
      competition: "PL",
      body: body({
        settledFixtures: 24,
        entrants: [entrant({ id: "match/claude-opus-5", matchPoints: 60, betPoints: 20 })]
      })
    },
    {
      competition: "PD",
      body: body({
        settledFixtures: 9,
        entrants: [entrant({ id: "match-pd/2026-27-v2/claude-opus-5", matchPoints: 15, betPoints: 5 })]
      })
    },
    // Not opened -- excluded from the covered set entirely.
    { competition: "SA", body: body({ active: false, throughGw: null, entrants: [] }) }
  ];
  const result = overallRanking(leaderboards);
  if (result.kind !== "ranking") throw new Error("expected a ranking");

  test("covers only the leagues that are active and scored, in that order", () => {
    expect(result.covered).toEqual(["PL", "PD"]);
  });

  test("sums both columns across the covered leagues, reconciling by hand", () => {
    expect(result.matchRanked).toEqual([
      expect.objectContaining({ slug: "claude-opus-5", matchPoints: 75, betPoints: 25 })
    ]);
  });

  test("keys a row by the seat's slug, so one Base Model under four " +
    "Competition-prefixed ids is one row and not four", () => {
    expect(result.matchRanked).toHaveLength(1);
  });

  test("the Fixture breakdown and its total are drawn from the covered set only", () => {
    expect(result.fixtures).toEqual([
      { competition: "PL", settledFixtures: 24 },
      { competition: "PD", settledFixtures: 9 }
    ]);
    expect(result.totalFixtures).toBe(33);
  });
});

describe("a row missing from one covered league", () => {
  test("still covers the same leagues as every other row, scoring nought where it is absent", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          entrants: [
            entrant({ id: "match/claude-opus-5", matchPoints: 60, betPoints: 20 }),
            entrant({ id: "match/gpt-5", name: "GPT-5", matchPoints: 40, betPoints: 10 })
          ]
        })
      },
      {
        // Gpt-5 has no row here at all -- the read API would not omit a
        // seated Entrant, but the rule under test is that the covered set
        // stays {PL, PD} for every row regardless, and an absent row
        // contributes nought rather than shrinking that Entrant's own set.
        competition: "PD",
        body: body({
          entrants: [
            entrant({ id: "match-pd/2026-27-v2/claude-opus-5", matchPoints: 15, betPoints: 5 })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");

    expect(result.covered).toEqual(["PL", "PD"]);
    expect(result.matchRanked).toEqual([
      expect.objectContaining({ slug: "claude-opus-5", matchPoints: 75, betPoints: 25 }),
      expect.objectContaining({ slug: "gpt-5", matchPoints: 40, betPoints: 10 })
    ]);
  });
});

describe("a seat that Gapped a whole covered league", () => {
  test("scores nought there and still ranks", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          entrants: [entrant({ id: "match/claude-opus-5", matchPoints: 0, betPoints: 0 })]
        })
      },
      {
        competition: "PD",
        body: body({
          entrants: [
            entrant({ id: "match-pd/2026-27-v2/claude-opus-5", matchPoints: 15, betPoints: 5 })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.matchRanked).toEqual([
      expect.objectContaining({ slug: "claude-opus-5", matchPoints: 15, betPoints: 5 })
    ]);
  });
});

describe("an Exhibition Run", () => {
  test("is summed and ranked like any other row, carrying the flag that labels it", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          entrants: [
            entrant({ id: "match/claude-opus-5", matchPoints: 4 }),
            entrant({
              id: "exhibition/ox-alpha", name: "Ox Alpha", matchPoints: 9,
              exhibition: { ranAfterGw: 3 }
            })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.matchRanked.map((row) => [row.slug, row.exhibition]))
      .toEqual([["ox-alpha", true], ["claude-opus-5", false]]);
  });

  test("sums across leagues under its own key, never into the Entrant of the "
    + "same Base Model", () => {
    // The state section 3 of the runbook puts a candidate in: one Base Model
    // seated as an Entrant in one league while a temporary Exhibition row
    // answers in another. Two rows, two totals, one name -- and adding them
    // would publish half a competitor and half a replay as one number.
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          entrants: [entrant({ id: "match/ox-alpha", matchPoints: 4 })]
        })
      },
      {
        competition: "PD",
        body: body({
          entrants: [
            entrant({
              id: "exhibition-pd/ox-alpha", name: "Ox Alpha", matchPoints: 9,
              exhibition: { ranAfterGw: 2 }
            }),
            entrant({
              id: "exhibition-sa/ox-alpha", name: "Ox Alpha", matchPoints: 1,
              exhibition: { ranAfterGw: 1 }
            })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.matchRanked.map((row) => [row.slug, row.exhibition, row.matchPoints]))
      .toEqual([["ox-alpha", true, 10], ["ox-alpha", false, 4]]);
  });
});

describe("ties", () => {
  test("rank as the per-league leaderboard ranks them -- each column sorted on its own " +
    "terms, and stable in the order rows arrived wherever it is level", () => {
    // Two pairs, each tied on one column and clearly apart on the other, so a
    // column that silently inherited the other's order -- or a sort that
    // reordered a tie instead of leaving it -- shows up as a wrong slug order
    // in the pair it was not supposed to touch.
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          entrants: [
            entrant({ id: "match/gpt-5", name: "GPT-5", matchPoints: 30, betPoints: 5 }),
            entrant({ id: "match/claude-opus-5", matchPoints: 30, betPoints: 50 }),
            entrant({ id: "match/gemini", name: "Gemini", matchPoints: 10, betPoints: 30 }),
            entrant({ id: "match/llama", name: "Llama", matchPoints: 90, betPoints: 30 })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");

    // Llama leads outright; gpt-5 and claude-opus-5 are level at 30 and keep
    // the order they arrived in; gemini trails.
    expect(result.matchRanked.map((row) => row.slug))
      .toEqual(["llama", "gpt-5", "claude-opus-5", "gemini"]);
    // Claude Opus 5 leads outright here; gemini and llama are level at 30
    // and keep the order they arrived in; gpt-5 trails -- a genuine tie on
    // this column, not carried over from the match-points sort above.
    expect(result.betRanked.map((row) => row.slug))
      .toEqual(["claude-opus-5", "gemini", "llama", "gpt-5"]);
  });
});

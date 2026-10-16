import { describe, expect, test } from "vitest";
import {
  COMBINED_RANKING_EXHIBITION_CLAUSE,
  COMBINED_RANKING_GUEST_CLAUSE,
  COMBINED_RANKING_QUALIFICATION
} from "../dashboard/src/overall-caveat.js";
import { guestOverallLabel } from "../dashboard/src/exhibition-view.js";
import {
  overallRanking, type CompetitionLeaderboard, type OverallRow
} from "../dashboard/src/overall-view.js";
import {
  EXHIBITION_CAVEAT, TYPESAFE_CAVEAT
} from "../src/exhibition/recall-caveat.js";

/**
 * The combined ranking's arithmetic, with no DOM, no database and no fetch:
 * hand-built `LeaderboardBody` values in, the ranked rows and the state out.
 * Every rule under test renders perfectly while being wrong (spec 0025).
 */

const body = (over: Partial<CompetitionLeaderboard["body"]> = {}) => ({
  season: "2026-27",
  edition: { number: 1, firstGameweek: 1, lastGameweek: null },
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
  role: "entrant" as const,
  baseModel: "anthropic/claude-opus-5",
  guest: null,
  ...over
});

describe("the qualification", () => {
  test("states the raw sum, the Fixture weighting and the Prompt Version confound without the Exhibition clause", () => {
    expect(COMBINED_RANKING_QUALIFICATION).toContain("raw sum");
    expect(COMBINED_RANKING_QUALIFICATION).toContain("weighs more");
    expect(COMBINED_RANKING_QUALIFICATION).toContain("Prompt Version");
    expect(COMBINED_RANKING_QUALIFICATION).not.toContain("fewer Fixtures");
    expect(COMBINED_RANKING_QUALIFICATION).not.toContain("fewer Competitions");
  });

  test("the Exhibition qualification constant carries the fourth clause", () => {
    expect(COMBINED_RANKING_EXHIBITION_CLAUSE).toContain("fewer Fixtures");
    expect(COMBINED_RANKING_EXHIBITION_CLAUSE).toContain("fewer Competitions");
    expect(COMBINED_RANKING_EXHIBITION_CLAUSE).toContain("sum does not correct");
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
    // Active alone must not be enough -- a Competition open with a null
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

  test("covers only the Competitions that are active and scored, in that order",
    () => {
    expect(result.covered).toEqual(["PL", "PD"]);
  });

  test("sums both columns across the covered Competitions, reconciling by hand",
    () => {
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

describe("a row missing from one covered Competition", () => {
  test("still covers the same Competitions as every other row, scoring nought "
    + "where it is absent", () => {
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

describe("a Guest", () => {
  const guest = (id: string, matchPoints: number, betPoints: number) => entrant({
    id, name: "Gemini 4 Argon", matchPoints, betPoints,
    role: "guest", baseModel: "google/gemini-4-argon", guest: { fromGw: 4, gapRate: 0 }
  });
  const roster = (competition: string, prefix: string) => ({
    competition,
    body: body({
      entrants: [
        entrant({ id: `${prefix}/claude-opus-5`, matchPoints: 50, betPoints: 30 }),
        entrant({ id: `${prefix}/gpt-5`, name: "GPT-5", matchPoints: 40, betPoints: 45 })
      ]
    })
  });
  const withGuest = (
    { competition, body: item }: CompetitionLeaderboard, row: ReturnType<typeof guest>
  ): CompetitionLeaderboard => ({ competition, body: { ...item, entrants: [...item.entrants, row] } });

  test("seated in several Competitions is one row summing them, naming those Competitions", () => {
    const result = overallRanking([
      withGuest(roster("PL", "match"), guest("guest/gemini-4-argon", 9, 3)),
      roster("SA", "match-sa"),
      withGuest(roster("PD", "match-pd"), guest("guest-pd/gemini-4-argon", 6, 2))
    ]);
    if (result.kind !== "ranking") throw new Error("expected a ranking");

    expect(result.matchRanked.filter((row) => row.guest !== null)).toEqual([{
      slug: "gemini-4-argon", name: "Gemini 4 Argon", baseModelClass: "frontier",
      role: "guest", baseModel: "google/gemini-4-argon",
      matchPoints: 15, betPoints: 5, exhibition: false, guest: { competitions: ["PL", "PD"] }
    }]);
    expect(guestOverallLabel(["PL", "PD"])).toBe("Guest · PL, PD");
  });

  test("changes no Entrant's total or rank, nor the Fixtures summed", () => {
    const leaderboards = [roster("PL", "match"), roster("PD", "match-pd")];
    const baseline = overallRanking(leaderboards);
    const present = overallRanking([
      // Ahead of one Entrant on Match Points and behind both on Bet Points,
      // under an Entrant's slug so only its own key keeps it out of that row.
      withGuest(leaderboards[0]!, guest("guest/gpt-5", 85, 1)),
      leaderboards[1]!
    ]);
    if (baseline.kind !== "ranking" || present.kind !== "ranking") {
      throw new Error("expected a ranking");
    }

    expect(present.matchRanked.map(({ slug, guest }) => [slug, guest !== null]))
      .toEqual([["claude-opus-5", false], ["gpt-5", true], ["gpt-5", false]]);
    expect(present.matchRanked.filter((row) => row.guest === null)).toEqual(baseline.matchRanked);
    expect(present.betRanked.filter((row) => row.guest === null)).toEqual(baseline.betRanked);
    expect(present.fixtures).toEqual(baseline.fixtures);
    expect(present.totalFixtures).toEqual(baseline.totalFixtures);
  });

  test("is a row apart from an Entrant, and split from an Exhibition Run of the same Base Model", () => {
    // Spec 0029 story 32; the split view (ticket 0119).
    const result = overallRanking([{
      competition: "PL",
      body: body({
        entrants: [
          entrant({ id: "match/gemini-4-argon", matchPoints: 60 }),
          guest("guest/gemini-4-argon", 9, 3)
        ]
      })
    }, {
      competition: "PD",
      body: body({
        exhibitionCaveat: EXHIBITION_CAVEAT,
        entrants: [
          entrant({
            id: "exhibition-pd/gemini-4-argon", matchPoints: 7, baseModel: "google/gemini-4-argon",
            exhibition: { ranAfterGw: 3, firstGw: 1, lastGw: 3 }
          })
        ]
      })
    }], { split: true });
    if (result.kind !== "ranking") throw new Error("expected a ranking");

    expect(result.matchRanked.map((row) => [row.slug, row.exhibition, row.guest, row.matchPoints]))
      .toEqual([
        ["gemini-4-argon", false, null, 60],
        ["gemini-4-argon", false, { competitions: ["PL"] }, 9],
        ["gemini-4-argon", true, null, 7]
      ]);
  });

  test("adds its clause to the qualification, after the Exhibition's when both are ranked", () => {
    const qualification = (leaderboards: CompetitionLeaderboard[]) => {
      const result = overallRanking(leaderboards);
      if (result.kind !== "ranking") throw new Error("expected a ranking");
      return result.qualification;
    };
    const guestOnly = qualification([withGuest(roster("PL", "match"), guest("guest/gemini-4-argon", 9, 3))]);
    const both = qualification([{
      competition: "PL",
      body: body({
        exhibitionCaveat: EXHIBITION_CAVEAT,
        entrants: [
          guest("guest/gemini-4-argon", 9, 3),
          entrant({ id: "exhibition/ox-alpha", exhibition: { ranAfterGw: 3, firstGw: 1, lastGw: 3 } })
        ]
      })
    }]);

    expect(guestOnly).toMatch(/is summed here; /);
    expect(guestOnly).toContain(COMBINED_RANKING_GUEST_CLAUSE);
    expect(guestOnly).not.toContain(COMBINED_RANKING_EXHIBITION_CLAUSE);
    expect(guestOnly.endsWith(`${COMBINED_RANKING_GUEST_CLAUSE} Ranks, does not prove.`)).toBe(true);
    expect(both).toContain(
      `${COMBINED_RANKING_EXHIBITION_CLAUSE} ${COMBINED_RANKING_GUEST_CLAUSE} Ranks, does not prove.`
    );
    expect(qualification([roster("PL", "match")])).not.toContain(COMBINED_RANKING_GUEST_CLAUSE);
  });
});

describe("one Base Model's Exhibition Run and Guest", () => {
  const ARGON = "google/gemini-4-argon";
  const guest = (id: string, matchPoints: number, betPoints: number) => entrant({
    id, name: "Gemini 4 Argon", matchPoints, betPoints,
    role: "guest", baseModel: ARGON, guest: { fromGw: 7, gapRate: 0 }
  });
  const exhibition = (
    id: string, matchPoints: number, betPoints: number, firstGw: number | null = 1
  ) => entrant({
    id, name: "Gemini 4 Argon", matchPoints, betPoints, role: "exhibition", baseModel: ARGON,
    exhibition: { ranAfterGw: 8, firstGw, lastGw: firstGw === null ? null : 6 }
  });
  const board = (competition: string, prefix: string, ...extra: ReturnType<typeof entrant>[]) => ({
    competition,
    body: body({
      exhibitionCaveat: extra.some((row) => row.exhibition !== null) ? EXHIBITION_CAVEAT : null,
      entrants: [
        entrant({ id: `${prefix}/claude-opus-5`, matchPoints: 50, betPoints: 30 }),
        entrant({ id: `${prefix}/gpt-5`, name: "GPT-5", matchPoints: 40, betPoints: 45 }),
        ...extra
      ]
    })
  });
  const leaderboards = (firstGw: number | null = 1) => [
    board("PL", "match", exhibition("exhibition/gemini-4-argon", 60, 8, firstGw),
      guest("guest/gemini-4-argon", 9, 3)),
    board("SA", "match-sa", exhibition("exhibition-sa/gemini-4-argon", 50, 6, firstGw)),
    board("PD", "match-pd", guest("guest-pd/gemini-4-argon", 6, 2))
  ];
  const ranking = (...args: Parameters<typeof overallRanking>) => {
    const result = overallRanking(...args);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    return result;
  };

  test("is one row by default, summing both parts and naming each part's Competitions", () => {
    const result = ranking(leaderboards());
    const argon = result.matchRanked.filter(({ baseModel }) => baseModel === ARGON);

    expect(argon).toEqual([{
      slug: "gemini-4-argon", name: "Gemini 4 Argon", baseModelClass: "frontier",
      role: "guest", baseModel: ARGON, matchPoints: 125, betPoints: 19,
      exhibition: true, guest: { competitions: ["PL", "PD"] },
      parts: { exhibition: ["PL", "SA"], guest: ["PL", "PD"] }
    }]);
    // Ranked by its combined total, 125, which passes GPT-5's 120 where
    // neither part alone does.
    expect(result.matchRanked.map(({ slug }) => slug))
      .toEqual(["claude-opus-5", "gemini-4-argon", "gpt-5"]);
    expect(result.splittable).toBe(true);
    expect(result.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);
    expect(result.qualification).toContain(COMBINED_RANKING_EXHIBITION_CLAUSE);
  });

  test("splits back into the two rows, and the Entrants are identical either way", () => {
    const combined = ranking(leaderboards());
    const split = ranking(leaderboards(), { split: true });

    expect(split.matchRanked.filter(({ baseModel }) => baseModel === ARGON)
      .map(({ exhibition, guest, matchPoints }) => [exhibition, guest, matchPoints]))
      .toEqual([[true, null, 110], [false, { competitions: ["PL", "PD"] }, 15]]);
    expect(split.splittable).toBe(true);
    const roster = (rows: OverallRow[]) => rows.filter(({ role }) => role === "entrant");
    expect(roster(combined.matchRanked)).toEqual(roster(split.matchRanked));
    expect(roster(combined.betRanked)).toEqual(roster(split.betRanked));
  });

  test("with no replayed answer in range, is the Guest's figures with no caveat", () => {
    const result = ranking(leaderboards(null).map(({ competition, body: item }) => ({
      competition,
      body: {
        ...item,
        entrants: item.entrants.map((row) => row.exhibition === null ? row
          : { ...row, matchPoints: 0, betPoints: 0 })
      }
    })));
    const [argon] = result.matchRanked.filter(({ baseModel }) => baseModel === ARGON);

    expect(argon).toMatchObject({
      matchPoints: 15, betPoints: 5, exhibition: false,
      parts: { exhibition: [], guest: ["PL", "PD"] }
    });
    expect(result.exhibitionCaveat).toBeNull();
    expect(result.qualification).not.toContain(COMBINED_RANKING_EXHIBITION_CLAUSE);
  });

  test("never combines a row from a body cached before baseModel existed", () => {
    const stale = leaderboards().map(({ competition, body: item }) => ({
      competition,
      body: {
        ...item,
        entrants: item.entrants.map((row) => ({ ...row, baseModel: undefined }))
      }
    })) as unknown as CompetitionLeaderboard[];
    const result = ranking(stale);
    expect(result.matchRanked).toHaveLength(4);
    expect(result.splittable).toBe(false);
  });

  test("never combines where a body was cached before firstGw existed", () => {
    // Serie A's alone, which holds no Guest: its own page has nothing to pair,
    // and `/overall` still must not count its Exhibition part.
    const stale = leaderboards().map(({ competition, body: item }) => competition !== "SA"
      ? { competition, body: item }
      : {
        competition,
        body: {
          ...item,
          entrants: item.entrants.map((row) => row.exhibition === null ? row
            : { ...row, exhibition: { ranAfterGw: 8 } })
        }
      }) as unknown as CompetitionLeaderboard[];
    expect(ranking(stale).splittable).toBe(false);
  });

  test("never combines where one Competition's parts overlap or a part is doubled", () => {
    const [pl, sa, pd] = leaderboards();
    const overlapping = {
      ...pl!,
      body: {
        ...pl!.body,
        entrants: pl!.body.entrants.map((row) => row.exhibition === null ? row
          : { ...row, exhibition: { ranAfterGw: 8, firstGw: 1, lastGw: 7 } })
      }
    };
    // Doubled under one slug, so the sum holds one row of each part and only
    // the Competition's own pairing rule can see the second.
    const doubled = <T extends CompetitionLeaderboard>(item: T, row: ReturnType<typeof entrant>) =>
      ({ ...item, body: { ...item.body, entrants: [...item.body.entrants, row] } });
    expect(ranking([overlapping, sa!, pd!]).splittable).toBe(false);
    // In a Competition holding both parts, as its own page would refuse; a
    // doubled Guest where no Exhibition row sits pairs nothing there.
    expect(ranking([doubled(pl!, guest("guest/2026-27-v2/gemini-4-argon", 1, 1)), sa!, pd!])
      .splittable).toBe(false);
    expect(ranking([pl!, sa!,
      doubled(pd!, guest("guest-pd/2026-27-v2/gemini-4-argon", 1, 1))]).splittable).toBe(true);
    expect(ranking([pl!,
      doubled(sa!, exhibition("exhibition-sa/2026-27-v2/gemini-4-argon", 1, 1)), pd!])
      .splittable).toBe(false);
  });

  test("is not splittable where nothing combines, and the ranking is as before", () => {
    const plain = [board("PL", "match", guest("guest/gemini-4-argon", 9, 3))];
    expect(ranking(plain).splittable).toBe(false);
    expect(ranking(plain)).toEqual(ranking(plain, { split: true }));
  });
});

describe("a seat that Gapped a whole covered Competition", () => {
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
  test("is summed and ranked like any other row, carrying the flag that labels it, the qualification clause and the caveat", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          exhibitionCaveat: EXHIBITION_CAVEAT,
          entrants: [
            entrant({ id: "match/claude-opus-5", matchPoints: 4, betPoints: 2 }),
            entrant({
              id: "exhibition/ox-alpha", name: "Ox Alpha", matchPoints: 9, betPoints: 1,
              exhibition: { ranAfterGw: 3, firstGw: 1, lastGw: 3 }
            })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.matchRanked.map((row) => [row.slug, row.exhibition]))
      .toEqual([["ox-alpha", true], ["claude-opus-5", false]]);
    expect(result.betRanked.map((row) => [row.slug, row.exhibition]))
      .toEqual([["claude-opus-5", false], ["ox-alpha", true]]);
    expect(result.qualification.endsWith(
      ` ${COMBINED_RANKING_QUALIFICATION.replace(
        "Ranks, does not prove.", `${COMBINED_RANKING_EXHIBITION_CLAUSE} Ranks, does not prove.`
      )}`
    )).toBe(true);
    expect(result.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);
  });

  // ADR-0059: read the same way as exhibitionCaveat, from whichever covered
  // body carries one.
  test("carries the typed-endpoint caveat when a covered body names one, and "
    + "stays null otherwise", () => {
    const withTypesafe: CompetitionLeaderboard[] = [{
      competition: "PL",
      body: body({
        exhibitionCaveat: EXHIBITION_CAVEAT,
        typesafeCaveat: TYPESAFE_CAVEAT,
        entrants: [
          entrant({
            id: "exhibition/jev", name: "Jev", matchPoints: 9, betPoints: 1,
            exhibition: { ranAfterGw: 3, firstGw: 1, lastGw: 3 }
          })
        ]
      })
    }];
    const result = overallRanking(withTypesafe);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.typesafeCaveat).toBe(TYPESAFE_CAVEAT);

    const withoutTypesafe = overallRanking([
      { competition: "PL", body: body() }
    ]);
    if (withoutTypesafe.kind !== "ranking") throw new Error("expected a ranking");
    expect(withoutTypesafe.typesafeCaveat).toBeNull();
  });

  test("preserves every roster row's total and position among Entrants with Exhibition rows present or absent", () => {
    const rosterLeaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          settledFixtures: 20,
          entrants: [
            entrant({ id: "match/claude-opus-5", matchPoints: 50, betPoints: 30 }),
            entrant({ id: "match/gpt-5", name: "GPT-5", matchPoints: 40, betPoints: 45 })
          ]
        })
      },
      {
        competition: "PD",
        body: body({
          settledFixtures: 10,
          entrants: [
            entrant({ id: "match-pd/2026-27-v2/claude-opus-5", matchPoints: 20, betPoints: 10 }),
            entrant({ id: "match-pd/2026-27-v2/gpt-5", name: "GPT-5", matchPoints: 15, betPoints: 5 })
          ]
        })
      }
    ];

    const withExhibitionLeaderboards: CompetitionLeaderboard[] = rosterLeaderboards.map(
      (item) => ({
        ...item,
        body: {
          ...item.body,
          exhibitionCaveat: EXHIBITION_CAVEAT,
          entrants: [
            ...item.body.entrants,
            item.competition === "PL"
              ? entrant({
                  id: "exhibition/ox-alpha", name: "Ox Alpha", matchPoints: 45, betPoints: 40,
                  exhibition: { ranAfterGw: 10, firstGw: 1, lastGw: 10 }
                })
              : entrant({
                  id: "exhibition-pd/ox-alpha", name: "Ox Alpha", matchPoints: 10, betPoints: 20,
                  exhibition: { ranAfterGw: 5, firstGw: 1, lastGw: 5 }
                })
          ]
        }
      })
    );

    const baseline = overallRanking(rosterLeaderboards);
    const withExhibition = overallRanking(withExhibitionLeaderboards);
    if (baseline.kind !== "ranking" || withExhibition.kind !== "ranking") {
      throw new Error("expected ranking");
    }

    const rosterFromWithExhibitionMatch = withExhibition.matchRanked.filter((r) => !r.exhibition);
    const rosterFromWithExhibitionBet = withExhibition.betRanked.filter((r) => !r.exhibition);

    expect(rosterFromWithExhibitionMatch).toEqual(baseline.matchRanked);
    expect(rosterFromWithExhibitionBet).toEqual(baseline.betRanked);
    expect(withExhibition.fixtures).toEqual(baseline.fixtures);
    expect(withExhibition.totalFixtures).toEqual(baseline.totalFixtures);
  });

  test("sums across Competitions under its own key, never into the Entrant of "
    + "the same Base Model", () => {
    // The state section 3 of the runbook puts a candidate in: one Base Model
    // seated as an Entrant in one Competition while a temporary Exhibition row
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
              exhibition: { ranAfterGw: 2, firstGw: 1, lastGw: 2 }
            }),
            entrant({
              id: "exhibition-sa/ox-alpha", name: "Ox Alpha", matchPoints: 1,
              exhibition: { ranAfterGw: 1, firstGw: 1, lastGw: 1 }
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

describe("without an Exhibition Run", () => {
  test("carries baseline qualification without Exhibition clause and null caveat", () => {
    const leaderboards: CompetitionLeaderboard[] = [
      {
        competition: "PL",
        body: body({
          exhibitionCaveat: null,
          entrants: [
            entrant({ id: "match/claude-opus-5", matchPoints: 4, betPoints: 2 }),
            entrant({ id: "match/gpt-5", name: "GPT-5", matchPoints: 8, betPoints: 6 })
          ]
        })
      }
    ];
    const result = overallRanking(leaderboards);
    if (result.kind !== "ranking") throw new Error("expected a ranking");
    expect(result.qualification)
      .toMatch(new RegExp(` ${COMBINED_RANKING_QUALIFICATION.replace(/[.()]/g, "\\$&")}$`));
    expect(result.qualification).not.toContain(COMBINED_RANKING_EXHIBITION_CLAUSE);
    expect(result.exhibitionCaveat).toBeNull();
    expect(result.matchRanked.map((row) => row.slug)).toEqual(["gpt-5", "claude-opus-5"]);
    expect(result.matchRanked.every((row) => !row.exhibition)).toBe(true);
  });
});

describe("ties", () => {
  test("rank as the per-Competition leaderboard ranks them -- each column sorted on its own " +
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

/**
 * ADR-0061: `/overall` sums one Edition set, says which, and leaves the cup
 * out. The page is where the set is checked, because it is where the sum is.
 */
describe("an Edition set", () => {
  test("is named at the head of the qualification, with the cup's absence", () => {
    const result = overallRanking([
      { competition: "PL", body: body({ edition: { number: 2, firstGameweek: 6, lastGameweek: null } }) },
      { competition: "PD", body: body({ edition: { number: 2, firstGameweek: 7, lastGameweek: null } }) },
      { competition: "SA", body: body({ edition: { number: 2, firstGameweek: 6, lastGameweek: null } }) }
    ]);
    if (result.kind !== "ranking") throw new Error("expected a ranking");

    expect(result.qualification).toBe(
      "Edition 2 of PL, PD, and SA is summed here; the Nations League is not in "
      + "it, because its roster is not the leagues' (ADR-0060). "
      + COMBINED_RANKING_QUALIFICATION
    );
  });

  test("is refused, naming the mismatch, when the bodies carry different Editions", () => {
    // Every body and not only the covered ones: an Edition 2 that has scored
    // nothing yet still says the set is not one Edition.
    expect(overallRanking([
      { competition: "PL", body: body({ edition: { number: 2, firstGameweek: 6, lastGameweek: null }, throughGw: null }) },
      { competition: "PD", body: body() }
    ])).toEqual({
      kind: "mixed-editions",
      editions: [{ competition: "PL", number: 2 }, { competition: "PD", number: 1 }]
    });
  });
});

import { describe, expect, test } from "vitest";
import {
  DEMONSTRATION_QUALIFICATION,
  FPL_DEMONSTRATION_METRICS
} from "../src/fpl/demonstration-record.js";
import type { FplRehearsalReport } from "../src/fpl-rehearsal/rehearsal-report.js";
import {
  REHEARSED_GAMEWEEKS,
  SEATS
} from "../src/fpl-rehearsal/rehearsal-seats.js";
import { verifyFplRehearsal } from "../src/fpl-rehearsal/verify-rehearsal.js";

/**
 * A report that agrees with the scenario in every particular, built from the
 * seats' own expectations. Each test then spoils exactly one thing, so what
 * fails is the check under test and never the fixture around it.
 */
function wholeReport(): FplRehearsalReport {
  return {
    season: "2026-27",
    startedAt: REHEARSED_GAMEWEEKS[0]!,
    qualification: DEMONSTRATION_QUALIFICATION,
    incomplete: [],
    entrants: SEATS.map((seat) => ({
      entrantId: `fpl/${seat.suffix}`,
      path: seat.expect.map((want) => ({
        gameweek: want.gameweek,
        rolledOver: want.rolledOver,
        attemptsUsed: want.repairs,
        state: {
          squad: { active: [], free_hit_stash: null },
          teamSheet: null,
          bankTenths: want.bank,
          freeTransfers: want.freeTransfers,
          hits: want.hits,
          chipsUsed: {
            firstHalf: [...want.chipsUsed.firstHalf],
            secondHalf: [...want.chipsUsed.secondHalf]
          },
          chipActive: want.chipActive
        }
      })),
      metrics: seat.expect.flatMap((want, played) => {
        const through = seat.expect.slice(0, played + 1);
        const sum = (of: (each: typeof want) => number): number =>
          through.reduce((total, each) => total + of(each), 0);
        const kindsOver = (
          rows: readonly (typeof want)[]
        ): Record<string, number> => {
          const totals: Record<string, number> = {};
          for (const each of rows) {
            for (const [kind, count] of Object.entries(each.violationKinds)) {
              totals[kind] = (totals[kind] ?? 0) + (count as number);
            }
          }
          return totals;
        };
        const distribution: Record<string, number> = {
          "0": 0, "1": 0, "2": 0, "3": 0, failed: 0
        };
        for (const each of through) {
          const bucket = each.rolledOver ? "failed" : String(each.repairs);
          distribution[bucket] = (distribution[bucket] ?? 0) + 1;
        }
        const qualification = DEMONSTRATION_QUALIFICATION;
        const startingGameweek = REHEARSED_GAMEWEEKS[0]!;
        const { gameweek } = want;
        return [
          {
            gameweek,
            metric: "fpl_points" as const,
            value: want.points,
            detail: { qualification }
          },
          {
            gameweek,
            metric: "fpl_points_season_to_date" as const,
            value: sum((each) => each.points),
            detail: {
              qualification,
              startingGameweek,
              gameweeks: through.map((each) =>
                ({ gw: each.gameweek, points: each.points }))
            }
          },
          {
            gameweek,
            metric: "repairs" as const,
            value: want.repairs,
            detail: null
          },
          {
            gameweek,
            metric: "repairs_season_to_date" as const,
            value: sum((each) => each.repairs) / through.length,
            detail: { distribution, startingGameweek }
          },
          {
            gameweek,
            metric: "roll_over_rate" as const,
            value: want.rolledOver ? 1 : 0,
            detail: null
          },
          {
            gameweek,
            metric: "roll_over_rate_season_to_date" as const,
            value: through.filter((each) => each.rolledOver).length
              / through.length,
            detail: {
              startingGameweek,
              gameweeks: through.filter((each) => each.rolledOver)
                .map((each) => each.gameweek)
            }
          },
          {
            gameweek,
            metric: "violation_profile" as const,
            value: want.violations,
            detail: { kinds: kindsOver([want]) }
          },
          {
            gameweek,
            metric: "violation_profile_season_to_date" as const,
            value: sum((each) => each.violations),
            detail: { kinds: kindsOver(through), startingGameweek }
          }
        ];
      })
    }))
  };
}

/** The entrant every spoiling test reaches for: the one that Rolled Over. */
function rolledOverSeat(report: FplRehearsalReport) {
  return report.entrants.find(
    ({ entrantId }) => entrantId === "fpl/rolled-over"
  )!;
}

describe("verifying a rehearsal", () => {
  test("finds nothing wrong with a report that matches the scenario", () => {
    const verdict = verifyFplRehearsal(wholeReport());

    expect(verdict.shortfalls).toEqual([]);
    expect(verdict.observed).toEqual(verdict.expected);
    expect(verdict.expected.metricRows)
      .toBe(SEATS.length * REHEARSED_GAMEWEEKS.length
        * FPL_DEMONSTRATION_METRICS.length);
  });

  test("catches a Gameweek's own violation kinds being wrong", () => {
    // The one a whole rehearsal can never produce: totals that come right in
    // the end while an earlier Gameweek is filed under the wrong rule.
    const report = wholeReport();
    const entrant = rolledOverSeat(report);
    const own = entrant.metrics.find(({ metric, gameweek }) =>
      metric === "violation_profile" && gameweek === 2)!;
    own.detail = { kinds: { club_limit: 4 } };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/rolled-over GW2 violation_profile kinds: expected "
      + "{\"captain\":4}, found {\"club_limit\":4}"
    ]);
  });

  test("catches a cumulative profile that is right only by the last Gameweek", () => {
    const report = wholeReport();
    const entrant = rolledOverSeat(report);
    const early = entrant.metrics.find(({ metric, gameweek }) =>
      metric === "violation_profile_season_to_date" && gameweek === 2)!;
    early.detail = { kinds: {}, startingGameweek: 1 };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/rolled-over GW2 violation_profile_season_to_date kinds: expected "
      + "{\"captain\":4}, found {}"
    ]);
  });

  test("catches a points trace that is wrong at an earlier Gameweek", () => {
    const report = wholeReport();
    const entrant = rolledOverSeat(report);
    const early = entrant.metrics.find(({ metric, gameweek }) =>
      metric === "fpl_points_season_to_date" && gameweek === 1)!;
    early.detail = {
      qualification: DEMONSTRATION_QUALIFICATION,
      startingGameweek: 1,
      gameweeks: [{ gw: 1, points: 70 }]
    };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/rolled-over GW1 points trace: expected [{\"gw\":1,\"points\":69}], "
      + "found [{\"gw\":1,\"points\":70}]"
    ]);
  });

  test("catches a Manager State value that disagrees with the scenario", () => {
    const report = wholeReport();
    rolledOverSeat(report).path[1]!.state.bankTenths = 14;

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/rolled-over GW2 bank: expected 15, found 14"
    ]);
  });

  test("catches a score row that lost the demonstration qualification", () => {
    const report = wholeReport();
    const entrant = rolledOverSeat(report);
    entrant.metrics.find(({ metric, gameweek }) =>
      metric === "fpl_points" && gameweek === 3)!.detail = {};

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/rolled-over GW3 fpl_points carries no demonstration qualification"
    ]);
  });

  /** The seat whose Wildcard is spent in Gameweek 2 and kept thereafter. */
  function wildcardSeat(report: FplRehearsalReport) {
    return report.entrants.find(
      ({ entrantId }) => entrantId === "fpl/wildcard"
    )!;
  }

  test("catches a Chip recorded a Gameweek before it was played", () => {
    // The final inventory is right either way — one Wildcard spent in the
    // first half — so only a per-Gameweek check can tell them apart.
    const report = wholeReport();
    wildcardSeat(report).path[0]!.state.chipsUsed = {
      firstHalf: ["wildcard"],
      secondHalf: []
    };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/wildcard GW1 Chips used: expected "
      + "{\"firstHalf\":[],\"secondHalf\":[]}, found "
      + "{\"firstHalf\":[\"wildcard\"],\"secondHalf\":[]}"
    ]);
  });

  test("catches a Chip that never reached the inventory", () => {
    const report = wholeReport();
    wildcardSeat(report).path[1]!.state.chipsUsed = {
      firstHalf: [],
      secondHalf: []
    };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/wildcard GW2 Chips used: expected "
      + "{\"firstHalf\":[\"wildcard\"],\"secondHalf\":[]}, found "
      + "{\"firstHalf\":[],\"secondHalf\":[]}"
    ]);
  });

  test("catches a Chip filed under the wrong half of the Season", () => {
    // The half is what makes the first set expire unspent at Gameweek 19, so a
    // Chip in the wrong one is a Chip the Entrant can still spend.
    const report = wholeReport();
    wildcardSeat(report).path[1]!.state.chipsUsed = {
      firstHalf: [],
      secondHalf: ["wildcard"]
    };

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/wildcard GW2 Chips used: expected "
      + "{\"firstHalf\":[\"wildcard\"],\"secondHalf\":[]}, found "
      + "{\"firstHalf\":[],\"secondHalf\":[\"wildcard\"]}"
    ]);
  });

  test("catches a Chip left active into the Gameweek after it", () => {
    // A Chip is in play for one Gameweek. One still active in the next would
    // score that Gameweek under a rule nobody played it by.
    const report = wholeReport();
    wildcardSeat(report).path[2]!.state.chipActive = "wildcard";

    expect(verifyFplRehearsal(report).shortfalls).toEqual([
      "fpl/wildcard GW3 active Chip: expected null, found \"wildcard\""
    ]);
  });

  test("catches expectations that have slid off the Gameweeks being played", () => {
    // Nothing in the type system says the scenario covers the Gameweeks the
    // rehearsal plays, in order — so the verifier says it.
    const report = wholeReport();
    report.entrants[0]!.path = [];
    report.entrants[0]!.metrics = [];

    const { shortfalls } = verifyFplRehearsal(report);
    expect(shortfalls.some((line) =>
      line.includes("GW1 points: expected 69, found undefined"))).toBe(true);
  });

  test("catches a seat that produced no path at all", () => {
    const report = wholeReport();
    report.entrants = report.entrants.filter(
      ({ entrantId }) => entrantId !== "fpl/idle"
    );

    const { shortfalls } = verifyFplRehearsal(report);
    expect(shortfalls).toContain("fpl/idle produced no path at all");
    expect(shortfalls.some((line) => line.startsWith("entrants:"))).toBe(true);
  });
});

import {
  DEMONSTRATION_QUALIFICATION,
  FPL_DEMONSTRATION_METRICS,
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC,
  repairBucket,
  REPAIRS_METRIC,
  REPAIRS_SEASON_TO_DATE_METRIC,
  ROLL_OVER_RATE_METRIC,
  ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
  VIOLATION_PROFILE_METRIC,
  VIOLATION_PROFILE_SEASON_TO_DATE_METRIC
} from "../fpl/demonstration-record.js";
import { emptyRepairDistribution } from "../repairs.js";
import { SEASON_ROSTER_SIZE } from "../season-roster.js";
import type { FplRehearsalReport } from "./rehearsal-report.js";
import {
  OPENING_GAMEWEEK,
  REHEARSED_GAMEWEEKS,
  SEATS
} from "./rehearsal-seats.js";

/** The size of the record a whole rehearsal writes. */
export interface FplRehearsalExpectation {
  entrants: number;
  gameweeks: number;
  metricRows: number;
}

export interface FplRehearsalVerdict {
  expected: FplRehearsalExpectation;
  /** What the run actually produced, counted the same way. */
  observed: FplRehearsalExpectation;
  /** Every way the run fell short of what it said it would do. */
  shortfalls: string[];
}

/**
 * Judges a rehearsal against the scenario it set out to play.
 *
 * Separate from the runner so that it can be driven against a report built by
 * hand: a check that only ever runs at the end of a whole rehearsal cannot be
 * shown to bite, because the one thing a passing rehearsal never produces is
 * the wrong answer.
 */
export function verifyFplRehearsal(
  report: FplRehearsalReport
): FplRehearsalVerdict {
  const playedGameweeks = REHEARSED_GAMEWEEKS.length;
  const expected: FplRehearsalExpectation = {
    entrants: SEASON_ROSTER_SIZE,
    gameweeks: playedGameweeks,
    // Every measure the record is made of, for every Entrant, for every
    // Gameweek that settled.
    metricRows:
      SEASON_ROSTER_SIZE * playedGameweeks * FPL_DEMONSTRATION_METRICS.length
  };
  const observed: FplRehearsalExpectation = {
    entrants: report.entrants.length,
    gameweeks: Math.max(0, ...report.entrants.map(({ path }) => path.length)),
    metricRows: report.entrants.reduce(
      (total, { metrics }) => total + metrics.length,
      0
    )
  };
  return {
    expected,
    observed,
    shortfalls: shortfalls(expected, observed, report)
  };
}

/**
 * What the run said it would produce against what it did.
 *
 * Counting rows is not enough and never was: every point value, Chip effect,
 * Repair, Roll Over and violation could be wrong while the row count stayed
 * exactly right, and the command would exit zero on a record that was entirely
 * false. So each seat's hand-computed Gameweek is checked one at a time — its
 * own values, the Season's through it, and the details beneath both.
 */
function shortfalls(
  expected: FplRehearsalExpectation,
  observed: FplRehearsalExpectation,
  report: FplRehearsalReport
): string[] {
  const found: string[] = [];
  for (const key of ["entrants", "gameweeks", "metricRows"] as const) {
    if (observed[key] !== expected[key]) {
      found.push(`${key}: expected ${expected[key]}, found ${observed[key]}`);
    }
  }

  for (const seat of SEATS) {
    const entrantId = `fpl/${seat.suffix}`;
    const entrant = report.entrants.find((row) => row.entrantId === entrantId);
    if (entrant === undefined) {
      found.push(`${entrantId} produced no path at all`);
      continue;
    }

    // The scenario must cover the Gameweeks the rehearsal plays, and cover
    // them in order. Nothing in the type system says so, and expectations that
    // had slid by one Gameweek would otherwise be checked against the wrong
    // rows without a word.
    const scripted = seat.expect.map(({ gameweek }) => gameweek);
    if (JSON.stringify(scripted) !== JSON.stringify(REHEARSED_GAMEWEEKS)) {
      found.push(
        `${entrantId} is scripted for Gameweeks ${JSON.stringify(scripted)}, `
        + `but the rehearsal plays ${JSON.stringify(REHEARSED_GAMEWEEKS)}`
      );
      continue;
    }

    const say = (measure: string, gameweek: number, want: unknown, got: unknown): void => {
      found.push(
        `${entrantId} GW${gameweek} ${measure}: expected `
        + `${JSON.stringify(want)}, found ${JSON.stringify(got)}`
      );
    };
    const same = (
      measure: string,
      gameweek: number,
      want: unknown,
      got: unknown
    ): void => {
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        say(measure, gameweek, want, got);
      }
    };
    /**
     * A mean and a fraction do not land on whole numbers, and one third is not
     * representable at all. Compared within a tolerance rather than exactly,
     * because the value under test is the rule and not the last bit of a double.
     */
    const nearly = (
      measure: string,
      gameweek: number,
      want: number,
      got: number | undefined
    ): void => {
      if (got === undefined || Math.abs(got - want) > 1e-9) {
        say(measure, gameweek, want, got);
      }
    };

    seat.expect.forEach((want, played) => {
      const { gameweek } = want;
      const through = seat.expect.slice(0, played + 1);
      const state = entrant.path.find((row) => row.gameweek === gameweek);
      const row = (name: string): { value: number; detail: unknown } | undefined =>
        entrant.metrics.find((each) =>
          each.metric === name && each.gameweek === gameweek);
      const value = (name: string): number | undefined => row(name)?.value;
      const detail = (name: string): Record<string, unknown> =>
        (row(name)?.detail ?? {}) as Record<string, unknown>;
      const sum = (of: (each: typeof want) => number): number =>
        through.reduce((total, each) => total + of(each), 0);

      // The Gameweek's own values.
      same("points", gameweek, want.points, value(FPL_POINTS_METRIC));
      same("violations", gameweek, want.violations, value(VIOLATION_PROFILE_METRIC));
      same("repairs", gameweek, want.repairs, value(REPAIRS_METRIC));
      same("roll over rate", gameweek, want.rolledOver ? 1 : 0, value(ROLL_OVER_RATE_METRIC));
      same("rolled over", gameweek, want.rolledOver, state?.rolledOver);
      same("bank", gameweek, want.bank, state?.state.bankTenths);
      same("free transfers", gameweek, want.freeTransfers, state?.state.freeTransfers);
      same("hits", gameweek, want.hits, state?.state.hits);

      // The Chip inventory as this Gameweek left it, and the Chip in play.
      // Checked every Gameweek and on both halves: a Chip recorded a Gameweek
      // early, or filed under the wrong half, or left active into the Gameweek
      // after it, all end the Season with the same final inventory.
      same("active Chip", gameweek, want.chipActive, state?.state.chipActive ?? null);
      same("Chips used", gameweek, {
        firstHalf: [...want.chipsUsed.firstHalf],
        secondHalf: [...want.chipsUsed.secondHalf]
      }, state?.state.chipsUsed);

      // The Season's values through this Gameweek.
      same(
        "cumulative points",
        gameweek,
        sum((each) => each.points),
        value(FPL_POINTS_SEASON_TO_DATE_METRIC)
      );
      same(
        "cumulative violations",
        gameweek,
        sum((each) => each.violations),
        value(VIOLATION_PROFILE_SEASON_TO_DATE_METRIC)
      );
      nearly(
        "cumulative roll over rate",
        gameweek,
        through.filter((each) => each.rolledOver).length / through.length,
        value(ROLL_OVER_RATE_SEASON_TO_DATE_METRIC)
      );
      nearly(
        "cumulative repairs",
        gameweek,
        sum((each) => each.repairs) / through.length,
        value(REPAIRS_SEASON_TO_DATE_METRIC)
      );

      // And the details beneath them. A mean of one Repair per Gameweek is the
      // same number whether an Entrant needed one every week or none for two
      // and then gave up, and those are different Base Models.
      same(
        "points trace",
        gameweek,
        through.map((each) => ({ gw: each.gameweek, points: each.points })),
        detail(FPL_POINTS_SEASON_TO_DATE_METRIC).gameweeks
      );
      const distribution = emptyRepairDistribution();
      for (const each of through) {
        const bucket = repairBucket(each.repairs, each.rolledOver);
        distribution[bucket] = (distribution[bucket] ?? 0) + 1;
      }
      same(
        "Repair distribution",
        gameweek,
        distribution,
        detail(REPAIRS_SEASON_TO_DATE_METRIC).distribution
      );
      same(
        "Roll Over Gameweeks",
        gameweek,
        through.filter((each) => each.rolledOver).map((each) => each.gameweek),
        detail(ROLL_OVER_RATE_SEASON_TO_DATE_METRIC).gameweeks
      );

      // Which rules were broken, not merely how many times. A seat that put the
      // armband on a substitute four times and one that breached the club limit
      // four times share a count and nothing else.
      const broken = (name: string): Record<string, number> => {
        const kinds = (detail(name).kinds ?? {}) as Record<string, number>;
        return Object.fromEntries(
          Object.entries(kinds).filter(([, count]) => count > 0).sort()
        );
      };
      const cumulativeKinds: Record<string, number> = {};
      for (const each of through) {
        for (const [kind, count] of Object.entries(each.violationKinds)) {
          cumulativeKinds[kind] = (cumulativeKinds[kind] ?? 0) + (count as number);
        }
      }
      same(
        `${VIOLATION_PROFILE_METRIC} kinds`,
        gameweek,
        want.violationKinds,
        broken(VIOLATION_PROFILE_METRIC)
      );
      same(
        `${VIOLATION_PROFILE_SEASON_TO_DATE_METRIC} kinds`,
        gameweek,
        Object.fromEntries(Object.entries(cumulativeKinds).sort()),
        broken(VIOLATION_PROFILE_SEASON_TO_DATE_METRIC)
      );

      // Every cumulative row says which Gameweek the Season path began at, so
      // a reader can tell a short path from a late start.
      for (const metric of [
        FPL_POINTS_SEASON_TO_DATE_METRIC,
        REPAIRS_SEASON_TO_DATE_METRIC,
        ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
        VIOLATION_PROFILE_SEASON_TO_DATE_METRIC
      ]) {
        same(
          `${metric} startingGameweek`,
          gameweek,
          OPENING_GAMEWEEK,
          detail(metric).startingGameweek
        );
      }

      // The qualification travels with every value a ranking could be read
      // off, rather than being added at publication.
      for (const metric of [
        FPL_POINTS_METRIC,
        FPL_POINTS_SEASON_TO_DATE_METRIC
      ]) {
        if (detail(metric).qualification !== DEMONSTRATION_QUALIFICATION) {
          found.push(
            `${entrantId} GW${gameweek} ${metric} carries no demonstration `
            + "qualification"
          );
        }
      }
    });
  }

  return [...found, ...report.incomplete];
}

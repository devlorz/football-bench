import { describe, expect, test } from "vitest";
import {
  ACCURACY_METRIC,
  ACCURACY_SEASON_TO_DATE_METRIC,
  ATTEMPTS_TO_VALID_METRIC,
  ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC,
  BRIER_METRIC,
  BRIER_SEASON_TO_DATE_METRIC,
  COHERENCE_METRIC,
  COHERENCE_SEASON_TO_DATE_METRIC,
  GAP_RATE_METRIC,
  GAP_RATE_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_METRIC,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  OUTCOME_PCT_METRIC,
  OUTCOME_PCT_SEASON_TO_DATE_METRIC,
  REFERENCE_ELO,
  REFERENCE_HOME,
  REFERENCE_UNIFORM,
  RPS_METRIC,
  RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
  RPS_SEASON_TO_DATE_METRIC,
  SCORE_PCT_METRIC,
  SCORE_PCT_SEASON_TO_DATE_METRIC
} from "../src/predictions/score-match-gameweek.js";
import { rehearsalExitCode } from "../src/rehearsal.js";
import {
  verifyScoringRehearsal,
  type RehearsedMetric,
  type ScoringRehearsalReport
} from "../src/dry-run/verify-scoring-rehearsal.js";

const ENTRANTS = ["one", "two", "three"];

/**
 * Every measure the Match track record is made of, written out here rather
 * than read from the module under test: a completeness check that agreed with
 * whatever list the implementation happened to hold would never disagree with
 * it.
 */
const ENTRANT_METRICS = [
  MATCH_POINTS_METRIC, MATCH_POINTS_SEASON_TO_DATE_METRIC,
  SCORE_PCT_METRIC, SCORE_PCT_SEASON_TO_DATE_METRIC,
  OUTCOME_PCT_METRIC, OUTCOME_PCT_SEASON_TO_DATE_METRIC,
  RPS_METRIC, RPS_SEASON_TO_DATE_METRIC,
  BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC,
  ACCURACY_METRIC, ACCURACY_SEASON_TO_DATE_METRIC,
  COHERENCE_METRIC, COHERENCE_SEASON_TO_DATE_METRIC,
  GAP_RATE_METRIC, GAP_RATE_SEASON_TO_DATE_METRIC,
  ATTEMPTS_TO_VALID_METRIC, ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC
];

/** A Reference Line answers on the probability layer and nowhere else. */
const REFERENCE_METRICS = [
  RPS_METRIC, RPS_SEASON_TO_DATE_METRIC,
  BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC,
  ACCURACY_METRIC, ACCURACY_SEASON_TO_DATE_METRIC
];

function metric(entrantId: string, name: string): RehearsedMetric {
  return { entrantId, gw: 1, metric: name, value: 1, n: 1, detail: null };
}

/**
 * A whole rehearsal, as the run that produced everything it promised would
 * report it: three Entrants scored on every measure, two comparisons against
 * the third, and all three Reference Lines on the probability layer.
 */
function completeReport(): ScoringRehearsalReport {
  return {
    settled: 10,
    entrants: [...ENTRANTS],
    metrics: [
      ...ENTRANTS.flatMap(
        (id) => ENTRANT_METRICS.map((name) => metric(id, name))
      ),
      ...ENTRANTS.slice(1).map(
        (id) => metric(id, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC)
      ),
      ...[REFERENCE_HOME, REFERENCE_UNIFORM, REFERENCE_ELO].flatMap(
        (id) => REFERENCE_METRICS.map((name) => metric(id, name))
      )
    ]
  };
}

describe("judging a scoring rehearsal", () => {
  test("finds no shortfall in a run that produced the whole record", () => {
    expect(verifyScoringRehearsal(completeReport()).shortfalls).toEqual([]);
  });

  test("names the Reference Line a run left out", () => {
    const report = completeReport();
    report.metrics = report.metrics.filter(
      ({ entrantId }) => entrantId !== REFERENCE_ELO
    );

    expect(verifyScoringRehearsal(report).shortfalls)
      .toEqual([`${REFERENCE_ELO} is missing ${REFERENCE_METRICS.join(", ")}`]);
  });

  test("names a whole measure the run never wrote for anyone", () => {
    // The failure a row count cannot see: every Entrant is present, every
    // comparison is published, and Coherence was silently never computed.
    const report = completeReport();
    report.metrics = report.metrics.filter(
      ({ metric: name }) => name !== COHERENCE_METRIC
    );

    expect(verifyScoringRehearsal(report).shortfalls).toEqual(
      ENTRANTS.map((id) => `${id} is missing ${COHERENCE_METRIC}`)
    );
  });

  test("names a measure one Reference Line alone is missing", () => {
    const report = completeReport();
    report.metrics = report.metrics.filter(
      ({ entrantId, metric: name }) =>
        !(entrantId === REFERENCE_HOME && name === BRIER_METRIC)
    );

    expect(verifyScoringRehearsal(report).shortfalls)
      .toEqual([`${REFERENCE_HOME} is missing ${BRIER_METRIC}`]);
  });

  test("names an Entrant that was scored on nothing", () => {
    const report = completeReport();
    report.metrics = report.metrics.filter(
      ({ entrantId }) => entrantId !== "two"
    );

    expect(verifyScoringRehearsal(report).shortfalls).toEqual([
      `two is missing ${ENTRANT_METRICS.join(", ")}`,
      "2 comparisons expected, 1 published"
    ]);
  });

  test("exits non-zero on any shortfall, and zero on none", () => {
    expect(rehearsalExitCode({ shortfalls: [] })).toBe(0);
    expect(rehearsalExitCode({ shortfalls: ["two is missing rps"] })).toBe(1);
  });

  test("counts a Fixture the script failed to settle", () => {
    expect(verifyScoringRehearsal({ ...completeReport(), settled: 9 })
      .shortfalls)
      .toEqual(["10 Fixtures expected to settle, 9 settled"]);
  });
});

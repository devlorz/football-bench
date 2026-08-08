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
  REFERENCE_LINE_IDS,
  RPS_METRIC,
  RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
  RPS_SEASON_TO_DATE_METRIC,
  SCORE_PCT_METRIC,
  SCORE_PCT_SEASON_TO_DATE_METRIC
} from "../predictions/score-match-gameweek.js";
import { REHEARSED_RESULTS } from "./rehearsed-results.js";


/**
 * Every measure a complete run writes for an Entrant: the readable layer, the
 * evidential one, and the behavioural one, each per Gameweek and cumulatively.
 *
 * The rehearsal's Entrants all answered a Fixture that settled, so there is no
 * Entrant here for which any of these is legitimately absent — which is what
 * lets a missing one be read as a failure rather than as a quiet Gameweek.
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

/**
 * What a Reference Line is scored on. No Predicted Score, so no Match Points,
 * Score % or Outcome %; nothing was asked of it, so no Gap rate or Repairs; and
 * Coherence compares a probability with a scoreline it does not have.
 */
const REFERENCE_METRICS = [
  RPS_METRIC, RPS_SEASON_TO_DATE_METRIC,
  BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC,
  ACCURACY_METRIC, ACCURACY_SEASON_TO_DATE_METRIC
];

/** One `scores` row, as a reviewer reads it. */
export interface RehearsedMetric {
  entrantId: string;
  gw: number;
  metric: string;
  value: number;
  n: number | null;
  /** The per-Fixture evidence, carried so a surprising total can be read. */
  detail: unknown;
}

export interface ScoringRehearsalReport {
  /** Fixtures the script settled, so a missing one cannot pass unnoticed. */
  settled: number;
  /** The Match roster the run was expected to score, as `models` holds it. */
  entrants: string[];
  metrics: RehearsedMetric[];
}

export interface ScoringRehearsalVerdict {
  /** Every way the run fell short of the record it set out to write. */
  shortfalls: string[];
}

/**
 * Judges a rehearsal against the record a complete run writes: every Entrant
 * scored, every Reference Line on the probability layer, one comparison for
 * every Entrant that is not the Comparison Anchor, and every scripted Fixture
 * settled.
 *
 * Separate from the runner so it can be driven against a report built by hand.
 * A check that only ever runs at the end of a whole rehearsal cannot be shown
 * to bite, because the one thing a passing rehearsal never produces is the
 * wrong answer.
 */
export function verifyScoringRehearsal(
  report: ScoringRehearsalReport
): ScoringRehearsalVerdict {
  const written = new Set(
    report.metrics.map(({ entrantId, metric }) => `${entrantId} ${metric}`)
  );
  const missing = (id: string, expected: string[]): string[] => {
    const absent = expected.filter((metric) => !written.has(`${id} ${metric}`));
    return absent.length === 0 ? [] : [`${id} is missing ${absent.join(", ")}`];
  };
  const shortfalls: string[] = [];

  if (report.settled !== REHEARSED_RESULTS.size) {
    shortfalls.push(
      `${REHEARSED_RESULTS.size} Fixtures expected to settle, `
      + `${report.settled} settled`
    );
  }
  // Measure by measure rather than a row apiece: an Entrant that holds Match
  // Points and nothing else is a run that produced a leaderboard with no
  // evidence under it, and a count of rows per Entrant cannot tell the two
  // apart.
  for (const entrantId of report.entrants) {
    shortfalls.push(...missing(entrantId, ENTRANT_METRICS));
  }
  for (const line of REFERENCE_LINE_IDS) {
    shortfalls.push(...missing(line, REFERENCE_METRICS));
  }

  // One per Entrant that is not the Anchor — the Anchor compares against
  // nothing, and an empty complete case would publish none at all.
  const expectedComparisons = Math.max(0, report.entrants.length - 1);
  const published = report.metrics.filter(
    ({ metric }) => metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
  ).length;
  if (published !== expectedComparisons) {
    shortfalls.push(
      `${expectedComparisons} comparisons expected, ${published} published`
    );
  }
  return { shortfalls };
}

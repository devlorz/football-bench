/**
 * What `fixtures.result` holds once the feed declares a Fixture settled: the
 * goals each side scored and the outcome derived from them at write time.
 *
 * The shape lives here rather than in the fetch that writes it, because the
 * scorer reads it and neither track owns the other. Deriving the outcome once
 * and storing it means every metric reads one shape (spec 0002).
 */
export interface FixtureResult {
  home_goals: number;
  away_goals: number;
  outcome: Outcome;
}

/** Home, Draw or Away, in the canonical order every ordered metric uses. */
export const OUTCOMES = ["H", "D", "A"] as const;

export type Outcome = (typeof OUTCOMES)[number];

export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  return homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D";
}

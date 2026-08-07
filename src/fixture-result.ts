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

/** What one Prediction says about a Fixture: a probability per Outcome. */
export type Probs = Record<Outcome, number>;

/**
 * The Outcome a distribution calls most likely, ties broken by canonical `H`,
 * `D`, `A` order (spec 0002).
 *
 * The rule is arbitrary and pinned: `0.40 / 0.40 / 0.20` is Home everywhere,
 * rather than whichever maximum a database or runtime iteration order happened
 * to reach first.
 */
export function argmaxOutcome(probs: Probs): Outcome {
  return OUTCOMES.reduce(
    (best, outcome) => probs[outcome] > probs[best] ? outcome : best
  );
}

export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  return homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D";
}

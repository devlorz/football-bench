/**
 * The deadline no league publishes.
 *
 * The FPL API hands the Premier League a deadline outright. football-data.org
 * gives a schedule and nothing else, because outside England the deadline was
 * never a football concept — so for every other Competition it is ours to
 * derive: the Gameweek's earliest kickoff minus ninety minutes, recomputed at
 * every fetch until a Lock is observed at it, frozen from then (ADR-0036).
 *
 * Pure on purpose. The Lock is the commitment the whole benchmark rests on,
 * and this is the only place its timing is decided, so it is decidable without
 * a schedule, a clock or a database.
 */

/** The margin between the derived deadline and the Gameweek's first kickoff. */
export const DERIVED_DEADLINE_LEAD_MS = 90 * 60 * 1000;

export interface DerivedDeadline {
  /** The deadline in force after this fetch — frozen once Locked. */
  deadlineAt: Date;
  /** Whether the Lock has been observed at it as of `observedAt`. */
  locked: boolean;
  /**
   * The kickoff that broke the margin, or `null` when none did. A non-null
   * value is the loud alert of ADR-0036: a Prediction must always precede
   * kick-off, and the caller raises rather than absorbing it.
   */
  breachedBy: Date | null;
}

/**
 * @param kickoffs every scheduled kickoff this fetch observed for the Gameweek
 * @param storedDeadline the deadline already on the record, or `null` for a
 *   Gameweek the record has never seen
 */
export function deriveDeadline(
  kickoffs: readonly Date[],
  storedDeadline: Date | null,
  observedAt: Date
): DerivedDeadline {
  const earliestTime = Math.min(...kickoffs.map((kickoff) => kickoff.getTime()));
  if (kickoffs.length === 0 || !Number.isFinite(earliestTime)) {
    throw new Error("a derived deadline needs at least one scheduled kickoff");
  }
  const earliest = new Date(earliestTime);
  const derived = new Date(earliestTime - DERIVED_DEADLINE_LEAD_MS);

  // A Gameweek the record has never seen has no deadline to have moved, so
  // nothing here can be a breach. This is also what lets a Competition be
  // adopted mid-Season: its played Gameweeks arrive already Locked, which is
  // what they are, instead of one alert each for a margin nobody was relying
  // on at the time.
  if (storedDeadline === null) {
    return {
      deadlineAt: derived,
      locked: observedAt.getTime() >= derived.getTime(),
      breachedBy: null
    };
  }

  if (observedAt.getTime() >= storedDeadline.getTime()) {
    // Locked, so the deadline is a stored fact rather than a recomputation
    // (ADR-0015). A kickoff that has since moved inside it is the one thing
    // that cannot be absorbed: the Entrants committed at a moment that is no
    // longer before kick-off.
    return {
      deadlineAt: storedDeadline,
      locked: true,
      breachedBy: earliestTime < storedDeadline.getTime() ? earliest : null
    };
  }

  // Still open, so the deadline follows the schedule. A recomputation that
  // lands at or before this instant would Lock the Gameweek retroactively —
  // the Entrants would have had no window at all — and is alerted rather than
  // written.
  //
  // `<=`, matching the `>=` the Lock is observed with above. The two
  // comparisons meet at `derived === observedAt`, and a strict `<` here left
  // that instant belonging to neither: no alert, and a deadline written equal
  // to the moment it was written, which is a zero-second window recorded as a
  // normal one.
  return {
    deadlineAt: derived,
    locked: false,
    breachedBy: derived.getTime() <= observedAt.getTime() ? earliest : null
  };
}

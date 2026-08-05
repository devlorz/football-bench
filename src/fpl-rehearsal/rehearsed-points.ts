export interface RehearsedPointsOptions {
  /** The archived bootstrap body, which names every player a Gameweek has. */
  archived: string;
  /**
   * What each named player came to, by player id. Everybody else is left out
   * of the matchday squad: no minutes and no points.
   */
  scored: Readonly<Record<number, { minutes: number; totalPoints: number }>>;
}

interface BootstrapElements {
  elements: { id: number }[];
}

/**
 * One Gameweek's live points, as FPL would have served them once the Gameweek
 * settled.
 *
 * Every player the archive holds appears, because a Squad the rehearsal never
 * scripted points for is not a Squad that scored nothing — the scorer refuses a
 * Gameweek it cannot account for wholly, and a body listing only the interesting
 * players would look like a Gameweek that had not settled.
 */
export function rehearsedPoints({
  archived,
  scored
}: RehearsedPointsOptions): string {
  const { elements } = JSON.parse(archived) as BootstrapElements;
  const known = new Set(elements.map(({ id }) => id));
  const unknown = Object.keys(scored)
    .map(Number)
    .filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `The archive holds no player ${unknown.join(", ")} to score`
    );
  }
  return JSON.stringify({
    elements: elements.map(({ id }) => ({
      id,
      stats: {
        minutes: scored[id]?.minutes ?? 0,
        total_points: scored[id]?.totalPoints ?? 0
      }
    }))
  });
}

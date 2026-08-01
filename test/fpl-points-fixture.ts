import type { PlayerGameweekPoints } from "../src/fpl/score-team-sheet.js";

/**
 * One Settled Gameweek's per-player points over the Squad in
 * `fpl-pool-fixture.ts`. They live in their own module for the same reason the
 * actions do: the Gameweek the store scores must be the Gameweek the scoring
 * rules were proved against, so neither suite can drift onto a scenario the
 * other has never seen.
 *
 * Every player of the fixture Squad played, and the four on the bench outscore
 * the eleven who started — so a rule that quietly counted them would show.
 */
export const EVERYONE_PLAYED: PlayerGameweekPoints[] = [
  { fplId: 1, minutes: 90, totalPoints: 6 },
  { fplId: 3, minutes: 90, totalPoints: 2 },
  { fplId: 4, minutes: 90, totalPoints: 5 },
  { fplId: 5, minutes: 90, totalPoints: 1 },
  { fplId: 6, minutes: 90, totalPoints: 2 },
  { fplId: 8, minutes: 90, totalPoints: 9 },
  { fplId: 9, minutes: 90, totalPoints: 3 },
  { fplId: 10, minutes: 90, totalPoints: 7 },
  { fplId: 11, minutes: 90, totalPoints: 2 },
  { fplId: 13, minutes: 90, totalPoints: 4 },
  { fplId: 14, minutes: 90, totalPoints: 8 },
  { fplId: 2, minutes: 90, totalPoints: 10 },
  { fplId: 7, minutes: 90, totalPoints: 9 },
  { fplId: 12, minutes: 90, totalPoints: 11 },
  { fplId: 15, minutes: 90, totalPoints: 12 }
];

/** The same Gameweek with the named players left out of the matchday squads. */
export function absent(fplIds: readonly number[]): PlayerGameweekPoints[] {
  return EVERYONE_PLAYED.map((player) => fplIds.includes(player.fplId)
    ? { ...player, minutes: 0, totalPoints: 0 }
    : player);
}

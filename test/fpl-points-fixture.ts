import type { Client } from "pg";
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

/**
 * The Gameweek a Free Hit's temporary Squad plays: Timber, Enzo and Wilson are
 * away and White, Caicedo and Evanilson are in their places. The three who
 * arrive outscore the three they replace by a wide margin, so a Gameweek
 * scored from the permanent Squad instead would land nowhere near this one.
 */
export const FREE_HIT_GAMEWEEK: PlayerGameweekPoints[] = [
  ...EVERYONE_PLAYED.filter(({ fplId }) => ![4, 9, 15].includes(fplId)),
  { fplId: 17, minutes: 90, totalPoints: 12 },
  { fplId: 18, minutes: 90, totalPoints: 14 },
  { fplId: 19, minutes: 90, totalPoints: 15 }
];

/** The same Gameweek with the named players left out of the matchday squads. */
export function absent(fplIds: readonly number[]): PlayerGameweekPoints[] {
  return EVERYONE_PLAYED.map((player) => fplIds.includes(player.fplId)
    ? { ...player, minutes: 0, totalPoints: 0 }
    : player);
}

/**
 * Every stat column migration 0015 requires, as a player who did nothing.
 * The stored counterpart of `NO_LIVE_STATS`: this one is a database row, so
 * the expected-goals family is numeric rather than the source's strings.
 */
export const NO_PERFORMANCE = {
  minutes: 0,
  total_points: 0,
  goals_scored: 0,
  assists: 0,
  clean_sheets: 0,
  bonus: 0,
  yellow_cards: 0,
  red_cards: 0,
  saves: 0,
  expected_goals: 0,
  expected_assists: 0,
  expected_goals_conceded: 0
};

export type PlayerPointsStat = keyof typeof NO_PERFORMANCE;

export interface StorePlayerPointsRow extends Partial<Record<PlayerPointsStat, number>> {
  season?: string;
  gameweek: number;
  fplId: number;
}

/**
 * Stores one row, defaulting every stat the caller has no opinion about. The
 * column list is `NO_PERFORMANCE`'s own keys, so a suite naming one stat does
 * not have to restate the other eleven.
 */
export async function storePlayerPoints(
  database: Pick<Client, "query">,
  { season = "2026-27", gameweek, fplId, ...overrides }: StorePlayerPointsRow
): Promise<void> {
  const stats: Record<string, number> = { ...NO_PERFORMANCE, ...overrides };
  const columns = Object.keys(stats);
  await database.query(
    `insert into fpl_player_points (season, gw, fpl_id, ${columns.join(", ")})
     values (
       $1, $2, $3,
       ${columns.map((_, index) => `$${index + 4}`).join(", ")}
     )`,
    [season, gameweek, fplId, ...Object.values(stats)]
  );
}

/**
 * Stores a Settled Gameweek's rows for a suite whose subject is what scoring
 * does with minutes and points. Migration 0015 widened the table with the raw
 * event stats the context windows read; a scoring suite has no opinion on
 * them, so they stay zero. A suite that *is* about the stat set names it.
 */
export async function storeSettledPoints(
  database: Pick<Client, "query">,
  gameweek: number,
  points: readonly PlayerGameweekPoints[],
  season = "2026-27"
): Promise<void> {
  for (const player of points) {
    await storePlayerPoints(database, {
      season,
      gameweek,
      fplId: player.fplId,
      minutes: player.minutes,
      total_points: player.totalPoints
    });
  }
}

import type { Client } from "pg";
import type { Position, TeamSheet } from "./apply-gameweek-action.js";
import {
  scoreTeamSheet,
  type PlayerGameweekPoints,
  type PlayerPosition
} from "./score-team-sheet.js";

type Database = Pick<Client, "query">;

export interface ScoreFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
}

/** The metric one Gameweek's FPL points are stored under. */
export const FPL_POINTS_METRIC = "fpl_points";

interface ManagerStateRow {
  model_id: string;
  team_sheet: TeamSheet;
  hits: number;
}

/**
 * Scores every Entrant's stored Team Sheet for one Gameweek and records the
 * result. Reads stored Manager States and stored player points and nothing
 * else: no network call, no clock, and no re-derivation of a decision already
 * made.
 *
 * A Gameweek with no stored player points has not settled — absence of rows is
 * that record (migration 0011) — and scoring it writes nothing at all, so an
 * unsettled Gameweek can never be read as a Gameweek in which everybody scored
 * zero.
 */
export async function scoreFplGameweek({
  database,
  season,
  gameweek
}: ScoreFplGameweekOptions): Promise<void> {
  const settled = await database.query<{
    fpl_id: number;
    minutes: number;
    total_points: number;
  }>(
    `select fpl_id, minutes, total_points
       from fpl_player_points
      where season = $1 and gw = $2`,
    [season, gameweek]
  );
  if (settled.rows.length === 0) {
    return;
  }
  const points: PlayerGameweekPoints[] = settled.rows.map((row) => ({
    fplId: row.fpl_id,
    minutes: row.minutes,
    totalPoints: row.total_points
  }));

  const settledIds = new Set(points.map(({ fplId }) => fplId));

  // Positions come from the Season rather than from this Gameweek's locked
  // pool: scoring prices nobody, and a Gameweek whose pre-Lock snapshot was
  // missed still has to be scoreable. Reading across Gameweeks is only sound
  // while the Season agrees on a player's position, so the query proves that
  // rather than picking a snapshot and hoping.
  const listed = await database.query<{ fpl_id: number; positions: Position[] }>(
    `select fpl_id, array_agg(distinct position) as positions
       from fpl_players
      where season = $1
      group by fpl_id`,
    [season]
  );
  const positionOf = new Map(
    listed.rows.map((row) => [row.fpl_id, row.positions])
  );

  const states = await database.query<ManagerStateRow>(
    `select model_id, team_sheet, hits
       from manager_states
      where season = $1 and gw = $2
      order by model_id`,
    [season, gameweek]
  );

  // Every rule below is about what a Team Sheet needs to be scored at all, and
  // all of them are checked before a single row is written: a Gameweek that
  // cannot be scored for one Entrant must not be half-scored for the others.
  for (const state of states.rows) {
    const named = [
      ...state.team_sheet.starters,
      ...state.team_sheet.bench
    ];
    for (const fplId of named) {
      if (!settledIds.has(fplId)) {
        throw new Error(
          `the Gameweek has no settled points for player ${fplId}, `
          + "so it is not wholly settled and cannot be scored"
        );
      }
      const held = positionOf.get(fplId) ?? [];
      if (held.length === 0) {
        throw new Error(
          `the Season records no position for player ${fplId}, `
          + "so the substitution rules cannot judge his Team Sheet"
        );
      }
      if (held.length > 1) {
        throw new Error(
          `the Season records player ${fplId} as ${held.join(" and ")}, `
          + "so his position cannot be read across Gameweeks"
        );
      }
    }
  }

  const positions: PlayerPosition[] = [...positionOf].flatMap(
    ([fplId, held]) => held.length === 1 && held[0] !== undefined
      ? [{ fplId, position: held[0] }]
      : []
  );

  for (const state of states.rows) {
    const scored = scoreTeamSheet({
      teamSheet: state.team_sheet,
      positions,
      points,
      hits: state.hits
    });

    // Re-running must leave the row as it was, so the same inputs upsert to
    // the same value and detail rather than inserting a second row or moving
    // the one already there.
    await database.query(
      `insert into scores (model_id, season, gw, track, metric, value, detail)
       values ($1, $2, $3, 'fpl', $4, $5, $6)
       on conflict (model_id, season, gw, track, metric)
       do update set value = excluded.value, detail = excluded.detail`,
      [
        state.model_id,
        season,
        gameweek,
        FPL_POINTS_METRIC,
        scored.points,
        JSON.stringify(scored.detail)
      ]
    );
  }
}

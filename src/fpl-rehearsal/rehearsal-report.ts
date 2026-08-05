import type { Client } from "pg";
import type { ManagerState } from "../fpl/apply-gameweek-action.js";
import {
  DEMONSTRATION_QUALIFICATION,
  type FplDemonstrationMetric
} from "../fpl/demonstration-record.js";
import {
  managerStateFromRow,
  MANAGER_STATE_COLUMNS,
  type ManagerStateRow
} from "../fpl/manager-state-store.js";

type Database = Pick<Client, "query">;

/**
 * One Gameweek of an Entrant's path, as the whole Manager State it stored.
 *
 * The Squad, Team Sheet, bank, Free Transfers, Hits and Chip sets are carried
 * rather than summarised, because a rehearsal that repeated identically in its
 * Gameweek numbers and its Roll Over flags while quietly buying a different
 * Squad would be a rehearsal nobody could rely on — and those columns are
 * exactly what the next Gameweek is computed from.
 */
export interface RehearsedGameweek {
  gameweek: number;
  rolledOver: boolean;
  attemptsUsed: number;
  /** The whole state, as the domain value the next Gameweek is computed from. */
  state: ManagerState;
}

export interface RehearsedMetric {
  gameweek: number;
  metric: FplDemonstrationMetric;
  value: number;
  detail: unknown;
}

export interface RehearsedEntrant {
  entrantId: string;
  /** Every Gameweek this Entrant holds a Manager State for, in order. */
  path: RehearsedGameweek[];
  /** Every measure the demonstration record is made of, for every Gameweek. */
  metrics: RehearsedMetric[];
}

export interface FplRehearsalReport {
  season: string;
  /** The Gameweek the track opened at, or null if it never did. */
  startedAt: number | null;
  /** The sentence that says what a ranking of these nine paths is worth. */
  qualification: string;
  entrants: RehearsedEntrant[];
  /**
   * What is wrong with the rehearsal, one sentence apiece. Empty is a whole
   * rehearsal; anything here is what the command exits non-zero for.
   */
  incomplete: string[];
}

/**
 * Reads back what a rehearsal came to, from the rows it wrote.
 *
 * Read rather than accumulated as the run goes, because the point of a
 * rehearsal is that the record survives in Postgres — a report assembled from
 * what the orchestrator remembered doing would pass whether or not any of it
 * persisted, which is the one thing this is meant to prove.
 */
export async function readFplRehearsalReport({
  database,
  season
}: {
  database: Database;
  season: string;
}): Promise<FplRehearsalReport> {
  const states = await database.query<ManagerStateRow & {
    model_id: string;
    gw: number;
    rolled_over: boolean;
    attempts_used: number;
  }>(
    `select model_id, gw, rolled_over, attempts_used, ${MANAGER_STATE_COLUMNS}
       from manager_states
      where season = $1
      order by model_id, gw`,
    [season]
  );
  const scores = await database.query<{
    model_id: string;
    gw: number;
    metric: FplDemonstrationMetric;
    value: string;
    detail: unknown;
  }>(
    `select model_id, gw, metric, value, detail
       from scores
      where season = $1 and track = 'fpl'
      order by model_id, gw, metric`,
    [season]
  );

  const entrantIds = [
    ...new Set(states.rows.map(({ model_id: entrantId }) => entrantId))
  ].sort();
  const entrants = entrantIds.map((entrantId) => ({
    entrantId,
    path: states.rows
      .filter((row) => row.model_id === entrantId)
      .map((row) => ({
        gameweek: row.gw,
        rolledOver: row.rolled_over,
        attemptsUsed: row.attempts_used,
        state: managerStateFromRow(row)
      })),
    metrics: scores.rows
      .filter((row) => row.model_id === entrantId)
      .map(({ gw, metric, value, detail }) => ({
        gameweek: gw,
        metric,
        value: Number(value),
        detail
      }))
  }));

  const startedAt = states.rows.length === 0
    ? null
    : Math.min(...states.rows.map(({ gw }) => gw));

  return {
    season,
    startedAt,
    qualification: DEMONSTRATION_QUALIFICATION,
    entrants,
    incomplete: incompletePaths(entrants, startedAt)
  };
}

/**
 * What a reader would be wrong to take at face value. A path shorter than the
 * longest is a Gameweek an Entrant produced nothing for, which ADR-0011
 * removes the Gameweek from the record for — so the rehearsal must say so
 * rather than print nine rankings of unequal length.
 */
function incompletePaths(
  entrants: RehearsedEntrant[],
  startedAt: number | null
): string[] {
  if (startedAt === null) {
    return ["The FPL track never opened, so there is no path to rehearse"];
  }
  const longest = Math.max(...entrants.map(({ path }) => path.length));
  return entrants
    .filter(({ path }) => path.length < longest)
    .map(({ entrantId, path }) =>
      `${entrantId} holds ${path.length} of ${longest} Gameweeks`);
}

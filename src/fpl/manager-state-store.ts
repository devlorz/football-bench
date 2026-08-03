import type { Client } from "pg";
import type {
  ChipsUsed,
  Chip,
  ManagerState,
  SquadEnvelope,
  TeamSheet
} from "./apply-gameweek-action.js";

type Database = Pick<Client, "query">;

export interface ManagerStateKey {
  entrantId: string;
  season: string;
  gameweek: number;
}

export interface StoredManagerState extends ManagerStateKey {
  state: ManagerState;
  attemptsUsed: number;
  rolledOver?: boolean;
  predictedAt: Date;
}

interface ManagerStateRow {
  squad: SquadEnvelope;
  team_sheet: TeamSheet;
  bank: number;
  free_transfers: number;
  hits: number;
  chips_used: ChipsUsed;
  chip_active: Chip | null;
}

/**
 * One row per Entrant per Gameweek, insert-only: the immutability trigger on
 * `manager_states` refuses an update, so storing the same Gameweek twice is a
 * conflict rather than a silent replacement of a decision already made.
 */
export async function storeManagerState(
  database: Database,
  {
    entrantId,
    season,
    gameweek,
    state,
    attemptsUsed,
    rolledOver = false,
    predictedAt
  }: StoredManagerState
): Promise<void> {
  await database.query(
    `insert into manager_states (
       model_id, season, gw, squad, team_sheet, bank, free_transfers,
       hits, chips_used, chip_active, rolled_over, attempts_used, predicted_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      entrantId,
      season,
      gameweek,
      JSON.stringify(state.squad),
      JSON.stringify(state.teamSheet),
      state.bankTenths,
      state.freeTransfers,
      state.hits,
      JSON.stringify(state.chipsUsed),
      state.chipActive,
      rolledOver,
      attemptsUsed,
      predictedAt
    ]
  );
}

function managerState(row: ManagerStateRow | undefined): ManagerState | null {
  return row === undefined
    ? null
    : {
      squad: row.squad,
      teamSheet: row.team_sheet,
      bankTenths: row.bank,
      freeTransfers: row.free_transfers,
      hits: row.hits,
      chipsUsed: row.chips_used,
      chipActive: row.chip_active
    };
}

const MANAGER_STATE_COLUMNS =
  "squad, team_sheet, bank, free_transfers, hits, chips_used, chip_active";

/**
 * The stored row is the whole input to the next reducer step (ADR-0017): this
 * reads one row and reads nothing else, so a Gameweek can be replayed without
 * the history that produced it.
 */
export async function loadManagerState(
  database: Database,
  { entrantId, season, gameweek }: ManagerStateKey
): Promise<ManagerState | null> {
  const result = await database.query<ManagerStateRow>(
    `select ${MANAGER_STATE_COLUMNS}
       from manager_states
      where model_id = $1 and season = $2 and gw = $3`,
    [entrantId, season, gameweek]
  );
  return managerState(result.rows[0]);
}

/** A stored Manager State and the Gameweek it was stored for. */
export interface StandingManagerState {
  gameweek: number;
  state: ManagerState;
}

/**
 * What the Entrant last stood on before `before`: the most recent Gameweek it
 * stored a Manager State for, or null if it has stored none and this is its
 * opening.
 *
 * The last stored rather than the one immediately behind, because a Gameweek
 * can store nothing at all — a provider that never answered, an action that
 * landed after the Lock — and a Squad must not vanish because the Gameweek
 * between was silent. What stands is what last stood, which is the same row
 * `before - 1` would have found whenever there is one.
 *
 * Which Gameweek that was comes back with it, and the caller needs it: a state
 * is only sufficient input to the *next* Gameweek's reducer step, and carrying
 * one across a gap as though there were none would lose every Free Transfer
 * the silent Gameweeks granted and leave a Chip active that stopped being so.
 *
 * Still one row and still no history: the reducer is handed a value, exactly
 * as it is at an opening.
 */
export async function loadStandingManagerState(
  database: Database,
  { entrantId, season, before }: Omit<ManagerStateKey, "gameweek"> & {
    before: number;
  }
): Promise<StandingManagerState | null> {
  const result = await database.query<ManagerStateRow & { gw: number }>(
    `select gw, ${MANAGER_STATE_COLUMNS}
       from manager_states
      where model_id = $1 and season = $2 and gw < $3
      order by gw desc
      limit 1`,
    [entrantId, season, before]
  );
  const [row] = result.rows;
  const state = managerState(row);
  return row === undefined || state === null
    ? null
    : { gameweek: row.gw, state };
}

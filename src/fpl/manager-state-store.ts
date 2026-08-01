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
    `select squad, team_sheet, bank, free_transfers, hits, chips_used,
            chip_active
       from manager_states
      where model_id = $1 and season = $2 and gw = $3`,
    [entrantId, season, gameweek]
  );
  const [row] = result.rows;
  if (row === undefined) {
    return null;
  }

  return {
    squad: row.squad,
    teamSheet: row.team_sheet,
    bankTenths: row.bank,
    freeTransfers: row.free_transfers,
    hits: row.hits,
    chipsUsed: row.chips_used,
    chipActive: row.chip_active
  };
}

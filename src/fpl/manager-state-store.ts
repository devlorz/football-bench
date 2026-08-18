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
  /**
   * The Rationale the Entrant gave (ADR-0041), required at every call site so
   * a caller cannot forget it: null only for a Roll Over, which reached no
   * legal action to explain.
   */
  rationale: string | null;
  predictedAt: Date;
}

export interface ManagerStateRow {
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
    rationale,
    predictedAt
  }: StoredManagerState
): Promise<void> {
  await database.query(
    `insert into manager_states (
       model_id, season, gw, squad, team_sheet, bank, free_transfers,
       hits, chips_used, chip_active, rolled_over, attempts_used, rationale,
       predicted_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
      rationale,
      predictedAt
    ]
  );
}

/**
 * One stored row as the Manager State it is. Exported because anything reading
 * these rows wants the domain value and not the column names — a second
 * mapping elsewhere would be a second place for `bank` and `bankTenths` to
 * drift apart.
 */
export function managerStateFromRow(row: ManagerStateRow): ManagerState {
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

function managerState(row: ManagerStateRow | undefined): ManagerState | null {
  return row === undefined ? null : managerStateFromRow(row);
}

export const MANAGER_STATE_COLUMNS =
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

/**
 * The Gameweek the Season's FPL track started at, or null before it has
 * started.
 *
 * There is no column for it and there must not be one. A Gameweek either holds
 * every Entrant's opening or holds nothing — `startFplTrack` commits all ten
 * or none — so the earliest Gameweek any Manager State belongs to *is* the
 * starting Gameweek. A stored column would be a second answer to a question
 * that already has one, and nothing would keep the two in agreement.
 *
 * It lives here, beside the table it is read from, because two callers need it
 * for opposite reasons: an opening refuses to run when it is not null, and the
 * demonstration record counts from it. Two copies of one `min(gw)` would be
 * two places for "the Gameweek the track started at" to drift apart.
 *
 * The role is asked for exactly as `loadStartedRoster` asks it. An Exhibition
 * Run leaves Manager States in this table too (ADR-0032), and while it can only
 * ever open at the Gameweek this answers — so it cannot pull the minimum down
 * today — the Gameweek the *track* started at is a fact about the seats, and a
 * reader that happens to be right is one change away from being wrong.
 */
export async function loadStartingGameweek(
  database: Database,
  season: string
): Promise<number | null> {
  const result = await database.query<{ gw: number | null }>(
    `select min(s.gw)::int as gw
       from manager_states s
       join models m on m.id = s.model_id
      where s.season = $1 and m.role = 'entrant'`,
    [season]
  );
  return result.rows[0]?.gw ?? null;
}

/**
 * The Entrants whose Season path the Season is a record of: whoever holds a
 * Manager State at the Gameweek the track started at.
 *
 * Read from the opening rather than counted against ADR-0034's ten, because
 * the opening has already checked it against ten — `startFplTrack` refuses a
 * roster of any other size and commits all of them or none. What is wanted
 * downstream is *which* Entrants, and only the opening knows that.
 *
 * The role is asked for because an Exhibition Run replays the Season from the
 * same opening Gameweek and leaves a Manager State standing there too
 * (ADR-0032). Holding a state at the opening is no longer the same thing as
 * being a seat, so the seats are what this selects.
 */
export async function loadStartedRoster(
  database: Database,
  season: string,
  startingGameweek: number
): Promise<string[]> {
  const result = await database.query<{ model_id: string }>(
    `select s.model_id
       from manager_states s
       join models m on m.id = s.model_id
      where s.season = $1 and s.gw = $2 and m.role = 'entrant'
      order by s.model_id`,
    [season, startingGameweek]
  );
  return result.rows.map((row) => row.model_id);
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

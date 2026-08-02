import { z } from "zod";
import {
  carriedIntoNextGameweek,
  chipRefusal,
  CHIPS,
  FIRST_HALF_FINAL_GAMEWEEK,
  GAMEWEEK_RULES,
  type Chip,
  type ChipsUsed,
  type ManagerState,
  type PoolPlayer,
  type Position
} from "../fpl/apply-gameweek-action.js";

/** Frozen (prompt template + context builder) pair for the FPL track. */
export const FPL_PROMPT_VERSION = "fpl/2026-27-v1";

export interface FplTrackPlayer {
  fplId: number;
  webName: string;
  club: string;
  position: Position;
  priceTenths: number;
  status: string;
}

export interface BuildFplTrackContextOptions {
  season: string;
  gameweek: number;
  state: ManagerState;
  pool: FplTrackPlayer[];
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  a: "available",
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable"
};

/**
 * What each half-Season's set still holds. An Entrant is refused for reaching
 * for a Chip it has spent (ADR-0004), so it is told what it holds rather than
 * left to remember, and told it half by half because the two sets are counted
 * apart and the first cannot be carried into the second.
 *
 * The names come from the reducer's own inventory and in its order, so a Chip
 * the rules gain is offered here without anyone remembering to add it.
 */
function chipsSection(state: ManagerState, gameweek: number): string[] {
  const named = (chips: readonly Chip[]): string =>
    chips.length === 0 ? "none" : chips.join(", ");
  const unspent = (half: keyof ChipsUsed): string =>
    named(CHIPS.filter((chip) => !state.chipsUsed[half].includes(chip)));

  return [
    `Chips unspent, first half (through Gameweek ${FIRST_HALF_FINAL_GAMEWEEK}`
    + `): ${unspent("firstHalf")}`,
    `Chips unspent, second half (from Gameweek ${FIRST_HALF_FINAL_GAMEWEEK + 1}`
    + `): ${unspent("secondHalf")}`,
    // The two counts above are what an Entrant plans a Season with. This is
    // what this Gameweek will actually accept, and the two differ whenever a
    // Chip is held but withheld — a Free Hit the Gameweek after a Free Hit,
    // and both transfer Chips in the Gameweek the track opens on. Asking the
    // rules rather than restating them is what keeps the answer true.
    "Chips you can play this Gameweek: "
    + named(CHIPS.filter(
      (chip) => chipRefusal(state, chip, gameweek) === null
    ))
  ];
}

function money(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

function playerLine(player: FplTrackPlayer): string {
  const status = STATUS_LABELS[player.status]
    ?? `unrecognised (${player.status})`;
  return JSON.stringify({
    id: player.fplId,
    name: player.webName,
    club: player.club,
    position: player.position,
    price: money(player.priceTenths),
    price_tenths: player.priceTenths,
    status
  });
}

/**
 * The line the pool starts on. The pool is pinned inside the context rather
 * than re-read from `fpl_players`, because that table is rewritten by every
 * pre-deadline fetch: an Entrant handed a stored context must be charged the
 * prices that context showed it, not whatever the latest snapshot holds.
 */
const POOL_HEADING = "Player pool for this Gameweek, one player per line:";

const poolLineSchema = z.strictObject({
  id: z.number().int().positive(),
  name: z.string(),
  club: z.string().min(1),
  position: z.enum(["GKP", "DEF", "MID", "FWD"]),
  price: z.string(),
  price_tenths: z.number().int().nonnegative(),
  status: z.string()
});

/**
 * Reads back the pool the stored context pinned, in the shape the reducer
 * prices Squads with.
 */
export function parseFplTrackContextPool(body: string): PoolPlayer[] {
  const lines = body.split("\n");
  const start = lines.indexOf(POOL_HEADING);
  if (start === -1) {
    throw new Error("Stored FPL context has no player pool");
  }

  const pool: PoolPlayer[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line === "") {
      return pool;
    }
    const parsed = poolLineSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error("Stored FPL context has a malformed player pool line");
    }
    pool.push({
      fplId: parsed.data.id,
      club: parsed.data.club,
      position: parsed.data.position,
      priceTenths: parsed.data.price_tenths
    });
  }
  return pool;
}

function squadSection(state: ManagerState): string[] {
  if (state.squad.active.length === 0) {
    return ["Squad: none yet — this is your opening Squad."];
  }
  return [
    "Squad, with what you paid for each player:",
    ...state.squad.active.map(({ fplId, purchasePriceTenths }) =>
      `- ${fplId} | bought for ${money(purchasePriceTenths)}`
    )
  ];
}

export function buildFplTrackContext({
  season,
  gameweek,
  state: stored,
  pool
}: BuildFplTrackContextOptions): string {
  // The same reversion the reducer performs on the same stored row, so what
  // the Entrant is shown is what its action will be judged against. Taking the
  // row as it stands would show a Free Hit's borrowed Squad and borrowed bank
  // to an Entrant that owns neither. Doing it here rather than leaving it to
  // callers means no caller can forget, and doing it twice is doing it once.
  const state = carriedIntoNextGameweek(stored);

  return [
    `Fantasy Premier League — ${season} Gameweek ${gameweek}`,
    "",
    "You manage one Squad for the whole Season. Your decisions persist: the "
    + "Squad you pick now is the Squad you carry into the next Gameweek.",
    "",
    "Your Manager State",
    ...squadSection(state),
    `Bank: ${money(state.bankTenths)}`,
    `Free Transfers: ${state.freeTransfers}`,
    ...chipsSection(state, gameweek),
    "",
    POOL_HEADING,
    ...pool.map(playerLine),
    "",
    "The rules your action must satisfy",
    ...GAMEWEEK_RULES.map((rule) => `- ${rule}`),
    "",
    "Return only JSON in exactly this shape, with no other text:",
    JSON.stringify({
      transfers_in: [],
      transfers_out: [],
      chip: null,
      team_sheet: {
        starters: [],
        bench: [],
        captain: 0,
        vice_captain: 0
      }
    })
  ].join("\n");
}

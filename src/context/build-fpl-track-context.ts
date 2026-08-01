import { z } from "zod";
import {
  OPENING_RULES,
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

const ALL_CHIPS = "wildcard, free_hit, triple_captain, bench_boost";

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
  state,
  pool
}: BuildFplTrackContextOptions): string {
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
    `Chips unspent, first half: ${ALL_CHIPS}`,
    `Chips unspent, second half: ${ALL_CHIPS}`,
    "",
    POOL_HEADING,
    ...pool.map(playerLine),
    "",
    "The rules your action must satisfy",
    ...OPENING_RULES.map((rule) => `- ${rule}`),
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

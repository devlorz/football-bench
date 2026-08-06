import type { FplTrackPlayer } from "../src/context/build-fpl-track-context.js";
import type { PoolPlayer } from "../src/fpl/apply-gameweek-action.js";
import type { PlayerPosition } from "../src/fpl/score-team-sheet.js";

export interface FixturePlayer extends PoolPlayer {
  webName: string;
}

/**
 * Fifteen players across five clubs, three each. Bought together they are a
 * legal opening Squad costing £95.5m, which leaves £4.5m in the bank.
 */
export const FPL_POOL: readonly FixturePlayer[] = [
  { fplId: 1, webName: "Raya", club: "Arsenal", position: "GKP", priceTenths: 45 },
  { fplId: 2, webName: "Kelleher", club: "Brentford", position: "GKP", priceTenths: 40 },
  { fplId: 3, webName: "Saliba", club: "Arsenal", position: "DEF", priceTenths: 60 },
  { fplId: 4, webName: "Timber", club: "Arsenal", position: "DEF", priceTenths: 55 },
  { fplId: 5, webName: "Collins", club: "Brentford", position: "DEF", priceTenths: 50 },
  { fplId: 6, webName: "Ajer", club: "Brentford", position: "DEF", priceTenths: 45 },
  { fplId: 7, webName: "Cucurella", club: "Chelsea", position: "DEF", priceTenths: 40 },
  { fplId: 8, webName: "Palmer", club: "Chelsea", position: "MID", priceTenths: 120 },
  { fplId: 9, webName: "Enzo", club: "Chelsea", position: "MID", priceTenths: 90 },
  { fplId: 10, webName: "Ndiaye", club: "Everton", position: "MID", priceTenths: 75 },
  { fplId: 11, webName: "Garner", club: "Everton", position: "MID", priceTenths: 55 },
  { fplId: 12, webName: "Alcaraz", club: "Everton", position: "MID", priceTenths: 45 },
  { fplId: 13, webName: "Jimenez", club: "Fulham", position: "FWD", priceTenths: 105 },
  { fplId: 14, webName: "Muniz", club: "Fulham", position: "FWD", priceTenths: 70 },
  { fplId: 15, webName: "Wilson", club: "Fulham", position: "FWD", priceTenths: 60 }
];

/**
 * Swapped in one at a time to break exactly one rule of the opening above —
 * except player 19, who breaks none: a sixth club keeps him clear of the
 * three-per-club limit, so a Transfer can bring him in on his own.
 */
export const FPL_POOL_ALTERNATES: readonly FixturePlayer[] = [
  { fplId: 16, webName: "Fernandez", club: "Chelsea", position: "MID", priceTenths: 170 },
  { fplId: 17, webName: "White", club: "Arsenal", position: "DEF", priceTenths: 50 },
  { fplId: 18, webName: "Caicedo", club: "Chelsea", position: "MID", priceTenths: 50 },
  { fplId: 19, webName: "Evanilson", club: "Bournemouth", position: "FWD", priceTenths: 60 },
  { fplId: 20, webName: "Dewsbury-Hall", club: "Everton", position: "MID", priceTenths: 170 },
  { fplId: 21, webName: "Branthwaite", club: "Everton", position: "DEF", priceTenths: 45 }
];

/**
 * The pool as a Gameweek's Lock hands it to the context builder: available,
 * with nothing flagged and no percentage published — what the fetch writes for
 * most of a pool most weeks. A test about a flag overrides the players it is
 * about, so what it is asserting is what it names.
 */
export function trackPool(
  players: readonly FixturePlayer[]
): FplTrackPlayer[] {
  return players.map((player) => ({
    ...player,
    status: "a",
    chanceOfPlaying: null,
    news: ""
  }));
}

/** The reducer takes the pool without the names the context builder shows. */
export function poolPlayers(
  players: readonly FixturePlayer[]
): PoolPlayer[] {
  return players.map(({ fplId, position, club, priceTenths }) => ({
    fplId,
    position,
    club,
    priceTenths
  }));
}

/**
 * Scoring never prices a player, so it is handed positions alone — the
 * season-scoped lookup rather than the Gameweek's locked pool.
 */
export function positionsOf(
  players: readonly FixturePlayer[]
): PlayerPosition[] {
  return players.map(({ fplId, position }) => ({ fplId, position }));
}

/** Every player a test action may name: the locked Gameweek's whole pool. */
export const LOCKED_POOL: PoolPlayer[] = poolPlayers([
  ...FPL_POOL,
  ...FPL_POOL_ALTERNATES
]);

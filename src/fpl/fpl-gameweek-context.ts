import { createHash } from "node:crypto";
import type { Client } from "pg";
import type {
  FplPerformanceWindow,
  FplPlayerPerformance,
  FplTrackPlayer
} from "../context/build-fpl-track-context.js";
import type { Position } from "./apply-gameweek-action.js";

type Database = Pick<Client, "query">;

interface PoolRow {
  fpl_id: number;
  team_name: string;
  web_name: string;
  position: Position;
  price_tenths: number;
  status: string;
}

/** A Gameweek's Lock, the pool as its Lock found it, and the two windows. */
export interface LockedGameweek {
  deadline: Date;
  pool: FplTrackPlayer[];
  performance: FplPlayerPerformance[];
  settledThrough: number | null;
}

interface WindowRow {
  fpl_id: number;
  appearances: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  /** `numeric` arrives as the fixed-point string the context renders. */
  expected_goals: string;
  expected_assists: string;
  expected_goals_conceded: string;
}

/**
 * One window's aggregate per player, over the Settled Gameweeks from `from` up
 * to the Gameweek being played. Summed by Postgres rather than in memory: the
 * expected-goals family is `numeric`, and adding it here would be a float
 * rounding step in the one place the source's two decimals still hold.
 *
 * A player who played no minutes in the window is dropped, so the pool line
 * carries no block for it — the absence is the statement "no Settled
 * appearance". `appearances` counts Gameweeks rather than rows because the
 * table is keyed by Gameweek: a Double Gameweek is one row, and one
 * appearance.
 */
/** Below every Gameweek number a Season has: a window floored at nothing. */
const SEASON_START = 0;

async function performanceWindow(
  database: Database,
  season: string,
  gameweek: number,
  from: number
): Promise<Map<number, FplPerformanceWindow>> {
  const summed = await database.query<WindowRow>(
    `select fpl_id,
            count(*) filter (where minutes > 0)::int as appearances,
            sum(total_points)::int            as points,
            sum(minutes)::int                 as minutes,
            sum(goals_scored)::int            as goals,
            sum(assists)::int                 as assists,
            sum(clean_sheets)::int            as clean_sheets,
            sum(bonus)::int                   as bonus,
            sum(yellow_cards)::int            as yellow_cards,
            sum(red_cards)::int               as red_cards,
            sum(saves)::int                   as saves,
            sum(expected_goals)               as expected_goals,
            sum(expected_assists)             as expected_assists,
            sum(expected_goals_conceded)      as expected_goals_conceded
       from fpl_player_points
      where season = $1 and gw < $2 and gw >= $3
      group by fpl_id
     having sum(minutes) > 0`,
    [season, gameweek, from]
  );
  return new Map(summed.rows.map((row) => [row.fpl_id, {
    points: row.points,
    minutes: row.minutes,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    cleanSheets: row.clean_sheets,
    bonus: row.bonus,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    saves: row.saves,
    expectedGoals: row.expected_goals,
    expectedAssists: row.expected_assists,
    expectedGoalsConceded: row.expected_goals_conceded
  }]));
}

/**
 * Both windows for every player who has played a Settled Gameweek, and the
 * Gameweek they run through.
 *
 * Settled-ness is the presence of stored points rows and nothing else, exactly
 * as scoring reads it: a Gameweek the fetch never wrote contributes to neither
 * window and cannot be the one the context announces. The five most recent
 * Settled Gameweeks are read first and the window floored at the earliest of
 * them, so the boundary is drawn across the Season's Gameweeks rather than
 * across each player's own appearances — a player who missed one of the five
 * carries four appearances, not a sixth Gameweek dragged in to make up the
 * number.
 */
async function settledPerformance(
  database: Database,
  season: string,
  gameweek: number
): Promise<Pick<LockedGameweek, "performance" | "settledThrough">> {
  const mostRecent = await database.query<{ gw: number }>(
    `select distinct gw
       from fpl_player_points
      where season = $1 and gw < $2
      order by gw desc
      limit 5`,
    [season, gameweek]
  );
  const settled = mostRecent.rows.map((row) => row.gw);
  if (settled.length === 0) {
    return { performance: [], settledThrough: null };
  }

  const [wholeSeason, lastFive] = await Promise.all([
    performanceWindow(database, season, gameweek, SEASON_START),
    performanceWindow(database, season, gameweek, settled[settled.length - 1]!)
  ]);
  return {
    settledThrough: settled[0]!,
    // Keyed off the Season's window, which every last-five player is in: a
    // player with Settled minutes only outside the five carries a season block
    // and no last5, which is what "no Settled appearance in this window" is.
    performance: [...wholeSeason].map(([fplId, whole]) => {
      const recent = lastFive.get(fplId);
      return recent === undefined
        ? { fplId, season: whole }
        : { fplId, season: whole, lastFive: recent };
    })
  };
}

/**
 * What a Gameweek offers every Entrant that plays it: one deadline shared with
 * the Match track (ADR-0006), one snapshot of the pool, and one set of
 * performance windows. All are read before any Entrant is called, because all
 * belong to the Gameweek rather than to whoever is reading it — which is also
 * what leaves the nine Entrants nothing to differ over.
 */
export async function loadLockedGameweek(
  database: Database,
  season: string,
  gameweek: number
): Promise<LockedGameweek> {
  const scheduled = await database.query<{ deadline_at: Date }>(
    "select deadline_at from gameweeks where season = $1 and gw = $2",
    [season, gameweek]
  );
  const [gameweekRow] = scheduled.rows;
  if (gameweekRow === undefined) {
    throw new Error(`Gameweek ${gameweek} of ${season} is not scheduled`);
  }

  const players = await database.query<PoolRow>(
    `select fpl_id, team_name, web_name, position, price_tenths, status
       from fpl_players
      where season = $1 and gw = $2
      order by fpl_id`,
    [season, gameweek]
  );
  return {
    ...await settledPerformance(database, season, gameweek),
    deadline: gameweekRow.deadline_at,
    pool: players.rows.map((row) => ({
      fplId: row.fpl_id,
      webName: row.web_name,
      club: row.team_name,
      position: row.position,
      priceTenths: row.price_tenths,
      status: row.status
    }))
  };
}

/**
 * Stores one Entrant's FPL context for a Gameweek and returns the body that is
 * on record. A later run gets the stored text back rather than the one it just
 * built, so a player snapshot that moved in between cannot price a Squad from
 * a text the Entrant was never shown and the stored hash does not cover.
 *
 * One row per Entrant per Gameweek, because from the second Gameweek onwards
 * the text carries that Entrant's own Squad. The opening's nine bodies are
 * identical — every Entrant is seeded from the same empty Squad — and are
 * still stored one apiece, so that no reader of `contexts` has to know which
 * Gameweek was the exception.
 */
export async function storeFplContext(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  body: string
): Promise<string> {
  const inserted = await database.query<{ body: string }>(
    `insert into contexts (season, gw, track, model_id, hash, body)
     values ($1, $2, 'fpl', $3, $4, $5)
     on conflict (
       season, gw, track, (coalesce(fpl_id, -1)), (coalesce(model_id, ''))
     ) do nothing
     returning body`,
    [
      season,
      gameweek,
      entrantId,
      createHash("sha256").update(body).digest("hex"),
      body
    ]
  );
  const insertedBody = inserted.rows[0]?.body;
  if (insertedBody !== undefined) {
    return insertedBody;
  }

  const stored = await database.query<{ body: string }>(
    `select body
       from contexts
      where season = $1 and gw = $2 and track = 'fpl' and model_id = $3`,
    [season, gameweek, entrantId]
  );
  const storedBody = stored.rows[0]?.body;
  if (storedBody === undefined) {
    throw new Error(
      `FPL context for ${entrantId} at Gameweek ${gameweek} of ${season} `
      + "was not stored"
    );
  }
  return storedBody;
}

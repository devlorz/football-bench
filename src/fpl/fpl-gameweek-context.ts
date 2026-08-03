import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { FplTrackPlayer } from "../context/build-fpl-track-context.js";
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

/** A Gameweek's Lock, and the player pool as its Lock found it. */
export interface LockedGameweek {
  deadline: Date;
  pool: FplTrackPlayer[];
}

/**
 * What a Gameweek offers every Entrant that plays it: one deadline shared with
 * the Match track (ADR-0006) and one snapshot of the pool. Both are read
 * before any Entrant is called, because both belong to the Gameweek rather
 * than to whoever is reading it.
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
 * Stores the Gameweek's one FPL context and returns the body that is on
 * record. A later caller gets the stored text back rather than the one it just
 * built, so a player snapshot that moves between two Entrants cannot hand the
 * second of them a text the stored hash does not cover.
 *
 * That sharing is sound only while the text says nothing about which Entrant
 * is reading it, and `shared` is where the caller states that it does not. At
 * an opening every Entrant is handed the same seed state, so one row is one
 * Entrant's context and every Entrant's at once. Once any Manager State has
 * been stored, each Entrant's context carries its own Squad, and
 * `contexts_identity` — unique on (season, gw, track, fpl_id) — has room for
 * only one of them.
 */
export async function storeFplContext(
  database: Database,
  season: string,
  gameweek: number,
  body: string,
  shared: boolean
): Promise<string> {
  const inserted = await database.query<{ body: string }>(
    `insert into contexts (season, gw, track, hash, body)
     values ($1, $2, 'fpl', $3, $4)
     on conflict (season, gw, track, (coalesce(fpl_id, -1))) do nothing
     returning body`,
    [season, gameweek, createHash("sha256").update(body).digest("hex"), body]
  );
  const insertedBody = inserted.rows[0]?.body;
  if (insertedBody !== undefined) {
    return insertedBody;
  }

  // The row that is already there belongs to another Entrant, and handing it
  // over would show this one a Squad it does not own and then judge it on the
  // Squad it does. Refusing loudly is the honest behaviour until per-Entrant
  // context rows exist — that belongs to "Run the FPL track under the shared
  // Lock", which is where the migration that widens the key belongs too.
  if (!shared) {
    throw new Error(
      `the FPL context for Gameweek ${gameweek} of ${season} is already `
      + "another Entrant's, and one Gameweek can hold only one"
    );
  }

  const stored = await database.query<{ body: string }>(
    `select body
       from contexts
      where season = $1 and gw = $2 and track = 'fpl'`,
    [season, gameweek]
  );
  const storedBody = stored.rows[0]?.body;
  if (storedBody === undefined) {
    throw new Error(
      `FPL context for Gameweek ${gameweek} of ${season} was not stored`
    );
  }
  return storedBody;
}

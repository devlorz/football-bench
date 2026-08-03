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

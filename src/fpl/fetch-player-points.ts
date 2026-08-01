import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  FplSourceHttpError,
  parseFplSource
} from "./fetch-gameweek.js";

const liveSchema = z.looseObject({
  elements: z.array(z.looseObject({
    id: z.number().int().positive(),
    stats: z.looseObject({
      minutes: z.number().int().nonnegative(),
      // Points go negative on a red card or an own goal.
      total_points: z.number().int()
    })
  }))
});

type Database = Pick<Client, "query">;

export interface FetchFplPlayerPointsOptions {
  database: Database;
  season: string;
  gameweek: number;
  http: HttpFetcher;
}

function liveUrl(gameweek: number): string {
  return `https://fantasy.premierleague.com/api/event/${gameweek}/live/`;
}

/**
 * Stores one Gameweek's per-player points. The caller decides the Gameweek is
 * settled from `events[].data_checked`; this function never reads a clock.
 */
export async function fetchFplPlayerPoints({
  database,
  season,
  gameweek,
  http
}: FetchFplPlayerPointsOptions): Promise<void> {
  const url = liveUrl(gameweek);
  const response = await http(url);

  await storeRawSnapshots(database, [{
    source: `fpl_live:${season}:${gameweek}`,
    body: response.body
  }]);

  if (response.status < 200 || response.status >= 300) {
    throw new FplSourceHttpError("fpl_live", response.status, url);
  }
  const live = parseFplSource("fpl_live", liveSchema, response.body);

  await database.query("begin");
  try {
    for (const player of live.elements) {
      await database.query(
        `insert into fpl_player_points (
           season, gw, fpl_id, minutes, total_points
         )
         values ($1, $2, $3, $4, $5)
         on conflict (season, gw, fpl_id)
         do update set
           minutes = excluded.minutes,
           total_points = excluded.total_points`,
        [
          season,
          gameweek,
          player.id,
          player.stats.minutes,
          player.stats.total_points
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

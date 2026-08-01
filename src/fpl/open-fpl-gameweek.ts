import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  type FplTrackPlayer
} from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import {
  openRouterRequest,
  parseOpenRouterResponse
} from "../predictions/openrouter-entrant.js";
import {
  applyGameweekAction,
  openingManagerState,
  type PoolPlayer,
  type Position
} from "./apply-gameweek-action.js";
import { storeManagerState } from "./manager-state-store.js";
import { validateGameweekAction } from "./validate-gameweek-action.js";

type Database = Pick<Client, "query">;

/**
 * One Entrant per call. Gathering all nine and committing them atomically is
 * the "Start all nine Entrants together" ticket's job; opening them one at a
 * time from here would leave a partial start behind.
 */
export interface OpenFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  entrantId: string;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

interface PoolRow {
  fpl_id: number;
  team_name: string;
  web_name: string;
  position: Position;
  price_tenths: number;
  status: string;
}

interface EntrantRow {
  id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
}

/**
 * Stores the Gameweek's one FPL context and returns the body that is on
 * record. A later caller gets the stored text back rather than the one it just
 * built, so a player snapshot that moves between two Entrants cannot hand the
 * second of them a text the stored hash does not cover.
 */
async function storeFplContext(
  database: Database,
  season: string,
  gameweek: number,
  body: string
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

export async function openFplGameweek({
  database,
  season,
  gameweek,
  entrantId,
  apiKey,
  http,
  now
}: OpenFplGameweekOptions): Promise<void> {
  const gameweekResult = await database.query<{ deadline_at: Date }>(
    "select deadline_at from gameweeks where season = $1 and gw = $2",
    [season, gameweek]
  );
  const [gameweekRow] = gameweekResult.rows;
  if (gameweekRow === undefined) {
    throw new Error(`Gameweek ${gameweek} of ${season} is not scheduled`);
  }
  const deadline = gameweekRow.deadline_at;

  const poolResult = await database.query<PoolRow>(
    `select fpl_id, team_name, web_name, position, price_tenths, status
       from fpl_players
      where season = $1 and gw = $2
      order by fpl_id`,
    [season, gameweek]
  );
  const contextPool: FplTrackPlayer[] = poolResult.rows.map((row) => ({
    fplId: row.fpl_id,
    webName: row.web_name,
    club: row.team_name,
    position: row.position,
    priceTenths: row.price_tenths,
    status: row.status
  }));

  const entrantResult = await database.query<EntrantRow>(
    `select id, base_model, provider, quantization
       from models
      where id = $1 and role = 'entrant'`,
    [entrantId]
  );
  const [entrant] = entrantResult.rows;
  if (entrant === undefined) {
    throw new Error(`${entrantId} is not an Entrant`);
  }

  // Every Entrant opens from the same seed state, so one context per Gameweek
  // is the exact text each of them is handed.
  const opening = openingManagerState();
  const body = await storeFplContext(
    database,
    season,
    gameweek,
    buildFplTrackContext({
      season,
      gameweek,
      state: opening,
      pool: contextPool
    })
  );
  // Priced from the context on record, never from a snapshot that may have
  // moved since it was stored.
  const pool = parseFplTrackContextPool(body);

  const { url, ...request } = openRouterRequest(
    apiKey,
    {
      baseModel: entrant.base_model,
      provider: entrant.provider,
      quantization: entrant.quantization
    },
    body
  );
  const response = await http(url, request);
  // The action is received the moment the response lands. Reading the clock
  // after parsing and validating would let slow processing miss a Lock the
  // Entrant made in time.
  const receivedAt = now();

  const parsed = parseOpenRouterResponse(response.body);
  if (parsed?.content === null || parsed?.content === undefined) {
    return;
  }

  const validation = validateGameweekAction(parsed.content);
  if (!validation.ok) {
    return;
  }
  const outcome = applyGameweekAction(opening, validation.action, pool);
  if (!("state" in outcome)) {
    return;
  }

  if (receivedAt >= deadline) {
    return;
  }

  await storeManagerState(database, {
    entrantId: entrant.id,
    season,
    gameweek,
    state: outcome.state,
    attemptsUsed: 0,
    predictedAt: receivedAt
  });
}

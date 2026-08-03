import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  FPL_PROMPT_VERSION
} from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import {
  openingManagerState,
  type ManagerState
} from "./apply-gameweek-action.js";
import {
  askForGameweekAction,
  type GameweekEntrant
} from "./ask-for-gameweek-action.js";
import {
  loadLockedGameweek,
  storeFplContext
} from "./fpl-gameweek-context.js";
import {
  loadStartingGameweek,
  storeManagerState
} from "./manager-state-store.js";
import { SEASON_ROSTER_SIZE } from "../season-roster.js";

type Database = Pick<Client, "query">;

export interface StartFplTrackOptions {
  database: Database;
  season: string;
  /** The Gameweek the operator chose to start at. Never inferred. */
  gameweek: number;
  /** How many Entrants may be called at once. */
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * What one attempt at opening the track came to: the Gameweek it was tried at,
 * and the Entrants that produced no legal opening action there.
 *
 * An empty `missing` is the whole start — every Entrant's Manager State is
 * committed. A non-empty one is no start at all: nothing was committed, the
 * attempts stay on record, and the operator may try the next Gameweek.
 */
export interface FplTrackOpening {
  gameweek: number;
  missing: string[];
}

/**
 * Opens the FPL track at a Gameweek the operator names, for every Entrant at
 * once.
 *
 * The Season path begins only when all nine Base Models hold a legal opening
 * Squad, so the actions are gathered first and committed second: an Entrant
 * that never gets there does not receive a shorter path than its peers, it
 * stops the start. What survives a refused start is the attempt record, which
 * is written as each call happens and is exactly what the operator reads to
 * decide whether to try again.
 */
export async function startFplTrack({
  database,
  season,
  gameweek,
  concurrency,
  apiKey,
  http,
  now
}: StartFplTrackOptions): Promise<FplTrackOpening> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("FPL opening concurrency must be a positive integer");
  }

  // An opening seeds every Entrant from the empty Squad, so opening a Season
  // that is already under way would discard it rather than continue it. A
  // refused start stores nothing, which is what leaves this clear for the
  // operator's next Gameweek.
  const startedAt = await loadStartingGameweek(database, season);
  if (startedAt !== null) {
    throw new Error(
      `the FPL track for ${season} already started at Gameweek ${startedAt}`
    );
  }

  const { deadline, pool: contextPool } =
    await loadLockedGameweek(database, season, gameweek);

  const entrantResult = await database.query<GameweekEntrant>(
    `select id, base_model, provider, quantization
       from models
      where role = 'entrant' and prompt_version = $1
      order by id`,
    [FPL_PROMPT_VERSION]
  );
  const entrants = entrantResult.rows;
  // One seat per Base Model is what makes this ranking a demonstration of one
  // season path each (ADR-0003), and a second seat would quietly make it
  // something else. Named first because it says which Base Model is at fault,
  // which the count below cannot.
  const seats = new Map<string, string[]>();
  for (const { id, base_model: baseModel } of entrants) {
    seats.set(baseModel, [...seats.get(baseModel) ?? [], id]);
  }
  for (const [baseModel, ids] of seats) {
    if (ids.length > 1) {
      throw new Error(
        `${baseModel} has more than one FPL seat: ${ids.join(", ")}`
      );
    }
  }
  // And there are as many of them as the Season has Entrants. `missing` is
  // measured against the roster that was queried, so a roster of the wrong
  // size reports nobody missing and starts a Season that is not the one
  // ADR-0014 describes — with no way back, because `manager_states` is
  // insert-only. Both questions are asked before the first call, so a roster
  // problem is never discovered next to a Lock.
  if (entrants.length !== SEASON_ROSTER_SIZE) {
    throw new Error(
      `the FPL track needs ${SEASON_ROSTER_SIZE} seats at Prompt Version `
      + `${FPL_PROMPT_VERSION}, but ${entrants.length} are configured`
    );
  }

  // Every Entrant starts from the same seed state and the same locked pool, so
  // there is one context and it is every Entrant's at once.
  const previous = openingManagerState();
  const body = await storeFplContext(
    database,
    season,
    gameweek,
    buildFplTrackContext({
      season,
      gameweek,
      state: previous,
      pool: contextPool
    }),
    true
  );
  const pool = parseFplTrackContextPool(body);

  const openings = new Map<string, {
    state: ManagerState;
    repairsUsed: number;
    receivedAt: Date;
  }>();
  // Nine conversations at once, up to the operator's limit. Each Entrant's
  // own Repairs stay in its own conversation, so the only thing concurrency
  // shares is the wait — which is the point, with one Lock to finish inside.
  let nextSeat = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const entrant = entrants[nextSeat];
      nextSeat += 1;
      if (entrant === undefined) {
        return;
      }
      const outcome = await askForGameweekAction({
        database,
        season,
        gameweek,
        entrant,
        body,
        previous,
        pool,
        deadline,
        apiKey,
        http,
        now
      });
      if (outcome.kind === "action") {
        openings.set(entrant.id, {
          state: outcome.state,
          repairsUsed: outcome.repairsUsed,
          receivedAt: outcome.receivedAt
        });
      }
    }
  }
  // Settled rather than raced: a worker whose database write failed must not
  // leave its peers writing into a call that has already returned.
  const finished = await Promise.allSettled(
    Array.from(
      { length: Math.min(concurrency, entrants.length) },
      () => worker()
    )
  );
  const failed = finished.find((result) => result.status === "rejected");
  if (failed !== undefined) {
    throw failed.reason;
  }

  const missing = entrants
    .map(({ id }) => id)
    .filter((id) => !openings.has(id));
  if (missing.length > 0) {
    return { gameweek, missing };
  }

  // One transaction for all of them. A Manager State stored while another
  // Entrant's is still to come would be a path already one Gameweek longer
  // than its peers' if the rest never arrive.
  await database.query("begin");
  try {
    for (const [entrantId, opening] of openings) {
      await storeManagerState(database, {
        entrantId,
        season,
        gameweek,
        state: opening.state,
        attemptsUsed: opening.repairsUsed,
        predictedAt: opening.receivedAt
      });
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
  return { gameweek, missing };
}

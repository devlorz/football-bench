import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool,
  FPL_PROMPT_VERSION
} from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import {
  openingManagerState,
  type ManagerState,
  type PoolPlayer
} from "./apply-gameweek-action.js";
import {
  askForGameweekAction,
  judgeGameweekResponse,
  type GameweekCaller
} from "./ask-for-gameweek-action.js";
import { parseOpenRouterResponse } from "../predictions/openrouter-entrant.js";
import {
  loadLockedGameweek,
  storeFplContext
} from "./fpl-gameweek-context.js";
import {
  loadStartingGameweek,
  storeManagerState
} from "./manager-state-store.js";
import { SEASON_ROSTER_SIZE } from "../season-roster.js";
import { eachBounded } from "../bounded-concurrency.js";

type Database = Pick<Client, "query">;

export interface StartFplTrackOptions {
  database: Database;
  season: string;
  /** The Gameweek the operator chose to start at. Never inferred. */
  gameweek: number;
  /** How many Entrants may be called at once. */
  concurrency: number;
  apiKey: string;
  /** How long one Entrant call may take (spec 0010). */
  entrantCallTimeoutMs: number;
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
 * The opening this seat already has on record for the Gameweek, replayed
 * through the rules reducer as if it had just been answered (ADR-0025) — or
 * null for a seat that never got a legal answer on record and must be called.
 *
 * A retry of a refused opening re-billed every seat, including the eight whose
 * legal actions the run had already thrown away. The accepted action is parsed
 * back out of `attempts.raw_response` at the point of use — no new column, no
 * second copy of a fact the audit trail already states — and driven through
 * the same judgement a live response gets, against the same stored context the
 * first run priced from. That is the whole reason the record can stand in for
 * the call: `storeFplContext` writes insert-or-nothing, so every retry hands
 * every seat the byte-identical text, and a replayed answer is an answer to
 * exactly the question being asked.
 *
 * Trusting the recorded `ok` flag and skipping to the commit was declined: a
 * replay costs nothing, and re-proving legality against the state actually
 * being committed turns any drift between two runs into this error rather than
 * a stale Squad committed silently.
 */
async function replayRecordedOpening(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  previous: ManagerState,
  pool: PoolPlayer[]
): Promise<{ state: ManagerState; repairsUsed: number; receivedAt: Date } | null> {
  const recorded = await database.query<{
    attempt_no: number;
    raw_response: string | null;
    attempted_at: Date;
  }>(
    `select attempt_no, raw_response, attempted_at
       from attempts
      where model_id = $1 and season = $2 and gw = $3 and track = 'fpl' and ok
      order by attempt_no
      limit 1`,
    [entrantId, season, gameweek]
  );
  const [attempt] = recorded.rows;
  if (attempt === undefined) {
    return null;
  }
  // A legal attempt whose body cannot be read back is a broken ledger, not an
  // Entrant that answered badly — it says so in its own words rather than
  // borrowing the rules' refusal below.
  const content = parseOpenRouterResponse(attempt.raw_response ?? "")?.content;
  if (content === null || content === undefined) {
    throw new Error(
      `${entrantId} has a recorded opening action for Gameweek ${gameweek} of `
      + `${season} that cannot be read back out of its attempt`
    );
  }
  const judged = judgeGameweekResponse(content, previous, pool, gameweek);
  if (!("state" in judged)) {
    throw new Error(
      `${entrantId} has a recorded opening action for Gameweek ${gameweek} of `
      + `${season} that the rules now refuse: ${judged.reason}`
    );
  }
  return {
    state: judged.state,
    repairsUsed: attempt.attempt_no,
    receivedAt: attempt.attempted_at
  };
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
  entrantCallTimeoutMs,
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

  const { deadline, pool: contextPool, ...windows } =
    await loadLockedGameweek(database, season, gameweek);

  const entrantResult = await database.query<GameweekCaller>(
    `select id, base_model, provider, quantization, role
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
  // the nine bodies are identical. They are still stored one apiece, because a
  // context is one Entrant's from the next Gameweek onwards and one shape for
  // the whole Season is worth nine copies of one body.
  const previous = openingManagerState();
  const opening = buildFplTrackContext({
    season,
    gameweek,
    state: previous,
    pool: contextPool,
    // A Season opened at its first Gameweek has nothing Settled behind it and
    // the context says so. A track opened mid-Season is the one with windows
    // to show, and the Lock read them once for every Entrant.
    ...windows
  });

  const openings = new Map<string, {
    state: ManagerState;
    repairsUsed: number;
    receivedAt: Date;
  }>();
  // Nine conversations at once, up to the operator's limit. Each Entrant's
  // own Repairs stay in its own conversation, so the only thing concurrency
  // shares is the wait — which is the point, with one Lock to finish inside.
  await eachBounded(entrants, concurrency, async (entrant) => {
    // Stored before the Entrant is called, and the stored text is what it is
    // handed: a second attempt at the same opening gives back the row on
    // record rather than a rebuilt one, so a snapshot that moved in between
    // cannot price a Squad from a text nobody was shown.
    const body = await storeFplContext(
      database,
      season,
      gameweek,
      entrant.id,
      opening
    );
    const pool = parseFplTrackContextPool(body);
    // A seat that already answered legally is not asked again. What it said is
    // replayed from the record instead, so one seat's provider outage stops
    // costing eight other Entrants' answers (ADR-0025).
    const replayed = await replayRecordedOpening(
      database,
      season,
      gameweek,
      entrant.id,
      previous,
      pool
    );
    if (replayed !== null) {
      openings.set(entrant.id, replayed);
      return;
    }
    const outcome = await askForGameweekAction({
      database,
      season,
      gameweek,
      caller: entrant,
      body,
      previous,
      pool,
      deadline,
      apiKey,
      timeoutMs: entrantCallTimeoutMs,
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
  });

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

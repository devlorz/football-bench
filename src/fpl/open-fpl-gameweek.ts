import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool
} from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import {
  rolledOverState,
  type ManagerState
} from "./apply-gameweek-action.js";
import {
  askForGameweekAction,
  type GameweekEntrant
} from "./ask-for-gameweek-action.js";
import {
  loadLockedGameweek,
  storeFplContext,
  type LockedGameweek
} from "./fpl-gameweek-context.js";
import { MAX_REPAIRS } from "../repairs.js";
import {
  loadManagerState,
  loadStandingManagerState,
  storeManagerState,
  type StandingManagerState
} from "./manager-state-store.js";

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
  /** How long one Entrant call may take (spec 0010). */
  entrantCallTimeoutMs: number;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * The Manager State the Entrant actually carries into `gameweek`, given the
 * Gameweek its last stored one belongs to.
 *
 * A stored state is sufficient input to the *next* Gameweek's reducer step and
 * to that one only (ADR-0017). A Gameweek can store nothing — a provider that
 * never answered, an action that arrived after the Lock — and those Gameweeks
 * still happened: they still granted a Free Transfer, and the Chip that was
 * active during the stored one stopped being active when it ended. Handing the
 * stored row straight to a Gameweek two or more later would bank one Free
 * Transfer for however many Gameweeks passed, and would refuse a Free Hit as
 * consecutive when a whole Gameweek sat between the two.
 *
 * A Gameweek nobody acted in is a Gameweek nothing was done in, which is what
 * `rolledOverState` already means — so the silent ones are folded through it
 * one at a time. Idempotent where there is no gap: no silent Gameweek, no
 * transition, and the stored row is passed through as it stands.
 *
 * The silent Gameweeks are counted from `gameweeks` rather than by
 * subtracting, because that table is the record of which Gameweeks a Season
 * has and arithmetic would invent any it does not.
 */
async function carriedThroughSilence(
  database: Database,
  season: string,
  standing: StandingManagerState,
  gameweek: number
): Promise<ManagerState> {
  const silent = await database.query<{ count: number }>(
    `select count(*)::int as count
       from gameweeks
      where season = $1 and gw > $2 and gw < $3`,
    [season, standing.gameweek, gameweek]
  );
  const passed = silent.rows[0]?.count ?? 0;
  return Array.from({ length: passed }).reduce<ManagerState>(
    (state) => rolledOverState(state),
    standing.state
  );
}

/**
 * What one Entrant's Gameweek came to.
 *
 * `played` stored a Manager State — a legal action's, or a Roll Over's after
 * the fourth invalid response. `standing` is an Entrant that already held one
 * for this Gameweek and was not called again. `missing` is every way it
 * produced nothing: a provider that failed or refused, a response nothing
 * could read, a Lock already passed.
 */
export type FplGameweekResult = "played" | "standing" | "missing";

export interface PlayFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  entrant: GameweekEntrant;
  /** The Gameweek's Lock and pool, read once for however many Entrants play. */
  locked: LockedGameweek;
  apiKey: string;
  /** How long one Entrant call may take (spec 0010). */
  entrantCallTimeoutMs: number;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * One Entrant's Gameweek, from the Manager State it carries in to the one it
 * leaves behind.
 *
 * It takes the Gameweek's Lock and pool rather than reading them, because a
 * whole roster plays one Gameweek and the deadline and the snapshot belong to
 * the Gameweek rather than to whoever is reading them. Every Entrant must be
 * priced from one pool, or two of them are playing different games.
 */
export async function playFplGameweek({
  database,
  season,
  gameweek,
  entrant,
  // The windows travel as the pair the builder takes them as, so the Gameweek
  // hands them on rather than restating them.
  locked: { deadline, pool: contextPool, ...windows },
  apiKey,
  entrantCallTimeoutMs,
  http,
  now
}: PlayFplGameweekOptions): Promise<FplGameweekResult> {
  const entrantId = entrant.id;

  // A Gameweek an Entrant already has a Manager State for is a decision
  // already taken. `manager_states` is insert-only and refuses an update, so
  // a second run could not replace it in any case — what this saves is the
  // call that would have been made and thrown away, and the crash that
  // storing it would have been.
  const already = await loadManagerState(database, {
    entrantId,
    season,
    gameweek
  });
  if (already !== null) {
    return "standing";
  }

  // What the Entrant carries in — and it must carry something in. An opening
  // seeds from the empty Squad, and seeding one Entrant here would start the
  // Season for one of nine: `manager_states` is insert-only, so that row is
  // permanent, it is the earliest the Season has, and it would therefore be
  // the Gameweek the track started at. Openings are `startFplTrack`'s, which
  // commits all nine or none.
  const standing = await loadStandingManagerState(database, {
    entrantId,
    season,
    before: gameweek
  });
  if (standing === null) {
    throw new Error(
      `${entrantId} has no Manager State to carry into Gameweek ${gameweek} `
      + `of ${season}; the FPL track opens through startFplTrack`
    );
  }
  const previous =
    await carriedThroughSilence(database, season, standing, gameweek);

  // This Entrant's own context, carrying this Entrant's own Squad. Stored
  // before the call, so what it saw is on record whatever the call comes to.
  const body = await storeFplContext(
    database,
    season,
    gameweek,
    entrant.id,
    buildFplTrackContext({
      season,
      gameweek,
      state: previous,
      pool: contextPool,
      ...windows
    })
  );

  const outcome = await askForGameweekAction({
    database,
    season,
    gameweek,
    entrant,
    body,
    previous,
    // Priced from the context on record, never from a snapshot that may have
    // moved since it was stored.
    pool: parseFplTrackContextPool(body),
    deadline,
    apiKey,
    timeoutMs: entrantCallTimeoutMs,
    http,
    now
  });

  if (outcome.kind === "action") {
    await storeManagerState(database, {
      entrantId: entrant.id,
      season,
      gameweek,
      state: outcome.state,
      attemptsUsed: outcome.repairsUsed,
      predictedAt: outcome.receivedAt
    });
    return "played";
  }
  // The fourth invalid response. The action is discarded whole and the
  // Gameweek Rolls Over onto the Team Sheet already standing (ADR-0004) —
  // never a score of zero, because zero is a punishment large enough to drown
  // out every other signal this track produces. There is always something
  // standing here: an Entrant without one never got past the check above.
  if (outcome.kind === "exhausted") {
    await storeManagerState(database, {
      entrantId: entrant.id,
      season,
      gameweek,
      state: rolledOverState(previous),
      attemptsUsed: MAX_REPAIRS,
      rolledOver: true,
      predictedAt: outcome.receivedAt
    });
    return "played";
  }
  return "missing";
}

/**
 * One Entrant's Gameweek, reading the Gameweek's Lock and pool for itself.
 *
 * The whole roster plays a Gameweek through `runFplGameweek`, which reads
 * those once and hands them to every Entrant. This is the same Gameweek for
 * one Entrant — what an operator reaches for to carry a single seat forward,
 * and what the per-Entrant behaviour is tested through.
 *
 * Reading them per call is what makes this the operator's tool rather than
 * the roster's: a pre-deadline fetch landing between two of these calls moves
 * the pool for the second Entrant, and a settled-points fetch landing there
 * moves its performance windows too. One Gameweek would then hold two
 * different texts, and Paired Differences over them would be measuring the
 * fetch rather than the Base Models (ADR-0008). Carrying seats forward one at
 * a time is therefore a thing to finish before the next fetch runs;
 * `runFplGameweek` is what the schedule calls, and it reads once.
 */
export async function openFplGameweek({
  database,
  season,
  gameweek,
  entrantId,
  apiKey,
  entrantCallTimeoutMs,
  http,
  now
}: OpenFplGameweekOptions): Promise<FplGameweekResult> {
  const locked = await loadLockedGameweek(database, season, gameweek);

  const entrantResult = await database.query<GameweekEntrant>(
    `select id, base_model, provider, quantization
       from models
      where id = $1 and role = 'entrant'`,
    [entrantId]
  );
  const [entrant] = entrantResult.rows;
  if (entrant === undefined) {
    throw new Error(`${entrantId} is not an Entrant`);
  }

  return playFplGameweek({
    database,
    season,
    gameweek,
    entrant,
    locked,
    apiKey,
    entrantCallTimeoutMs,
    http,
    now
  });
}

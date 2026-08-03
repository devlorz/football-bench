import type { Client } from "pg";
import {
  buildFplTrackContext,
  parseFplTrackContextPool
} from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import {
  openingManagerState,
  rolledOverState,
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
import { MAX_REPAIRS } from "../repairs.js";
import {
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

export async function openFplGameweek({
  database,
  season,
  gameweek,
  entrantId,
  apiKey,
  http,
  now
}: OpenFplGameweekOptions): Promise<void> {
  const { deadline, pool: contextPool } =
    await loadLockedGameweek(database, season, gameweek);

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

  // What the Entrant carries in. Nothing stored yet is what makes a Gameweek
  // an opening, and it is also what decides whether a failed Gameweek can Roll
  // Over: there is no standing Team Sheet to roll onto before the first one.
  const standing = await loadStandingManagerState(database, {
    entrantId,
    season,
    before: gameweek
  });
  const previous = standing === null
    ? openingManagerState()
    : await carriedThroughSilence(database, season, standing, gameweek);

  // Whether this Gameweek's context says anything about who is reading it.
  // It does not while every Entrant is still at its opening seed, and the
  // question is about every Entrant rather than this one: an Entrant that has
  // stored nothing yet would otherwise be handed a context built from someone
  // else's Squad and judged on the empty Squad it actually has.
  const started = await database.query(
    `select 1
       from manager_states
      where season = $1 and gw < $2
      limit 1`,
    [season, gameweek]
  );
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
    started.rows.length === 0
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
    return;
  }
  // The fourth invalid response. The action is discarded whole and the
  // Gameweek Rolls Over onto the Team Sheet already standing (ADR-0004) —
  // never a score of zero, because zero is a punishment large enough to drown
  // out every other signal this track produces.
  //
  // Unless there is nothing standing. An Entrant that never produced a legal
  // opening has no Squad to play, and inventing one is not a thing the rules
  // can do; what happens to the Gameweek then belongs to "Start all nine
  // Entrants together", where the whole opening is committed or none of it is.
  if (outcome.kind === "exhausted" && standing !== null) {
    await storeManagerState(database, {
      entrantId: entrant.id,
      season,
      gameweek,
      state: rolledOverState(previous),
      attemptsUsed: MAX_REPAIRS,
      rolledOver: true,
      predictedAt: outcome.receivedAt
    });
  }
}

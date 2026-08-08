import type { Client } from "pg";
import { eachBounded } from "../bounded-concurrency.js";
import { FPL_PROMPT_VERSION } from "../context/build-fpl-track-context.js";
import type { HttpFetcher } from "../http.js";
import type { GameweekEntrant } from "./ask-for-gameweek-action.js";
import { loadLockedGameweek } from "./fpl-gameweek-context.js";
import {
  loadStartedRoster,
  loadStartingGameweek
} from "./manager-state-store.js";
import {
  playFplGameweek,
  type FplGameweekResult
} from "./open-fpl-gameweek.js";

type Database = Pick<Client, "query">;

export interface RunFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  /** How many Entrants may be called at once. */
  concurrency: number;
  apiKey: string;
  /** How long one Entrant call may take. Unset is the fetcher's default. */
  entrantCallTimeoutMs?: number;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * What one run of a Gameweek came to.
 *
 * `inactive` is a Gameweek the track does not play: one before the Gameweek
 * the operator started it at, or any Gameweek at all while it has not started.
 * It is a result rather than a refusal because the scheduler polls every
 * Gameweek the Season has, and a track that joins at Gameweek 28 must let the
 * twenty-seven before it pass without a word.
 *
 * Otherwise every Entrant on the Season's roster is in exactly one of three
 * lists: `played` stored a Manager State in this run, `standing` already held
 * one and was not called again, and `missing` produced nothing.
 */
export type FplGameweekRun =
  | { kind: "inactive"; gameweek: number }
  | {
    kind: "played";
    gameweek: number;
    played: string[];
    standing: string[];
    missing: string[];
  };

/**
 * One Gameweek for the whole FPL roster, under the deadline the Match track
 * locks at (ADR-0006).
 *
 * The Lock and the pool are read once and handed to every Entrant, because
 * both belong to the Gameweek rather than to whoever is reading them: nine
 * Entrants priced from nine reads of a moving snapshot would be nine Entrants
 * playing slightly different games. Everything after that is per-Entrant — its
 * own standing Manager State, its own context, its own conversation and its
 * own three Repairs — and the only thing the roster shares is the wait.
 *
 * Nothing is gathered and committed together here, unlike the opening. A later
 * Gameweek stores each Manager State as soon as it has one: the Entrants
 * already hold season paths of equal length, and an Entrant that fails this
 * Gameweek has a Gap in it rather than a shorter path. That Gap is what
 * ADR-0011 removes the Gameweek from the record for, and the remedy is another
 * run while the Lock still stands.
 */
export async function runFplGameweek({
  database,
  season,
  gameweek,
  concurrency,
  apiKey,
  entrantCallTimeoutMs,
  http,
  now
}: RunFplGameweekOptions): Promise<FplGameweekRun> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("FPL run concurrency must be a positive integer");
  }

  // The track joins the Season at a Gameweek and runs forward (ADR-0003). It
  // never reaches back: a Gameweek before the start has no Manager State to
  // carry into it for anybody, and back-filling one would invent a season path
  // nobody played.
  const startedAt = await loadStartingGameweek(database, season);
  if (startedAt === null || gameweek < startedAt) {
    return { kind: "inactive", gameweek };
  }

  // Who is on the Season's path: whoever holds a Manager State at the Gameweek
  // the track started at. Read from the opening rather than from `models`,
  // because the opening committed all nine or none and is therefore the record
  // of which nine. A seat added to `models` afterwards never opened, has
  // nothing standing, and is not one of them.
  const roster = await loadStartedRoster(database, season, startedAt);
  const entrantResult = await database.query<GameweekEntrant>(
    `select id, base_model, provider, quantization
       from models
      where id = any($1) and role = 'entrant' and prompt_version = $2
      order by id`,
    [roster, FPL_PROMPT_VERSION]
  );
  const entrants = entrantResult.rows;
  if (entrants.length !== roster.length) {
    const found = new Set(entrants.map(({ id }) => id));
    throw new Error(
      `${roster.filter((id) => !found.has(id)).join(", ")} opened the FPL `
      + `track for ${season} but is no longer an Entrant at Prompt Version `
      + FPL_PROMPT_VERSION
    );
  }

  const locked = await loadLockedGameweek(database, season, gameweek);

  // Nine conversations at once, up to the operator's limit. Each Entrant's own
  // Repairs stay in its own conversation, so the only thing concurrency shares
  // is the wait — which is the point, with one Lock to finish inside.
  const results = new Map<string, FplGameweekResult>();
  await eachBounded(entrants, concurrency, async (entrant) => {
    results.set(entrant.id, await playFplGameweek({
      database,
      season,
      gameweek,
      entrant,
      locked,
      apiKey,
      ...(entrantCallTimeoutMs === undefined ? {} : { entrantCallTimeoutMs }),
      http,
      now
    }));
  });

  const inState = (wanted: FplGameweekResult): string[] => entrants
    .map(({ id }) => id)
    .filter((id) => results.get(id) === wanted);
  return {
    kind: "played",
    gameweek,
    played: inState("played"),
    standing: inState("standing"),
    missing: inState("missing")
  };
}

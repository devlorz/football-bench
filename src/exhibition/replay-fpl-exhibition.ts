import type { Client } from "pg";
import {
  FPL_PROMPT_VERSION,
  spliceManagerState
} from "../context/build-fpl-track-context.js";
import { whileHoldingLockOrRefuse } from "../db/advisory-lock.js";
import {
  openingManagerState,
  type ManagerState
} from "../fpl/apply-gameweek-action.js";
import { storeFplContext } from "../fpl/fpl-gameweek-context.js";
import {
  loadManagerState,
  loadStartingGameweek
} from "../fpl/manager-state-store.js";
import { playGameweekFromContext } from "../fpl/open-fpl-gameweek.js";
import type { HttpFetcher } from "../http.js";
import { loadExhibition } from "./load-exhibition.js";

type Database = Pick<Client, "query">;

/**
 * One FPL replay at a time. Its own key rather than the Match replay's: what
 * two of them would collide over is a Manager State chain, and a Match replay
 * shares none of it — but a second FPL replay would splice the same donor onto
 * the same standing state and pay for the same call.
 */
const FPL_EXHIBITION_REPLAY_LOCK_KEY = 8150531;

export interface ReplayFplExhibitionOptions {
  database: Database;
  season: string;
  /** The `models` row to replay; everything else about it is read from it. */
  exhibitionModelId: string;
  apiKey: string;
  /** How long one call may take (spec 0010). */
  entrantCallTimeoutMs: number;
  http: HttpFetcher;
  now: () => Date;
}

interface ReplayedGameweek {
  gw: number;
  deadline_at: Date;
  settled: boolean;
}

/**
 * Every Gameweek from the one the track opened at onwards, with its Lock and
 * whether it has settled.
 *
 * Nothing is filtered out here, because the run has to see the first Gameweek
 * that has not settled rather than the next one that has: a season path is
 * played in order, and skipping a Gameweek would carry a Manager State across
 * one nobody played.
 *
 * Settled-ness is the presence of stored player points and nothing else,
 * exactly as scoring reads it (migration 0011). A Gameweek the fetch never
 * wrote has not settled, and the replay stops in front of it.
 */
async function gameweeksFrom(
  database: Database,
  season: string,
  startedAt: number
): Promise<ReplayedGameweek[]> {
  const ahead = await database.query<ReplayedGameweek>(
    `select g.gw,
            g.deadline_at,
            exists (
              select 1
                from fpl_player_points p
               where p.season = g.season and p.gw = g.gw
            ) as settled
       from gameweeks g
      where g.season = $1 and g.gw >= $2
      order by g.gw`,
    [season, startedAt]
  );
  return ahead.rows;
}

/**
 * The body one Gameweek is replayed from: the stored context of the first
 * Entrant by id, which is an ordering of text and so alphabetical rather than
 * numeric — determinism is the whole of what is wanted from it.
 *
 * Any seat's would do — from the second Gameweek onwards the nine differ only
 * in the Manager State block, which is the one thing the splice replaces — so
 * the choice is made by a rule rather than by chance, and the same run twice
 * splices the same text.
 *
 * A Settled Gameweek with no Entrant context is a broken record rather than a
 * Gameweek to skip: the chain would have to bridge it with a state nobody
 * played, so the run stops and says which Gameweek it stopped at.
 */
async function donorBody(
  database: Database,
  season: string,
  gameweek: number
): Promise<string> {
  const donor = await database.query<{ body: string }>(
    `select c.body
       from contexts c
       join models m on m.id = c.model_id
      where c.season = $1 and c.gw = $2 and c.track = 'fpl'
        and m.role = 'entrant'
      order by c.model_id
      limit 1`,
    [season, gameweek]
  );
  const body = donor.rows[0]?.body;
  if (body === undefined) {
    throw new Error(
      `Gameweek ${gameweek} of ${season} has settled but holds no Entrant FPL `
      + "context to replay from"
    );
  }
  return body;
}

/**
 * The Exhibition Run's one season path, from the real track's opening Gameweek
 * forward, returning the Gameweeks it now holds a Manager State for.
 *
 * Sequential by construction, and not merely by choice of loop: each Gameweek's
 * context carries the Squad the one before it left behind, so there is nothing
 * here for concurrency to overlap. What the Exhibition changes is which rows are
 * called and when — the prompt is the Entrants' own frozen text with one block
 * replaced, the rules are the same rules, the three Repairs and the Roll Over
 * are the same, and the Lock is not applied because answering after every
 * deadline is the feature (ADR-0032).
 *
 * A Gameweek that produces no Manager State ends the run rather than being
 * carried past. The roster tolerates a silent Gameweek because the other
 * Entrants are waiting on the Lock and the Squad is still on record; here there
 * is nothing to wait for and no reason to invent a state to bridge it, and the
 * next run picks the chain up where this one left it.
 */
async function replaySeasonPath({
  database,
  season,
  exhibitionModelId,
  apiKey,
  entrantCallTimeoutMs,
  http,
  now
}: ReplayFplExhibitionOptions): Promise<number[]> {
  const exhibition = await loadExhibition(
    database,
    exhibitionModelId,
    FPL_PROMPT_VERSION
  );

  // The Gameweek the real track opened at, and the only one an Exhibition may
  // open at: a path that started anywhere else would be a different Season's
  // worth of decisions from the one the roster played.
  const startedAt = await loadStartingGameweek(database, season);
  if (startedAt === null) {
    throw new Error(
      `the FPL track for ${season} never started, so there is nothing for `
      + `${exhibitionModelId} to replay`
    );
  }

  // The empty Squad every Entrant was seeded from at the opening. From the
  // second Gameweek on it is whatever the Gameweek before left behind.
  let previous: ManagerState = openingManagerState();
  const covered: number[] = [];
  for (const { gw, deadline_at: deadline, settled } of
    await gameweeksFrom(database, season, startedAt)) {
    if (!settled) {
      break;
    }
    // A Gameweek already on the chain is a decision already taken, and
    // `manager_states` is insert-only in any case. What resuming saves is the
    // call that would have been made and thrown away.
    const already = await loadManagerState(database, {
      entrantId: exhibition.id,
      season,
      gameweek: gw
    });
    if (already !== null) {
      previous = already;
      covered.push(gw);
      continue;
    }

    // Stored before the call and hashed like every other context, so what the
    // Exhibition Run saw is on record whatever the call comes to — and is
    // comparable, line for line, with what the roster saw the same Gameweek.
    const body = await storeFplContext(
      database,
      season,
      gw,
      exhibition.id,
      spliceManagerState(await donorBody(database, season, gw), previous)
    );
    const state = await playGameweekFromContext({
      database,
      season,
      gameweek: gw,
      caller: exhibition,
      body,
      previous,
      deadline,
      apiKey,
      entrantCallTimeoutMs,
      http,
      now
    });
    if (state === null) {
      break;
    }
    previous = state;
    covered.push(gw);
  }
  return covered;
}

export async function replayFplExhibition(
  options: ReplayFplExhibitionOptions
): Promise<number[]> {
  return whileHoldingLockOrRefuse(
    options.database,
    FPL_EXHIBITION_REPLAY_LOCK_KEY,
    "Another FPL Exhibition replay is running; this one would pay for the "
    + "same calls twice",
    () => replaySeasonPath(options)
  );
}

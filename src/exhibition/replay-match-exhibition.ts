import type { Client } from "pg";
import { whileHoldingLockOrRefuse } from "../db/advisory-lock.js";
import type { HttpFetcher } from "../http.js";
import {
  attemptMatchCalls,
  requireCallConcurrency,
  type MatchCall
} from "../predictions/attempt-match-calls.js";
import { REPAIRABLE_KINDS } from "../predictions/validate-prediction.js";
import { MAX_REPAIRS } from "../repairs.js";
import { loadExhibition } from "./load-exhibition.js";

type Database = Pick<Client, "query">;

/**
 * One replay at a time, whichever row it names. Two of them are not a race
 * over rows — the Prediction each writes is the same one — but over money:
 * both would select the same unanswered Fixtures and pay for the same calls.
 */
const EXHIBITION_REPLAY_LOCK_KEY = 8150530;

export interface ReplayMatchExhibitionOptions {
  database: Database;
  season: string;
  /** The `models` row to replay; everything else about it is read from it. */
  exhibitionModelId: string;
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

interface ReplayedFixture {
  fpl_id: number;
  context_id: number;
  context_body: string;
}

/**
 * Every Gameweek this replay covers: one that holds stored Match contexts and
 * whose Fixtures have all been played.
 *
 * Settled is read off the record rather than off the clock (CONTEXT.md), and on
 * the Match track the record is `fixtures.result` — the same thing scoring
 * reads. A deferred Fixture is excluded because it will never gain a result, so
 * a Gameweek left holding one would otherwise stay unreplayable for the rest of
 * the Season. The run resolves this itself rather than taking a range: an
 * operator naming Gameweeks would be a second opinion about which of them are
 * Settled.
 */
async function settledGameweeks(
  database: Database,
  season: string
): Promise<number[]> {
  const settled = await database.query<{ gw: number }>(
    `select distinct c.gw
       from contexts c
      where c.season = $1
        and c.track = 'match'
        and not exists (
          select 1
            from fixtures f
           where f.season = c.season
             and coalesce(f.locked_in_gw, f.gw) = c.gw
             and not f.deferred
             and f.result is null
        )
      order by c.gw`,
    [season]
  );
  return settled.rows.map(({ gw }) => gw);
}

/**
 * The Fixtures of one Gameweek this Exhibition Run is still owed an ask on,
 * each with the stored context row the roster was shown — the same id its
 * Prediction then cites, so what it saw is verifiable against the hash.
 *
 * Only a Fixture that was played, and whose Lock belongs to this Gameweek. The
 * Lock is read rather than assigned: `attemptMatchCalls` would fill an absent
 * one in, and a replay months later must not be the run that decides which
 * Gameweek a Fixture was locked into (ADR-0013). A Fixture with no result was
 * withdrawn from the calendar and will never gain one, so there is nothing to
 * replay it against.
 *
 * Two things end this run's business with a Fixture, and both are read off the
 * ledger rather than remembered: a Prediction, which is the answer, and an
 * attempt that stopped the asking — one whose cause no Repair addresses, or
 * one that had already used the last Repair. What that leaves is the crash
 * window: a Fixture whose stored failure is repairable and whose Repairs are
 * not spent is still owed the asks it never got, so a re-run finishes it
 * rather than counting an interrupted conversation as a Gap. A recorded Gap is
 * never retried; within a Gameweek the run's own Repairs are the only retries,
 * as on the official track.
 */
async function remainingFixtures(
  database: Database,
  season: string,
  gameweek: number,
  exhibitionModelId: string
): Promise<ReplayedFixture[]> {
  const remaining = await database.query<ReplayedFixture>(
    `select f.fpl_id, c.id as context_id, c.body as context_body
       from fixtures f
       join contexts c
         on c.season = f.season
        and c.track = 'match'
        and c.gw = $2
        and c.fpl_id = f.fpl_id
      where f.season = $1
        and f.locked_in_gw = $2
        and f.result is not null
        and not exists (
          select 1
            from predictions p
           where p.model_id = $3
             and p.season = f.season
             and p.fpl_id = f.fpl_id
        )
        and not exists (
          select 1
            from attempts a
           where a.model_id = $3
             and a.season = f.season
             and a.track = 'match'
             and a.fpl_id = f.fpl_id
             and (
               a.attempt_no = $4
               or not (a.error_kind = any($5))
             )
        )
      order by f.fpl_id`,
    [
      season,
      gameweek,
      exhibitionModelId,
      MAX_REPAIRS,
      [...REPAIRABLE_KINDS]
    ]
  );
  return remaining.rows;
}

/**
 * Every Settled Gameweek's stored Match contexts, put to the named Exhibition
 * row, returning the Gameweeks covered.
 *
 * The call path is the Entrants' own, unchanged (ADR-0032): the same request
 * shape, the same three Repairs, the same failure taxonomy, the same attempt
 * ledger under trigger `'manual'`. What an Exhibition changes is which rows are
 * called and when, never how — its Predictions post-date the deadlines they
 * cover, and that stored fact is what labels them downstream.
 */
async function replayCoveredGameweeks({
  database,
  season,
  exhibitionModelId,
  concurrency,
  apiKey,
  http,
  now
}: ReplayMatchExhibitionOptions): Promise<number[]> {
  const exhibition = await loadExhibition(database, exhibitionModelId);

  const covered: number[] = [];
  for (const gameweek of await settledGameweeks(database, season)) {
    const fixtures = await remainingFixtures(
      database,
      season,
      gameweek,
      exhibition.id
    );
    covered.push(gameweek);
    if (fixtures.length === 0) {
      continue;
    }
    const calls: MatchCall[] = fixtures.map((fixture) => ({
      model_id: exhibition.id,
      base_model: exhibition.base_model,
      provider: exhibition.provider,
      quantization: exhibition.quantization,
      role: exhibition.role,
      fpl_id: fixture.fpl_id,
      context: { id: fixture.context_id, body: fixture.context_body }
    }));
    await attemptMatchCalls({
      database,
      season,
      gameweek,
      concurrency,
      apiKey,
      http,
      now,
      // An Exhibition Run is operator-triggered and nothing about it recurs,
      // so it lands in the ledger as the manual run it is. Its Exhibition
      // identity is the join to `models.role`; a second marker saying the same
      // thing would be a second place to disagree (ADR-0032).
      trigger: "manual",
      calls
    });
  }
  return covered;
}

export async function replayMatchExhibition(
  options: ReplayMatchExhibitionOptions
): Promise<number[]> {
  requireCallConcurrency(options.concurrency);
  return whileHoldingLockOrRefuse(
    options.database,
    EXHIBITION_REPLAY_LOCK_KEY,
    "Another Exhibition replay is running; this one would pay for the same "
    + "calls twice",
    () => replayCoveredGameweeks(options)
  );
}

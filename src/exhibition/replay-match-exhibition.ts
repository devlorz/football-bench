import type { Client } from "pg";
import { whileHoldingLockOrRefuse } from "../db/advisory-lock.js";
import type { HttpFetcher } from "../http.js";
import {
  attemptMatchCalls,
  requireCallConcurrency,
  type MatchCall
} from "../predictions/attempt-match-calls.js";
import { matchPromptOf } from "../predictions/openrouter-entrant.js";
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
  /**
   * The one Competition this run replays. An Exhibition Run is
   * Competition-scoped (ADR-0032): it replays one Competition's stored
   * contexts under that Competition's Prompt Version, so this decides both
   * which rows are read and which the run's writes are filed under.
   */
  competition: string;
  season: string;
  /** The `models` row to replay; everything else about it is read from it. */
  exhibitionModelId: string;
  concurrency: number;
  entrantCallTimeoutMs: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
}

interface ReplayedFixture {
  fixture_id: number;
  context_id: number;
  context_body: string;
}

/**
 * Every Gameweek this replay covers: one that holds stored Match contexts and
 * whose Fixtures have all been played.
 *
 * Settled is read off the record rather than off the clock (CONTEXT.md), and on
 * the Match track the record is `fixtures.result` — the same thing scoring
 * reads.
 *
 * A Fixture that has left the Gameweek it was locked into does not hold that
 * Gameweek open: `deferred` marks exactly that, monotonically, and it is set on
 * every Locked Fixture the feed withdraws (ADR-0024). Waiting for one to come
 * back would leave its Gameweek unreplayable for the rest of the Season, and
 * nothing is lost by not waiting — coverage is decided per Fixture and
 * resolved again on every run, so a withdrawal that is rescheduled and played
 * is picked up by the next one.
 *
 * The run resolves this itself rather than taking a range: an operator naming
 * Gameweeks would be a second opinion about which of them are Settled.
 *
 * One Competition's, throughout. A Gameweek number names a round of one league
 * (ADR-0035), so a select over the Season alone would answer with La Liga's
 * Gameweek 1 and the Premier League's as if they were one — and hold one
 * league's round open on the other's unplayed Fixtures.
 */
async function settledGameweeks(
  database: Database,
  competition: string,
  season: string
): Promise<number[]> {
  const settled = await database.query<{ gw: number }>(
    `select distinct c.gw
       from contexts c
      where c.competition = $1
        and c.season = $2
        and c.track = 'match'
        and not exists (
          select 1
            from fixtures f
           where f.competition = c.competition
             and f.season = c.season
             and coalesce(f.locked_in_gw, f.gw) = c.gw
             and not f.deferred
             and f.result is null
        )
      order by c.gw`,
    [competition, season]
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
 * Gameweek a Fixture was locked into (ADR-0013).
 *
 * A result is what makes a Fixture replayable, and `deferred` is not consulted
 * here on purpose. It records that the Fixture left the Gameweek it was locked
 * into, never that it went unplayed (ADR-0024): a withdrawal FPL rescheduled
 * is played, scored, and answered by the roster under the same Lock, so
 * skipping it would leave the Exhibition short of a Fixture everyone else has.
 * What a missing result means is only "not played yet", and the next run
 * covers it.
 *
 * Two things end this run's business with a Fixture, and both are read off the
 * ledger rather than remembered: a Prediction, which is the answer, and an
 * attempt that stopped the asking — one whose cause no Repair addresses, or
 * one that had already used the last Repair. A Gap so reached is never retried;
 * within a Gameweek the run's own Repairs are the only retries, as on the
 * official track.
 *
 * What that leaves is the crash window: a Fixture whose stored failure is
 * repairable and whose Repairs are not spent was never asked to the end, so it
 * is asked again — from the top, as a new ask with its own three Repairs, as
 * the official Fill asks a Fixture it finds unanswered. Not a continuation:
 * the interrupted conversation's assistant turn and failure reason are in the
 * ledger, but rebuilding a Repair chain out of them is a
 * second way to ask, and one way to ask is worth more here than a refunded
 * budget is. So three Repairs bound one ask and not a Season, a crash hands
 * back three, and the ledger shows it as a second attempt sequence beside the
 * first rather than as a longer one.
 */
async function remainingFixtures(
  database: Database,
  competition: string,
  season: string,
  gameweek: number,
  exhibitionModelId: string
): Promise<ReplayedFixture[]> {
  const remaining = await database.query<ReplayedFixture>(
    `select f.fixture_id, c.id as context_id, c.body as context_body
       from fixtures f
       join contexts c
         on c.competition = f.competition
        and c.season = f.season
        and c.track = 'match'
        and c.gw = $3
        and c.fixture_id = f.fixture_id
      where f.competition = $1
        and f.season = $2
        and f.locked_in_gw = $3
        and f.result is not null
        and not exists (
          select 1
            from predictions p
           where p.model_id = $4
             and p.competition = f.competition
             and p.season = f.season
             and p.fixture_id = f.fixture_id
        )
        and not exists (
          select 1
            from attempts a
           where a.model_id = $4
             and a.competition = f.competition
             and a.season = f.season
             and a.track = 'match'
             and a.fixture_id = f.fixture_id
             and (
               a.attempt_no = $5
               or not (a.error_kind = any($6))
             )
        )
      order by f.fixture_id`,
    [
      competition,
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
 * Every Settled Gameweek of one Competition, its stored Match contexts put to
 * the named Exhibition row, returning the Gameweeks covered.
 *
 * The call path is the Entrants' own, unchanged (ADR-0032): the same request
 * shape, the same three Repairs, the same failure taxonomy, the same attempt
 * ledger under trigger `'manual'`. What an Exhibition changes is which rows are
 * called and when, never how — its Predictions post-date the deadlines they
 * cover, and that stored fact is what labels them downstream.
 */
async function replayCoveredGameweeks({
  database,
  competition,
  season,
  exhibitionModelId,
  concurrency,
  entrantCallTimeoutMs,
  apiKey,
  http,
  now
}: ReplayMatchExhibitionOptions): Promise<number[]> {
  const exhibition = await loadExhibition(
    database,
    exhibitionModelId,
    matchPromptOf(competition).version
  );

  const covered: number[] = [];
  const gameweeks = await settledGameweeks(database, competition, season);
  for (const gameweek of gameweeks) {
    const fixtures = await remainingFixtures(
      database,
      competition,
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
      fixture_id: fixture.fixture_id,
      context: { id: fixture.context_id, body: fixture.context_body }
    }));
    await attemptMatchCalls({
      database,
      competition,
      season,
      gameweek,
      concurrency,
      apiKey,
      entrantCallTimeoutMs,
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

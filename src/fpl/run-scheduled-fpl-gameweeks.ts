import type { Client } from "pg";
import { whileHoldingLock } from "../db/advisory-lock.js";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";
import { loadStartingGameweek } from "./manager-state-store.js";
import { runFplGameweek, type FplGameweekRun } from "./run-fpl-gameweek.js";

type Database = Pick<Client, "query">;

interface DueRun {
  gw: number;
  scheduled_for: Date;
  deadline_at: Date;
}

export interface RunScheduledFplGameweeksOptions {
  database: Database;
  season: string;
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
  onCompletedRun?: (run: CompletedFplRun) => void;
}

/**
 * What a scheduled run came to. Everything `runFplGameweek` can return, plus
 * the one outcome only the scheduler produces: a Gameweek picked up after its
 * Lock, whose ledger is closed without a call being spent on answers that
 * would all be refused on arrival.
 *
 * `locked` is deliberately not `played` with three empty lists. That reads as
 * a Gameweek every Entrant got through, which is the opposite of what it is.
 */
export type FplRunOutcome =
  | FplGameweekRun
  | { kind: "locked"; gameweek: number };

export interface CompletedFplRun {
  gameweek: number;
  outcome: FplRunOutcome;
}

/**
 * Its own key, distinct from the Match scheduler's. The two run side by side
 * on purpose: sharing a lock would make an FPL Gameweek that ran long hold up
 * Predictions that were ready to write.
 */
const FPL_SCHEDULER_LOCK_KEY = 8150529;

/**
 * How far before the Lock the FPL action run starts. The same six hours the
 * Match track's main run uses, against the same deadline (ADR-0006).
 *
 * There is no second, later run to match the Match track's fill. A fill exists
 * there because Predictions are insert-only and a Gap can only be closed by
 * asking again; here, re-running a Gameweek already skips every Entrant that
 * holds it, so the retry this ledger performs on a failed run is the same
 * thing. An operator who wants one before the Lock runs the Gameweek again.
 */
const FPL_RUN_LEAD_TIME = "6 hours";

/**
 * Runs whichever FPL Gameweeks are due, at most one process at a time.
 *
 * The shape below is the Match scheduler's — poll for what is due, mark it
 * started, run it, close it or record why it did not close — and the advisory
 * lock the two share is extracted. The ledger writes are not, and deliberately.
 * They are three literal statements naming `fpl_runs`, and the only way to
 * share them is to interpolate a table name into SQL, which nothing in this
 * repository does; passing the three statements in as arguments would move the
 * duplication rather than remove it. The two ledgers have also stopped being
 * the same rule: this one closes a run only when every Entrant holds the
 * Gameweek or the Lock has passed, which the Match track has no equivalent of.
 *
 * The track joins the Season at a Gameweek and runs forward (ADR-0003), so
 * the starting Gameweek is read first and Gameweeks before it are never
 * scheduled at all. Recording them as completed runs would be worse than
 * noise: a Gameweek marked done before the operator opened the track on it
 * would never be run afterwards.
 */
export async function runScheduledFplGameweeks({
  database,
  season,
  concurrency,
  apiKey,
  http,
  now,
  onCompletedRun
}: RunScheduledFplGameweeksOptions): Promise<CompletedFplRun[]> {
  return whileHoldingLock(database, FPL_SCHEDULER_LOCK_KEY, async () => {
    const startedAt = await loadStartingGameweek(database, season);
    if (startedAt === null) {
      return [];
    }

    const observedAt = now();
    const due = await database.query<DueRun>(
      `select
         g.gw,
         g.deadline_at - $3::interval as scheduled_for,
         g.deadline_at
         from gameweeks g
         left join fpl_runs existing
           on existing.season = g.season
          and existing.gw = g.gw
        where g.season = $1
          and g.gw >= $4
          and g.deadline_at - $3::interval <= $2
          and existing.completed_at is null
          and (
            g.deadline_at > $2
            or existing.season is not null
          )
        order by g.gw`,
      [season, observedAt, FPL_RUN_LEAD_TIME, startedAt]
    );
    const completed: CompletedFplRun[] = [];

    for (const run of due.rows) {
      await database.query(
        `insert into fpl_runs (
           season, gw, scheduled_for, started_at
         ) values ($1, $2, $3, $4)
         on conflict (season, gw) do update
           set scheduled_for = excluded.scheduled_for,
               started_at = excluded.started_at,
               completed_at = null,
               attempt_count = fpl_runs.attempt_count + 1,
               last_error = null`,
        [season, run.gw, run.scheduled_for, observedAt]
      );
      const locked = observedAt.getTime() >= run.deadline_at.getTime();
      let completedRun: CompletedFplRun;
      try {
        // Past the Lock there is nothing left to collect: every answer would
        // be refused on arrival, and what the Entrants did is already in the
        // attempts the run that straddled the Lock recorded. The Gameweek is
        // still walked so the ledger closes rather than sitting open for ever,
        // but it is walked without spending a call on it.
        const outcome: FplRunOutcome = locked
          ? { kind: "locked", gameweek: run.gw }
          : await runFplGameweek({
            database,
            season,
            gameweek: run.gw,
            concurrency,
            apiKey,
            http,
            now
          });
        // A run is finished when every Entrant holds the Gameweek, or when the
        // Lock has passed and no further attempt could succeed. An Entrant
        // that produced nothing does not throw — a provider that never
        // answered is an Entrant with a Gap, not a broken run — so closing the
        // ledger on a clean return would close a Gameweek with a Gap in it and
        // no poll would ever ask again. One Gap takes the Gameweek from
        // everyone (ADR-0011), which is exactly what the remaining polls
        // before the Lock exist to prevent.
        const finished = outcome.kind !== "played"
          || outcome.missing.length === 0;
        await database.query(
          `update fpl_runs
              set completed_at = $3,
                  last_error = null
            where season = $1 and gw = $2`,
          [season, run.gw, finished ? now() : null]
        );
        completedRun = { gameweek: run.gw, outcome };
      } catch (error) {
        // The row keeps `completed_at` null, so the next poll picks this
        // Gameweek up again with its attempt count raised. Whatever the run
        // did commit before it failed is still committed, and the retry skips
        // every Entrant that already holds the Gameweek.
        await database.query(
          `update fpl_runs
              set last_error = $3
            where season = $1 and gw = $2`,
          [season, run.gw, errorText(error)]
        );
        throw error;
      }
      completed.push(completedRun);
      onCompletedRun?.(completedRun);
    }

    return completed;
  });
}

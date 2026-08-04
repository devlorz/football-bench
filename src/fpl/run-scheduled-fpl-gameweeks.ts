import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";
import { loadStartingGameweek } from "./manager-state-store.js";
import { runFplGameweek, type FplGameweekRun } from "./run-fpl-gameweek.js";

type Database = Pick<Client, "query">;

interface DueRun {
  gw: number;
  scheduled_for: Date;
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

export interface CompletedFplRun {
  gameweek: number;
  outcome: FplGameweekRun;
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
  const lock = await database.query<{ acquired: boolean }>(
    "select pg_try_advisory_lock($1) as acquired",
    [FPL_SCHEDULER_LOCK_KEY]
  );
  if (lock.rows[0]?.acquired !== true) {
    return [];
  }

  try {
    const startedAt = await loadStartingGameweek(database, season);
    if (startedAt === null) {
      return [];
    }

    const observedAt = now();
    const due = await database.query<DueRun>(
      `select
         g.gw,
         g.deadline_at - $3::interval as scheduled_for
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
      let completedRun: CompletedFplRun;
      try {
        const outcome = await runFplGameweek({
          database,
          season,
          gameweek: run.gw,
          concurrency,
          apiKey,
          http,
          now
        });
        await database.query(
          `update fpl_runs
              set completed_at = $3,
                  last_error = null
            where season = $1 and gw = $2`,
          [season, run.gw, now()]
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
  } finally {
    await database.query("select pg_advisory_unlock($1)", [
      FPL_SCHEDULER_LOCK_KEY
    ]);
  }
}

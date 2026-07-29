import type { Client } from "pg";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";
import { predictGameweek } from "./predict-gameweek.js";
import type {
  ScheduledPredictionTrigger
} from "./prediction-trigger.js";
import type { GapAlert } from "./gap-alert.js";

type Database = Pick<Client, "query">;

interface DueRun {
  gw: number;
  trigger: ScheduledPredictionTrigger;
  scheduled_for: Date;
}

export interface RunScheduledPredictionsOptions {
  database: Database;
  season: string;
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
  onCompletedRun?: (run: CompletedPredictionRun) => void;
}

export interface CompletedPredictionRun {
  gameweek: number;
  trigger: ScheduledPredictionTrigger;
  gapAlert?: GapAlert;
}

const SCHEDULER_LOCK_KEY = 8150528;

export async function runScheduledPredictions({
  database,
  season,
  concurrency,
  apiKey,
  http,
  now,
  onCompletedRun
}: RunScheduledPredictionsOptions): Promise<CompletedPredictionRun[]> {
  const lock = await database.query<{ acquired: boolean }>(
    "select pg_try_advisory_lock($1) as acquired",
    [SCHEDULER_LOCK_KEY]
  );
  if (lock.rows[0]?.acquired !== true) {
    return [];
  }

  try {
    const observedAt = now();
    const due = await database.query<DueRun>(
      `select
         g.gw,
         run.trigger,
         g.deadline_at - run.lead_time as scheduled_for
         from gameweeks g
         cross join (
           values
             ('main'::text, interval '6 hours'),
             ('fill'::text, interval '2 hours')
         ) as run(trigger, lead_time)
         left join prediction_runs existing
           on existing.season = g.season
          and existing.gw = g.gw
          and existing.trigger = run.trigger
        where g.season = $1
          and g.deadline_at - run.lead_time <= $2
          and existing.completed_at is null
          and (
            g.deadline_at > $2
            or existing.season is not null
          )
        order by scheduled_for, g.gw`,
      [season, observedAt]
    );
    const completed: CompletedPredictionRun[] = [];

    for (const run of due.rows) {
      await database.query(
        `insert into prediction_runs (
           season, gw, trigger, scheduled_for, started_at
         ) values ($1, $2, $3, $4, $5)
         on conflict (season, gw, trigger) do update
           set scheduled_for = excluded.scheduled_for,
               started_at = excluded.started_at,
               completed_at = null,
               attempt_count = prediction_runs.attempt_count + 1,
               last_error = null`,
        [season, run.gw, run.trigger, run.scheduled_for, observedAt]
      );
      let completedRun: CompletedPredictionRun;
      try {
        const gapAlert = await predictGameweek({
          database,
          season,
          gameweek: run.gw,
          concurrency,
          apiKey,
          http,
          now,
          trigger: run.trigger
        });
        await database.query(
          `update prediction_runs
              set completed_at = $4,
                  last_error = null
            where season = $1 and gw = $2 and trigger = $3`,
          [season, run.gw, run.trigger, now()]
        );
        completedRun = {
          gameweek: run.gw,
          trigger: run.trigger,
          ...(gapAlert === null ? {} : { gapAlert })
        };
      } catch (error) {
        await database.query(
          `update prediction_runs
              set last_error = $4
            where season = $1 and gw = $2 and trigger = $3`,
          [season, run.gw, run.trigger, errorText(error)]
        );
        throw error;
      }
      completed.push(completedRun);
      onCompletedRun?.(completedRun);
    }

    return completed;
  } finally {
    await database.query("select pg_advisory_unlock($1)", [
      SCHEDULER_LOCK_KEY
    ]);
  }
}

import type { Client } from "pg";
import { whileHoldingLock } from "../db/advisory-lock.js";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";
import { predictGameweek } from "./predict-gameweek.js";
import type {
  ScheduledPredictionTrigger
} from "./prediction-trigger.js";
import type { GapAlert } from "./gap-alert.js";

type Database = Pick<Client, "query">;

interface DueRun {
  competition: string;
  gw: number;
  trigger: ScheduledPredictionTrigger;
  scheduled_for: Date;
}

export interface RunScheduledPredictionsOptions {
  database: Database;
  season: string;
  concurrency: number;
  apiKey: string;
  entrantCallTimeoutMs: number;
  http: HttpFetcher;
  now: () => Date;
  onCompletedRun?: (run: CompletedPredictionRun) => void;
}

export interface CompletedPredictionRun {
  competition: string;
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
  entrantCallTimeoutMs,
  http,
  now,
  onCompletedRun
}: RunScheduledPredictionsOptions): Promise<CompletedPredictionRun[]> {
  return whileHoldingLock(database, SCHEDULER_LOCK_KEY, async () => {
    const observedAt = now();
    // One query over every active Competition rather than one call per
    // Competition, so the whole Season's due work is ordered by when it was
    // due and not by which league happened to be walked first. Opening a
    // league is the `competitions` insert this joins to, which is the whole of
    // what the join is for: no branch here knows any Competition's name.
    const due = await database.query<DueRun>(
      `select
         g.competition,
         g.gw,
         run.trigger,
         g.deadline_at - run.lead_time as scheduled_for
         from gameweeks g
         join competitions c
           on c.competition = g.competition
          and c.season = g.season
         cross join (
           values
             ('main'::text, interval '6 hours'),
             ('fill'::text, interval '2 hours')
         ) as run(trigger, lead_time)
         left join prediction_runs existing
           on existing.competition = g.competition
          and existing.season = g.season
          and existing.gw = g.gw
          and existing.trigger = run.trigger
        where g.season = $1
          and g.deadline_at - run.lead_time <= $2
          and existing.completed_at is null
          and (
            g.deadline_at > $2
            or existing.season is not null
          )
        order by scheduled_for, g.competition, g.gw`,
      [season, observedAt]
    );
    const completed: CompletedPredictionRun[] = [];

    for (const run of due.rows) {
      await database.query(
        `insert into prediction_runs (
           competition, season, gw, trigger, scheduled_for, started_at
         ) values ($1, $2, $3, $4, $5, $6)
         on conflict (competition, season, gw, trigger) do update
           set scheduled_for = excluded.scheduled_for,
               started_at = excluded.started_at,
               completed_at = null,
               attempt_count = prediction_runs.attempt_count + 1,
               last_error = null`,
        [
          run.competition, season, run.gw, run.trigger, run.scheduled_for,
          observedAt
        ]
      );
      let completedRun: CompletedPredictionRun;
      try {
        const gapAlert = await predictGameweek({
          database,
          competition: run.competition,
          season,
          gameweek: run.gw,
          concurrency,
          apiKey,
          entrantCallTimeoutMs,
          http,
          now,
          trigger: run.trigger
        });
        await database.query(
          `update prediction_runs
              set completed_at = $5,
                  last_error = null
            where competition = $1 and season = $2 and gw = $3
              and trigger = $4`,
          [run.competition, season, run.gw, run.trigger, now()]
        );
        completedRun = {
          competition: run.competition,
          gameweek: run.gw,
          trigger: run.trigger,
          ...(gapAlert === null ? {} : { gapAlert })
        };
      } catch (error) {
        await database.query(
          `update prediction_runs
              set last_error = $5
            where competition = $1 and season = $2 and gw = $3
              and trigger = $4`,
          [run.competition, season, run.gw, run.trigger, errorText(error)]
        );
        throw error;
      }
      completed.push(completedRun);
      onCompletedRun?.(completedRun);
    }

    return completed;
  });
}

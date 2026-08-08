import type { Client } from "pg";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import {
  matchRoster,
  scoreMatchGameweek
} from "../predictions/score-match-gameweek.js";
import { REHEARSED_RESULTS } from "./rehearsed-results.js";
import {
  runDryRun,
  type DryRunResult,
  type RunDryRunOptions
} from "./run-dry-run.js";
import {
  verifyScoringRehearsal,
  type RehearsedMetric,
  type ScoringRehearsalReport,
  type ScoringRehearsalVerdict
} from "./verify-scoring-rehearsal.js";

type Database = Pick<Client, "query">;

/** What a rehearsal came to: the record it wrote, and the verdict on it. */
export interface ScoringRehearsalResult extends ScoringRehearsalVerdict {
  report: ScoringRehearsalReport;
  dryRun: DryRunResult;
}

export interface RehearseScoringOptions extends RunDryRunOptions {
  /** Stamps `scored_at`, exactly as it does for the scheduled job. */
  now: () => Date;
}

async function settleScriptedResults(
  database: Database,
  season: string
): Promise<number> {
  let settled = 0;
  for (const [fplId, [home, away]] of REHEARSED_RESULTS) {
    // The same shape and derivation the fetch stores, so the rehearsal cannot
    // prove the scorer against a result no Season would ever hold.
    const result = await database.query(
      "update fixtures set result = $3 where season = $1 and fpl_id = $2",
      [
        season,
        fplId,
        JSON.stringify({
          home_goals: home,
          away_goals: away,
          outcome: outcomeOf(home, away)
        } satisfies FixtureResult)
      ]
    );
    settled += result.rowCount ?? 0;
  }
  return settled;
}

async function readMetrics(
  database: Database,
  season: string
): Promise<RehearsedMetric[]> {
  const stored = await database.query<{
    entrantId: string;
    gw: number;
    metric: string;
    value: string;
    n: number | null;
    detail: unknown;
  }>(
    `select model_id as "entrantId", gw, metric, value, n, detail
       from scores
      where season = $1 and track = 'match'
      order by model_id, gw, metric`,
    [season]
  );
  return stored.rows.map((row) => ({ ...row, value: Number(row.value) }));
}

/**
 * Runs the whole Match track over archived bytes and then scores it: the dry
 * run writes the Predictions, a scripted result settles every Fixture the
 * Gameweek's Lock owns, and the production scorer writes the record.
 *
 * The results are fabricated because the archive predates them — everything
 * else is the archive and the production path. The caller supplies the
 * database, which is how a rehearsal is kept to a cluster that exists only for
 * the run.
 */
export async function rehearseScoring({
  now,
  ...dryRunOptions
}: RehearseScoringOptions): Promise<ScoringRehearsalResult> {
  const { target, season, gameweek } = dryRunOptions;
  const dryRun = await runDryRun(dryRunOptions);
  const settled = await settleScriptedResults(target, season);
  await scoreMatchGameweek({ database: target, season, gameweek, now });

  const report: ScoringRehearsalReport = {
    settled,
    entrants: await matchRoster(target),
    metrics: await readMetrics(target, season)
  };
  return { report, dryRun, ...verifyScoringRehearsal(report) };
}

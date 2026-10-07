import type { Client } from "pg";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import {
  matchRoster,
  scoreMatchGameweek
} from "../predictions/score-match-gameweek.js";
import { REHEARSED_RESULTS } from "./rehearsed-results.js";
import type { HttpFetcher } from "../http.js";
import { createArchiveReplayFetcher } from "./archive-replay-fetcher.js";
import type { DryRunArchive } from "./load-archive.js";
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
  /** When the replayed bytes were observed, which may be after the Lock. */
  observedAt: Date;
}

export interface RehearseScoringOptions extends RunDryRunOptions {
  /** Stamps `scored_at`, exactly as it does for the scheduled job. */
  now: () => Date;
}

/**
 * The instant the replay is loaded at: just before the Season's first
 * deadline, or the archive's own instant if that is earlier.
 *
 * Not the archive's instant once that is past a deadline. The fetch Locks a
 * Fixture it first sees after its deadline into the next open Gameweek, and in
 * an empty database every played Fixture is seen for the first time, so none
 * would stay in its own Gameweek's Lock. Not just before the rehearsed
 * Gameweek's deadline either: every earlier Gameweek's Fixtures would then
 * Lock into it. Before the first deadline nothing is Locked, and the
 * prediction path Locks the rehearsed Gameweek's Fixtures itself.
 */
function replayInstant({ observedAt, snapshots }: DryRunArchive): Date {
  const bootstrap = snapshots.find(({ source }) => source === "fpl_bootstrap");
  if (bootstrap === undefined) {
    throw new Error("The archive holds no fpl_bootstrap snapshot to replay");
  }
  const { events } = JSON.parse(bootstrap.body) as {
    events: { deadline_time: string }[];
  };
  const first = Math.min(
    ...events.map(({ deadline_time: deadline }) => Date.parse(deadline))
  );
  return new Date(Math.min(observedAt.getTime(), first - 1));
}

/**
 * The archive replay, with each Entrant's answer rewritten to name the Fixture
 * it was asked about — read off the prompt's `Fixture ID:` line, the one the
 * Entrant reads. Every other field is as recorded.
 *
 * An archived answer is one preflight about one Fixture, usually another
 * league's, so replayed as recorded every Entrant Gaps every Fixture and
 * nothing below the behavioural layer is ever scored. The dry run keeps the
 * recorded answer: its expected outcome is built on it.
 */
function answeringTheFixtureAsked(http: HttpFetcher): HttpFetcher {
  return async (url, options) => {
    const response = await http(url, options);
    const asked = /Fixture ID: (\d+)/.exec(options?.body ?? "")?.[1];
    if (asked === undefined) {
      return response;
    }
    try {
      const body = JSON.parse(response.body) as {
        choices: { message: { content: string } }[];
      };
      const message = body.choices[0]!.message;
      message.content = JSON.stringify({
        ...JSON.parse(message.content) as Record<string, unknown>,
        fixture_id: Number(asked)
      });
      return { ...response, body: JSON.stringify(body) };
    } catch {
      // An answer that was never JSON, or never an answer, stays the Gap it
      // was recorded as.
      return response;
    }
  };
}

async function readFixtureIds(
  database: Database,
  season: string,
  column: "gw" | "locked_in_gw",
  gameweek: number
): Promise<number[]> {
  const result = await database.query<{ fixture_id: number }>(
    `select fixture_id from fixtures
      where competition = 'PL' and season = $1 and ${column} = $2
      order by fixture_id`,
    [season, gameweek]
  );
  return result.rows.map(({ fixture_id: fixtureId }) => fixtureId);
}

async function settleScriptedResults(
  database: Database,
  season: string,
  fixtureIds: number[]
): Promise<ScoringRehearsalReport["settled"]> {
  const settled: ScoringRehearsalReport["settled"] = [];
  for (const [index, [home, away]] of REHEARSED_RESULTS.entries()) {
    const fixtureId = fixtureIds[index];
    if (fixtureId === undefined) {
      break;
    }
    // The same shape and derivation the fetch stores, so the rehearsal cannot
    // prove the scorer against a result no Season would ever hold.
    const result = await database.query(
      `update fixtures set result = $3
        where competition = 'PL' and season = $1 and fixture_id = $2`,
      [
        season,
        fixtureId,
        JSON.stringify({
          home_goals: home,
          away_goals: away,
          outcome: outcomeOf(home, away)
        } satisfies FixtureResult)
      ]
    );
    if (result.rowCount === 1) {
      settled.push({ fixtureId, home, away });
    }
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
 * The results are fabricated so the verifier cannot agree with itself, even
 * when the archive holds the real ones — everything else is the archive and
 * the production path. The caller supplies the database, which is how a
 * rehearsal is kept to a cluster that exists only for the run.
 */
export async function rehearseScoring({
  now,
  ...dryRunOptions
}: RehearseScoringOptions): Promise<ScoringRehearsalResult> {
  const { target, archive, season, gameweek } = dryRunOptions;
  const dryRun = await runDryRun({
    ...dryRunOptions,
    loadAt: replayInstant(archive),
    http: answeringTheFixtureAsked(
      createArchiveReplayFetcher(archive.snapshots)
    )
  });
  const locked = await readFixtureIds(target, season, "locked_in_gw", gameweek);
  const settled = await settleScriptedResults(target, season, locked);
  await scoreMatchGameweek({
    database: target, competition: "PL", season, gameweek, now
  });

  const report: ScoringRehearsalReport = {
    scheduled: await readFixtureIds(target, season, "gw", gameweek),
    locked,
    settled,
    entrants: await matchRoster(target, "PL", season, gameweek),
    metrics: await readMetrics(target, season)
  };
  return {
    report,
    dryRun,
    observedAt: archive.observedAt,
    ...verifyScoringRehearsal(report)
  };
}

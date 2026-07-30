import type { Client } from "pg";
import { runDailyFetch } from "../fetch/daily-fetch.js";
import type { GapAlert } from "../predictions/gap-alert.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import { createArchiveReplayFetcher } from "./archive-replay-fetcher.js";
import { resolveDryRunInstant } from "./dry-run-clock.js";
import {
  expectedDryRunOutcome,
  type ExpectedDryRunOutcome
} from "./expected-outcome.js";
import type { ArchivedEntrant, DryRunArchive } from "./load-archive.js";

type Database = Pick<Client, "query">;

export interface RunDryRunOptions {
  target: Database;
  archive: DryRunArchive;
  season: string;
  footballDataSeason: string;
  gameweek: number;
  at: string;
  concurrency: number;
}

export interface DryRunContext {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  body: string;
}

export interface DryRunPhase {
  trigger: "main" | "fill";
  gapAlert: GapAlert | null;
  predictions: number;
}

export interface DryRunResult {
  instant: Date;
  deadline: Date;
  contexts: DryRunContext[];
  phases: DryRunPhase[];
  expected: ExpectedDryRunOutcome;
}

async function seedEntrants(
  database: Database,
  entrants: ArchivedEntrant[]
): Promise<void> {
  for (const entrant of entrants) {
    await database.query(
      `insert into models
         (id, name, base_model, provider, quantization, prompt_version,
          role, config)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [
        entrant.id,
        entrant.name,
        entrant.base_model,
        entrant.provider,
        entrant.quantization,
        entrant.prompt_version,
        entrant.role,
        entrant.config
      ]
    );
  }
}

async function readDeadline(
  database: Database,
  season: string,
  gameweek: number
): Promise<Date> {
  const result = await database.query<{ deadline_at: Date }>(
    "select deadline_at from gameweeks where season = $1 and gw = $2",
    [season, gameweek]
  );
  const deadline = result.rows[0]?.deadline_at;
  if (deadline === undefined) {
    throw new Error(
      `The archive produced no Gameweek ${gameweek} for Season ${season}`
    );
  }
  return deadline;
}

async function readFixtureIds(
  database: Database,
  season: string,
  gameweek: number
): Promise<number[]> {
  const result = await database.query<{ fpl_id: number }>(
    `select fpl_id
       from fixtures
      where season = $1 and coalesce(locked_in_gw, gw) = $2
      order by fpl_id`,
    [season, gameweek]
  );
  return result.rows.map(({ fpl_id: fixtureId }) => fixtureId);
}

async function countPredictions(
  database: Database,
  season: string
): Promise<number> {
  const result = await database.query<{ n: number }>(
    "select count(*)::int as n from predictions where season = $1",
    [season]
  );
  return result.rows[0]?.n ?? 0;
}

async function readContexts(
  database: Database,
  season: string,
  gameweek: number
): Promise<DryRunContext[]> {
  const result = await database.query<DryRunContext>(
    `select c.fpl_id as "fixtureId",
            f.home_team as "homeTeam",
            f.away_team as "awayTeam",
            c.body
       from contexts c
       join fixtures f
         on f.season = c.season and f.fpl_id = c.fpl_id
      where c.season = $1 and c.gw = $2 and c.track = 'match'
      order by c.fpl_id`,
    [season, gameweek]
  );
  return result.rows;
}

/**
 * Rehearses the whole write path against archived bytes in a throwaway
 * database. Loading runs at the archive's own observation instant; the chosen
 * instant governs the prediction path, which is where the Lock decides whether
 * a Prediction may be written at all.
 */
export async function runDryRun({
  target,
  archive,
  season,
  footballDataSeason,
  gameweek,
  at,
  concurrency
}: RunDryRunOptions): Promise<DryRunResult> {
  const http = createArchiveReplayFetcher(archive.snapshots);

  await seedEntrants(target, archive.entrants);
  await runDailyFetch({
    database: target,
    season,
    footballDataSeason,
    http,
    now: () => archive.observedAt
  });

  const deadline = await readDeadline(target, season, gameweek);
  const instant = resolveDryRunInstant(at, deadline);

  // The Fill is rehearsed as well as the main run: it is the newest machinery
  // in the system and the only Gap signal that reaches a person, and this is
  // the one place it can be exercised against real archived data before a
  // deadline exists. Running it second also proves it reuses the stored
  // context rather than building a fresher one.
  const phases: DryRunPhase[] = [];
  for (const trigger of ["main", "fill"] as const) {
    const gapAlert = await predictGameweek({
      database: target,
      season,
      gameweek,
      concurrency,
      apiKey: "dry-run",
      http,
      now: () => instant,
      trigger
    });
    phases.push({
      trigger,
      gapAlert,
      predictions: await countPredictions(target, season)
    });
  }

  const fixtureIds = await readFixtureIds(target, season, gameweek);
  return {
    instant,
    deadline,
    contexts: await readContexts(target, season, gameweek),
    phases,
    expected: expectedDryRunOutcome({
      entrants: archive.entrants.filter(({ role }) => role === "entrant"),
      snapshots: archive.snapshots,
      fixtureIds,
      beforeLock: instant.getTime() < deadline.getTime()
    })
  };
}

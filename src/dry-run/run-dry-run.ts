import type { Client } from "pg";
import type { GapAlert } from "../predictions/gap-alert.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import { createArchiveReplayFetcher } from "./archive-replay-fetcher.js";
import { prepareArchivedGameweek } from "./prepare-archived-gameweek.js";
import { resolveDryRunInstant } from "./dry-run-clock.js";
import {
  expectedDryRunOutcome,
  type ExpectedDryRunOutcome
} from "./expected-outcome.js";
import type { DryRunArchive } from "./load-archive.js";

type Database = Pick<Client, "query">;

export interface RunDryRunOptions {
  target: Database;
  archive: DryRunArchive;
  /**
   * The Competition being rehearsed. Whatever it is, the archive has to hold
   * its snapshots: a dry run replays bytes and invents none.
   */
  competition: string;
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

async function readDeadline(
  database: Database,
  competition: string,
  season: string,
  gameweek: number
): Promise<Date> {
  const result = await database.query<{ deadline_at: Date }>(
    `select deadline_at from gameweeks
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
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
  competition: string,
  season: string,
  gameweek: number
): Promise<number[]> {
  const result = await database.query<{ fixture_id: number }>(
    `select fixture_id
       from fixtures
      where competition = $1 and season = $2
        and coalesce(locked_in_gw, gw) = $3
      order by fixture_id`,
    [competition, season, gameweek]
  );
  return result.rows.map(({ fixture_id: fixtureId }) => fixtureId);
}

async function countPredictions(
  database: Database,
  competition: string,
  season: string
): Promise<number> {
  const result = await database.query<{ n: number }>(
    `select count(*)::int as n from predictions
      where competition = $1 and season = $2`,
    [competition, season]
  );
  return result.rows[0]?.n ?? 0;
}

async function readContexts(
  database: Database,
  competition: string,
  season: string,
  gameweek: number
): Promise<DryRunContext[]> {
  const result = await database.query<DryRunContext>(
    `select c.fixture_id as "fixtureId",
            f.home_team as "homeTeam",
            f.away_team as "awayTeam",
            c.body
       from contexts c
       join fixtures f
         on f.competition = c.competition and f.season = c.season
        and f.fixture_id = c.fixture_id
      where c.competition = $1 and c.season = $2 and c.gw = $3
        and c.track = 'match'
      order by c.fixture_id`,
    [competition, season, gameweek]
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
  competition,
  season,
  footballDataSeason,
  gameweek,
  at,
  concurrency
}: RunDryRunOptions): Promise<DryRunResult> {
  const http = createArchiveReplayFetcher(archive.snapshots);
  await prepareArchivedGameweek({ target, archive, season, footballDataSeason });

  const deadline = await readDeadline(target, competition, season, gameweek);
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
      competition,
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
      predictions: await countPredictions(target, competition, season)
    });
  }

  const fixtureIds = await readFixtureIds(target, competition, season, gameweek);
  return {
    instant,
    deadline,
    contexts: await readContexts(target, competition, season, gameweek),
    phases,
    expected: expectedDryRunOutcome({
      entrants: archive.entrants.filter(({ role }) => role === "entrant"),
      snapshots: archive.snapshots,
      fixtureIds,
      beforeLock: instant.getTime() < deadline.getTime()
    })
  };
}

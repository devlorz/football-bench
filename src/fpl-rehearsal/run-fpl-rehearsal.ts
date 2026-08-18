import type { Client } from "pg";
import { runDailyFetch } from "../fetch/daily-fetch.js";
import { FPL_PROMPT_VERSION } from "../context/build-fpl-track-context.js";
import { runFplGameweek } from "../fpl/run-fpl-gameweek.js";
import { startFplTrack } from "../fpl/start-fpl-track.js";
import type { ArchivedSnapshot } from "../dry-run/archive-replay-fetcher.js";
import { DEFAULT_HTTP_TIMEOUT_MS } from "../http.js";
import { createRehearsalFetcher } from "./rehearsal-fetcher.js";
import {
  readFplRehearsalReport,
  type FplRehearsalReport
} from "./rehearsal-report.js";
import { rehearsedBootstrap } from "./rehearsed-bootstrap.js";
import { rehearsedPoints } from "./rehearsed-points.js";
import {
  ACTS_BEFORE_LOCK_MS,
  OPENING_GAMEWEEK,
  PLAYED_GAMEWEEKS,
  SEATS,
  SETTLING_GAMEWEEK
} from "./rehearsal-seats.js";
import {
  verifyFplRehearsal,
  type FplRehearsalVerdict
} from "./verify-rehearsal.js";
import {
  absent,
  BENCHED_CAPTAIN,
  EVERYONE_PLAYED,
  OPENING,
  REBUILT_STAND_PAT,
  SELL_INTO_A_RISE,
  SOLER_FALL,
  STAND_PAT,
  THREE_AT_THE_BACK,
  WATKINS_RISE,
  withChip,
  type ScriptedPoints
} from "./rehearsal-script.js";

type Database = Pick<Client, "query">;


export interface FplRehearsalArchive {
  /** The archived bootstrap, which every rehearsed day is derived from. */
  bootstrap: string;
  /** Everything else the daily fetch reads, archived byte for byte. */
  snapshots: ArchivedSnapshot[];
}

export interface RunFplRehearsalOptions {
  target: Database;
  archive: FplRehearsalArchive;
  season: string;
  concurrency: number;
}

/** What a rehearsal came to: the record it wrote, and the verdict on it. */
export interface FplRehearsalResult extends FplRehearsalVerdict {
  report: FplRehearsalReport;
}

async function seedSeats(database: Database): Promise<void> {
  for (const { suffix } of SEATS) {
    const baseModel = `rehearsal/${suffix}`;
    await database.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($1, $2, $3, 'rehearsal', $4, 'entrant')
       on conflict (id) do nothing`,
      [`fpl/${suffix}`, baseModel, baseModel, FPL_PROMPT_VERSION]
    );
  }
}

async function readDeadline(
  database: Database,
  season: string,
  gameweek: number
): Promise<Date> {
  const result = await database.query<{ deadline_at: Date }>(
    // The Premier League's row, as every FPL read takes (ADR-0035).
    `select deadline_at from gameweeks
      where competition = 'PL' and season = $1 and gw = $2`,
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

/**
 * Rehearses the whole FPL track against archived bytes in a database the
 * caller has already migrated.
 *
 * Every Gameweek is a day's fetch followed by the roster's actions, in that
 * order and through the same functions the scheduled jobs call — the point is
 * not to reproduce the outcome but to run the production path over inputs
 * nobody has to wait a week for.
 */
export async function runFplRehearsal({
  target,
  archive,
  season,
  concurrency
}: RunFplRehearsalOptions): Promise<FplRehearsalResult> {
  await seedSeats(target);

  const fetchDay = async (
    gameweek: number,
    settled: Record<number, Record<number, ScriptedPoints>>,
    prices: Readonly<Record<number, number>> | undefined,
    at: Date
  ): Promise<void> => {
    const settledGameweeks = Object.keys(settled).map(Number);
    await runDailyFetch({
      database: target,
      season,
      footballDataSeason: season,
      // The rehearsal answers every request from its script and calls no live
      // source, so it holds no token.
      footballDataOrgToken: null,
      http: createRehearsalFetcher({
        season,
        snapshots: [
          ...archive.snapshots,
          {
            source: "fpl_bootstrap",
            body: rehearsedBootstrap({
              archived: archive.bootstrap,
              gameweek,
              settled: settledGameweeks,
              ...prices === undefined ? {} : { prices }
            })
          },
          ...settledGameweeks.map((settledGameweek) => ({
            source: `fpl_live:${season}:${settledGameweek}`,
            body: rehearsedPoints({
              archived: archive.bootstrap,
              scored: settled[settledGameweek]!
            })
          }))
        ],
        answer: () => "no Entrant is called by the fetch"
      }),
      now: () => at
    });
  };

  // The opening. Every rehearsed day before a Lock is fetched a day ahead of
  // it, as the scheduled fetch would have.
  const openingDeadlineDay = new Date("2026-08-20T06:00:00Z");
  await fetchDay(OPENING_GAMEWEEK, {}, undefined, openingDeadlineDay);
  const openingLock = await readDeadline(target, season, OPENING_GAMEWEEK);
  await startFplTrack({
    database: target,
    season,
    gameweek: OPENING_GAMEWEEK,
    concurrency,
    apiKey: "rehearsal",
    entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
    http: createRehearsalFetcher({
      season,
      snapshots: archive.snapshots,
      answer: () => OPENING
    }),
    now: () => new Date(openingLock.getTime() - ACTS_BEFORE_LOCK_MS)
  });

  for (const gameweek of PLAYED_GAMEWEEKS) {
    const lock = await readDeadline(target, season, gameweek);
    await fetchDay(
      gameweek,
      {},
      gameweek === 2 ? { ...WATKINS_RISE, ...SOLER_FALL } : undefined,
      new Date(lock.getTime() - 24 * 3_600_000)
    );
    await runFplGameweek({
      database: target,
      season,
      gameweek,
      concurrency,
      apiKey: "rehearsal",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      http: createRehearsalFetcher({
        season,
        snapshots: archive.snapshots,
        answer: (baseModel, attempt) => {
          const seat = SEATS.find(
            ({ suffix }) => baseModel === `rehearsal/${suffix}`
          );
          if (seat === undefined) {
            throw new Error(`No rehearsed seat answers for ${baseModel}`);
          }
          return gameweek === 2 ? seat.gw2(attempt) : seat.gw3;
        }
      }),
      now: () => new Date(lock.getTime() - ACTS_BEFORE_LOCK_MS)
    });
  }

  // The day every played Gameweek has checked. Saliba and Haaland are left out
  // of Gameweek 3's matchday squads, which is what puts a formation-blocked
  // substitution and an absent captain into the record rather than only into
  // the tests.
  const settlingLock = await readDeadline(target, season, SETTLING_GAMEWEEK);
  await fetchDay(
    SETTLING_GAMEWEEK,
    { 1: EVERYONE_PLAYED, 2: EVERYONE_PLAYED, 3: absent([6, 411]) },
    undefined,
    new Date(settlingLock.getTime() - 24 * 3_600_000)
  );

  const report = await readFplRehearsalReport({ database: target, season });
  return { report, ...verifyFplRehearsal(report) };
}

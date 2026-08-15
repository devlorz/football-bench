import type { Client } from "pg";
import { fetchFootballDataSeason } from "../football-data/fetch-season.js";
import {
  fetchFootballDataOrgCompetition
} from "../football-data-org/fetch-competition.js";
import {
  fetchFplDaily,
  type FetchFplDailyResult
} from "../fpl/fetch-gameweek.js";
import { fetchFplPlayerPoints } from "../fpl/fetch-player-points.js";
import { scoreFplGameweek } from "../fpl/score-fpl-gameweek.js";
import { fetchUnderstatSeasonXg } from "../understat/fetch-season-xg.js";
import {
  fetchSquadChanges,
  type FetchSquadChangesResult
} from "../squad-changes/fetch-squad-changes.js";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";

type Database = Pick<Client, "query">;

export interface RunDailyFetchOptions {
  database: Database;
  season: string;
  footballDataSeason: string;
  /**
   * `null` until a Competition that reads football-data.org is listed. The
   * Premier League has never needed it, so requiring it would have made every
   * existing deployment carry a secret it does not spend; the fetch of a
   * Competition that does need it refuses loudly instead.
   */
  footballDataOrgToken: string | null;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * xG is enrichment, so its outcome is reported rather than thrown: per
 * ADR 0019 an Understat outage degrades the affected form lines to an explicit
 * marker and must never cost a Gameweek of Predictions.
 */
export type DailyXgOutcome =
  | { stored: true }
  | { stored: false; failure: string };

/**
 * Squad Changes are enrichment on the same terms as xG (ADR-0031): a Wikipedia
 * outage degrades the section to a stated absence and must never cost a
 * Gameweek of Predictions. A day outside the render gate stores nothing and is
 * not a failure.
 */
export type DailySquadChangeOutcome =
  | FetchSquadChangesResult
  | { stored: false; failure: string };

export interface DailyFetchResult {
  fpl: FetchFplDailyResult;
  xg: DailyXgOutcome;
  squadChanges: DailySquadChangeOutcome;
}

export class StaleFootballDataSeasonError extends Error {
  constructor(
    public readonly season: string,
    public readonly footballDataSeason: string
  ) {
    const guidance = footballDataSeason === season
      ? "the current feed yielded zero stored matches"
      : `advance FOOTBALL_DATA_SEASON from ${footballDataSeason} to ${season}`;
    super(
      `Current Season ${season} has no stored football-data matches after `
      + `its Gameweek 1 deadline; ${guidance}`
    );
    this.name = "StaleFootballDataSeasonError";
  }
}

async function requireCurrentSeasonMatchesAfterFirstDeadline(
  database: Database,
  season: string,
  footballDataSeason: string,
  observedAt: Date
): Promise<void> {
  // Premier League on both halves, as a literal: the feed this guards is
  // football-data.co.uk's English one, and the Gameweek 1 whose deadline dates
  // the guard has to be the same Competition's. Without it `gw = 1` returns a
  // row per listed Competition and `rows[0]` picks between them by luck, while
  // a Spanish result would answer "the English feed is live".
  const currentSeasonState = await database.query(
    `select
       g.deadline_at,
       exists (
         select 1
           from historical_matches h
          where h.season = g.season and h.competition = 'PL'
       ) as has_matches
       from gameweeks g
      where g.season = $1 and g.gw = 1 and g.competition = 'PL'`,
    [season]
  );
  const state = currentSeasonState.rows[0] as
    | { deadline_at: Date; has_matches: boolean }
    | undefined;
  if (
    state !== undefined
    && observedAt.getTime() >= state.deadline_at.getTime()
    && !state.has_matches
  ) {
    throw new StaleFootballDataSeasonError(season, footballDataSeason);
  }
}

/**
 * Every active Competition except the Premier League, which keeps the FPL API
 * for everything (ADR-0036). The dispatch keys on the Competition code — a
 * field already read — rather than on a mode flag, so opening a league is the
 * `competitions` insert and nothing here.
 */
async function competitionsReadingFootballDataOrg(
  database: Database,
  season: string
): Promise<string[]> {
  const active = await database.query<{ competition: string }>(
    `select competition from competitions
      where season = $1 and competition <> 'PL'
      order by competition`,
    [season]
  );
  return active.rows.map(({ competition }) => competition);
}

export async function runDailyFetch({
  database,
  season,
  footballDataSeason,
  footballDataOrgToken,
  http,
  now
}: RunDailyFetchOptions): Promise<DailyFetchResult> {
  const observedAt = now();
  const errors: unknown[] = [];
  let fpl: FetchFplDailyResult | undefined;
  let footballDataSucceeded = false;
  try {
    fpl = await fetchFplDaily({
      database,
      season,
      http,
      now: () => observedAt
    });
  } catch (error) {
    errors.push(error);
  }
  if (fpl !== undefined) {
    for (const gameweek of fpl.settledGameweeks) {
      try {
        await fetchFplPlayerPoints({ database, season, gameweek, http });
      } catch (error) {
        errors.push(error);
      }
    }
    // Every settled Gameweek's points are stored before any of them is
    // scored, and deliberately in two passes rather than one. A Gameweek's
    // record is folded from the Season's whole path, so scoring Gameweek 3
    // while Gameweek 2's points were still to be written would find a hole
    // where Gameweek 2 should be and skip the lot.
    //
    // This is where the record is written in production. The scorer is a pure
    // function of stored Manager States, attempts and player points, and the
    // daily fetch is where settlement is learnt — so the run that discovers a
    // Gameweek has checked is the run that records what it came to. An
    // unsettled Gameweek, or one an Entrant stored no Manager State for, is
    // skipped by the scorer rather than refused, and a Season whose FPL track
    // has not started scores nothing at all.
    for (const gameweek of fpl.settledGameweeks) {
      try {
        await scoreFplGameweek({ database, season, gameweek });
      } catch (error) {
        errors.push(error);
      }
    }
  }
  // Each Competition's failure is collected rather than thrown, on the same
  // terms as every source above it: one league's dead token must not cost
  // another league its schedule, and the run still fails loudly at the end.
  for (const competition of await competitionsReadingFootballDataOrg(
    database,
    season
  )) {
    try {
      await fetchFootballDataOrgCompetition({
        database,
        competition,
        season,
        apiToken: footballDataOrgToken,
        http,
        now: () => observedAt
      });
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await fetchFootballDataSeason({
      database,
      season: footballDataSeason,
      http
    });
    footballDataSucceeded = true;
  } catch (error) {
    errors.push(error);
  }
  if (footballDataSucceeded) {
    try {
      await requireCurrentSeasonMatchesAfterFirstDeadline(
        database,
        season,
        footballDataSeason,
        observedAt
      );
    } catch (error) {
      errors.push(error);
    }
  }
  let xg: DailyXgOutcome;
  try {
    await fetchUnderstatSeasonXg({ database, season, http });
    xg = { stored: true };
  } catch (error) {
    xg = { stored: false, failure: errorText(error) };
  }
  let squadChanges: DailySquadChangeOutcome;
  try {
    squadChanges = await fetchSquadChanges({
      database,
      season,
      http,
      now: () => observedAt
    });
  } catch (error) {
    squadChanges = { stored: false, failure: errorText(error) };
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Daily fetch failed for multiple sources");
  }
  if (fpl === undefined) {
    throw new Error("Daily FPL fetch completed without a result");
  }
  return { fpl, xg, squadChanges };
}

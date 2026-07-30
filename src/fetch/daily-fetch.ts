import type { Client } from "pg";
import { fetchFootballDataSeason } from "../football-data/fetch-season.js";
import {
  fetchFplDaily,
  type FetchFplDailyResult
} from "../fpl/fetch-gameweek.js";
import { fetchUnderstatSeasonXg } from "../understat/fetch-season-xg.js";
import { errorText } from "../error-text.js";
import type { HttpFetcher } from "../http.js";

type Database = Pick<Client, "query">;

export interface RunDailyFetchOptions {
  database: Database;
  season: string;
  footballDataSeason: string;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * xG is enrichment, so its outcome is reported rather than thrown: per
 * ADR 0017 an Understat outage degrades the affected form lines to an explicit
 * marker and must never cost a Gameweek of Predictions.
 */
export type DailyXgOutcome =
  | { stored: true }
  | { stored: false; failure: string };

export interface DailyFetchResult {
  fpl: FetchFplDailyResult;
  xg: DailyXgOutcome;
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
  const currentSeasonState = await database.query(
    `select
       g.deadline_at,
       exists (
         select 1
           from historical_matches h
          where h.season = g.season
       ) as has_matches
       from gameweeks g
      where g.season = $1 and g.gw = 1`,
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

export async function runDailyFetch({
  database,
  season,
  footballDataSeason,
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
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Daily fetch failed for multiple sources");
  }
  if (fpl === undefined) {
    throw new Error("Daily FPL fetch completed without a result");
  }
  return { fpl, xg };
}

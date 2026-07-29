import type { Client } from "pg";
import { fetchFootballDataSeason } from "../football-data/fetch-season.js";
import {
  fetchFplDaily,
  type FetchFplDailyResult
} from "../fpl/fetch-gameweek.js";
import type { HttpFetcher } from "../http.js";

type Database = Pick<Client, "query">;

export interface RunDailyFetchOptions {
  database: Database;
  season: string;
  footballDataSeason: string;
  http: HttpFetcher;
  now: () => Date;
}

export interface DailyFetchResult {
  fpl: FetchFplDailyResult;
}

export async function runDailyFetch({
  database,
  season,
  footballDataSeason,
  http,
  now
}: RunDailyFetchOptions): Promise<DailyFetchResult> {
  const errors: unknown[] = [];
  let fpl: FetchFplDailyResult | undefined;
  try {
    fpl = await fetchFplDaily({
      database,
      season,
      http,
      now
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
  } catch (error) {
    errors.push(error);
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
  return { fpl };
}

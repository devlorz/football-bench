import { resolveDryRunInstant } from "../dry-run/dry-run-clock.js";
import { SEASON_ROSTER_SIZE } from "../season-roster.js";
import {
  parseAttemptTrigger,
  type AttemptTrigger
} from "../predictions/prediction-trigger.js";

export interface FetchJobConfig {
  databaseUrl: string;
  season: string;
  gameweek: number;
}

export interface HistoricalFetchJobConfig {
  databaseUrl: string;
  season: string;
}

export interface DailyFetchJobConfig {
  databaseUrl: string;
  season: string;
  footballDataSeason: string;
}

/**
 * What any scheduled run that calls Entrants needs: a database, a Season, a
 * key to call with, and a bound on how many are called at once. It belongs to
 * neither track — both have Entrants, and both resolve their Gameweek from the
 * stored deadlines rather than from the environment, so neither reads one.
 *
 * The two track names below stay, because which job reads a config is worth
 * saying at every call site. What they must not be is one defined in terms of
 * the other: the shared reader returning `ScheduledPredictJobConfig` made the
 * FPL track's configuration a kind of the Match track's, which is a
 * relationship neither has to the other.
 */
export interface ScheduledEntrantJobConfig {
  databaseUrl: string;
  season: string;
  concurrency: number;
  openRouterApiKey: string;
}

export type ScheduledPredictJobConfig = ScheduledEntrantJobConfig;

export interface PredictJobConfig extends ScheduledEntrantJobConfig {
  gameweek: number;
  trigger: AttemptTrigger;
}

export type ScheduledFplJobConfig = ScheduledEntrantJobConfig;

export interface FplStartJobConfig extends ScheduledEntrantJobConfig {
  gameweek: number;
}

export interface PreviewJobConfig extends DailyFetchJobConfig {
  gameweek: number;
  concurrency: number;
  openRouterApiKey: string;
}

export interface DryRunJobConfig extends DailyFetchJobConfig {
  gameweek: number;
  at: string;
  concurrency: number;
}

export interface PreflightJobConfig {
  databaseUrl: string;
  season: string;
  fixtureId: number;
  expectedEntrantCount: number;
  openRouterApiKey: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredSeason(environment: NodeJS.ProcessEnv): string {
  const season = required(environment, "SEASON");
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("SEASON must use YYYY-YY format");
  }
  return season;
}

export function readHistoricalFetchJobConfig(
  environment: NodeJS.ProcessEnv
): HistoricalFetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = required(environment, "HISTORICAL_SEASON");
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("HISTORICAL_SEASON must use YYYY-YY format");
  }
  return { databaseUrl, season };
}

export function readDailyFetchJobConfig(
  environment: NodeJS.ProcessEnv
): DailyFetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const footballDataSeason = required(environment, "FOOTBALL_DATA_SEASON");
  if (!/^\d{4}-\d{2}$/.test(footballDataSeason)) {
    throw new Error("FOOTBALL_DATA_SEASON must use YYYY-YY format");
  }
  return { databaseUrl, season, footballDataSeason };
}

export function readFetchJobConfig(
  environment: NodeJS.ProcessEnv
): FetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const gameweekText = required(environment, "GAMEWEEK");
  const gameweek = Number(gameweekText);

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("GAMEWEEK must be an integer from 1 to 38");
  }

  return { databaseUrl, season, gameweek };
}

export function readPredictJobConfig(
  environment: NodeJS.ProcessEnv
): PredictJobConfig {
  const trigger = parseAttemptTrigger(environment.PREDICTION_TRIGGER);

  return {
    ...readScheduledPredictJobConfig(environment),
    gameweek: readFetchJobConfig(environment).gameweek,
    trigger
  };
}

/**
 * Reads a `ScheduledEntrantJobConfig` for whichever track asks for one.
 *
 * The concurrency variable is a parameter because the two must stay separate:
 * the tracks share a deadline (ADR-0006) and nothing else, and the FPL prompt
 * is several times the Match prompt's size, so one number for both would tie
 * two costs that have no reason to move together. It is the only thing that
 * differs, which is why everything else is read once here.
 */
function readScheduledJobConfig(
  environment: NodeJS.ProcessEnv,
  concurrencyVariable: string,
  concurrencyDefault: number
): ScheduledEntrantJobConfig {
  const concurrency = Number(
    environment[concurrencyVariable]?.trim() || String(concurrencyDefault)
  );
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`${concurrencyVariable} must be a positive integer`);
  }

  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    season: requiredSeason(environment),
    concurrency,
    openRouterApiKey: required(environment, "OPENROUTER_API_KEY")
  };
}

export function readScheduledPredictJobConfig(
  environment: NodeJS.ProcessEnv
): ScheduledPredictJobConfig {
  return readScheduledJobConfig(environment, "PREDICT_CONCURRENCY", 9);
}

/**
 * The FPL action run's configuration, which resolves its Gameweek from the
 * stored deadlines exactly as the scheduled Prediction run does.
 *
 * Its own concurrency knob rather than `PREDICT_CONCURRENCY`. The two runs
 * share a deadline (ADR-0006) and are scheduled apart on purpose, and the FPL
 * prompt is several times the Match prompt's size — one number for both would
 * tie two costs that have no reason to move together.
 */
export function readScheduledFplJobConfig(
  environment: NodeJS.ProcessEnv
): ScheduledFplJobConfig {
  return readScheduledJobConfig(
    environment,
    "FPL_CONCURRENCY",
    SEASON_ROSTER_SIZE
  );
}

/**
 * The same, plus the Gameweek the operator chooses to start the track at.
 * That Gameweek is never inferred (ADR-0003): the track joins the Season
 * where the operator says and runs forward from there.
 */
export function readFplStartJobConfig(
  environment: NodeJS.ProcessEnv
): FplStartJobConfig {
  return {
    ...readScheduledFplJobConfig(environment),
    gameweek: readFetchJobConfig(environment).gameweek
  };
}

export function readDryRunJobConfig(
  environment: NodeJS.ProcessEnv
): DryRunJobConfig {
  const { databaseUrl, season, footballDataSeason } =
    readDailyFetchJobConfig(environment);
  const { gameweek } = readFetchJobConfig(environment);
  const at = environment.DRY_RUN_AT?.trim() || "deadline-6h";
  const concurrency = Number(environment.PREDICT_CONCURRENCY?.trim() || "9");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }
  // Read now so an unusable instant fails before a cluster is built for it.
  resolveDryRunInstant(at, new Date(0));

  return {
    databaseUrl,
    season,
    footballDataSeason,
    gameweek,
    at,
    concurrency
  };
}

export function readPreflightJobConfig(
  environment: NodeJS.ProcessEnv
): PreflightJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const fixtureId = Number(required(environment, "FIXTURE_ID"));
  const expectedEntrantCount = Number(
    required(environment, "EXPECTED_ENTRANT_COUNT")
  );
  const openRouterApiKey = required(environment, "OPENROUTER_API_KEY");

  if (!Number.isInteger(fixtureId) || fixtureId < 1) {
    throw new Error("FIXTURE_ID must be a positive integer");
  }
  if (!Number.isInteger(expectedEntrantCount) || expectedEntrantCount < 1) {
    throw new Error("EXPECTED_ENTRANT_COUNT must be a positive integer");
  }

  return {
    databaseUrl,
    season,
    fixtureId,
    expectedEntrantCount,
    openRouterApiKey
  };
}

/**
 * The preview calls the real roster, so it needs the key the prediction job
 * uses. It writes to a throwaway cluster, so it needs no instant: the run is
 * always before the Lock it builds for itself.
 */
export function readPreviewJobConfig(
  environment: NodeJS.ProcessEnv
): PreviewJobConfig {
  const { databaseUrl, season, footballDataSeason } =
    readDailyFetchJobConfig(environment);
  const { gameweek } = readFetchJobConfig(environment);
  const concurrency = Number(environment.PREDICT_CONCURRENCY?.trim() || "9");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }
  const openRouterApiKey = required(environment, "OPENROUTER_API_KEY");

  return {
    databaseUrl,
    season,
    footballDataSeason,
    gameweek,
    concurrency,
    openRouterApiKey
  };
}

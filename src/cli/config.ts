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

export interface ScheduledPredictJobConfig {
  databaseUrl: string;
  season: string;
  concurrency: number;
  openRouterApiKey: string;
}

export interface PredictJobConfig extends ScheduledPredictJobConfig {
  gameweek: number;
  trigger: AttemptTrigger;
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

export function readScheduledPredictJobConfig(
  environment: NodeJS.ProcessEnv
): ScheduledPredictJobConfig {
  const concurrency = Number(
    environment.PREDICT_CONCURRENCY?.trim() || "9"
  );
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }

  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    season: requiredSeason(environment),
    concurrency,
    openRouterApiKey: required(environment, "OPENROUTER_API_KEY")
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

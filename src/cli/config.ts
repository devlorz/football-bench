export interface FetchJobConfig {
  databaseUrl: string;
  season: string;
  gameweek: number;
}

export interface PredictJobConfig extends FetchJobConfig {
  concurrency: number;
  openRouterApiKey: string;
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
  const concurrency = Number(environment.PREDICT_CONCURRENCY ?? "9");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }

  return {
    ...readFetchJobConfig(environment),
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

export interface FetchJobConfig {
  databaseUrl: string;
  season: string;
  gameweek: number;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function readFetchJobConfig(
  environment: NodeJS.ProcessEnv
): FetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = required(environment, "SEASON");
  const gameweekText = required(environment, "GAMEWEEK");
  const gameweek = Number(gameweekText);

  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("SEASON must use YYYY-YY format");
  }
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("GAMEWEEK must be an integer from 1 to 38");
  }

  return { databaseUrl, season, gameweek };
}

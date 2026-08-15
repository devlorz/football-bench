import pg from "pg";
import { fetchFootballDataSeason } from "../football-data/fetch-season.js";
import { nodeHttpFetcher } from "../http.js";
import { readHistoricalFetchJobConfig } from "./config.js";

const { Client } = pg;
const config = readHistoricalFetchJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await fetchFootballDataSeason({
    database,
    competition: config.competition,
    season: config.season,
    http: nodeHttpFetcher
  });
} finally {
  await database.end();
}

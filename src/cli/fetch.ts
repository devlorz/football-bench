import pg from "pg";
import { runDailyFetch } from "../fetch/daily-fetch.js";
import { nodeHttpFetcher } from "../http.js";
import { readDailyFetchJobConfig } from "./config.js";

const { Client } = pg;
const config = readDailyFetchJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await runDailyFetch({
    database,
    season: config.season,
    footballDataSeason: config.footballDataSeason,
    http: nodeHttpFetcher,
    now: () => new Date()
  });
} finally {
  await database.end();
}

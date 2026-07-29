import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import { readPredictJobConfig } from "./config.js";

const { Client } = pg;
const config = readPredictJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await predictGameweek({
    database,
    season: config.season,
    gameweek: config.gameweek,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher,
    now: () => new Date(),
    trigger: config.trigger
  });
} finally {
  await database.end();
}

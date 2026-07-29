import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { runScheduledPredictions } from "../predictions/run-scheduled-predictions.js";
import { readScheduledPredictJobConfig } from "./config.js";

const { Client } = pg;
const config = readScheduledPredictJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const runs = await runScheduledPredictions({
    database,
    season: config.season,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher,
    now: () => new Date()
  });
  for (const run of runs) {
    console.log(
      `Completed ${run.trigger} Prediction run for Gameweek ${run.gameweek}`
    );
  }
} finally {
  await database.end();
}

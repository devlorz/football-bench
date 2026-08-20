import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { runScheduledPredictions } from "../predictions/run-scheduled-predictions.js";
import { readScheduledPredictJobConfig } from "./config.js";
import { writeCompletedRunAlert } from "./write-gap-alert.js";

const { Client } = pg;
const config = readScheduledPredictJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await runScheduledPredictions({
    database,
    season: config.season,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    entrantCallTimeoutMs: config.entrantCallTimeoutMs,
    http: nodeHttpFetcher,
    now: () => new Date(),
    onCompletedRun: (run) => {
      console.log(
        `Completed ${run.trigger} Prediction run for ${run.competition} `
        + `Gameweek ${run.gameweek}`
      );
      writeCompletedRunAlert(run);
    }
  });
} finally {
  await database.end();
}

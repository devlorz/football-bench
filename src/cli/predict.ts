import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import { readPredictJobConfig } from "./config.js";
import { writeGapAlert } from "./write-gap-alert.js";

const { Client } = pg;
const config = readPredictJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const gapAlert = await predictGameweek({
    database,
    // The hand-run Prediction is the Premier League's. The scheduled run walks
    // every active Competition; this one names the Gameweek an operator typed,
    // and a Gameweek number means nothing until a Competition is named too.
    competition: "PL",
    season: config.season,
    gameweek: config.gameweek,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher,
    now: () => new Date(),
    trigger: config.trigger
  });
  if (gapAlert !== null) {
    writeGapAlert(gapAlert);
  }
} finally {
  await database.end();
}

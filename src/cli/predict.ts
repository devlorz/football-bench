import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import { readPredictJobConfig } from "./config.js";
import { writeGapAlert } from "./write-gap-alert.js";

const { Client } = pg;
const config = readPredictJobConfig(process.env);
// A Gameweek number means nothing until a Competition is named too, and the
// scheduled run names one per active Competition. This one is the operator's,
// so it takes the name from them — defaulted to the Premier League, which is
// what every runbook that types this command already means, and required to be
// stated whenever it is anything else.
//
// Unlike the backfill's, this default is safe to have: a wrong Competition here
// predicts a Gameweek that is either empty, which prints Fixtures 0 and spends
// nothing, or already answered, which the insert-only Predictions refuse.
const competition = process.env.COMPETITION?.trim() || "PL";
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const gapAlert = await predictGameweek({
    database,
    competition,
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

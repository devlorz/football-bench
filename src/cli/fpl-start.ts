import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { startFplTrack } from "../fpl/start-fpl-track.js";
import { readFplStartJobConfig } from "./config.js";

const { Client } = pg;
const config = readFplStartJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const opening = await startFplTrack({
    database,
    season: config.season,
    gameweek: config.gameweek,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    entrantCallTimeoutMs: config.entrantCallTimeoutMs,
    http: nodeHttpFetcher,
    now: () => new Date()
  });

  if (opening.missing.length > 0) {
    // Nothing was stored: the track starts for all ten or for none. Every
    // attempt is on record, and the operator decides from those whether to
    // try this Gameweek again or the next one.
    console.error(
      `The FPL track did not start at Gameweek ${opening.gameweek}: `
      + `${opening.missing.join(", ")} produced no legal opening action`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `The FPL track started at Gameweek ${opening.gameweek} `
      + "for every Entrant"
    );
  }
} finally {
  await database.end();
}

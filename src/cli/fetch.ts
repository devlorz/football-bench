import pg from "pg";
import { runDailyFetch } from "../fetch/daily-fetch.js";
import { nodeHttpFetcher } from "../http.js";
import { readDailyFetchJobConfig } from "./config.js";

const { Client } = pg;
const config = readDailyFetchJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const result = await runDailyFetch({
    database,
    season: config.season,
    footballDataSeason: config.footballDataSeason,
    http: nodeHttpFetcher,
    now: () => new Date()
  });
  // Loud on the day it happens, rather than as a half-empty column at
  // season's end. The run itself is deliberately still a success.
  if (!result.xg.stored) {
    console.warn(
      `xG enrichment unavailable for ${config.season}; form lines will read `
      + `"xG unavailable" until the next successful fetch: ${result.xg.failure}`
    );
  }
  // A day outside the render gate stores nothing and says nothing; only a
  // failure inside it is worth a line.
  if (!result.squadChanges.stored && "failure" in result.squadChanges) {
    console.warn(
      `Squad Changes unavailable for ${config.season}; the section will state `
      + `its absence until the next successful fetch: `
      + result.squadChanges.failure
    );
  }
} finally {
  await database.end();
}

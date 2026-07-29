import pg from "pg";
import { fetchFplGameweek } from "../fpl/fetch-gameweek.js";
import { nodeHttpFetcher } from "../http.js";
import { readFetchJobConfig } from "./config.js";

const { Client } = pg;
const config = readFetchJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await fetchFplGameweek({
    database,
    season: config.season,
    gameweek: config.gameweek,
    http: nodeHttpFetcher,
    now: () => new Date()
  });
} finally {
  await database.end();
}

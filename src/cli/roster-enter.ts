import pg from "pg";
import { enterSeasonRoster } from "../season-roster.js";
import { readScoreJobConfig } from "./config.js";

const { Client } = pg;
// The same two fields the scoring job needs: a database, and the Season whose
// Prompt Version the seats are entered under.
const config = readScoreJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const entered = await enterSeasonRoster(database, config.season);
  console.log(`Entered ${entered.length} Entrants: ${entered.join(", ")}`);
} finally {
  await database.end();
}

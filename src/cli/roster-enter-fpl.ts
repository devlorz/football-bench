import pg from "pg";
import { enterFplRoster } from "../season-roster.js";
import { readScoreJobConfig } from "./config.js";

const { Client } = pg;
// The same two fields the match door needs, and no Competition: the FPL track
// has none, so there is no `competitions` table to loop.
const config = readScoreJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const entered = await enterFplRoster(database, config.season);
  console.log(`Entered ${entered.length} Entrants: ${entered.join(", ")}`);
} finally {
  await database.end();
}

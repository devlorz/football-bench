import pg from "pg";
import { scoreMatchSeason } from "../predictions/score-match-gameweek.js";
import { readScoreJobConfig } from "./config.js";

const { Client } = pg;
const config = readScoreJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const gameweeks = await scoreMatchSeason({
    database,
    season: config.season,
    now: () => new Date()
  });
  console.log(
    gameweeks.length === 0
      ? `No Gameweek of ${config.season} owns a Lock yet; nothing to score`
      : `Scored ${config.season} Gameweeks ${gameweeks.join(", ")}`
  );
} finally {
  await database.end();
}

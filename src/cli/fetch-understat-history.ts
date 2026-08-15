import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { fetchUnderstatSeasonXg } from "../understat/fetch-season-xg.js";
import { readHistoricalFetchJobConfig } from "./config.js";

// A one-off backfill of a single named Season's xG, run at setup so the
// five-match form window can cross the season boundary in the opening
// Gameweeks. The daily fetch keeps the current Season current; nothing deeper
// than the prior Season has anywhere to appear in the context.
const { Client } = pg;
const config = readHistoricalFetchJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await fetchUnderstatSeasonXg({
    database,
    competition: config.competition,
    season: config.season,
    http: nodeHttpFetcher
  });
  const stored = await database.query<{ count: number }>(
    `select count(*)::int as count from understat_match_xg
      where competition = $1 and season = $2`,
    [config.competition, config.season]
  );
  console.log(
    `Stored xG for ${stored.rows[0]?.count ?? 0} ${config.competition} `
      + `${config.season} matches`
  );
} finally {
  await database.end();
}

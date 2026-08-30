import pg from "pg";
import { fetchFplDaily } from "../fpl/fetch-gameweek.js";
import { fetchFplPlayerPoints } from "../fpl/fetch-player-points.js";
import { scoreFplGameweek } from "../fpl/score-fpl-gameweek.js";
import { nodeHttpFetcher } from "../http.js";
import { readScoreJobConfig } from "./config.js";

/** Unset scores every Gameweek fetchFplDaily finds settled. */
function readGameweekArg(environment: NodeJS.ProcessEnv): number | null {
  const text = environment.GAMEWEEK?.trim();
  if (!text) {
    return null;
  }
  const gameweek = Number(text);
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("GAMEWEEK must be an integer from 1 to 38");
  }
  return gameweek;
}

const { Client } = pg;
const config = readScoreJobConfig(process.env);
const requestedGameweek = readGameweekArg(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const { settledGameweeks: detected } = await fetchFplDaily({
    database,
    season: config.season,
    http: nodeHttpFetcher,
    now: () => new Date()
  });

  // A caller-named Gameweek is scored even if fetchFplDaily has not itself
  // marked it settled -- a backfill or a repair asks for one by number
  // rather than waiting on that detection.
  const settledGameweeks = requestedGameweek === null
    ? detected
    : [...new Set([...detected, requestedGameweek])].sort((a, b) => a - b);

  if (settledGameweeks.length === 0) {
    console.log(`No FPL Gameweek of ${config.season} has settled; nothing to score`);
  }

  // Every settled Gameweek's points are stored before any of them is scored,
  // the same order daily-fetch keeps: scoring Gameweek 3 while Gameweek 2's
  // points were still to be written would find a hole where 2 should be.
  for (const gameweek of settledGameweeks) {
    await fetchFplPlayerPoints({ database, season: config.season, gameweek, http: nodeHttpFetcher });
  }
  for (const gameweek of settledGameweeks) {
    await scoreFplGameweek({ database, season: config.season, gameweek });
    console.log(`Scored FPL ${config.season} Gameweek ${gameweek}`);
  }
} finally {
  await database.end();
}

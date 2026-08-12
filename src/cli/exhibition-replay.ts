import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { replayMatchExhibition } from "../exhibition/replay-match-exhibition.js";
import { readExhibitionJobConfig } from "./config.js";

const { Client } = pg;
const config = readExhibitionJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const gameweeks = await replayMatchExhibition({
    database,
    season: config.season,
    exhibitionModelId: config.exhibitionModelId,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher,
    now: () => new Date()
  });
  console.log(
    gameweeks.length === 0
      ? `${config.season} holds no Settled Gameweek for `
        + `${config.exhibitionModelId} to replay.`
      : `${config.exhibitionModelId} covered Settled Gameweeks `
        + `${gameweeks.join(", ")} of the ${config.season} Match track.`
  );
} finally {
  await database.end();
}

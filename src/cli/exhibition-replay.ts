import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { replayFplExhibition } from "../exhibition/replay-fpl-exhibition.js";
import { replayMatchExhibition } from "../exhibition/replay-match-exhibition.js";
import {
  readExhibitionJobConfig,
  readExhibitionTrack,
  readFplExhibitionJobConfig
} from "./config.js";

const { Client } = pg;

/**
 * One entry point for both tracks, chosen by `TRACK`. The two replays share the
 * operator, the model row and the reason for running — what differs is which
 * record they walk — so a second command would be a second place to learn that
 * an Exhibition Run exists.
 */
const track = readExhibitionTrack(process.env);
const config = track === "fpl"
  ? readFplExhibitionJobConfig(process.env)
  : readExhibitionJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  // The call timeout is the FPL track's alone (spec 0010), so it is also what
  // tells the two configurations apart without a second reading of `TRACK`.
  if ("entrantCallTimeoutMs" in config) {
    const gameweeks = await replayFplExhibition({
      database,
      season: config.season,
      exhibitionModelId: config.exhibitionModelId,
      apiKey: config.openRouterApiKey,
      entrantCallTimeoutMs: config.entrantCallTimeoutMs,
      http: nodeHttpFetcher,
      now: () => new Date()
    });
    console.log(
      gameweeks.length === 0
        ? `${config.exhibitionModelId} played no Gameweek of the `
          + `${config.season} FPL track.`
        : `${config.exhibitionModelId} holds Gameweeks ${gameweeks.join(", ")} `
          + `of the ${config.season} FPL track.`
    );
  } else {
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
  }
} finally {
  await database.end();
}

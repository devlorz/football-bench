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
const config = readExhibitionTrack(process.env) === "fpl"
  ? { track: "fpl" as const, ...readFplExhibitionJobConfig(process.env) }
  : { track: "match" as const, ...readExhibitionJobConfig(process.env) };
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  // The track travels with the configuration rather than being read off the
  // shape of it: the call timeout used to tell the two apart, and ticket 0023
  // gave it to both tracks.
  if (config.track === "fpl") {
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
      // An Exhibition Run is one Competition's (ADR-0032), and this is the
      // operator's — defaulted to the Premier League the way the prediction
      // command's is, and stated whenever it is anything else. A wrong one
      // here spends nothing: the seat is loaded at this Competition's Prompt
      // Version, so a La Liga row named under `PL` is refused before the
      // first call.
      competition: process.env.COMPETITION?.trim() || "PL",
      season: config.season,
      exhibitionModelId: config.exhibitionModelId,
      concurrency: config.concurrency,
      apiKey: config.openRouterApiKey,
      entrantCallTimeoutMs: config.entrantCallTimeoutMs,
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

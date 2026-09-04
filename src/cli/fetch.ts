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
    footballDataOrgToken: config.footballDataOrgToken,
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
  // Visible on the day it happens: an operator reading the job log sees
  // "matchday 6 Fixture attached to Gameweek 4" without throwing (ticket 0064).
  for (const moved of result.movedAttachments) {
    console.info(
      `Competition ${moved.competition}: matchday ${moved.matchday} Fixture `
      + `${moved.fixtureId} attached to Gameweek ${moved.attachedGameweek}`
    );
  }
  for (const refused of result.refusedAttachments) {
    console.warn(
      `Competition ${refused.competition}: matchday ${refused.matchday} Fixture `
      + `${refused.fixtureId} (kickoff ${refused.kickoffAt.toISOString()}) could not attach to an open Gameweek before kickoff and was refused`
    );
  }
} finally {
  await database.end();
}

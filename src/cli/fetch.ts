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
  // Five loops of the same shape and not one formatter over them: each names
  // different fields of a different fact, and the shared version would be a
  // switch on which fact it was handed. What they do share is the rule -- a
  // thing the record absorbed quietly is said out loud on the day it happens,
  // and none of them fails the run.
  //
  // Neither result is changed and neither source is preferred (ADR-0056), so
  // the only place a disagreement exists at all is this line.
  for (const disagreement of result.resultDisagreements) {
    console.warn(
      `Competition ${disagreement.competition}: Fixture `
      + `${disagreement.fixtureId} (${disagreement.homeTeam} v `
      + `${disagreement.awayTeam}, kickoff `
      + `${disagreement.kickoffAt.toISOString()}) is stored `
      + `${disagreement.stored} and the second source reports `
      + `${disagreement.reported}; neither has been changed`
    );
  }
  // The signal that a stats source and the schedule source disagree about the
  // day a match was played, which is otherwise only visible as a packet line
  // reading "unavailable" over a source that was answering.
  for (const unlisted of result.unlistedFixtures) {
    console.warn(
      `Competition ${unlisted.competition}: Fixture ${unlisted.fixtureId} `
      + `(${unlisted.homeTeam} v ${unlisted.awayTeam}) is settled and was not `
      + `in the stats source's listing for `
      + `${unlisted.kickoffAt.toISOString().slice(0, 10)}; no shots or xG `
      + "were stored for it and the next run will ask again"
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

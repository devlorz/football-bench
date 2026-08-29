import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import {
  runScheduledFplGameweeks
} from "../fpl/run-scheduled-fpl-gameweeks.js";
import {
  readFplRunLeadHours,
  readScheduledFplJobConfig
} from "./config.js";

const { Client } = pg;
const config = readScheduledFplJobConfig(process.env);
const runLeadHours = readFplRunLeadHours(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  await runScheduledFplGameweeks({
    database,
    season: config.season,
    concurrency: config.concurrency,
    apiKey: config.openRouterApiKey,
    entrantCallTimeoutMs: config.entrantCallTimeoutMs,
    runLeadHours,
    http: nodeHttpFetcher,
    now: () => new Date(),
    onCompletedRun: ({ gameweek, outcome }) => {
      if (outcome.kind === "inactive") {
        console.log(`Gameweek ${gameweek}: the FPL track is not active`);
        return;
      }
      if (outcome.kind === "locked") {
        console.log(
          `Gameweek ${gameweek}: the Lock has passed; the run is closed `
          + "without asking again"
        );
        return;
      }
      // Every Entrant is named in exactly one of the three, so an operator
      // reading this can tell a Gameweek that got the whole roster through
      // from one that did not — and the second is worth a fill before the
      // Lock, because one Gap takes the Gameweek from everyone (ADR-0011).
      console.log(
        `Gameweek ${gameweek}: `
        + `${outcome.played.length} played, `
        + `${outcome.standing.length} already standing, `
        + `${outcome.missing.length} missing`
        + (outcome.missing.length === 0
          ? ""
          : ` (${outcome.missing.join(", ")})`)
      );
    }
  });
} finally {
  await database.end();
}

import pg from "pg";
import { startTemporaryPostgres } from "../db/temporary-postgres.js";
import {
  loadDryRunArchive,
  restrictToReadOnly
} from "../dry-run/load-archive.js";
import { formatScoringRehearsal } from "../dry-run/format-scoring-rehearsal.js";
import { rehearseScoring } from "../dry-run/rehearse-scoring.js";
import {
  rehearsalExitCode,
  rehearseInThrowawayPostgres
} from "../rehearsal.js";
import { readDryRunJobConfig } from "./config.js";

const { Client } = pg;
const config = readDryRunJobConfig(process.env);

const archiveDatabase = new Client({ connectionString: config.databaseUrl });
await archiveDatabase.connect();
let archive;
try {
  // The archive holds snapshots that exist nowhere else, and this command
  // fabricates results. The session is downgraded before a single statement
  // runs against it, so the configured database cannot be written to whatever
  // the code above this layer does.
  await restrictToReadOnly(archiveDatabase);
  archive = await loadDryRunArchive(archiveDatabase);
} finally {
  await archiveDatabase.end();
}

console.log(
  `Archive: ${archive.snapshots.length} snapshots, `
  + `${archive.entrants.length} Entrants, observed `
  + `${archive.observedAt.toISOString()}`
);

// Everything written from here on lands in a cluster built for this run and
// removed with it, which is what keeps the fabricated results off real data.
const result = await rehearseInThrowawayPostgres({
  start: () => startTemporaryPostgres("football-benchmark-score-rehearsal-"),
  connect: async (connectionString) => {
    const target = new Client({ connectionString });
    await target.connect();
    return target;
  },
  rehearse: (target) => rehearseScoring({
    target,
    archive,
    season: config.season,
    footballDataSeason: config.footballDataSeason,
    gameweek: config.gameweek,
    at: config.at,
    concurrency: config.concurrency,
    now: () => new Date()
  })
});

console.log(
  formatScoringRehearsal(config.season, config.gameweek, result)
);
process.exitCode = rehearsalExitCode(result);

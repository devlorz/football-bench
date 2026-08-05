import pg from "pg";
import { startTemporaryPostgres } from "../db/temporary-postgres.js";
import {
  loadDryRunArchive,
  restrictToReadOnly
} from "../dry-run/load-archive.js";
import { formatFplRehearsalResult } from "../fpl-rehearsal/format-rehearsal-result.js";
import {
  rehearsalExitCode,
  rehearseInThrowawayPostgres
} from "../fpl-rehearsal/rehearse-in-throwaway-postgres.js";
import { rehearsalArchive } from "../fpl-rehearsal/rehearsal-archive.js";
import { readFplRehearsalJobConfig } from "./config.js";

const { Client } = pg;
const config = readFplRehearsalJobConfig(process.env);

const source = new Client({ connectionString: config.databaseUrl });
await source.connect();
let archive;
try {
  // The archive holds snapshots that exist nowhere else. The session is
  // downgraded before a single statement runs against it, so the configured
  // database cannot be written to whatever the code above this layer does.
  await restrictToReadOnly(source);
  archive = rehearsalArchive(await loadDryRunArchive(source), config.season);
} finally {
  await source.end();
}

console.log(
  `Rehearsing Season ${config.season} from `
  + `${archive.snapshots.length + 1} archived snapshots`
);

const result = await rehearseInThrowawayPostgres({
  archive,
  season: config.season,
  concurrency: config.concurrency,
  start: () => startTemporaryPostgres("football-benchmark-fpl-rehearsal-"),
  connect: async (connectionString) => {
    const target = new Client({ connectionString });
    await target.connect();
    return target;
  }
});

console.log(formatFplRehearsalResult(result));
process.exitCode = rehearsalExitCode(result);

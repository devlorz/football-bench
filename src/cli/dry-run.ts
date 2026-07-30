import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { applyMigrations } from "../db/migrations.js";
import { startTemporaryPostgres } from "../db/temporary-postgres.js";
import { formatGapAlert } from "../predictions/gap-alert.js";
import {
  loadDryRunArchive,
  restrictToReadOnly
} from "../dry-run/load-archive.js";
import { runDryRun } from "../dry-run/run-dry-run.js";
import { dryRunVerdict } from "../dry-run/verdict.js";
import { readDryRunJobConfig } from "./config.js";
import { writeCompletedRunAlert } from "./write-gap-alert.js";

const { Client } = pg;
const config = readDryRunJobConfig(process.env);

const archiveDatabase = new Client({ connectionString: config.databaseUrl });
await archiveDatabase.connect();
let archive;
try {
  // The archive holds snapshots that exist nowhere else. The session is
  // downgraded before a single statement runs against it.
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

const postgres = startTemporaryPostgres("football-benchmark-dry-run-");
const target = new Client({ connectionString: postgres.connectionString });
try {
  await target.connect();
  await applyMigrations(target);

  const result = await runDryRun({
    target,
    archive,
    season: config.season,
    footballDataSeason: config.footballDataSeason,
    gameweek: config.gameweek,
    at: config.at,
    concurrency: config.concurrency
  });

  for (const context of result.contexts) {
    console.log(
      `\n${"=".repeat(72)}\n`
      + `Fixture ${context.fixtureId}: `
      + `${context.homeTeam} v ${context.awayTeam}\n`
      + `${"=".repeat(72)}\n${context.body}`
    );
  }

  for (const phase of result.phases) {
    console.log(
      `\n${"=".repeat(72)}\n${phase.trigger} run\n${"=".repeat(72)}`
    );
    console.log(
      phase.gapAlert === null
        ? "No Gaps remain."
        : formatGapAlert(phase.gapAlert)
    );
  }

  // Rehearse the escalation the workflow performs, through the same function
  // the scheduled job uses, so the report handed to the issue script is seen
  // here rather than first appearing on a real Friday.
  const fill = result.phases.find(({ trigger }) => trigger === "fill");
  if (fill?.gapAlert != null) {
    const reportDirectory = mkdtempSync("/tmp/football-benchmark-fill-report-");
    const reportPath = join(reportDirectory, "fill-gaps.md");
    try {
      writeCompletedRunAlert(
        {
          gameweek: config.gameweek,
          trigger: "fill",
          gapAlert: fill.gapAlert
        },
        { ...process.env, GITHUB_ACTIONS: "false", FILL_GAP_REPORT_PATH: reportPath }
      );
      console.log(
        `\n${"=".repeat(72)}\n`
        + "Fill escalation report — the body handed to "
        + `scripts/report-prediction-fill-gaps.sh\n${"=".repeat(72)}\n`
        + readFileSync(reportPath, "utf8")
      );
    } finally {
      rmSync(reportDirectory, { recursive: true, force: true });
    }
  }

  const { predictions, gaps, matched } = dryRunVerdict(result);

  console.log(
    `\n${"=".repeat(72)}\n`
    + `Season ${config.season} Gameweek ${config.gameweek}\n`
    + `Deadline:    ${result.deadline.toISOString()}\n`
    + `Ran at:      ${result.instant.toISOString()} (${config.at})\n`
    + `Contexts:    ${result.contexts.length}\n`
    + `Predictions: ${predictions} (expected ${result.expected.predictions})\n`
    + `Gaps:        ${gaps} (expected ${result.expected.gaps})\n`
    + (matched
      ? "Dry run matched the archive's expected outcome."
      : "Dry run DID NOT match the archive's expected outcome.")
  );
  if (!matched) {
    process.exitCode = 1;
  }
} finally {
  await target.end();
  postgres.stop();
}

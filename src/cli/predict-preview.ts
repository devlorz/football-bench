import pg from "pg";
import { applyMigrations } from "../db/migrations.js";
import { startTemporaryPostgres } from "../db/temporary-postgres.js";
import {
  loadDryRunArchive,
  restrictToReadOnly
} from "../dry-run/load-archive.js";
import { previewGameweek } from "../dry-run/preview-gameweek.js";
import { nodeHttpFetcher } from "../http.js";
import { formatGapAlert } from "../predictions/gap-alert.js";
import { readPreviewJobConfig } from "./config.js";

const { Client } = pg;
const config = readPreviewJobConfig(process.env);
const showContexts = process.env.PREVIEW_SHOW_CONTEXTS === "true";

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
  `Previewing ${config.competition} ${config.season} Gameweek ${config.gameweek} with `
  + `${archive.entrants.filter(({ role }) => role === "entrant").length} Entrants. `
  + "Real Entrant calls; a throwaway database; the Season's own Predictions "
  + "are untouched."
);

const postgres = startTemporaryPostgres("football-benchmark-preview-");
const target = new Client({ connectionString: postgres.connectionString });
try {
  await target.connect();
  await applyMigrations(target);

  const result = await previewGameweek({
    target,
    archive,
    competition: config.competition,
    season: config.season,
    footballDataSeason: config.footballDataSeason,
    gameweek: config.gameweek,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher,
    concurrency: config.concurrency,
    at: config.at
  });

  if (showContexts) {
    for (const context of result.contexts) {
      console.log(
        `\n${"=".repeat(76)}\nContext — Fixture ${context.fixtureId}: `
        + `${context.fixture}\n${"=".repeat(76)}\n${context.body}`
      );
    }
  }

  let currentFixture = -1;
  for (const forecast of result.forecasts) {
    if (forecast.fixtureId !== currentFixture) {
      currentFixture = forecast.fixtureId;
      const spread = result.forecasts
        .filter(({ fixtureId }) => fixtureId === currentFixture)
        .map(({ home }) => home);
      console.log(`\n${"─".repeat(76)}`);
      console.log(
        `${forecast.fixture}   `
        + `(Home spread ${(Math.max(...spread) - Math.min(...spread)).toFixed(2)} `
        + `across ${spread.length})`
      );
      console.log("─".repeat(76));
      console.log(
        `${"Entrant".padEnd(26)}${"H".padStart(6)}${"D".padStart(6)}`
        + `${"A".padStart(6)}   score  repairs`
      );
    }
    console.log(
      forecast.entrant.padEnd(26)
      + forecast.home.toFixed(2).padStart(6)
      + forecast.draw.toFixed(2).padStart(6)
      + forecast.away.toFixed(2).padStart(6)
      + `   ${forecast.predictedHome}-${forecast.predictedAway}      `
      + `${forecast.repairs}`
    );
  }

  console.log(`\n${"─".repeat(76)}`);
  console.log(
    `Forecasts ${result.forecasts.length}   `
    + `Gaps ${result.gapAlert?.gaps.length ?? 0}   `
    + `${Math.round(result.elapsedMs / 1000)}s   `
    + `tokens ${result.tokensIn} in / ${result.tokensOut} out`
  );
  if (result.gapAlert !== null) {
    console.log(`\n${formatGapAlert(result.gapAlert)}`);
  }
} finally {
  await target.end();
  postgres.stop();
}

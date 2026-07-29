import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { preflightBaseModels } from "../preflight/preflight-base-models.js";
import { readPreflightJobConfig } from "./config.js";

const { Client } = pg;
const config = readPreflightJobConfig(process.env);
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const report = await preflightBaseModels({
    database,
    season: config.season,
    fixtureId: config.fixtureId,
    apiKey: config.openRouterApiKey,
    http: nodeHttpFetcher
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await database.end();
}

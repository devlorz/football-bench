import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { preflightBaseModels } from "../preflight/preflight-base-models.js";
import { readPreflightJobConfig } from "./config.js";

const { Client } = pg;
// The roster's count and the one Exhibition's id are each present exactly
// when the other is absent, so the config is spread rather than restated: an
// absent option must stay absent, not arrive as an explicit `undefined`.
const { databaseUrl, openRouterApiKey, entrantCallTimeoutMs, ...target } =
  readPreflightJobConfig(process.env);
const database = new Client({ connectionString: databaseUrl });

await database.connect();
try {
  const report = await preflightBaseModels({
    database,
    ...target,
    apiKey: openRouterApiKey,
    entrantCallTimeoutMs,
    http: nodeHttpFetcher
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await database.end();
}

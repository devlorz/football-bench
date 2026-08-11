import { createServer } from "node:http";
import pg from "pg";
import { handleDashboardRequest, type Query } from "../dashboard/read-api.js";
import { readScoreJobConfig } from "./config.js";

/**
 * The read API in front of a local seeded Postgres, so the pages can be walked
 * by hand before anything is deployed.
 *
 * It is the development counterpart of `src/dashboard/worker.ts` and shares the
 * only thing worth sharing with it: `handleDashboardRequest`. What differs is
 * the wiring either side -- `pg` here because the harness's cluster listens on
 * a socket, `postgres.js` there because that is what runs on a Worker -- and
 * that difference is exactly what the seam exists to absorb.
 *
 * Port 8787 because that is where `astro dev` proxies `/api`, and where
 * `wrangler dev` would answer once the deploy slice adds it.
 */
const PORT = 8787;

const { Client } = pg;
const config = readScoreJobConfig(process.env);

const database = new Client({ connectionString: config.databaseUrl });
await database.connect();
// The role the Worker holds in production. Reading as the owner here would show
// a page that the deployed dashboard cannot: under Row Level Security a table
// granted without a policy returns nothing and reports no error.
await database.query("set role dashboard_read");

const query: Query = async (sql, parameters = []) =>
  (await database.query(sql, [...parameters])).rows;

createServer((incoming, outgoing) => {
  void (async () => {
    const request = new Request(
      new URL(incoming.url ?? "/", `http://localhost:${PORT}`)
    );
    const response = await handleDashboardRequest(
      request, query, config.season, new Date()
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  })();
}).listen(PORT, () => {
  console.log(`Reading ${config.season} on http://localhost:${PORT}/api/*`);
});

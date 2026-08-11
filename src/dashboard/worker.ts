import postgres from "postgres";
import { handleDashboardRequest, type Query } from "./read-api.js";

/**
 * What the deployment supplies. `DATABASE_URL` is a Worker secret holding the
 * login role an operator provisioned outside migrations and granted membership
 * in `dashboard_read` (ADR-0027), so rotating it is a secret change and not a
 * schema change.
 */
export interface Env {
  DATABASE_URL: string;
  SEASON: string;
}

/** The one method of Cloudflare's context this file uses. */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The wiring, and nothing else: a connection, the configured Season, the real
 * clock, and the seam. Every decision worth a test is in `read-api.ts`.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    context: ExecutionContext
  ): Promise<Response> {
    // ponytail: one connection per request, closed on the way out. A Worker
    // isolate cannot hold a pool across requests it can be evicted between, and
    // the endpoints are cached for minutes at the edge — Hyperdrive is the
    // upgrade if connection setup ever shows up in the latency.
    //
    // `fetch_types` off because the type catalogue is a round trip on a
    // connection that answers one request: every column here is read as text or
    // through `Number`, so the driver has nothing to infer.
    const sql = postgres(env.DATABASE_URL, { fetch_types: false });
    const query: Query = (text, parameters = []) =>
      sql.unsafe(text, parameters as never[]);

    try {
      return await handleDashboardRequest(
        request, query, env.SEASON, new Date()
      );
    } finally {
      context.waitUntil(sql.end());
    }
  }
};

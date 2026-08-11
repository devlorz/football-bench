import postgres from "postgres";
import type { Query } from "../src/dashboard/read-api.js";

/**
 * The read seam over `postgres.js`, which is the driver the Worker runs and the
 * one part of the read path a suite running on `pg` cannot see. ADR-0027 puts
 * `postgres.js` on the Worker and `pg` everywhere else, and the two disagree
 * about exactly what these bodies are full of: `numeric`, `count(*)` and every
 * timestamp reach one as a string and the other as a number or a `Date`.
 *
 * Handed the parts rather than the URL. `postgres.js` does not read the
 * `?host=` parameter a connection string carries -- `pg` does, and the
 * harness's temporary cluster listens on a socket and on no TCP port at all, so
 * the URL that reaches `pg` over a socket would send `postgres.js` to whatever
 * is on localhost at the same port. Deployment hands the Worker an ordinary
 * `host:port` URL and never meets this; a test that pointed the driver at a
 * developer's own Postgres and reported a driver fault would.
 *
 * The role is set here because reading as the owner would pass a suite the
 * deployed dashboard fails: under Row Level Security a table granted without a
 * policy returns nothing and reports no error.
 */
export async function workerDriver(): Promise<{
  query: Query;
  end: () => Promise<void>;
}> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const sql = postgres({
    host: url.searchParams.get("host") ?? url.hostname,
    port: Number(url.port),
    username: url.username,
    database: url.pathname.slice(1),
    max: 1,
    fetch_types: false
  });
  await sql.unsafe("set role dashboard_read");
  return {
    query: (text, parameters = []) => sql.unsafe(text, parameters as never[]),
    end: async () => {
      await sql.end();
    }
  };
}

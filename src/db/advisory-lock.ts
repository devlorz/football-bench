import type { Client } from "pg";

type Database = Pick<Client, "query">;

/**
 * Runs `work` while holding a Postgres advisory lock, or returns nothing at
 * all if another process already holds it.
 *
 * Both schedulers poll, both are driven by a cron that cannot know whether the
 * last run has finished, and both must never have two processes asking the
 * same Entrants at once. An empty list is the honest answer to "what did this
 * poll run?" when the answer is nothing — a refusal would make the ordinary
 * case of overlapping polls look like a failure.
 *
 * The lock is released in a `finally`, so a run that throws does not hold it
 * until the connection drops.
 */
export async function whileHoldingLock<T>(
  database: Database,
  key: number,
  work: () => Promise<T[]>
): Promise<T[]> {
  const lock = await database.query<{ acquired: boolean }>(
    "select pg_try_advisory_lock($1) as acquired",
    [key]
  );
  if (lock.rows[0]?.acquired !== true) {
    return [];
  }

  try {
    return await work();
  } finally {
    await database.query("select pg_advisory_unlock($1)", [key]);
  }
}

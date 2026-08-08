import type { Client } from "pg";
import { applyMigrations } from "./db/migrations.js";
import type { TemporaryPostgres } from "./db/temporary-postgres.js";

export interface RehearseInThrowawayPostgresOptions<T> {
  /** Builds the cluster the rehearsal writes to. */
  start: () => TemporaryPostgres;
  /** Connects to it. Separated so a test can drive the lifecycle. */
  connect: (connectionString: string) => Promise<Client>;
  /** The rehearsal itself, against a database that is already migrated. */
  rehearse: (target: Client) => Promise<T>;
}

/**
 * Rehearses something in a Postgres that exists only for the run.
 *
 * The cluster is torn down in a `finally`, so a rehearsal that throws leaves no
 * more behind than one that succeeds. That matters more here than in most
 * places: these commands exist to be run repeatedly while something is being
 * got right, and a failed run that leaked a cluster would make the next one
 * fail for an unrelated reason.
 *
 * The schema is built by `applyMigrations` rather than by any shape a caller
 * knows, so the database a rehearsal proves things against is the one
 * production would deploy.
 *
 * Shared by both tracks: the lifecycle is the same whether what runs inside is
 * a Season of FPL Gameweeks or one scoring pass, and it is the one part of a
 * rehearsal whose failure paths nobody reproduces by hand.
 */
export async function rehearseInThrowawayPostgres<T>({
  start,
  connect,
  rehearse
}: RehearseInThrowawayPostgresOptions<T>): Promise<T> {
  const postgres = start();
  let target: Client | undefined;
  try {
    target = await connect(postgres.connectionString);
    await applyMigrations(target);
    return await rehearse(target);
  } finally {
    // Nested, because closing the connection can itself throw — and it throws
    // after the rehearsal has finished with it. Stopping the cluster is the
    // one thing that must happen whatever else went wrong, so it is not left
    // downstream of a statement that can fail.
    try {
      if (target !== undefined) {
        await target.end();
      }
    } finally {
      postgres.stop();
    }
  }
}

/**
 * What a rehearsal command exits with. Any shortfall is a failure: a rehearsal
 * that ran to the end having written less than the record it said it would is
 * exactly the outcome an operator must not read as success.
 */
export function rehearsalExitCode(
  result: { shortfalls: string[] }
): number {
  return result.shortfalls.length > 0 ? 1 : 0;
}

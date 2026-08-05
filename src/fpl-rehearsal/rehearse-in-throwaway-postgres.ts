import type { Client } from "pg";
import { applyMigrations } from "../db/migrations.js";
import type { TemporaryPostgres } from "../db/temporary-postgres.js";
import {
  runFplRehearsal,
  type FplRehearsalArchive,
  type FplRehearsalResult
} from "./run-fpl-rehearsal.js";

export interface RehearseInThrowawayPostgresOptions {
  archive: FplRehearsalArchive;
  season: string;
  concurrency: number;
  /** Builds the cluster the rehearsal writes to. */
  start: () => TemporaryPostgres;
  /** Connects to it. Separated so a test can drive the lifecycle. */
  connect: (connectionString: string) => Promise<Client>;
}

/**
 * Rehearses the track in a Postgres that exists only for the run.
 *
 * The cluster is torn down in a `finally`, so a rehearsal that throws leaves
 * no more behind than one that succeeds. That matters more here than in most
 * places: this command exists to be run repeatedly while something is being
 * got right, and a failed run that leaked a cluster would make the next one
 * fail for an unrelated reason.
 *
 * The schema is built by `applyMigrations` rather than by any shape this
 * module knows, so the database the rehearsal proves things against is the one
 * production would deploy.
 */
export async function rehearseInThrowawayPostgres({
  archive,
  season,
  concurrency,
  start,
  connect
}: RehearseInThrowawayPostgresOptions): Promise<FplRehearsalResult> {
  const postgres = start();
  let target: Client | undefined;
  try {
    target = await connect(postgres.connectionString);
    await applyMigrations(target);
    return await runFplRehearsal({ target, archive, season, concurrency });
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
 * What the command exits with. Any shortfall is a failure: a rehearsal that
 * ran to the end having written fewer rows than it said it would is exactly
 * the outcome an operator must not read as success.
 */
export function rehearsalExitCode(result: FplRehearsalResult): number {
  return result.shortfalls.length > 0 ? 1 : 0;
}

import type { Client } from "pg";
import type { ArchivedSnapshot } from "./archive-replay-fetcher.js";

type Database = Pick<Client, "query">;

export interface ArchivedEntrant {
  id: string;
  name: string;
  role: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  prompt_version: string;
  config: Record<string, unknown>;
}

export interface DryRunArchive {
  /**
   * When these bytes were first observed. A dry run loads data at this instant
   * rather than at the instant being rehearsed, because that is when the
   * archived responses were real — and because a post-deadline rehearsal would
   * otherwise trip the stale-Season guard on a Season whose results the
   * archive predates.
   */
  observedAt: Date;
  snapshots: ArchivedSnapshot[];
  entrants: ArchivedEntrant[];
}

/**
 * Downgrades the session holding the real data so a dry run reading its
 * archive cannot write to it, whatever the code above this layer does. This is
 * the enforcement behind "leaves real data untouched" — not a convention.
 */
export async function restrictToReadOnly(database: Database): Promise<void> {
  await database.query(
    "set session characteristics as transaction read only"
  );
}

/**
 * Reads the archived upstream bodies and the Entrant roster that a dry run
 * replays. Where a source was archived more than once the newest body wins, so
 * a run reproduces the most recent observation rather than an arbitrary one.
 */
export async function loadDryRunArchive(
  database: Database
): Promise<DryRunArchive> {
  const snapshots = await database.query<ArchivedSnapshot>(
    `select distinct on (source) source, body
       from raw_snapshots
      order by source, first_seen_at desc, id desc`
  );
  const observed = await database.query<{ observed_at: Date | null }>(
    "select max(first_seen_at) as observed_at from raw_snapshots"
  );
  const entrants = await database.query<ArchivedEntrant>(
    `select id, name, role, base_model, provider, quantization,
            prompt_version, config
       from models
      order by id`
  );
  const observedAt = observed.rows[0]?.observed_at;
  if (observedAt === null || observedAt === undefined) {
    throw new Error("The archive holds no snapshots to replay");
  }
  return {
    observedAt,
    snapshots: snapshots.rows,
    entrants: entrants.rows
  };
}

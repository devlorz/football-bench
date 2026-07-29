import { createHash } from "node:crypto";
import type { Client } from "pg";

type Database = Pick<Client, "query">;

export interface RawSnapshot {
  source: string;
  body: string;
}

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Archives received upstream bytes in their own transaction. Callers validate
 * only after this resolves so a changed or unusable response remains evidence.
 */
export async function storeRawSnapshots(
  database: Database,
  snapshots: RawSnapshot[]
): Promise<void> {
  if (snapshots.length === 0) {
    return;
  }
  await database.query("begin");
  try {
    for (const snapshot of snapshots) {
      await database.query(
        `insert into raw_snapshots (source, sha256, body)
         values ($1, $2, $3)
         on conflict (source, sha256)
         do update set last_seen_at = now()`,
        [snapshot.source, sha256(snapshot.body), snapshot.body]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

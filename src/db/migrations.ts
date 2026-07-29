import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

type Database = Pick<Client, "query">;

const MIGRATIONS_DIRECTORY = new URL("../../migrations/", import.meta.url);

// Serialises concurrent runners so two processes cannot apply the same
// migration twice. The key is arbitrary but must stay stable.
const MIGRATION_LOCK_KEY = 8150527;

async function migrationFilenames(directory: URL): Promise<string[]> {
  const entries = await readdir(fileURLToPath(directory));
  return entries.filter((entry) => entry.endsWith(".sql")).sort();
}

async function appliedFilenames(database: Database): Promise<Set<string>> {
  const applied = await database.query<{ filename: string }>(
    "select filename from schema_migrations"
  );
  return new Set(applied.rows.map(({ filename }) => filename));
}

/**
 * Applies every migration the database has not recorded yet, in filename
 * order, and returns the filenames it applied. Safe to run repeatedly.
 */
export async function applyMigrations(
  database: Database,
  directory: URL = MIGRATIONS_DIRECTORY
): Promise<string[]> {
  await database.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  try {
    await database.query(
      `create table if not exists schema_migrations (
         filename   text primary key,
         applied_at timestamptz not null default now()
       )`
    );

    const applied = await appliedFilenames(database);
    const pending = (await migrationFilenames(directory))
      .filter((filename) => !applied.has(filename));

    for (const filename of pending) {
      const sql = await readFile(new URL(filename, directory), "utf8");
      // The migration and the record of it share one transaction. Splitting
      // them would let a crash in between leave the schema changed but
      // unrecorded, and the next run would try to apply it again.
      await database.query("begin");
      try {
        await database.query(sql);
        await database.query(
          "insert into schema_migrations (filename) values ($1)",
          [filename]
        );
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw new Error(`Migration ${filename} failed`, { cause: error });
      }
    }

    return pending;
  } finally {
    await database.query("select pg_advisory_unlock($1)", [
      MIGRATION_LOCK_KEY
    ]);
  }
}

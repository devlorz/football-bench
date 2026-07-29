import type { Client } from "pg";
import { applyMigrations } from "../src/db/migrations.js";

type Database = Pick<Client, "query">;

/**
 * Rebuilds an empty database from every migration. Tests share this with the
 * migrate CLI so a new migration reaches them without editing each test.
 */
export async function resetSchema(database: Database): Promise<void> {
  await database.query("drop schema public cascade; create schema public");
  await applyMigrations(database);
}

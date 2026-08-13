import type { Client } from "pg";
import { applyMigrations } from "../src/db/migrations.js";
import {
  MATCH_PROMPT_VERSION
} from "../src/predictions/openrouter-entrant.js";

type Database = Pick<Client, "query">;

/**
 * Rebuilds an empty database from every migration. Tests share this with the
 * migrate CLI so a new migration reaches them without editing each test.
 */
export async function resetSchema(database: Database): Promise<void> {
  await database.query("drop schema public cascade; create schema public");
  await applyMigrations(database);
}

/**
 * The late-arriving Base Model's row, as an operator inserts it: one `models`
 * row with `role = 'exhibition'` and nothing else to it (ADR-0032).
 *
 * Shared because the row is the same fact in every test that has one, and eight
 * copies of it were eight places to drift. Each caller overrides only the field
 * its test is about — a colliding id, a pinned quantization, another track's
 * Prompt Version — so what a test says about the row is what makes it differ.
 */
export async function insertExhibition(
  database: Database,
  row: {
    id?: string;
    name?: string;
    baseModel?: string;
    provider?: string;
    quantization?: string | null;
    promptVersion?: string;
  } = {}
): Promise<void> {
  await database.query(
    `insert into models (
       id, name, base_model, provider, quantization, prompt_version, role
     ) values ($1, $2, $3, $4, $5, $6, 'exhibition')`,
    [
      row.id ?? "exhibition/late",
      row.name ?? "Late Arrival",
      row.baseModel ?? "vendor/late",
      row.provider ?? "vendor",
      row.quantization ?? null,
      row.promptVersion ?? MATCH_PROMPT_VERSION
    ]
  );
}

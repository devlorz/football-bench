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

interface UnrankedRow {
  id?: string;
  name?: string;
  baseModel?: string;
  provider?: string;
  quantization?: string | null;
  promptVersion?: string;
  config?: Record<string, unknown>;
}

/**
 * One `models` row of an unranked role — an Exhibition Run or a Shadow Seat —
 * inserted with the given role and its defaults. Shared because the row is
 * the same fact in every test that has one, and eight copies of it were eight
 * places to drift: `insertExhibition` and `insertShadow` below are this with
 * `role` fixed and their own defaults.
 */
async function insertUnranked(
  database: Database,
  role: "exhibition" | "shadow",
  defaults: Required<Omit<UnrankedRow, "quantization">>
    & Pick<UnrankedRow, "quantization">,
  row: UnrankedRow
): Promise<void> {
  await database.query(
    `insert into models (
       id, name, base_model, provider, quantization, prompt_version, role,
       config
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id ?? defaults.id,
      row.name ?? defaults.name,
      row.baseModel ?? defaults.baseModel,
      row.provider ?? defaults.provider,
      row.quantization ?? defaults.quantization ?? null,
      row.promptVersion ?? defaults.promptVersion,
      role,
      JSON.stringify(row.config ?? defaults.config)
    ]
  );
}

/**
 * The late-arriving Base Model's row, as an operator inserts it: one `models`
 * row with `role = 'exhibition'` and nothing else to it (ADR-0032).
 *
 * Each caller overrides only the field its test is about — a colliding id, a
 * pinned quantization, another track's Prompt Version — so what a test says
 * about the row is what makes it differ.
 */
export async function insertExhibition(
  database: Database,
  row: UnrankedRow = {}
): Promise<void> {
  await insertUnranked(database, "exhibition", {
    id: "exhibition/late",
    name: "Late Arrival",
    baseModel: "vendor/late",
    provider: "vendor",
    quantization: null,
    promptVersion: MATCH_PROMPT_VERSION,
    config: {}
  }, row);
}

/**
 * A Shadow Seat's row, as ADR-0055 seats one: an existing Entrant's Base
 * Model, provider and quantization under `role = 'shadow'`, asking with a
 * different `config`.
 */
export async function insertShadow(
  database: Database,
  row: UnrankedRow = {}
): Promise<void> {
  await insertUnranked(database, "shadow", {
    id: "shadow/entrant",
    name: "Shadow of Entrant",
    baseModel: "vendor/shadowed",
    provider: "vendor",
    quantization: null,
    promptVersion: MATCH_PROMPT_VERSION,
    config: { reasoning: { effort: "none" } }
  }, row);
}

export const OX_ALPHA_FIXTURE = {
  id: "exhibition/ox-alpha",
  name: "Ox Alpha",
  baseModel: "stealth/ox-alpha",
  provider: "stealth",
  quantization: null,
  promptVersion: MATCH_PROMPT_VERSION,
  config: {
    baseModelClass: "First-party",
    canonical_slug: "stealth/ox-alpha",
    catalog_checked_at: "2026-08-23"
  }
} as const;

export async function insertOxAlpha(database: Database): Promise<void> {
  await insertExhibition(database, OX_ALPHA_FIXTURE);
}



import { execFileSync } from "node:child_process";
import type { Client } from "pg";
import { applyMigrations } from "./migrations.js";
import { startTemporaryPostgres } from "./temporary-postgres.js";

/**
 * The seven tables migration 0022 rekeys, and the four of them whose Fixture id
 * it renames. Named here rather than read from the schema: the check below is
 * about what one migration did, and a list the schema produced would agree with
 * whatever that migration left behind.
 */
export const KEYED_TABLES = [
  "gameweeks", "fixtures", "contexts", "predictions", "attempts",
  "prediction_runs", "scores"
] as const;

/**
 * Every table the rehearsal compares with itself. The seven above plus
 * `squad_changes`, which 0022 gave a Competition without rekeying and which
 * 0027 then took the primary key off — a table no pass may quietly lose rows
 * from is a table this list has to name, whoever rekeyed it.
 */
const COMPARED_TABLES = [...KEYED_TABLES, "squad_changes"] as const;

const RENAMED_TABLES = ["fixtures", "contexts", "predictions", "attempts"];

const quoted = (names: readonly string[]): string =>
  names.map((name) => `'${name}'`).join(", ");

/**
 * Copies every row of the compared tables into a schema the migration does not
 * touch, so the record can be compared with itself afterwards.
 */
const SNAPSHOT = "create schema before;\n" + COMPARED_TABLES
  .map((table) => `create table before.${table} as select * from ${table};`)
  .join("\n");

/**
 * Proves the pass moved the record rather than rewriting it: every row comes
 * back identical, once whatever that pass was supposed to change is allowed
 * for.
 *
 * **What it allows for is read from the snapshot, not assumed.** The first
 * version of this asked every pass the question only 0022's could answer — it
 * stripped `competition` off the migrated side and read `fixture_id` under its
 * old name unconditionally, which is right exactly once, against a record that
 * predates 0022. Run against a record already carrying the column, every row
 * differs from itself by that column and the rehearsal reports the whole
 * record lost. That is what it did the first time a later ticket followed the
 * runbook's own instruction to rehearse again, and a safety harness that fails
 * on a healthy record is one an operator learns to talk themselves past.
 *
 * So: the Competition is taken off only where the snapshot has no such column,
 * the Fixture id is renamed only where the snapshot still calls it `fpl_id`,
 * and the everything-came-back-`PL` assertion is made only of the tables this
 * pass actually relabelled. A pass that relabels nothing is held to the
 * stronger claim instead, that nothing moved at all — and once a second
 * Competition is listed, that is the only one of the two that stays true.
 *
 * Whole rows as `jsonb`, so a column this file has never heard of is compared
 * too — the claim is that *nothing* else changed, and a check listing the
 * columns would only ever check the ones somebody remembered. Compared both
 * ways with `except all`, so a row the migration duplicated is a difference
 * rather than a match.
 *
 * It raises rather than reports. The one outcome an operator must not be able
 * to read as success is a rehearsal that ran to the end having found something.
 */
const VERIFY = `
do $$
declare
  target      text;
  projection  text;
  relabelled  boolean;
  renamed     boolean;
  missing     bigint;
  extra       bigint;
  mislabelled bigint;
begin
  foreach target in array array[${quoted(COMPARED_TABLES)}] loop
    select not exists (
      select 1 from information_schema.columns
       where table_schema = 'before'
         and table_name = target
         and column_name = 'competition')
      into relabelled;
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'before'
         and table_name = target
         and column_name = 'fpl_id')
      into renamed;

    projection := 'to_jsonb(a)';
    if relabelled then
      projection := projection || ' - ''competition''';
    end if;
    if renamed and target in (${quoted(RENAMED_TABLES)}) then
      projection := '(' || projection || ' - ''fixture_id'') || '
        || 'jsonb_build_object(''fpl_id'', to_jsonb(a) -> ''fixture_id'')';
    end if;

    execute format(
      'select count(*) from ('
      || 'select to_jsonb(b) from before.%1$I b'
      || ' except all '
      || 'select %2$s from %1$I a) as difference',
      target, projection) into missing;
    execute format(
      'select count(*) from ('
      || 'select %2$s from %1$I a'
      || ' except all '
      || 'select to_jsonb(b) from before.%1$I b) as difference',
      target, projection) into extra;
    mislabelled := 0;
    if relabelled then
      execute format(
        'select count(*) from %1$I where competition <> ''PL''', target)
        into mislabelled;
    end if;

    if missing > 0 or extra > 0 or mislabelled > 0 then
      raise exception
        'the migration did not carry % across: % rows lost, % rows '
        'unaccounted for, % rows not PL', target, missing, extra, mislabelled;
    end if;
  end loop;
end $$;
`;

type Database = Pick<Client, "query">;

/**
 * Puts the record where the migration cannot reach it. Call before migrating.
 */
export async function snapshotKeyedRecord(database: Database): Promise<void> {
  await database.query(SNAPSHOT);
}

/**
 * Compares the migrated record with the snapshot and throws on any difference.
 * Call after migrating, over the same connection.
 */
export async function verifyRelabelledAsPl(
  database: Database
): Promise<void> {
  await database.query(VERIFY);
}

/**
 * `pg_dump` piped straight into `psql`, rather than read into this process and
 * handed over: `attempts` carries a provider's answer verbatim on every row, so
 * a Season's dump is far past the buffer a captured child's output gets.
 *
 * `psql` rather than a query on the open connection, because a dump is not
 * only SQL — recent `pg_dump` brackets its output in `\restrict`, which is a
 * psql instruction and reaches the server as a syntax error.
 *
 * `--schema=public` is what makes a managed database's dump replayable at all.
 * The deployed one is Supabase, whose dump opens by creating `auth`, `graphql`,
 * `realtime`, `vault` and the extensions that live in them — none of which a
 * throwaway cluster has, and the first of them stops the restore. The record
 * and every table this migration touches are in `public`, and the rest is the
 * platform's, not the benchmark's.
 *
 * Both URLs are handed over in the environment and never as arguments. A
 * connection string carries a password: in `argv` it is readable by anyone who
 * can run `ps` while the dump is going, and `execFileSync` puts the whole
 * command line into the message of any error it throws — which is how an
 * operator following the runbook would have found the deployed database's
 * password in their terminal the first time this failed.
 */
const copyRecord = (sourceUrl: string, targetUrl: string): void => {
  execFileSync(
    "bash",
    [
      "-c",
      'pg_dump --no-owner --no-privileges --schema=public "$REHEARSAL_SOURCE"'
      + ' | psql --quiet --no-psqlrc -v ON_ERROR_STOP=1 --file=-'
      + ' "$REHEARSAL_TARGET"'
    ],
    {
      env: {
        ...process.env,
        REHEARSAL_SOURCE: sourceUrl,
        REHEARSAL_TARGET: targetUrl
      },
      stdio: ["ignore", "ignore", "inherit"]
    }
  );
};

export interface MigrationRehearsal {
  /** The migrations the rehearsal applied, in the order it applied them. */
  applied: string[];
  /** How many rows of each compared table the copied record held. */
  rows: Record<string, number>;
}

export interface RehearseMigrationOptions {
  /** The database whose record is copied. Only ever read. */
  sourceUrl: string;
  connect: (connectionString: string) => Promise<Client>;
  /** Which migrations to rehearse. The repository's, unless a test says. */
  migrations?: URL;
}

/**
 * Applies the pending migrations to a copy of a live record in a Postgres that
 * exists only for the run, and proves the record survived them unchanged.
 *
 * A copy rather than an invented Season: the surprises a migration meets are in
 * the rows nobody would think to invent, and this is the last check before the
 * one failure a record does not come back from.
 */
export async function rehearseMigration({
  sourceUrl,
  connect,
  migrations
}: RehearseMigrationOptions): Promise<MigrationRehearsal> {
  const postgres = startTemporaryPostgres("football-benchmark-rehearsal-");
  let target: Client | undefined;
  try {
    target = await connect(postgres.connectionString);
    // Migration 0017's policies name this role by hand, and the restore fails
    // on a role the throwaway cluster has never heard of. `nologin`, as 0017
    // makes it, so it is no way into the copy either.
    await target.query("create role dashboard_read nologin");
    // From Postgres 15 `public` is an ordinary schema and the dump creates it,
    // which is an error against the one a new cluster already has. Dropped
    // rather than the dump filtered: what lands is then the deployed schema
    // exactly, which is the half of this rehearsal that catches drift.
    await target.query("drop schema public cascade");

    copyRecord(sourceUrl, postgres.connectionString);
    await snapshotKeyedRecord(target);

    const applied = await applyMigrations(target, migrations);
    await verifyRelabelledAsPl(target);

    const rows: Record<string, number> = {};
    for (const table of COMPARED_TABLES) {
      const counted = await target.query<{ count: number }>(
        `select count(*)::int as count from ${table}`
      );
      rows[table] = counted.rows[0]?.count ?? 0;
    }
    return { applied, rows };
  } finally {
    // Nested as `rehearseInThrowawayPostgres` nests it, and for its reason:
    // closing the connection can throw after the rehearsal has finished with
    // it, and stopping the cluster is the one thing that must happen whatever
    // else went wrong.
    try {
      if (target !== undefined) {
        await target.end();
      }
    } finally {
      postgres.stop();
    }
  }
}

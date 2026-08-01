import { readFile } from "node:fs/promises";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../src/db/migrations.js";

const { Client } = pg;
const pairUrl = new URL("./fixtures/migrations-pair/", import.meta.url);
const brokenUrl = new URL("./fixtures/migrations-broken/", import.meta.url);
const realMigrationsUrl = new URL("../migrations/", import.meta.url);

async function tableNames(database: Pick<pg.Client, "query">) {
  const result = await database.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
      order by table_name`
  );
  return result.rows.map(({ table_name: name }) => name);
}

describe("applying migrations", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query("drop schema public cascade; create schema public");
  });

  test("applies every pending migration in filename order", async () => {
    const applied = await applyMigrations(client, pairUrl);

    expect(applied).toEqual(["0001_first.sql", "0002_second.sql"]);
    expect(await tableNames(client)).toEqual([
      "first_step",
      "schema_migrations",
      "second_step"
    ]);
  });

  test("skips a migration the database has already recorded", async () => {
    await applyMigrations(client, pairUrl);
    const secondRun = await applyMigrations(client, pairUrl);

    expect(secondRun).toEqual([]);
    const recorded = await client.query(
      "select filename from schema_migrations order by filename"
    );
    expect(recorded.rows).toEqual([
      { filename: "0001_first.sql" },
      { filename: "0002_second.sql" }
    ]);
  });

  test("leaves nothing behind when a migration fails part-way", async () => {
    await expect(applyMigrations(client, brokenUrl))
      .rejects.toThrow("Migration 0002_broken.sql failed");

    // The first migration committed; the failing one left no table and no
    // record, so re-running retries exactly that file.
    expect(await tableNames(client)).toEqual([
      "applied_step",
      "schema_migrations"
    ]);
    const recorded = await client.query(
      "select filename from schema_migrations"
    );
    expect(recorded.rows).toEqual([{ filename: "0001_first.sql" }]);
  });

  test("applies each migration once when two runners start together", async () => {
    const first = new Client({ connectionString: process.env.DATABASE_URL });
    const second = new Client({ connectionString: process.env.DATABASE_URL });
    await Promise.all([first.connect(), second.connect()]);

    try {
      const runs = await Promise.all([
        applyMigrations(first, pairUrl),
        applyMigrations(second, pairUrl)
      ]);
      expect(runs.flat().sort()).toEqual([
        "0001_first.sql",
        "0002_second.sql"
      ]);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    const recorded = await client.query(
      "select count(*)::int as count from schema_migrations"
    );
    expect(recorded.rows).toEqual([{ count: 2 }]);
  });

  test("applies the real schema to its current shape", async () => {
    const applied = await applyMigrations(client);

    // Asserted as an end state rather than a file list, so a new migration
    // does not require editing this test to describe itself.
    expect(applied[0]).toBe("0001_initial.sql");
    expect(await tableNames(client)).toContain("predictions");

    const attemptTrigger = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conname = 'attempts_trigger_check'`
    );
    expect(attemptTrigger.rows[0]?.definition).toContain("'fill'");
    expect(attemptTrigger.rows[0]?.definition).not.toContain("'repair'");

    const unprotected = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not c.relrowsecurity`
    );
    expect(unprotected.rows).toEqual([]);
  });

  test("locks player snapshots over the deployed 0006 schema", async () => {
    await client.query(
      `create table schema_migrations (
         filename   text primary key,
         applied_at timestamptz not null default now()
       )`
    );
    const deployedFilenames = [
      "0001_initial.sql",
      "0002_rename_attempt_trigger_to_fill.sql",
      "0003_restrict_public_role_access.sql",
      "0004_historical_matches.sql",
      "0005_fpl_players.sql",
      "0006_gameweek_scoped_fpl_players.sql"
    ];
    for (const filename of deployedFilenames) {
      await client.query(await readFile(new URL(filename, realMigrationsUrl), "utf8"));
      await client.query(
        "insert into schema_migrations (filename) values ($1)",
        [filename]
      );
    }
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2099-00', 1, '2099-08-21T17:30:00Z');
       insert into fpl_players (
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added
       ) values (
         '2099-00', 1, 1, 'Arsenal', 'Raya', 'GKP', 60,
         'a', null, '', null
       )`
    );

    const applied = await applyMigrations(client);

    expect(applied).toEqual([
      "0007_lock_fpl_player_snapshots.sql",
      "0008_prediction_runs.sql",
      "0009_historical_match_shots.sql",
      "0010_understat_match_xg.sql",
      "0011_fpl_player_points.sql",
      "0012_record_gameweek_hits.sql"
    ]);
    const backfill = await client.query<{
      observed_at: Date;
      precedes_deadline: boolean;
    }>(
      `select
         p.observed_at,
         p.observed_at < g.deadline_at as precedes_deadline
         from fpl_players p
         join gameweeks g using (season, gw)`
    );
    expect(backfill.rows[0]?.observed_at).toBeInstanceOf(Date);
    expect(backfill.rows[0]?.precedes_deadline).toBe(true);
    const protection = await client.query<{
      table_name: string;
      row_level_security: boolean;
    }>(
      `select c.relname as table_name, c.relrowsecurity as row_level_security
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'fpl_players'`
    );
    expect(protection.rows).toEqual([{
      table_name: "fpl_players",
      row_level_security: true
    }]);
  });
});

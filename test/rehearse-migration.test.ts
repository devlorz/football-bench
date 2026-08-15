import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { rehearseMigration } from "../src/db/rehearse-migration.js";
import { applyRealMigrationsThrough, seedPremierLeagueRecord } from
  "./pre-competition-record.js";

const { Client } = pg;

const connect = async (connectionString: string): Promise<pg.Client> => {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
};

/**
 * The rehearsal drives the real thing: a database standing where the deployed
 * one stands, copied by `pg_dump` into a cluster of its own and migrated there.
 * The suite's own throwaway Postgres plays the deployed database — it is the
 * only one on hand that can be left at an earlier migration, and the rehearsal
 * never writes to its source.
 */
describe("rehearsing a migration against a copy of the record", () => {
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

  test("migrates the copied record and reports what it carried", async () => {
    await applyRealMigrationsThrough(
      client,
      "0021_dashboard_reads_the_squad_record.sql"
    );
    await seedPremierLeagueRecord(client);

    const rehearsal = await rehearseMigration({
      sourceUrl: process.env.DATABASE_URL!,
      connect
    });

    expect(rehearsal.applied).toEqual([
      "0022_the_competition_dimension.sql",
      "0023_dashboard_reads_the_competition_column.sql"
    ]);
    // The record the copy carried, not a shape asserted about the schema: an
    // operator reading a rehearsal needs to see that it ran over rows.
    expect(rehearsal.rows).toEqual({
      gameweeks: 1,
      fixtures: 2,
      contexts: 1,
      predictions: 1,
      attempts: 1,
      prediction_runs: 1,
      scores: 1
    });

    // And the source is untouched — it is a live record's stand-in, and a
    // rehearsal that migrated the thing it was rehearsing for would be the
    // exact accident this command exists to prevent.
    const source = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'fixtures' and column_name in
          ('fpl_id', 'fixture_id', 'competition')`
    );
    expect(source.rows).toEqual([{ column_name: "fpl_id" }]);
  });

  test("fails when the migration does not leave the record alone", async () => {
    await applyRealMigrationsThrough(
      client,
      "0021_dashboard_reads_the_squad_record.sql"
    );
    await seedPremierLeagueRecord(client);

    // A relabel that changes a number on the way past — the failure the whole
    // rehearsal exists for, and the one a green run has to be incapable of
    // reporting. Rehearsed from a fixture rather than by damaging 0022, so
    // what is under test here is the check.
    const failure = await rehearseMigration({
      sourceUrl: process.env.DATABASE_URL!,
      connect,
      migrations: new URL(
        "./fixtures/migrations-rewriting-relabel/", import.meta.url
      )
    }).then(() => null, (error: unknown) => error);

    expect((failure as Error).message)
      .toMatch(/did not relabel scores: 1 rows lost, 1 rows unaccounted for/);
  });
});

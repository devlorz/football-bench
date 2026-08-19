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
      "0023_dashboard_reads_the_competition_column.sql",
      "0024_history_and_xg_know_their_competition.sql",
      "0025_a_committed_gameweek_deadline_is_immutable.sql",
      "0026_the_spanish_divisions.sql",
      "0027_a_squad_change_may_state_no_date.sql",
      "0028_dashboard_reads_the_competition_list.sql",
      "0029_a_club_carries_its_own_code.sql",
      "0030_set_piece_and_penalty_duties_join_the_pool.sql",
      "0031_the_action_carries_a_required_rationale_back.sql",
      "0032_head_coach_changes.sql"
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
      scores: 1,
      // Compared and counted even though 0022 never rekeyed it: 0027 takes its
      // primary key off, and a table no pass may lose rows from has to be one
      // the rehearsal is looking at.
      squad_changes: 0
    });

    // And the source is untouched — it is a live record's stand-in, and a
    // rehearsal that migrated the thing it was rehearsing for would be the
    // exact accident this command exists to prevent.
    const source = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fixtures'
          and column_name in ('fpl_id', 'fixture_id', 'competition')`
    );
    expect(source.rows).toEqual([{ column_name: "fpl_id" }]);
  });

  // The case the deployed database is actually in from 0022 onwards, and the
  // one the first version of the check could not survive: it took the
  // Competition off the migrated side unconditionally, so a record that
  // already carried the column differed from itself in every row and the
  // rehearsal reported the whole record lost. The runbook says to rehearse
  // again after any ticket adds a migration; until this, that instruction
  // could not be followed. **Found by running it.**
  test("rehearses a record that has already taken the Competition", async () => {
    await applyRealMigrationsThrough(client, "0026_the_spanish_divisions.sql");
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PL', '2026-27', 1, '2026-08-21T17:30:00Z');
       insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         'PL', '2026-27', 1, 'Spurs', 'in', 'Sandro Tonali',
         'Newcastle United', '£92.5m', false, '2026-07-06',
         '2026-08-21T17:00:00Z'
       )`
    );

    const rehearsal = await rehearseMigration({
      sourceUrl: process.env.DATABASE_URL!,
      connect
    });

    // Only the pending migrations ran, and the row they are about came back.
    expect(rehearsal.applied).toEqual([
      "0027_a_squad_change_may_state_no_date.sql",
      "0028_dashboard_reads_the_competition_list.sql",
      "0029_a_club_carries_its_own_code.sql",
      "0030_set_piece_and_penalty_duties_join_the_pool.sql",
      "0031_the_action_carries_a_required_rationale_back.sql",
      "0032_head_coach_changes.sql"
    ]);
    expect(rehearsal.rows).toMatchObject({ gameweeks: 1, squad_changes: 1 });
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
      .toMatch(/did not carry scores across: 1 rows lost, 1 rows unaccounted for/);
  });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../src/db/migrations.js";
import {
  KEYED_TABLES, snapshotKeyedRecord, verifyRelabelledAsPl
} from "../src/db/rehearse-migration.js";
import {
  applyRealMigrationsThrough, seedPremierLeagueRecord
} from "./pre-competition-record.js";

const { Client } = pg;
const pairUrl = new URL("./fixtures/migrations-pair/", import.meta.url);
const brokenUrl = new URL("./fixtures/migrations-broken/", import.meta.url);

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
    await client.query(
      // `before` too: the snapshot below leaves it on the shared database, and
      // every later test file inherits it.
      "drop schema if exists before cascade;"
      + " drop schema public cascade; create schema public"
    );
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

  test("gives a seat a nullable departure with no default", async () => {
    // A withdrawal is a date on the row, not a deletion (ADR-0047), and the
    // absence of a default is what makes null mean "this seat stands" rather
    // than "nobody filled this in".
    await applyMigrations(client);

    const column = await client.query<{
      is_nullable: string;
      column_default: string | null;
      data_type: string;
    }>(
      `select is_nullable, column_default, data_type
         from information_schema.columns
        where table_name = 'models' and column_name = 'withdrawn_at'`
    );
    expect(column.rows).toEqual([{
      is_nullable: "YES",
      column_default: null,
      data_type: "timestamp with time zone"
    }]);
  });

  test("refuses an FPL context that cannot name the Entrant it was built for", async () => {
    await applyRealMigrationsThrough(client, "0012_record_gameweek_hits.sql");

    // One FPL context under the old key: one row for the whole Gameweek, with
    // no column that could say whose Squad it carries.
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into contexts (season, gw, track, hash, body)
       values ('2026-27', 1, 'fpl', 'hash', 'context')`
    );

    // Attributing it would mean guessing, and guessing wrong would put a text
    // on record as one an Entrant saw when it did not. The migration says so
    // in a sentence, carried on the cause, instead of failing through the
    // check constraint below it with nothing but a constraint name.
    const failure = await applyMigrations(client)
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message)
      .toBe("Migration 0013_per_entrant_fpl_contexts.sql failed");
    expect(((failure as Error).cause as Error).message)
      .toMatch(/predate per-Entrant identity/);

    const untouched = await client.query<{ count: number }>(
      "select count(*)::int as count from contexts"
    );
    expect(untouched.rows).toEqual([{ count: 1 }]);
  });

  test("refuses to widen player points it would have to invent", async () => {
    await applyRealMigrationsThrough(client, "0014_fpl_runs.sql");

    // One row under the narrow shape: a player who took 90 minutes and seven
    // points off a Gameweek, with nothing on record about how.
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into fpl_player_points (season, gw, fpl_id, minutes, total_points)
       values ('2026-27', 1, 1, 90, 7)`
    );

    // Defaulting the new columns to zero would put "played and did nothing" on
    // record for a player who may have scored twice, and an Entrant's context
    // would then read it as fact. The bytes are archived, so the migration
    // names the back-fill instead of guessing.
    const failure = await applyMigrations(client)
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message)
      .toBe("Migration 0015_full_fpl_player_stats.sql failed");
    expect(((failure as Error).cause as Error).message)
      .toMatch(/back-fill them from the archived fpl_live snapshots/);

    const untouched = await client.query<{ count: number }>(
      "select count(*)::int as count from fpl_player_points"
    );
    expect(untouched.rows).toEqual([{ count: 1 }]);
  });

  test("relabels a scored Premier League record as PL", async () => {
    await applyRealMigrationsThrough(
      client,
      "0021_dashboard_reads_the_squad_record.sql"
    );

    await seedPremierLeagueRecord(client);
    await snapshotKeyedRecord(client);

    const applied = await applyMigrations(client);
    expect(applied).toEqual([
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
      "0032_head_coach_changes.sql",
      "0033_the_head_coach_in_post.sql",
      "0034_a_seat_leaves_a_track_without_leaving_the_record.sql",
      "0035_the_italian_and_french_divisions.sql",
      "0036_the_german_divisions.sql",
      "0037_la_liga_gameweek_6s_nine_early_predictions_are_withdrawn.sql"
    ]);

    // Relabelled, not rewritten: every row of every rekeyed table comes back
    // carrying `PL` and otherwise identical, with the Fixture id under its
    // source-native name. The same check `npm run db:rehearse` runs over the
    // live record, rather than a second one in another language saying the
    // same thing -- what the rehearsal proves and what this test proves would
    // otherwise be two claims to keep in step by hand.
    await verifyRelabelledAsPl(client);

    // It had rows to prove that over, which the check cannot say itself: it
    // compares two records, and an empty record matches an empty one.
    const counts: Record<string, number> = {};
    for (const table of KEYED_TABLES) {
      const counted = await client.query<{ count: number }>(
        `select count(*)::int as count from ${table}`
      );
      counts[table] = counted.rows[0]!.count;
    }
    expect(counts).toEqual({
      gameweeks: 1,
      fixtures: 2,
      contexts: 1,
      predictions: 1,
      attempts: 1,
      prediction_runs: 1,
      scores: 1
    });

    // And the Season's one active Competition is listed.
    const competitions = await client.query(
      "select competition, season from competitions"
    );
    expect(competitions.rows).toEqual([
      { competition: "PL", season: "2026-27" }
    ]);
  });

  // Migration 0037 refuses to run at or after this instant (Gameweek 5's
  // `main` run) -- by design, since past it the nine it moves would be
  // re-Locked into a Gameweek nobody will predict. The two tests below seed
  // that exact nine-and-one shape and run every migration including 0037,
  // so once real time passes this instant they would hit that "too late"
  // guard first and fail for the wrong reason -- not a regression, just a
  // migration whose subject stopped being testable. Skipped past it rather
  // than left red; delete both once ticket 0065's production apply (box 5)
  // is done and this migration is history.
  const migration0037Cutoff = new Date("2026-09-11T11:30:00Z");

  // The PD Gameweek 6 bug's shape, shared by both tests below: two
  // Gameweeks and ten Fixtures, nine of which kick off well after the wrong
  // deadline and one -- Real Sociedad-Celta -- which genuinely does not.
  // `resultFor` lets a test give one of the nine a settled result without a
  // second copy of these inserts.
  async function seedPdGameweek6Fixtures(
    resultFor?: { fixtureId: number; result: string }
  ): Promise<void> {
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values
         ('PD', '2026-27', 5, '2026-09-11T17:30:00Z'),
         ('PD', '2026-27', 6, '2026-09-03T17:30:00Z')`
    );
    const fixtures: Array<[number, string, string, string]> = [
      [1, "Real Sociedad", "Celta", "2026-09-03T19:00:00Z"],
      [2, "Home 2", "Away 2", "2026-09-15T17:00:00Z"],
      [3, "Home 3", "Away 3", "2026-09-15T19:30:00Z"],
      [4, "Home 4", "Away 4", "2026-09-16T17:00:00Z"],
      [5, "Home 5", "Away 5", "2026-09-16T19:30:00Z"],
      [6, "Home 6", "Away 6", "2026-09-16T19:30:00Z"],
      [7, "Home 7", "Away 7", "2026-09-17T17:00:00Z"],
      [8, "Home 8", "Away 8", "2026-09-17T19:30:00Z"],
      [9, "Home 9", "Away 9", "2026-09-17T19:30:00Z"],
      [10, "Home 10", "Away 10", "2026-09-17T19:30:00Z"]
    ];
    for (const [fixtureId, homeTeam, awayTeam, kickoffAt] of fixtures) {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw,
           home_team, away_team, kickoff_at, result
         ) values ('PD', '2026-27', $1, 6, 6, $2, $3, $4, $5)`,
        [
          fixtureId, homeTeam, awayTeam, kickoffAt,
          resultFor?.fixtureId === fixtureId ? resultFor.result : null
        ]
      );
    }
  }

  test.skipIf(new Date() >= migration0037Cutoff)(
    "withdraws La Liga Gameweek 6's nine early Predictions and re-locks them into 5",
    async () => {
      await applyRealMigrationsThrough(
        client, "0036_the_german_divisions.sql"
      );
      await client.query(
        `insert into models (id, name, base_model, provider, prompt_version, role)
         values
           ('seat-1', 'Seat 1', 'provider/base-model', 'provider', 'match/v1', 'entrant'),
           ('seat-2', 'Seat 2', 'provider/base-model', 'provider', 'match/v1', 'entrant')`
      );
      await seedPdGameweek6Fixtures();
      for (let fixtureId = 1; fixtureId <= 10; fixtureId += 1) {
        const context = await client.query<{ id: number }>(
          `insert into contexts (competition, season, gw, track, fixture_id, hash, body)
           values ('PD', '2026-27', 6, 'match', $1, $2, 'the context')
           returning id`,
          [fixtureId, `hash-${fixtureId}`]
        );
        const contextId = context.rows[0]!.id;
        for (const modelId of ["seat-1", "seat-2"]) {
          await client.query(
            `insert into predictions (
               model_id, competition, season, fixture_id, probs, pred_home,
               pred_away, context_id, attempts_used
             ) values (
               $1, 'PD', '2026-27', $2, '{"H":0.4,"D":0.3,"A":0.3}', 1, 1, $3, 1
             )`,
            [modelId, fixtureId, contextId]
          );
          await client.query(
            `insert into attempts (
               model_id, competition, season, gw, track, fixture_id,
               attempt_no, ok, trigger
             ) values ($1, 'PD', '2026-27', 6, 'match', $2, 0, true, 'main')`,
            [modelId, fixtureId]
          );
        }
      }

      await applyMigrations(client);

      const predictions = await client.query<{ fixture_id: number }>(
        "select fixture_id from predictions where competition = 'PD' order by fixture_id"
      );
      expect(predictions.rows).toEqual([{ fixture_id: 1 }, { fixture_id: 1 }]);

      const fixtures = await client.query<{
        fixture_id: number; locked_in_gw: number;
      }>(
        `select fixture_id, locked_in_gw from fixtures
          where competition = 'PD' order by fixture_id`
      );
      expect(fixtures.rows[0]).toEqual({ fixture_id: 1, locked_in_gw: 6 });
      expect(fixtures.rows.slice(1)).toEqual(
        Array.from({ length: 9 }, (_, index) => (
          { fixture_id: index + 2, locked_in_gw: 5 }
        ))
      );

      const attempts = await client.query<{ count: number }>(
        "select count(*)::int as count from attempts where competition = 'PD'"
      );
      expect(attempts.rows).toEqual([{ count: 20 }]);

      const triggers = await client.query<{
        tgname: string; tgenabled: string;
      }>(
        `select tgname, tgenabled from pg_trigger
          where (tgname, tgrelid) in (
            ('fixture_locked_gameweek_is_immutable', 'fixtures'::regclass),
            ('predictions_are_immutable', 'predictions'::regclass)
          )
          order by tgname`
      );
      expect(triggers.rows).toEqual([
        { tgname: "fixture_locked_gameweek_is_immutable", tgenabled: "O" },
        { tgname: "predictions_are_immutable", tgenabled: "O" }
      ]);

      const deadlines = await client.query<{ gw: number; deadline_at: Date }>(
        "select gw, deadline_at from gameweeks where competition = 'PD' order by gw"
      );
      expect(deadlines.rows).toEqual([
        { gw: 5, deadline_at: new Date("2026-09-11T17:30:00Z") },
        { gw: 6, deadline_at: new Date("2026-09-03T17:30:00Z") }
      ]);
    }
  );

  test.skipIf(new Date() >= migration0037Cutoff)(
    "refuses to withdraw a Fixture that already has a result",
    async () => {
      await applyRealMigrationsThrough(
        client, "0036_the_german_divisions.sql"
      );
      // The full nine-plus-one shape, so the "already has a result" guard is
      // the one that fires -- not the row-count guard above it.
      await seedPdGameweek6Fixtures({
        fixtureId: 2,
        result: '{"home_goals": 1, "away_goals": 0, "outcome": "H"}'
      });

      const failure = await applyMigrations(client)
        .then(() => null, (error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message)
        .toBe(
          "Migration 0037_la_liga_gameweek_6s_nine_early_predictions_are_withdrawn.sql failed"
        );
      expect(((failure as Error).cause as Error).message)
        .toMatch(/already has a result or is unscheduled/);

      // The whole migration ran in one transaction and rolled back: the
      // Fixture the guard refused on is still exactly where it started.
      const untouched = await client.query<{ locked_in_gw: number }>(
        `select locked_in_gw from fixtures
          where competition = 'PD' and season = '2026-27' and fixture_id = 2`
      );
      expect(untouched.rows).toEqual([{ locked_in_gw: 6 }]);
    }
  );

  test("locks player snapshots over the deployed 0006 schema", async () => {
    await applyRealMigrationsThrough(
      client,
      "0006_gameweek_scoped_fpl_players.sql"
    );
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
      "0012_record_gameweek_hits.sql",
      "0013_per_entrant_fpl_contexts.sql",
      "0014_fpl_runs.sql",
      "0015_full_fpl_player_stats.sql",
      "0016_unscheduled_fixtures.sql",
      "0017_dashboard_read_role.sql",
      "0018_squad_changes.sql",
      "0019_exhibition_role.sql",
      "0020_dashboard_reads_the_fpl_tables.sql",
      "0021_dashboard_reads_the_squad_record.sql",
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
      "0032_head_coach_changes.sql",
      "0033_the_head_coach_in_post.sql",
      "0034_a_seat_leaves_a_track_without_leaving_the_record.sql",
      "0035_the_italian_and_french_divisions.sql",
      "0036_the_german_divisions.sql",
      "0037_la_liga_gameweek_6s_nine_early_predictions_are_withdrawn.sql"
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

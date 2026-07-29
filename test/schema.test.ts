import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

describe("the benchmark database", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         predictions, contexts, fixtures, manager_states, attempts, scores,
         models, gameweeks, raw_snapshots, historical_matches, fpl_players
       restart identity cascade`
    );
  });

  test("builds every table in the write-path schema", async () => {
    const result = await client.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
        order by table_name`
    );

    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "attempts",
      "contexts",
      "fixtures",
      "fpl_players",
      "gameweeks",
      "historical_matches",
      "manager_states",
      "models",
      "predictions",
      "raw_snapshots",
      // Bookkeeping for the migration runner, not part of the write path.
      "schema_migrations",
      "scores"
    ]);
  });

  test("keeps Fixtures with the same FPL id in different Seasons", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2025-26', 1, '2025-08-15T17:30:00Z'),
         ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values
         ('2025-26', 1, 1, 'Liverpool', 'Bournemouth', '2025-08-15T19:00:00Z'),
         ('2026-27', 1, 1, 'Arsenal', 'Coventry City', '2026-08-21T19:00:00Z')`
    );

    const fixtures = await client.query(
      "select season, fpl_id from fixtures order by season"
    );
    expect(fixtures.rows).toEqual([
      { season: "2025-26", fpl_id: 1 },
      { season: "2026-27", fpl_id: 1 }
    ]);
  });

  test("rejects rows that refer to a Gameweek that does not exist", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'match/v1', 'entrant'
       );
       insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );

    const invalidRows = [
      () => client.query(
        `insert into fixtures (
           season, fpl_id, gw, home_team, away_team, kickoff_at
         ) values (
           '2026-27', 1, 99, 'Arsenal', 'Coventry City',
           '2026-08-21T19:00:00Z'
         )`
      ),
      () => client.query(
        `insert into fixtures (
           season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
         ) values (
           '2026-27', 2, 1, 99, 'Leeds United', 'Everton',
           '2026-08-22T14:00:00Z'
         )`
      ),
      () => client.query(
        `insert into contexts (season, gw, track, fpl_id, hash, body)
         values ('2026-27', 99, 'match', 1, 'hash', 'context')`
      ),
      () => client.query(
        `insert into manager_states (
           model_id, season, gw, squad, team_sheet, bank, free_transfers,
           chips_used, attempts_used, predicted_at
         ) values (
           'entrant/v1', '2026-27', 99, '[]', '{}', 0, 1, '{}', 0, now()
         )`
      ),
      () => client.query(
        `insert into attempts (
           model_id, season, gw, track, attempt_no, ok, trigger
         ) values (
           'entrant/v1', '2026-27', 99, 'fpl', 0, false, 'main'
         )`
      ),
      () => client.query(
        `insert into scores (model_id, season, gw, track, metric, value)
         values ('entrant/v1', '2026-27', 99, 'fpl', 'points', 0)`
      )
    ];

    for (const invalidRow of invalidRows) {
      await expect(invalidRow()).rejects.toMatchObject({ code: "23503" });
    }
  });

  test("requires context identity to match its track", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );

    await expect(client.query(
      `insert into contexts (season, gw, track, hash, body)
       values ('2026-27', 1, 'match', 'match-hash', 'context')`
    )).rejects.toMatchObject({ code: "23514" });

    await expect(client.query(
      `insert into contexts (season, gw, track, fpl_id, hash, body)
       values ('2026-27', 1, 'fpl', 1, 'fpl-hash', 'context')`
    )).rejects.toMatchObject({ code: "23514" });
  });

  test("names a scheduled Gap-closing run as a fill", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'match/v1', 'entrant'
       );
       insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );

    await client.query(
      `insert into attempts (
         model_id, season, gw, track, attempt_no, ok, trigger
       ) values (
         'entrant/v1', '2026-27', 1, 'match', 0, false, 'fill'
       )`
    );
    await expect(client.query(
      `insert into attempts (
         model_id, season, gw, track, attempt_no, ok, trigger
       ) values (
         'entrant/v1', '2026-27', 1, 'match', 0, false, 'repair'
       )`
    )).rejects.toMatchObject({ code: "23514" });

    const attempts = await client.query("select trigger from attempts");
    expect(attempts.rows).toEqual([{ trigger: "fill" }]);
  });

  test("keeps a Fixture's locked Gameweek when its schedule moves", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z');
       insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       update fixtures
          set gw = 2
        where season = '2026-27' and fpl_id = 1`
    );

    await expect(client.query(
      `update fixtures
          set locked_in_gw = 2
        where season = '2026-27' and fpl_id = 1`
    )).rejects.toMatchObject({
      code: "55000",
      message: "a Fixture's locked Gameweek is immutable"
    });

    const fixture = await client.query(
      "select gw, locked_in_gw from fixtures"
    );
    expect(fixture.rows).toEqual([{ gw: 2, locked_in_gw: 1 }]);
  });

  test("refuses a Prediction for a Fixture that has no Lock", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'match/v1', 'entrant'
       );
       insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       insert into contexts (
         season, gw, track, fpl_id, hash, body
       ) values (
         '2026-27', 1, 'match', 1, 'context-hash', 'context'
       )`
    );

    await expect(client.query(
      `insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away,
         context_id, attempts_used
       ) values (
         'entrant/v1', '2026-27', 1, '{"H":0.5,"D":0.3,"A":0.2}',
         1, 0, 1, 0
       )`
    )).rejects.toMatchObject({
      code: "23514",
      constraint: "prediction_requires_locked_fixture"
    });
  });

  test("refuses an update to a Prediction at the database", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'match/v1', 'entrant'
       );
       insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 2, 1, 1, 'Leeds United', 'Everton',
         '2026-08-22T14:00:00Z'
       );
       insert into contexts (
         season, gw, track, fpl_id, hash, body
       ) values (
         '2026-27', 1, 'match', 2, 'context-hash', 'context'
       );
       insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away,
         context_id, attempts_used
       ) values (
         'entrant/v1', '2026-27', 2, '{"H":0.5,"D":0.3,"A":0.2}',
         1, 0, 1, 0
       )`
    );

    await expect(client.query(
      `update predictions
          set pred_home = 9
        where model_id = 'entrant/v1'
          and season = '2026-27'
          and fpl_id = 2`
    )).rejects.toMatchObject({
      code: "55000",
      message: "predictions rows are immutable"
    });

    const prediction = await client.query(
      "select pred_home from predictions"
    );
    expect(prediction.rows).toEqual([{ pred_home: 1 }]);
  });
});

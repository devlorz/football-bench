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
      "fpl_player_points",
      "fpl_players",
      "gameweeks",
      "historical_matches",
      "manager_states",
      "models",
      "prediction_runs",
      "predictions",
      "raw_snapshots",
      // Bookkeeping for the migration runner, not part of the write path.
      "schema_migrations",
      "scores",
      "understat_match_xg"
    ]);
  });

  test("keeps a historical match whose source carried no shot counts", async () => {
    await client.query(
      `insert into historical_matches (
         season, division, played_on, home_team, away_team,
         home_goals, away_goals,
         home_shots, away_shots, home_shots_on_target, away_shots_on_target
       ) values (
         '2025-26', 'Premier League', '2025-08-15T00:00:00Z',
         'Liverpool', 'Bournemouth', 4, 2, 19, 10, 10, 3
       ), (
         '1993-94', 'Premier League', '1993-08-14T00:00:00Z',
         'Arsenal', 'Coventry', 0, 3, null, null, null, null
       )`
    );

    const matches = await client.query(
      `select home_team, home_shots, away_shots,
              home_shots_on_target, away_shots_on_target
         from historical_matches
        order by season`
    );
    expect(matches.rows).toEqual([
      {
        home_team: "Arsenal",
        home_shots: null,
        away_shots: null,
        home_shots_on_target: null,
        away_shots_on_target: null
      },
      {
        home_team: "Liverpool",
        home_shots: 19,
        away_shots: 10,
        home_shots_on_target: 10,
        away_shots_on_target: 3
      }
    ]);
  });

  test("refuses a negative shot count on a historical match", async () => {
    const negativeCounts = [
      "home_shots = -1",
      "away_shots = -1",
      "home_shots_on_target = -1",
      "away_shots_on_target = -1"
    ];

    for (const negativeCount of negativeCounts) {
      const [column, value] = negativeCount.split(" = ");
      await expect(client.query(
        `insert into historical_matches (
           season, division, played_on, home_team, away_team,
           home_goals, away_goals, ${column}
         ) values (
           '2025-26', 'Premier League', '2025-08-15T00:00:00Z',
           'Liverpool', 'Bournemouth', 4, 2, ${value}
         )`
      )).rejects.toMatchObject({ code: "23514" });
    }
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

  test("rejects an FPL player snapshot at or after its Gameweek deadline", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );

    await expect(client.query(
      `insert into fpl_players (
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added, observed_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Raya', 'GKP', 60,
         'a', null, '', null, '2026-08-21T17:30:00Z'
       )`
    )).rejects.toMatchObject({
      constraint: "fpl_player_snapshot_precedes_deadline"
    });
  });

  test("rejects moving a deadline across an existing FPL player snapshot", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into fpl_players (
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added, observed_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Raya', 'GKP', 60,
         'a', null, '', null, '2026-08-21T17:00:00Z'
       )`
    );

    await expect(client.query(
      `update gameweeks
          set deadline_at = '2026-08-21T17:00:00Z'
        where season = '2026-27' and gw = 1`
    )).rejects.toMatchObject({
      constraint: "gameweek_deadline_preserves_fpl_snapshot_lock"
    });
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
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'fpl/v1', 'entrant'
       );
       insert into gameweeks (season, gw, deadline_at)
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

    // A Match context is one Fixture's and every Entrant sees the same text;
    // an FPL context is one Entrant's, because it carries that Entrant's own
    // Squad. Naming the wrong one of the two is refused in both directions.
    await expect(client.query(
      `insert into contexts (season, gw, track, fpl_id, model_id, hash, body)
       values ('2026-27', 1, 'match', 1, 'entrant/v1', 'match-hash', 'context')`
    )).rejects.toMatchObject({ code: "23514" });

    await expect(client.query(
      `insert into contexts (season, gw, track, hash, body)
       values ('2026-27', 1, 'fpl', 'fpl-hash', 'context')`
    )).rejects.toMatchObject({ code: "23514" });
  });

  test("gives every Entrant its own FPL context for one Gameweek", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values
         (
           'entrant/one', 'One', 'vendor/one', 'provider', 'fpl/v1', 'entrant'
         ),
         (
           'entrant/two', 'Two', 'vendor/two', 'provider', 'fpl/v1', 'entrant'
         );
       insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );

    // Two Entrants, one Gameweek, two contexts. Every Gameweek after the
    // opening hands each Entrant a text carrying its own Squad, so a key with
    // room for one of them would show the second a Squad it does not own and
    // then judge it on the Squad it does.
    await client.query(
      `insert into contexts (season, gw, track, model_id, hash, body)
       values
         ('2026-27', 1, 'fpl', 'entrant/one', 'one-hash', 'one context'),
         ('2026-27', 1, 'fpl', 'entrant/two', 'two-hash', 'two context')`
    );

    // And one apiece: the stored text is what "it saw only this" is verified
    // against, so a second row for the same seat would leave two answers.
    await expect(client.query(
      `insert into contexts (season, gw, track, model_id, hash, body)
       values ('2026-27', 1, 'fpl', 'entrant/one', 'again', 'another context')`
    )).rejects.toMatchObject({ code: "23505" });

    const stored = await client.query<{ model_id: string; body: string }>(
      `select model_id, body
         from contexts
        where season = '2026-27' and gw = 1 and track = 'fpl'
        order by model_id`
    );
    expect(stored.rows).toEqual([
      { model_id: "entrant/one", body: "one context" },
      { model_id: "entrant/two", body: "two context" }
    ]);
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

  test("refuses to rewrite or discard a stored Manager State", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
         'match/v1', 'entrant'
       );
       insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into manager_states (
         model_id, season, gw, squad, team_sheet, bank, free_transfers,
         chips_used, attempts_used, predicted_at
       ) values (
         'entrant/v1', '2026-27', 1,
         '{"active": [], "free_hit_stash": null}', '{}', 45, 1,
         '{"firstHalf": [], "secondHalf": []}', 0, now()
       )`
    );

    await expect(client.query(
      `update manager_states
          set bank = 0
        where model_id = 'entrant/v1' and season = '2026-27' and gw = 1`
    )).rejects.toMatchObject({
      code: "55000",
      message: "manager_states rows are immutable"
    });

    await expect(client.query(
      `delete from manager_states
        where model_id = 'entrant/v1' and season = '2026-27' and gw = 1`
    )).rejects.toMatchObject({
      code: "55000",
      message: "manager_states rows are immutable"
    });

    const stored = await client.query("select bank from manager_states");
    expect(stored.rows).toEqual([{ bank: 45 }]);
  });
});

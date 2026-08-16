import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  storePlayerPoints,
  type PlayerPointsStat
} from "./fpl-points-fixture.js";
import { divisionsOf } from "../src/football-data/divisions.js";
import {
  MATCH_PROMPT_COMPETITIONS
} from "../src/predictions/openrouter-entrant.js";

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
         models, gameweeks, raw_snapshots, historical_matches, fpl_players,
         fpl_player_points, squad_changes
       restart identity cascade`
    );
  });

  /** A Settled Gameweek to hang a player's points on. */
  async function storeGameweek(): Promise<void> {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 1, '2026-08-21T17:30:00Z')`
    );
  }

  test("stores an Exhibition beside the roles that were already there", async () => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values
         (
           'entrant/one', 'One', 'vendor/one', 'provider',
           'match/2026-27-v2', 'entrant'
         ),
         (
           'reference/elo', 'Elo', 'reference/elo', 'reference',
           'match/2026-27-v2', 'reference'
         ),
         (
           'exhibition/late', 'Late Arrival', 'vendor/late', 'provider',
           'match/2026-27-v2', 'exhibition'
         )`
    );

    const stored = await client.query<{ id: string; role: string }>(
      "select id, role from models order by id"
    );
    expect(stored.rows).toEqual([
      { id: "entrant/one", role: "entrant" },
      { id: "exhibition/late", role: "exhibition" },
      { id: "reference/elo", role: "reference" }
    ]);

    // The check widened by exactly one word; anything else is still refused.
    await expect(client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'guest/one', 'Guest', 'vendor/guest', 'provider',
         'match/2026-27-v2', 'guest'
       )`
    )).rejects.toMatchObject({ code: "23514" });
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
      "competitions",
      "contexts",
      "fixtures",
      "fpl_player_points",
      "fpl_players",
      "fpl_runs",
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
      "squad_changes",
      "understat_match_xg"
    ]);
  });

  test("keeps a historical match whose source carried no shot counts", async () => {
    await client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals,
         home_shots, away_shots, home_shots_on_target, away_shots_on_target
       ) values (
         'PL', '2025-26', 'Premier League', '2025-08-15T00:00:00Z',
         'Liverpool', 'Bournemouth', 4, 2, 19, 10, 10, 3
       ), (
         'PL', '1993-94', 'Premier League', '1993-08-14T00:00:00Z',
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
           competition, season, division, played_on, home_team, away_team,
           home_goals, away_goals, ${column}
         ) values (
           'PL', '2025-26', 'Premier League', '2025-08-15T00:00:00Z',
           'Liverpool', 'Bournemouth', 4, 2, ${value}
         )`
      )).rejects.toMatchObject({ code: "23514" });
    }
  });

  // The curated list and the check constraint hold the same four names in two
  // languages, and only one of them can be typechecked. "Segunda División"
  // has to match migration 0026 accent for accent, and nothing said so until
  // an insert failed — in production, mid-backfill. Every name, every
  // Competition, driven through the constraint. **Found by review.**
  test("accepts every division name the curated list holds", async () => {
    for (const competition of MATCH_PROMPT_COMPETITIONS) {
      const divisions = divisionsOf(competition);
      expect(divisions).toBeDefined();
      for (const { name } of divisions!) {
        await expect(client.query(
          `insert into historical_matches (
             competition, season, division, played_on, home_team, away_team,
             home_goals, away_goals
           ) values ($1, '1999-00', $2, '2000-05-01T00:00:00Z', $3, $4, 1, 0)`,
          [competition, name, `Home ${name}`, `Away ${name}`]
        )).resolves.toBeDefined();
      }
    }
  });

  test("refuses a division name the curated list does not hold", async () => {
    await expect(client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values (
         'PD', '1999-00', 'Segunda Division', '2000-05-01T00:00:00Z',
         'Home', 'Away', 1, 0
       )`
    )).rejects.toMatchObject({ code: "23514" });
  });

  test("refuses a negative stat on a player's Settled Gameweek", async () => {
    await storeGameweek();

    // `total_points` is deliberately absent: it goes negative on a red card or
    // an own goal, and it is the one number here that legitimately can.
    const nonNegative: PlayerPointsStat[] = [
      "minutes",
      "goals_scored",
      "assists",
      "clean_sheets",
      "bonus",
      "yellow_cards",
      "red_cards",
      "saves",
      "expected_goals",
      "expected_assists",
      "expected_goals_conceded"
    ];

    for (const stat of nonNegative) {
      await expect(storePlayerPoints(client, {
        gameweek: 1,
        fplId: 1,
        [stat]: -1
      })).rejects.toMatchObject({ code: "23514" });
    }
  });

  test("refuses a player's Gameweek points that carry no stat set", async () => {
    await storeGameweek();

    // The narrow shape migration 0015 widened away from. Accepting it would
    // let a row exist that says a player took seven points off a Gameweek with
    // nothing on record about how -- which is exactly what the guard in that
    // migration refuses to invent for the rows that already existed.
    await expect(client.query(
      `insert into fpl_player_points (season, gw, fpl_id, minutes, total_points)
       values ('2026-27', 1, 1, 90, 7)`
    )).rejects.toMatchObject({ code: "23502" });
  });

  test("keeps a player's expected-goals family at the source's two decimals", async () => {
    await storeGameweek();
    await storePlayerPoints(client, {
      gameweek: 1,
      fplId: 1,
      minutes: 90,
      total_points: 8,
      goals_scored: 1,
      expected_goals: 0.5,
      expected_assists: 0.25,
      expected_goals_conceded: 1.5
    });

    // Fixed-point, so a stat reads back as the source spelled it rather than
    // as the nearest float to it.
    const stored = await client.query(
      `select expected_goals, expected_assists, expected_goals_conceded
         from fpl_player_points`
    );
    expect(stored.rows).toEqual([{
      expected_goals: "0.50",
      expected_assists: "0.25",
      expected_goals_conceded: "1.50"
    }]);
  });

  test("keeps Fixtures with the same FPL id in different Seasons", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2025-26', 1, '2025-08-15T17:30:00Z'),
         ('2026-27', 1, '2026-08-21T17:30:00Z');
       insert into fixtures (
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values
         ('2025-26', 1, 1, 'Liverpool', 'Bournemouth', '2025-08-15T19:00:00Z'),
         ('2026-27', 1, 1, 'Arsenal', 'Coventry City', '2026-08-21T19:00:00Z')`
    );

    const fixtures = await client.query(
      "select season, fixture_id from fixtures order by season"
    );
    expect(fixtures.rows).toEqual([
      { season: "2025-26", fixture_id: 1 },
      { season: "2026-27", fixture_id: 1 }
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

  test("rejects a Squad Change observed at or after its Gameweek deadline", async () => {
    await storeGameweek();

    await expect(client.query(
      `insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         'PL', '2026-27', 1, 'Spurs', 'in', 'Sandro Tonali', 'Newcastle United',
         '£92.5m', false, '2026-07-06', '2026-08-21T17:30:00Z'
       )`
    )).rejects.toMatchObject({
      constraint: "squad_change_precedes_deadline"
    });
  });

  // Migration 0027. The Spanish transfer list files no move under a date, so
  // the column has to take a null -- and the identity index has to keep
  // meaning something once it does, which is what `nulls not distinct` buys.
  // Without it Postgres holds every pair of nulls apart and the constraint
  // stops applying to exactly the league that introduced the case.
  describe("a Squad Change the source stated no date for", () => {
    const move = (player: string): Promise<unknown> => client.query(
      `insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         'PL', '2026-27', 1, 'Spurs', 'in', $1, 'Real Madrid',
         null, false, null, '2026-08-21T17:00:00Z'
       )`,
      [player]
    );

    test("is stored with a null date", async () => {
      await storeGameweek();

      await move("Undated Player");

      const stored = await client.query<{ dated_on: Date | null }>(
        "select dated_on from squad_changes"
      );
      expect(stored.rows).toEqual([{ dated_on: null }]);
    });

    test("is refused a second time under the same identity", async () => {
      await storeGameweek();
      await move("Undated Player");

      await expect(move("Undated Player")).rejects.toMatchObject({
        constraint: "squad_changes_identity"
      });
    });
  });

  // The hazard 0024 named for the two history tables, one ticket later and one
  // table over: a Spanish row *saying* `PL` is what nothing downstream can
  // catch, because it points at a real Premier League Gameweek. A row saying
  // nothing is caught, and this pins where -- the Lock trigger reaches the
  // unsaid Competition before the not-null does, because it runs `before
  // insert` and its `select ... into` finds no Gameweek to match a null. The
  // message names a Gameweek rather than a Competition, which is the level the
  // guard actually works at; what matters is that the row does not land.
  test("refuses a Squad Change that does not name its Competition", async () => {
    await storeGameweek();

    await expect(client.query(
      `insert into squad_changes (
         season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         '2026-27', 1, 'Spurs', 'in', 'Sandro Tonali', 'Newcastle United',
         '£92.5m', false, '2026-07-06', '2026-08-21T17:00:00Z'
       )`
    )).rejects.toThrow("a Squad Change requires a Gameweek");
  });

  test("rejects moving a deadline across an existing Squad Change", async () => {
    await storeGameweek();
    await client.query(
      `insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         'PL', '2026-27', 1, 'Spurs', 'in', 'Sandro Tonali', 'Newcastle United',
         '£92.5m', false, '2026-07-06', '2026-08-21T17:00:00Z'
       )`
    );

    await expect(client.query(
      `update gameweeks
          set deadline_at = '2026-08-21T17:00:00Z'
        where season = '2026-27' and gw = 1`
    )).rejects.toMatchObject({
      constraint: "gameweek_deadline_preserves_squad_change_lock"
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
           season, fixture_id, gw, home_team, away_team, kickoff_at
         ) values (
           '2026-27', 1, 99, 'Arsenal', 'Coventry City',
           '2026-08-21T19:00:00Z'
         )`
      ),
      () => client.query(
        `insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at
         ) values (
           '2026-27', 2, 1, 99, 'Leeds United', 'Everton',
           '2026-08-22T14:00:00Z'
         )`
      ),
      () => client.query(
        `insert into contexts (season, gw, track, fixture_id, hash, body)
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
      ),
      // The six below join the list with migration 0022, which drops both
      // primary keys with `cascade` and writes every foreign key into them
      // back out again. This test is the whole reason that is safe to do —
      // a key the migration forgets to restore is a row this refuses today
      // and would accept then — so it has to name all twelve, not the half
      // of them it happened to cover before.
      () => client.query(
        `insert into prediction_runs (
           season, gw, trigger, scheduled_for, started_at
         ) values ('2026-27', 99, 'main', now(), now())`
      ),
      // Predictions point at a Fixture rather than a Gameweek, and the Lock
      // trigger passes a Fixture that is not there at all: nothing is unlocked,
      // so the key is what refuses it.
      () => client.query(
        `insert into contexts (season, gw, track, fixture_id, hash, body)
         values ('2026-27', 1, 'match', 99, 'orphan', 'context');
         insert into predictions (
           model_id, season, fixture_id, probs, pred_home, pred_away,
           context_id, attempts_used
         ) values (
           'entrant/v1', '2026-27', 99, '{"H":0.5,"D":0.3,"A":0.2}', 1, 0,
           (select id from contexts where hash = 'orphan'), 0
         )`
      ),
      // The four FPL-side tables. Their own pre-deadline triggers raise
      // `23503` for a Gameweek that does not exist, which is the same answer
      // the key gives and the same one asserted below.
      () => client.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added, observed_at
         ) values (
           '2026-27', 99, 1, 'Arsenal', 'Raya', 'GKP', 60,
           'a', null, '', null, '2026-08-21T17:00:00Z'
         )`
      ),
      () => client.query(
        `insert into fpl_player_points (
           season, gw, fpl_id, minutes, total_points, goals_scored, assists,
           clean_sheets, bonus, yellow_cards, red_cards, saves,
           expected_goals, expected_assists, expected_goals_conceded
         ) values ('2026-27', 99, 1, 90, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`
      ),
      () => client.query(
        `insert into fpl_runs (season, gw, scheduled_for, started_at)
         values ('2026-27', 99, now(), now())`
      ),
      () => client.query(
        `insert into squad_changes (
           competition, season, gw, club, direction, player, counterpart_club,
           fee, loan, dated_on, observed_at
         ) values (
           'PL', '2026-27', 99, 'Spurs', 'in', 'Sandro Tonali', 'Newcastle United',
           '£92.5m', false, '2026-07-06', '2026-08-21T17:00:00Z'
         )`
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
      `insert into contexts (season, gw, track, fixture_id, hash, body)
       values ('2026-27', 1, 'fpl', 1, 'fpl-hash', 'context')`
    )).rejects.toMatchObject({ code: "23514" });

    // A Match context is one Fixture's and every Entrant sees the same text;
    // an FPL context is one Entrant's, because it carries that Entrant's own
    // Squad. Naming the wrong one of the two is refused in both directions.
    await expect(client.query(
      `insert into contexts (season, gw, track, fixture_id, model_id, hash, body)
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
         season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       update fixtures
          set gw = 2
        where season = '2026-27' and fixture_id = 1`
    );

    await expect(client.query(
      `update fixtures
          set locked_in_gw = 2
        where season = '2026-27' and fixture_id = 1`
    )).rejects.toMatchObject({
      code: "55000",
      message: "a Fixture's locked Gameweek is immutable"
    });

    const fixture = await client.query(
      "select gw, locked_in_gw from fixtures"
    );
    expect(fixture.rows).toEqual([{ gw: 2, locked_in_gw: 1 }]);
  });

  test("keeps a Gameweek's deadline once a Fixture has locked into it",
    async () => {
      await client.query(
        `insert into gameweeks (season, gw, deadline_at) values
           ('2026-27', 1, '2026-08-21T17:30:00Z'),
           ('2026-27', 2, '2026-08-28T17:30:00Z');
         insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at
         ) values (
           '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
           '2026-08-21T19:00:00Z'
         )`
      );

      // Nothing has committed under Gameweek 2, so its deadline still follows
      // the schedule — which is the state a Competition adopted mid-Season
      // arrives in, and the reason the condition is not the clock.
      await client.query(
        `update gameweeks set deadline_at = '2026-08-28T15:00:00Z'
          where season = '2026-27' and gw = 2`
      );

      await expect(client.query(
        `update gameweeks set deadline_at = '2026-08-21T15:00:00Z'
          where season = '2026-27' and gw = 1`
      )).rejects.toMatchObject({
        code: "55000",
        message: "a Gameweek deadline is immutable once a Fixture has locked into it"
      });

      // Rewriting the value it already holds is the ordinary case: every fetch
      // upserts the deadlines it derived.
      await client.query(
        `update gameweeks set deadline_at = '2026-08-21T17:30:00Z'
          where season = '2026-27' and gw = 1`
      );

      const deadlines = await client.query(
        "select gw, deadline_at from gameweeks order by gw"
      );
      expect(deadlines.rows.map(({ gw, deadline_at: at }) => [
        gw,
        (at as Date).toISOString()
      ])).toEqual([
        [1, "2026-08-21T17:30:00.000Z"],
        [2, "2026-08-28T15:00:00.000Z"]
      ]);
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
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 1, 1, 'Arsenal', 'Coventry City',
         '2026-08-21T19:00:00Z'
       );
       insert into contexts (
         season, gw, track, fixture_id, hash, body
       ) values (
         '2026-27', 1, 'match', 1, 'context-hash', 'context'
       )`
    );

    await expect(client.query(
      `insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away,
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
         season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values (
         '2026-27', 2, 1, 1, 'Leeds United', 'Everton',
         '2026-08-22T14:00:00Z'
       );
       insert into contexts (
         season, gw, track, fixture_id, hash, body
       ) values (
         '2026-27', 1, 'match', 2, 'context-hash', 'context'
       );
       insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away,
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
          and fixture_id = 2`
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

  test("pairs every dashboard_read grant with a select policy", async () => {
    const role = await client.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'dashboard_read'"
    );
    // A privilege role and nothing else (ADR-0027): the Worker's login role is
    // provisioned outside migrations and granted membership in this one.
    expect(role.rows).toEqual([{ rolcanlogin: false }]);

    const namesOf = async (sql: string): Promise<string[]> =>
      (await client.query<{ relname: string }>(sql)).rows
        .map(({ relname }) => relname);

    const granted = await namesOf(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and has_table_privilege('dashboard_read', c.oid, 'select')
        order by c.relname`
    );
    const policied = await namesOf(
      `select c.relname
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where p.polcmd = 'r'
          and 'dashboard_read'::regrole = any(p.polroles)
        order by c.relname`
    );

    // Row Level Security is on every table here, so a grant without a policy
    // selects zero rows and reports no error. The two lists being equal is what
    // makes that failure loud, and a later migration adding a table the
    // dashboard reads has to carry both halves to keep it that way.
    expect(granted).toEqual([
      "competitions", "contexts", "fixtures", "fpl_player_points",
      "fpl_players", "gameweeks", "manager_states", "models", "predictions",
      "scores"
    ]);

    // `attempts` is the one table granted column by column rather than whole
    // (migration 0021): the squads endpoint reads the last violation off it,
    // and the same row carries a provider's answer verbatim. A column grant is
    // no table privilege at all, so it holds a policy without appearing above —
    // and the columns are what has to be checked instead.
    expect(policied).toEqual(["attempts", ...granted]);
    const readable = async (column: string): Promise<boolean> =>
      (await client.query<{ allowed: boolean }>(
        `select has_column_privilege(
           'dashboard_read', 'attempts', $1, 'select') as allowed`,
        [column]
      )).rows[0]!.allowed;
    expect(await readable("error_kind")).toBe(true);
    expect(await readable("raw_response")).toBe(false);
  });
});

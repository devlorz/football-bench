import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const realMigrationsUrl = new URL("../migrations/", import.meta.url);

type Database = Pick<pg.Client, "query">;

/**
 * Rebuilds the schema as a deployment that stopped at `through` left it, and
 * records each file so `applyMigrations` picks up only what follows.
 *
 * Read from the directory rather than listed here: a test about what one later
 * migration does to rows that already exist should not also have to restate
 * every migration that came before it, and should not need editing when a new
 * one lands ahead of the file it is about.
 */
export async function applyRealMigrationsThrough(
  database: Database,
  through: string
): Promise<void> {
  await database.query(
    `create table schema_migrations (
       filename   text primary key,
       applied_at timestamptz not null default now()
     )`
  );
  const deployed = (await readdir(fileURLToPath(realMigrationsUrl)))
    .filter((entry) => entry.endsWith(".sql"))
    .sort()
    .filter((entry) => entry <= through);

  for (const filename of deployed) {
    await database.query(
      await readFile(new URL(filename, realMigrationsUrl), "utf8")
    );
    await database.query(
      "insert into schema_migrations (filename) values ($1)",
      [filename]
    );
  }
}

/**
 * A small but complete Premier League record under the one-league key: a
 * Locked Gameweek, a settled Fixture and one still to play, the context an
 * Entrant was sent, its Prediction, a refused call, the run that produced them
 * and the score they earned.
 *
 * One row in each of the seven tables migration 0022 rekeys, which is what
 * makes "readable and identical" checkable on the other side of it.
 *
 * Every value here is an input and none of them is asserted. What the test
 * expects is this record read back from the migrated database, so a number
 * typed here cannot make the migration look right — change `0.21` to anything
 * and the test still passes or still fails for the same reasons. Whether the
 * scorer's own output survives is a question about real rows, and
 * `npm run db:rehearse` is what asks it, against the live record.
 */
export async function seedPremierLeagueRecord(
  database: Database
): Promise<void> {
  await database.query(
    `insert into models (
       id, name, base_model, provider, prompt_version, role
     ) values (
       'entrant/v1', 'Entrant', 'provider/base-model', 'provider',
       'match/2026-27-v2', 'entrant'
     );
     insert into gameweeks (season, gw, deadline_at)
     values ('2026-27', 1, '2026-08-21T17:30:00Z');
     insert into fixtures (
       season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at,
       result
     ) values (
       '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City',
       '2026-08-21T19:00:00Z',
       '{"home_goals": 2, "away_goals": 1, "outcome": "H"}'
     ), (
       '2026-27', 2, 1, 1, 'Leeds United', 'Everton',
       '2026-08-22T14:00:00Z', null
     );
     insert into contexts (season, gw, track, fpl_id, hash, body)
     values ('2026-27', 1, 'match', 1, 'context-hash', 'the context');
     insert into predictions (
       model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
       rationale, attempts_used
     ) values (
       'entrant/v1', '2026-27', 1, '{"H":0.5,"D":0.3,"A":0.2}', 2, 1,
       (select id from contexts), 'because', 1
     );
     insert into attempts (
       model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
       trigger
     ) values (
       'entrant/v1', '2026-27', 1, 'match', 1, 0, false, 'schema', 'main'
     );
     insert into prediction_runs (
       season, gw, trigger, scheduled_for, started_at, completed_at
     ) values (
       '2026-27', 1, 'main', '2026-08-21T11:30:00Z',
       '2026-08-21T11:30:04Z', '2026-08-21T11:34:00Z'
     );
     insert into scores (model_id, season, gw, track, metric, value, n)
     values ('entrant/v1', '2026-27', 1, 'match', 'brier', 0.21, 1)`
  );
}

import type { Client } from "pg";

type Database = Pick<Client, "query">;

/**
 * The Lock a rehearsal dates itself from, read out of the database the archive
 * was replayed into.
 *
 * One function for the dry run and the preview because migration 0022 has
 * already made this copy cost twice: `competition` reached every rehearsal
 * query in one edit, and two verbatim copies of the same three-line read is
 * two places for the next such column to be forgotten. The message names the
 * Competition because it is now a parameter — the archive answering for one
 * league and not another is the likeliest way this fails.
 */
export async function readGameweekDeadline(
  database: Database,
  competition: string,
  season: string,
  gameweek: number
): Promise<Date> {
  const result = await database.query<{ deadline_at: Date }>(
    `select deadline_at from gameweeks
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
  );
  const deadline = result.rows[0]?.deadline_at;
  if (deadline === undefined) {
    throw new Error(
      `The archive produced no ${competition} Gameweek ${gameweek} for `
      + `Season ${season}`
    );
  }
  return deadline;
}

import type { Client } from "pg";

type Database = Pick<Client, "query">;

export interface Edition {
  edition: number;
  firstGameweek: number;
}

/**
 * The Edition a Gameweek belongs to: the row with the greatest first Gameweek
 * at or below it (ADR-0061). Every Competition has an Edition 1 at Gameweek 1,
 * so no row means a Competition or Season the record never opened, and that
 * is an error rather than an implicit first Edition.
 */
export async function readEdition(
  database: Database,
  competition: string,
  season: string,
  gameweek: number
): Promise<Edition> {
  const result = await database.query<Edition>(
    `select edition, first_gw as "firstGameweek" from editions
      where competition = $1 and season = $2 and first_gw <= $3
      order by first_gw desc
      limit 1`,
    [competition, season, gameweek]
  );
  const edition = result.rows[0];
  if (edition === undefined) {
    throw new Error(
      `No ${competition} Edition holds Gameweek ${gameweek} of Season ${season}`
    );
  }
  return edition;
}

/**
 * An Edition's first Lock: `deadline_at` of its first Gameweek, read rather
 * than stored, because migration 0025 already makes it immutable once a
 * Fixture locks into it. `null` means that Gameweek is not fetched yet, and no
 * date is invented for it.
 */
export async function readEditionFirstLock(
  database: Database,
  competition: string,
  season: string,
  edition: number
): Promise<Date | null> {
  const result = await database.query<{ deadline_at: Date | null }>(
    `select g.deadline_at from editions e
       left join gameweeks g
         on g.competition = e.competition
        and g.season = e.season
        and g.gw = e.first_gw
      where e.competition = $1 and e.season = $2 and e.edition = $3`,
    [competition, season, edition]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(
      `The record holds no ${competition} Edition ${edition} for Season ${season}`
    );
  }
  return row.deadline_at;
}

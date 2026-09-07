import type { Client } from "pg";
import type { FixtureResult } from "../fixture-result.js";
import { divisionsOf } from "./divisions.js";
import { resolveFootballDataTeamName, teamNamesOf } from "./team-identity.js";

type Database = Pick<Client, "query">;

export interface ProjectSettledFixturesOptions {
  database: Database;
  competition: string;
  season: string;
}

/**
 * ADR-0056: when a Competition's football-data.co.uk fetch fails, its settled
 * Fixtures are already known -- stored that same morning from
 * football-data.org or the FPL API -- and are written into
 * `historical_matches` as the current Season's top flight, shots null. Club
 * names go through `teamNamesOf()` to reach the identity the stored results
 * carry; the second division is football-data.co.uk's alone and is never
 * touched here.
 *
 * No row football-data.co.uk has already answered is touched: an outage
 * spanning several daily runs must not re-null Gameweek 1's real shots while
 * filling in Gameweek 2's gap, so a fixture already stored with shots is left
 * alone and only a missing or still-null row is written. This is what makes
 * the projection safe to run on every day an outage continues, not only the
 * first.
 */
export async function projectSettledFixturesIntoHistoricalMatches({
  database,
  competition,
  season
}: ProjectSettledFixturesOptions): Promise<void> {
  const divisions = divisionsOf(competition);
  if (divisions === undefined) {
    throw new Error(`Competition ${competition} has no curated divisions`);
  }
  const [topFlight] = divisions;
  const names = teamNamesOf(competition);

  // A Fixture with no `result` is one `settledResult` has not written yet --
  // ADR-0050's side of this that already exists, so no second rule for it.
  //
  // `played_on` comes back as text and not as `date`: node-pg parses a bare
  // `date` column as local midnight, which would shift it by the reading
  // session's timezone offset. Text sidesteps the parser and is turned into a
  // UTC instant the same way `fetch-season.ts` builds one from a CSV date.
  const settled = await database.query<{
    home_team: string;
    away_team: string;
    played_on: string;
    result: FixtureResult;
  }>(
    `select home_team, away_team,
            to_char(kickoff_at at time zone 'utc', 'YYYY-MM-DD') as played_on,
            result
       from fixtures
      where competition = $1 and season = $2 and result is not null`,
    [competition, season]
  );

  // Resolved before anything is written: an unreviewed name is exactly the
  // case `resolveFootballDataTeamName()` refuses rather than answers, and
  // writing it anyway would file a promoted club under its Fixture spelling,
  // splitting its record from the identity the league table and every join
  // read it under. `footballDataTeamName()`'s silent fallback is for
  // comparisons against already-stored rows, not for deciding what to store.
  const projected = settled.rows.map((fixture) => {
    const homeTeam = resolveFootballDataTeamName(names, fixture.home_team);
    const awayTeam = resolveFootballDataTeamName(names, fixture.away_team);
    if (homeTeam === undefined || awayTeam === undefined) {
      throw new Error(
        `Competition ${competition} has an unreviewed Fixture team name: `
        + `"${homeTeam === undefined ? fixture.home_team : fixture.away_team}"`
      );
    }
    return { ...fixture, homeTeam, awayTeam };
  });

  await database.query("begin");
  try {
    for (const fixture of projected) {
      await database.query(
        `insert into historical_matches (
           competition, season, division, played_on, home_team, away_team,
           home_goals, away_goals
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (season, division, home_team, away_team) do update set
           played_on  = excluded.played_on,
           home_goals = excluded.home_goals,
           away_goals = excluded.away_goals
         where historical_matches.home_shots is null`,
        [
          competition,
          season,
          topFlight.name,
          new Date(`${fixture.played_on}T00:00:00.000Z`),
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.result.home_goals,
          fixture.result.away_goals
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

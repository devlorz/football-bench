import type { Client } from "pg";
import {
  buildHistoricalContext,
  type HistoricalMatch
} from "../context/build-historical-context.js";
import {
  matchContext,
  type MatchPromptFixture
} from "./openrouter-entrant.js";

type Database = Pick<Client, "query">;

export interface MatchContextData {
  season: string;
  deadline: Date;
  historicalMatches: HistoricalMatch[];
}

export async function loadMatchContextData(
  database: Database,
  season: string,
  gameweek: number
): Promise<MatchContextData> {
  const deadlineResult = await database.query<{ deadline_at: Date }>(
    `select deadline_at
       from gameweeks
      where season = $1 and gw = $2`,
    [season, gameweek]
  );
  const deadline = deadlineResult.rows[0]?.deadline_at;
  if (deadline === undefined) {
    throw new Error(`Gameweek ${season} ${gameweek} does not exist`);
  }
  const historicalMatches = await database.query<HistoricalMatch>(
    `select
       season, division, played_on, home_team, away_team,
       home_goals, away_goals
       from historical_matches
      where played_on < $1
      order by played_on`,
    [deadline]
  );
  return { season, deadline, historicalMatches: historicalMatches.rows };
}

/**
 * The single construction path for the prompt sent by prediction runs and
 * pre-flight. Later context tickets extend this function for both callers.
 */
export function buildMatchContext(
  fixture: MatchPromptFixture,
  data: MatchContextData
): string {
  return matchContext(
    fixture,
    buildHistoricalContext({
      season: data.season,
      asOf: data.deadline,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      matches: data.historicalMatches
    })
  );
}

import type { Client } from "pg";
import {
  buildHistoricalContext,
  type HistoricalMatch
} from "../context/build-historical-context.js";
import {
  buildFplContext,
  type FplPlayer
} from "../context/build-fpl-context.js";
import {
  buildSquadChangesContext,
  type SquadChangeRow
} from "../context/build-squad-changes-context.js";
import {
  matchContext,
  type MatchPromptFixture
} from "./openrouter-entrant.js";
import { resolveUnderstatTeamName } from "../understat/team-identity.js";

type Database = Pick<Client, "query">;

interface StoredMatchXg {
  kicked_off_at: Date;
  home_team: string;
  away_team: string;
  home_xg: string;
  away_xg: string;
}

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Understat rows carry Understat's spelling and a real kick-off instant; stored
 * results carry football-data.co.uk's spelling and the match date. The join is
 * by date and alias-resolved names, and there is deliberately no fallback: an
 * xG row that matches nothing leaves the line reading "xG unavailable", which
 * is the same explicit gap a promoted side's Championship history produces.
 */
function joinXg(
  matches: HistoricalMatch[],
  storedXg: StoredMatchXg[]
): HistoricalMatch[] {
  const byMatch = new Map<string, StoredMatchXg>();
  for (const row of storedXg) {
    const home = resolveUnderstatTeamName(row.home_team);
    const away = resolveUnderstatTeamName(row.away_team);
    if (home === undefined || away === undefined) {
      continue;
    }
    byMatch.set(`${utcDate(row.kicked_off_at)}|${home}|${away}`, row);
  }
  return matches.map((match) => {
    const xg = byMatch.get(
      `${utcDate(match.played_on)}|${match.home_team}|${match.away_team}`
    );
    return xg === undefined
      ? match
      : {
        ...match,
        home_xg: Number(xg.home_xg),
        away_xg: Number(xg.away_xg)
      };
  });
}

export interface MatchContextData {
  competition: string;
  season: string;
  deadline: Date;
  historicalMatches: HistoricalMatch[];
  fplPlayers: FplPlayer[];
  squadChanges: SquadChangeRow[];
}

export async function loadMatchContextData(
  database: Database,
  competition: string,
  season: string,
  gameweek: number
): Promise<MatchContextData> {
  const deadlineResult = await database.query<{ deadline_at: Date }>(
    `select deadline_at
       from gameweeks
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
  );
  const deadline = deadlineResult.rows[0]?.deadline_at;
  if (deadline === undefined) {
    throw new Error(
      `Gameweek ${competition} ${season} ${gameweek} does not exist`
    );
  }
  const historicalMatches = await database.query<HistoricalMatch>(
    `select
       season, division, played_on, home_team, away_team,
       home_goals, away_goals,
       home_shots, away_shots, home_shots_on_target, away_shots_on_target
       from historical_matches
      where played_on < $1
      order by played_on`,
    [deadline]
  );
  // Bounded by the same deadline as the results: an xG row for a Match played
  // after the Lock can never reach a form line.
  const storedXg = await database.query<StoredMatchXg>(
    `select kicked_off_at, home_team, away_team, home_xg, away_xg
       from understat_match_xg
      where kicked_off_at < $1`,
    [deadline]
  );
  const fplPlayers = await database.query<FplPlayer>(
    `select
       fpl_id, team_name, web_name, position, price_tenths, status,
       chance_of_playing_next_round, news, news_added
       from fpl_players
      where competition = $1 and season = $2 and gw = $3
      order by team_name, price_tenths desc, fpl_id`,
    [competition, season, gameweek]
  );
  // Only the Gameweek's own partition: the fetch writes one per rendering
  // Gameweek, and a Gameweek outside the gate simply has none.
  const squadChanges = await database.query<SquadChangeRow>(
    `select club, direction, player, counterpart_club, fee, loan, dated_on
       from squad_changes
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
  );
  return {
    competition,
    season,
    deadline,
    historicalMatches: joinXg(historicalMatches.rows, storedXg.rows),
    fplPlayers: fplPlayers.rows,
    squadChanges: squadChanges.rows
  };
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
    [
      buildHistoricalContext({
        competition: data.competition,
        season: data.season,
        asOf: data.deadline,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        matches: data.historicalMatches
      }),
      // Availability is Premier League only and structurally so (ADR-0037):
      // the section is built from the FPL player feed, which has no equivalent
      // in the other leagues. Absent rather than empty -- the empty section
      // reads "no player snapshot loaded for this Gameweek", which in a league
      // that will never have one would apologise for a Gap that is not one.
      data.competition === "PL"
        ? buildFplContext({
          homeTeam: fixture.home_team,
          awayTeam: fixture.away_team,
          players: data.fplPlayers
        })
        : undefined,
      // Undefined outside the render gate, and then the section is absent
      // rather than empty.
      buildSquadChangesContext({
        deadline: data.deadline,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        changes: data.squadChanges
      })
    ].filter((section) => section !== undefined).join("\n\n")
  );
}

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
  buildHeadCoachContext,
  type HeadCoachChangeRow,
  type HeadCoachRow
} from "../context/build-head-coach-context.js";
import {
  matchContext,
  type MatchPromptFixture
} from "./openrouter-entrant.js";
import { resolveUnderstatTeamName } from "../understat/team-identity.js";
import { sourcesOf } from "../fetch/competition-sources.js";
import { SCORES_365_SOURCE } from "../365scores/fetch-match-stats.js";

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
  competition: string,
  matches: HistoricalMatch[],
  storedXg: StoredMatchXg[]
): HistoricalMatch[] {
  const byMatch = new Map<string, StoredMatchXg>();
  for (const row of storedXg) {
    const home = resolveUnderstatTeamName(competition, row.home_team);
    const away = resolveUnderstatTeamName(competition, row.away_team);
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

/**
 * One settled Fixture of this Season with the shots and xG a Fixture-keyed
 * stats source stored against it (ADR-0058), which is how a Competition that
 * is not a league carries the numbers a league carries on its stored results.
 *
 * Read from `team_match_stats` and from nowhere else: `understat_match_xg` is
 * keyed by an Understat match id in a league Understat covers, and
 * `historical_matches` is keyed by a Division a national side does not have
 * (migration 0042). A `null` figure is the source's hole and never a zero.
 *
 * Loaded here and rendered by the section ticket 0073 builds, which is the
 * ticket that decides what a cup's Season lines say and merges these with the
 * recent internationals they would otherwise be listed twice beside. Putting
 * them on the league form lines in the meantime would render a Division a cup
 * does not have.
 */
export interface PlayedFixture {
  kicked_off_at: Date;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  home_shots: number | null;
  away_shots: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_xg: number | null;
  away_xg: number | null;
}

export interface MatchContextData {
  competition: string;
  season: string;
  deadline: Date;
  historicalMatches: HistoricalMatch[];
  playedFixtures: PlayedFixture[];
  fplPlayers: FplPlayer[];
  squadChanges: SquadChangeRow[];
  headCoachChanges: HeadCoachChangeRow[];
  headCoaches: HeadCoachRow[];
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
      where competition = $1 and played_on < $2
      order by played_on`,
    [competition, deadline]
  );
  // Bounded by the same deadline as the results: an xG row for a Match played
  // after the Lock can never reach a form line.
  const storedXg = await database.query<StoredMatchXg>(
    `select kicked_off_at, home_team, away_team, home_xg, away_xg
       from understat_match_xg
      where competition = $1 and kicked_off_at < $2`,
    [competition, deadline]
  );
  // The registry decides which table the shots and xG come from, on the same
  // terms as the daily fetch that wrote them (ADR-0057): a league's are keyed
  // by the league's own match id and joined onto stored results above, and a
  // Competition whose stats source is keyed by Fixture reads its own table
  // here. A Competition that names neither reads nothing and gets no rows,
  // rather than an empty read of a table that has none for it.
  //
  // The join is by date and both stored names, the one `joinXg` above makes:
  // the two sources agree on the day and on the spelling -- the fetch resolves
  // 365Scores' three into the record's before it writes -- and on nothing
  // else, least of all a match id.
  const statsSource = sourcesOf(competition)?.stats;
  const playedFixtures = statsSource === SCORES_365_SOURCE
    ? await database.query<PlayedFixture>(
      `select
         f.kickoff_at as kicked_off_at,
         f.home_team,
         f.away_team,
         (f.result->>'home_goals')::int as home_goals,
         (f.result->>'away_goals')::int as away_goals,
         s.home_shots,
         s.away_shots,
         s.home_shots_on_target,
         s.away_shots_on_target,
         s.home_xg::float8 as home_xg,
         s.away_xg::float8 as away_xg
         from fixtures f
         left join team_match_stats s
           on s.competition = f.competition
          and s.season = f.season
          and s.source = $4
          and s.home_team = f.home_team
          and s.away_team = f.away_team
          and (s.kicked_off_at at time zone 'utc')::date
              = (f.kickoff_at at time zone 'utc')::date
        where f.competition = $1 and f.season = $2
          and f.result is not null and f.kickoff_at < $3
        order by f.kickoff_at`,
      [competition, season, deadline, statsSource]
    )
    : undefined;
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
  // The Gameweek's own partition, on the same terms as the Squad Changes
  // above. `dated_on` comes back as text: the render both bounds by it and
  // prints it, and a `date` handed over as local midnight would be a day out
  // on either side of UTC.
  const headCoachChanges = await database.query<HeadCoachChangeRow>(
    `select club, direction, head_coach, manner, dated_on::text as dated_on
       from head_coach_changes
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
  );
  // The same partition again, and the state beside the events: one row per
  // club. Every row comes back and the deadline bound is the renderer's, where
  // the deadline is and where the Changes are bounded too -- no `where` here
  // holds it back.
  const headCoaches = await database.query<HeadCoachRow>(
    `select club, head_coach, observed_at
       from head_coaches
      where competition = $1 and season = $2 and gw = $3`,
    [competition, season, gameweek]
  );
  return {
    competition,
    season,
    deadline,
    historicalMatches: joinXg(
      competition, historicalMatches.rows, storedXg.rows
    ),
    playedFixtures: playedFixtures?.rows ?? [],
    fplPlayers: fplPlayers.rows,
    squadChanges: squadChanges.rows,
    headCoachChanges: headCoachChanges.rows,
    headCoaches: headCoaches.rows
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
        competition: data.competition,
        deadline: data.deadline,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        changes: data.squadChanges
      }),
      // Undefined for a Season whose article is not listed, and then the
      // section is absent rather than empty.
      buildHeadCoachContext({
        competition: data.competition,
        season: data.season,
        deadline: data.deadline,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        headCoaches: data.headCoaches,
        changes: data.headCoachChanges
      })
    ].filter((section) => section !== undefined).join("\n\n"),
    data.competition
  );
}

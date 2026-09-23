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
  NO_TRANSFER_WINDOW,
  type SquadChangeRow
} from "../context/build-squad-changes-context.js";
import {
  buildNationalTeamHeadCoachContext,
  type NationalTeamHeadCoachRow
} from "../context/build-national-team-head-coach-context.js";
import { NATIONAL_TEAM_HEAD_COACHES_SOURCE }
  from "../head-coach/fetch-national-team-head-coaches.js";
import { HEAD_COACH_SEASON_ARTICLE_SOURCE }
  from "../head-coach/head-coach-source.js";
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
import {
  sourcesOf,
  type CompetitionSources
} from "../fetch/competition-sources.js";
import { SCORES_365_SOURCE } from "../365scores/fetch-match-stats.js";
import {
  INTERNATIONAL_RESULTS_SOURCE,
  RESULTS_SNAPSHOT
} from "../international-results/fetch-results.js";
import {
  buildInternationalsContext,
  type InternationalMatch,
  type GroupFixture,
  type InternationalStats,
  type PlayedFixture
} from "../context/build-internationals-context.js";

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

export interface MatchContextData {
  competition: string;
  season: string;
  deadline: Date;
  historicalMatches: HistoricalMatch[];
  playedFixtures: PlayedFixture[];
  /** Sheets stored for internationals outside this Season's Fixtures (ADR-0058). */
  internationalStats: InternationalStats[];
  /** Every Fixture of the cup's league-phase groups, played or not (ticket 0087). */
  groupFixtures: GroupFixture[];
  /**
   * The registry entry the reads above were dispatched by, carried rather than
   * resolved twice: which sections this packet has is the same question as
   * which tables it read, and answering it once is what keeps the two from
   * disagreeing.
   */
  sources: CompetitionSources | undefined;
  internationals: InternationalMatch[];
  /** The date of the dataset's latest row, or null where it was never read. */
  datasetUpdatedOn: string | null;
  fplPlayers: FplPlayer[];
  squadChanges: SquadChangeRow[];
  headCoachChanges: HeadCoachChangeRow[];
  headCoaches: HeadCoachRow[];
  nationalTeamHeadCoaches: NationalTeamHeadCoachRow[];
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
  const sources = sourcesOf(competition);
  const statsSource = sources?.stats;
  // A cup's league-phase groups, every Fixture of every group with its
  // result where it has one, so the packet can put this Fixture's group table
  // in front of an Entrant (migration 0047, ticket 0087). Read whole and not
  // bounded by the Lock: which sides are in a group is a fact about the draw,
  // and the builder counts only what was settled before the Lock. A
  // Competition whose Fixtures name no group reads an empty list.
  const groupFixtures = statsSource === SCORES_365_SOURCE
    ? await database.query<GroupFixture>(
      `select group_name, home_team, away_team, kickoff_at,
              (result->>'home_goals')::int as home_goals,
              (result->>'away_goals')::int as away_goals
         from fixtures
        where competition = $1 and season = $2 and group_name is not null
        order by kickoff_at`,
      [competition, season]
    )
    : undefined;
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
  // The same table once more, for the internationals the dataset holds and
  // this Season's Fixtures do not: sheets backfilled by hand for earlier
  // editions land under the same source and Competition, and are read here by
  // the day and the two sides so a dataset line can carry them. Bounded by
  // the Lock like everything else this loader reads.
  const internationalStats = statsSource === SCORES_365_SOURCE
    ? await database.query<InternationalStats>(
      `select
         (kicked_off_at at time zone 'utc')::date::text as played_on,
         home_team, away_team,
         home_shots, away_shots, home_shots_on_target, away_shots_on_target,
         home_xg::float8 as home_xg, away_xg::float8 as away_xg
         from team_match_stats
        where competition = $1 and source = $2 and kicked_off_at < $3`,
      [competition, statsSource, deadline]
    )
    : undefined;
  // The registry again, and the same rule the shots and xG above are read by:
  // a Competition whose history is the GitHub dataset reads
  // `international_results`, and one that does not name it never opens that
  // table at all (ADR-0057).
  //
  // Not the symmetric claim, deliberately: `historical_matches` above is read
  // for every Competition and filtered by its `competition` column, which
  // returns nothing for a cup because nothing may be written there for one
  // (migration 0042 leaves the Division check where it is). The gate is here
  // because this table has no such column to filter by, and could not have
  // one -- a national side plays in several competitions under none of this
  // record's codes.
  //
  // Bounded by the Lock's own UTC day, exclusive, because the dataset carries
  // days and not instants -- and read back as text for the same reason, since
  // a `date` handed over as local midnight would be a day out on either side
  // of UTC. The renderer bounds the rows again; this keeps the read honest on
  // its own.
  const internationals = sources?.history === INTERNATIONAL_RESULTS_SOURCE
    ? await database.query<InternationalMatch>(
      `select
         played_on::text as played_on, home_team, away_team,
         home_goals, away_goals, tournament, country, neutral
         from international_results
        where played_on < ($1 at time zone 'utc')::date
        order by played_on`,
      [deadline]
    )
    : undefined;
  // How fresh that file was when it was last read, which is a fact about the
  // file and not about its rows: its latest row is usually a match between two
  // sides no Competition here stores (migration 0043).
  const datasetRead = internationals === undefined
    ? undefined
    : await database.query<{ latest_row_on: string }>(
      `select latest_row_on::text as latest_row_on
         from international_results_source where source = $1`,
      [RESULTS_SNAPSHOT]
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
  // The Gameweek's own partition, on the same terms as the Squad Changes
  // above, and only for a Competition whose registry entry names the season
  // articles. `dated_on` comes back as text: the render both bounds by it and
  // prints it, and a `date` handed over as local midnight would be a day out
  // on either side of UTC.
  //
  // The gate is the registry's and not the `where` clause's, though both these
  // tables carry a `competition` column and a cup's partition is empty. That
  // is the asymmetry ticket 0073 left between `historical_matches` and
  // `international_results` and ticket 0074 did not want twice: which of the
  // two Head Coach stores a Competition reads is one fact, it is written in
  // one place, and a reader that asks it in one direction and leans on an
  // empty partition in the other has to be read twice to be believed.
  const seasonArticles =
    sources?.headCoaches === HEAD_COACH_SEASON_ARTICLE_SOURCE;
  const headCoachChanges = seasonArticles
    ? await database.query<HeadCoachChangeRow>(
      `select club, direction, head_coach, manner, dated_on::text as dated_on
         from head_coach_changes
        where competition = $1 and season = $2 and gw = $3`,
      [competition, season, gameweek]
    )
    : undefined;
  // The same partition again, and the state beside the events: one row per
  // club. Every row comes back and the deadline bound is the renderer's, where
  // the deadline is and where the Changes are bounded too -- no `where` here
  // holds it back.
  const headCoaches = seasonArticles
    ? await database.query<HeadCoachRow>(
      `select club, head_coach, observed_at
         from head_coaches
        where competition = $1 and season = $2 and gw = $3`,
      [competition, season, gameweek]
    )
    : undefined;
  // The cup's Head Coaches, from the other of the two sources the registry
  // dispatches on, and read only for a Competition whose entry names it -- the
  // gate `international_results` is behind, for the same reason (ADR-0057):
  // this table has no Competition column to filter by and could not have one,
  // because the same side's Head Coach answers for every Competition it plays
  // in.
  //
  // Every day's snapshot and not only the newest, because a Change here is the
  // difference between two of them (migration 0045). Bounded by the Lock, and
  // the renderer bounds it again: this store has no trigger holding that line
  // for itself, so the read is kept honest on its own.
  const nationalTeamHeadCoaches =
    sources?.headCoaches === NATIONAL_TEAM_HEAD_COACHES_SOURCE
      ? await database.query<NationalTeamHeadCoachRow>(
        `select
           team, observed_on::text as observed_on, observed_at,
           head_coach, assumed_on::text as assumed_on
           from national_team_head_coaches
          where observed_at < $1
          order by team, observed_on`,
        [deadline]
      )
      : undefined;
  return {
    competition,
    season,
    deadline,
    historicalMatches: joinXg(
      competition, historicalMatches.rows, storedXg.rows
    ),
    playedFixtures: playedFixtures?.rows ?? [],
    internationalStats: internationalStats?.rows ?? [],
    groupFixtures: groupFixtures?.rows ?? [],
    sources,
    internationals: internationals?.rows ?? [],
    datasetUpdatedOn: datasetRead?.rows[0]?.latest_row_on ?? null,
    fplPlayers: fplPlayers.rows,
    squadChanges: squadChanges.rows,
    headCoachChanges: headCoachChanges?.rows ?? [],
    headCoaches: headCoaches?.rows ?? [],
    nationalTeamHeadCoaches: nationalTeamHeadCoaches?.rows ?? []
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
      // One history section, chosen by the registry the fetch that wrote the
      // rows was dispatched by (ADR-0057). A cup gets the recent-internationals
      // section *instead of* the league one and not beside it: the league
      // section is built on Divisions, a table and prior-Season positions, and
      // for a Competition with none of those it renders four lines saying so
      // and one -- "no matches played" -- that stops being true the moment a
      // matchday settles.
      data.sources?.history === INTERNATIONAL_RESULTS_SOURCE
        ? buildInternationalsContext({
          competition: data.competition,
          asOf: data.deadline,
          homeTeam: fixture.home_team,
          awayTeam: fixture.away_team,
          internationals: data.internationals,
          playedFixtures: data.playedFixtures,
          internationalStats: data.internationalStats,
          groupFixtures: data.groupFixtures,
          datasetUpdatedOn: data.datasetUpdatedOn
        })
        : buildHistoricalContext({
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
      // The registry once more, and the third of the three dispatches this
      // builder makes on it: a Competition whose entry names no Squad Change
      // source states the absence, and one that names a source renders the
      // window's own section (ADR-0057). The gate is the registry's and not
      // the window table's, for the reason ticket 0074 gave for the Head
      // Coach reads -- `squadChangeWindow` also returns undefined for a cup,
      // because no window is written down for one, but that is a Competition
      // between two windows and this is a Competition that has none, and a
      // reader cannot tell those apart from an `undefined`.
      //
      // The two above match on a source name and this one matches on `null`,
      // which is the shape of the question and not an inconsistency: those
      // fields hold two sources each and the dispatch picks between them,
      // while `squadChanges` holds one source or nothing and what is being
      // asked is whether this Competition has it at all. A Competition with
      // no registry entry is neither, and falls to the builder below exactly
      // as it does for the history section.
      //
      // Undefined inside the other branch is still the render gate: a league
      // Gameweek outside its window states no squad movement at all rather
      // than a stale list (ADR-0031), and then the section is absent rather
      // than empty.
      data.sources?.squadChanges === null
        ? NO_TRANSFER_WINDOW
        : buildSquadChangesContext({
          competition: data.competition,
          deadline: data.deadline,
          homeTeam: fixture.home_team,
          awayTeam: fixture.away_team,
          changes: data.squadChanges
        }),
      // One Head Coach section, chosen by the registry the fetch that wrote
      // the rows was dispatched by, exactly as the history section above is
      // (ADR-0057). A cup gets the current-list section *instead of* the
      // season-article one and not beside it: that one is built on a club
      // competition's dated Managerial changes, and this source publishes no
      // event at all -- who is in post today, and a Change is the difference
      // between two mornings of it.
      //
      // The season-article builder is still the `else`, and still undefined
      // for a Season whose article is not listed, and then the section is
      // absent rather than empty.
      data.sources?.headCoaches === NATIONAL_TEAM_HEAD_COACHES_SOURCE
        ? buildNationalTeamHeadCoachContext({
          deadline: data.deadline,
          homeTeam: fixture.home_team,
          awayTeam: fixture.away_team,
          headCoaches: data.nationalTeamHeadCoaches
        })
        : buildHeadCoachContext({
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

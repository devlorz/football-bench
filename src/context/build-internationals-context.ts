import {
  baseRatesClause,
  matchCount,
  NO_PRIOR_MEETING,
  NO_RESULT_YET,
  type MatchPerformance,
  performanceSegments,
  xgRatePerGame,
  type SideMatch
} from "./build-historical-context.js";
import {
  datasetNameOf,
  STORED_FROM,
  UnknownInternationalCompetitionError
} from "../international-results/fetch-results.js";

/**
 * One row of `international_results` as the packet reads it: a date rather
 * than an instant, because the dataset carries days and a `date` handed over
 * as local midnight would be a day out on either side of UTC.
 */
export interface InternationalMatch {
  played_on: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  /**
   * The dataset's own column and its own word (migration 0042): "FIFA World
   * Cup", "Friendly", "UEFA Nations League". Printed as the source spells it
   * and never translated into this project's vocabulary, where it would claim
   * to be a Competition.
   */
  tournament: string;
  country: string;
  neutral: boolean;
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

export interface BuildInternationalsContextOptions {
  competition: string;
  asOf: Date;
  homeTeam: string;
  awayTeam: string;
  internationals: InternationalMatch[];
  playedFixtures: PlayedFixture[];
  /**
   * Shots and xG a Fixture-keyed stats source stored for internationals that
   * are the dataset's rows and not this Season's Fixtures -- earlier editions,
   * backfilled by hand (`stats:backfill`). Joined to a dataset line by the day
   * and the two sides, the key the merge below already uses. A dataset match
   * with no row here says nothing about its shots: a sheet was never asked
   * for, which is the ordinary case for a friendly and not a hole.
   */
  internationalStats?: InternationalStats[];
  /** The cup's groups; empty where the schedule names none. */
  groupFixtures?: GroupFixture[];
  /** The date of the dataset's latest row, or null if it was never read. */
  datasetUpdatedOn: string | null;
}

/**
 * One Fixture of a cup's league-phase group, played or not: the group is the
 * draw's, and a table that listed only the sides that had played would leave
 * a group of four reading as a group of two after one matchday.
 */
export interface GroupFixture {
  group_name: string;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
  home_goals: number | null;
  away_goals: number | null;
}

/** One `team_match_stats` row as the packet reads it, keyed the dataset's way. */
export interface InternationalStats extends MatchPerformance {
  played_on: string;
  home_team: string;
  away_team: string;
}

/** How many of a side's internationals the section shows (ADR-0057). */
const RECENT = 5;

/**
 * ADR-0058's sentence, amended by ticket 0072 and rendered here: a settled
 * Fixture that carries neither shots nor xG. A Fixture whose sheet carried the
 * shots and no xG is a hole, and reads "xG unavailable" beside its shots the
 * way the other five Competitions' form lines already do.
 *
 * A constant because it is frozen text, and two copies of frozen text are two
 * things to edit and one of them will be missed.
 */
const NO_STATS = "no shots or xG stored for this Fixture";

/** What a side with nothing in the window says, rather than an absent block. */
const NO_INTERNATIONAL = "no international stored for this side.";

/**
 * The first of the packet's stated absences (ADR-0057, story 39 of spec
 * 0027), and it is stated rather than dropped for the reason the whole
 * section exists: the league section this one replaces opens with a table, so
 * a cup packet that simply had no table would leave an Entrant to work out
 * whether one was missing or whether the Competition has none. The second
 * clause says which -- these sides play no league, so there is no table to be
 * missing, and what a group of four playing six matches did is on the form
 * lines below.
 */
const NO_LEAGUE_TABLE = "League table: no league table for this Competition; "
  + "a national side plays no league.";

/**
 * The group's table where this Fixture's sides are in one (ticket 0087): the
 * league phase is four sides playing each other home and away, so the table
 * is what the league's is to a league -- what has been settled so far, and
 * where each side stands before this Fixture. Points, goal difference, goals
 * scored, then name, which is the ordering the league table uses; UEFA's own
 * tie-breaks (head-to-head first) are not applied, and the line says so.
 *
 * Every side of the group is a row from the first day, at nought, so a group
 * reads as four before any of them has played. Only results settled before
 * the Lock count.
 */
function groupTable(
  fixtures: GroupFixture[],
  homeTeam: string,
  asOf: Date
): string[] {
  const group = fixtures.find((fixture) =>
    fixture.home_team === homeTeam || fixture.away_team === homeTeam)?.group_name;
  if (group === undefined) {
    return [NO_LEAGUE_TABLE];
  }
  const members = fixtures.filter((fixture) => fixture.group_name === group);
  const sides = [...new Set(members.flatMap((fixture) =>
    [fixture.home_team, fixture.away_team]))];
  const settled = members.filter((fixture) =>
    fixture.home_goals !== null && fixture.away_goals !== null
    && fixture.kickoff_at.getTime() < asOf.getTime());
  const rows = sides.map((side) => {
    let played = 0; let won = 0; let drawn = 0; let lost = 0;
    let scored = 0; let conceded = 0;
    for (const fixture of settled) {
      const home = fixture.home_team === side;
      if (!home && fixture.away_team !== side) {
        continue;
      }
      const goalsFor = home ? fixture.home_goals! : fixture.away_goals!;
      const goalsAgainst = home ? fixture.away_goals! : fixture.home_goals!;
      played += 1; scored += goalsFor; conceded += goalsAgainst;
      if (goalsFor > goalsAgainst) { won += 1; }
      else if (goalsFor === goalsAgainst) { drawn += 1; }
      else { lost += 1; }
    }
    return {
      side, played, won, drawn, lost, scored, conceded,
      difference: scored - conceded, points: won * 3 + drawn
    };
  }).sort((left, right) =>
    right.points - left.points
    || right.difference - left.difference
    || right.scored - left.scored
    || left.side.localeCompare(right.side));
  const through = settled.length === 0
    ? null
    : utcDate(new Date(Math.max(...settled.map((f) => f.kickoff_at.getTime()))));
  return [
    `${group} table${through === null ? "" : ` (results through ${through})`}:`,
    ...rows.map((row, index) =>
      `${index + 1}. ${row.side} | P ${row.played} W ${row.won} D ${row.drawn} `
      + `L ${row.lost} | GF ${row.scored} GA ${row.conceded} `
      + `GD ${row.difference > 0 ? "+" : ""}${row.difference} | Pts ${row.points}`),
    "Ordered by points, goal difference and goals scored; UEFA's own "
      + "head-to-head tie-breaks are not applied here."
  ];
}

const NO_DATASET_READ = "Dataset last updated: no read of the dataset is "
  + "stored.";

/**
 * One line of a side's recent form, whichever of the two sources it came from.
 * The record's own Fixtures and the dataset's rows are one list and read as
 * one, which is the whole of why they are merged rather than sectioned apart.
 */
interface RecentMatch {
  playedOn: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  tournament: string;
  /** What follows the outcome, if anything: a venue, or a performance. */
  tail: string[];
}

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * The key both sources are deduplicated on: the day and the two sides
 * (ADR-0057). There is no shared id — the dataset has none at all and the
 * record's Fixture ids are UEFA's — and the dataset lags the record by up to a
 * month, so the same match arrives from the record first and from the file
 * weeks later.
 */
/** `YYYY-MM-DD` moved by whole UTC days. */
function shiftDay(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function matchKey(playedOn: string, home: string, away: string): string {
  return `${playedOn}|${home}|${away}`;
}

function fromDataset(
  match: InternationalMatch,
  stats: MatchPerformance | undefined
): RecentMatch {
  return {
    playedOn: match.played_on,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
    tournament: match.tournament,
    // Marked only where it is true, and the only thing the line says about the
    // venue: home-team-first ordering already says who was at home, and a
    // neutral ground is the one case where that ordering means nothing.
    tail: [
      ...(match.neutral ? [`neutral venue in ${match.country}`] : []),
      // The figures where a sheet was read for this match; silence where none
      // was, which is not the stated absence a settled Fixture gets.
      ...(stats === undefined ? [] : [performanceSegments(stats).join(", ")])
    ]
  };
}

function fromRecord(
  competitionName: string,
  fixture: PlayedFixture
): RecentMatch {
  // Every figure absent is a settled Fixture no sheet was stored for, which is
  // a different thing from a sheet that carried shots and no xG (ADR-0058, as
  // ticket 0072 amended it). Asked of the six figures rather than of the
  // rendered segments, so that the sentence follows the rule and not the
  // wording of whatever `performanceSegments` returns today.
  const nothingStored = fixture.home_shots === null
    && fixture.away_shots === null
    && fixture.home_shots_on_target === null
    && fixture.away_shots_on_target === null
    && fixture.home_xg === null
    && fixture.away_xg === null;
  return {
    playedOn: utcDate(fixture.kicked_off_at),
    homeTeam: fixture.home_team,
    awayTeam: fixture.away_team,
    homeGoals: fixture.home_goals,
    awayGoals: fixture.away_goals,
    tournament: competitionName,
    tail: [nothingStored
      ? NO_STATS
      : performanceSegments(fixture).join(", ")]
  };
}

function outcome(match: RecentMatch, team: string): "W" | "D" | "L" {
  const home = match.homeTeam === team;
  const goalsFor = home ? match.homeGoals : match.awayGoals;
  const goalsAgainst = home ? match.awayGoals : match.homeGoals;
  return goalsFor > goalsAgainst ? "W" : goalsFor === goalsAgainst ? "D" : "L";
}

/**
 * A form line where a side is named, and a score-only line where none is: the
 * head-to-head section carries neither the outcome letter nor the
 * performance, on the same rule the league section's does -- an outcome is
 * relative to a side, and performance signals belong on the form lines, where
 * recent performance is what the section is for.
 */
function matchLine(match: RecentMatch, team?: string): string {
  return [
    `- ${match.tournament}`,
    match.playedOn,
    `${match.homeTeam} ${match.homeGoals}-${match.awayGoals} ${match.awayTeam}`,
    ...(team === undefined ? [] : [outcome(match, team), ...match.tail])
  ].join(" | ");
}

/**
 * One side's five latest matches before the Lock, newest first, from both
 * sources with the record winning every collision: it is the record that
 * carries the shots and xG, and the dataset's copy of the same match would
 * lose them.
 */
function recentOf(matches: RecentMatch[], team: string): RecentMatch[] {
  return matches
    .filter((match) => match.homeTeam === team || match.awayTeam === team)
    .sort((left, right) => right.playedOn.localeCompare(left.playedOn))
    .slice(0, RECENT);
}

/**
 * The anchor ADR-0043 asks for, computed over the stored internationals and
 * never over `historical_matches`: a cup's sides play no league, and a league's
 * rows would be an anchor for somebody else's competition.
 *
 * Matches at a neutral venue are left out, and that is the one judgement in
 * this line. A home-win share over a set in which a third of the matches had
 * no home side understates home advantage for an Entrant reading a Fixture
 * that has one, and the dataset's `neutral` column is there to tell them
 * apart. The count is printed so the share can be weighed against what it was
 * computed over.
 */
function baseRatesLine(internationals: InternationalMatch[]): string {
  const matches = internationals.filter((match) => !match.neutral);
  if (matches.length === 0) {
    return "Base rates: no international played at a home venue is stored.";
  }
  // The line states the whole of what it is over, because none of it is what
  // ADR-0043's own sentence describes: every competition rather than one, a
  // window that opens on a fixed day rather than a Season that closed, and a
  // set that moves with each Gameweek's Lock.
  return `Base rates (internationals in every competition at a home venue, `
    + `${STORED_FROM} to this Lock, ${matchCount(matches.length)}): `
    + baseRatesClause(matches);
}

/**
 * One side's xG for and against per game, over this Season's own Fixtures and
 * over nothing else (ADR-0043, spec 0027 story 41). The dataset has no xG
 * column at all, so these rates can only come from the team-stats table, which
 * is what the merged Fixtures above carry; a side whose Fixtures carry no xG
 * reads `unavailable` rather than a silent zero, under the same
 * both-or-nothing rule the league's rates are read by.
 */
function xgRatesLine(played: PlayedFixture[], team: string): string {
  const mine = played.filter((fixture) =>
    fixture.home_team === team || fixture.away_team === team);
  if (mine.length === 0) {
    return "xG for and against per game, this Season's Fixtures: no Fixture "
      + "played yet.";
  }
  const isHome = (match: SideMatch): boolean => match.home_team === team;
  return "xG for and against per game, this Season's Fixtures: "
    + `${xgRatePerGame(mine, isHome)} overall, `
    + `${xgRatePerGame(mine.filter(isHome), isHome)} home, `
    + `${xgRatePerGame(mine.filter((match) => !isHome(match)), isHome)} away.`;
}

/**
 * How much of this Season the form lines above are drawn from: the count of
 * its settled Fixtures and the day the latest was played. It does the job
 * ADR-0021 gives the league table's heading -- date what is being shown by
 * its latest included result -- and it is a third wording rather than that
 * heading's: the league dates a table (`Premier League table (results through
 * DATE):`), the FPL track dates the same table from another track's fetch,
 * and this dates a set of results that is not a table at all.
 *
 * The Fixtures themselves are on the two sides' lines and not listed again
 * here -- a cup's Season is a hundred and fifty-six of them and a packet is
 * one Fixture's.
 *
 * The empty case is not a third wording: it is `NO_RESULT_YET`, the sentence
 * every league's Gameweek 1 renders, which is the whole of story 40.
 */
function seasonResultsLine(played: PlayedFixture[]): string {
  if (played.length === 0) {
    return `This Season's results: ${NO_RESULT_YET}`;
  }
  const through = Math.max(
    ...played.map((fixture) => fixture.kicked_off_at.getTime())
  );
  return `This Season's results: ${matchCount(played.length)} played, `
    + `through ${utcDate(new Date(through))}.`;
}

/**
 * What these two sides have done to each other, from both sources at once and
 * newest first, which is the section the league packet ends with and the one
 * thing replacing that packet's history section took away. `RECENT` meetings
 * at most, as the form lines carry `RECENT` matches: two national sides meet
 * across decades and the oldest of those is a different team.
 */
function headToHead(
  matches: RecentMatch[],
  homeTeam: string,
  awayTeam: string
): string[] {
  const meetings = matches
    .filter((match) =>
      (match.homeTeam === homeTeam && match.awayTeam === awayTeam)
      || (match.homeTeam === awayTeam && match.awayTeam === homeTeam))
    .sort((left, right) => right.playedOn.localeCompare(left.playedOn))
    .slice(0, RECENT);
  return [
    "Head-to-head history:",
    ...(meetings.length === 0
      ? [NO_PRIOR_MEETING]
      : meetings.map((match) => matchLine(match)))
  ];
}

function teamSection(
  matches: RecentMatch[],
  played: PlayedFixture[],
  team: string
): string[] {
  const recent = recentOf(matches, team);
  return [
    team,
    xgRatesLine(played, team),
    ...(recent.length === 0
      ? [`Last ${RECENT} internationals: ${NO_INTERNATIONAL}`]
      : [
        `Last ${RECENT} internationals:`,
        ...recent.map((match) => matchLine(match, team))
      ])
  ];
}

/**
 * What each side of a cup's Fixture did last: its five most recent
 * internationals across every competition — World Cup, qualifiers, friendlies
 * — from the GitHub dataset (ADR-0057), merged with this Season's settled
 * Fixtures from the record so that the same match is never two lines, and one
 * trailing line saying how fresh the dataset is.
 *
 * This replaces the historical section rather than joining it: that section is
 * built on Divisions, a table and prior-Season positions, and a Competition
 * with none of those would render four lines saying so and one -- "no matches
 * played" -- that is false the moment a matchday settles.
 */
export function buildInternationalsContext(
  options: BuildInternationalsContextOptions
): string {
  // The dataset's own word for this Competition, resolved here the way the
  // league section resolves its Division names: loudly, because the
  // alternative is a merged line labelled with a Competition this source has
  // no name for (ADR-0054).
  const competitionName = datasetNameOf(options.competition);
  if (competitionName === undefined) {
    throw new UnknownInternationalCompetitionError(options.competition);
  }
  // Both sources are re-bounded here as well as in the read, the way the
  // historical section bounds its own rows: what may reach an Entrant is the
  // renderer's claim, and a builder that trusted its caller's `where` would
  // put a result nobody could have known on a form line.
  //
  // The dataset's bound is the Lock's own UTC day and is exclusive, because a
  // row dated that day says nothing about the hour: a match played that
  // morning is lost and one played that evening cannot leak. For a source
  // that lags by a month, one day of form is the cheaper of the two.
  const lockDay = utcDate(options.asOf);
  const internationals = options.internationals
    .filter((match) => match.played_on < lockDay);
  const statsByMatch = new Map((options.internationalStats ?? [])
    .map((row) => [matchKey(row.played_on, row.home_team, row.away_team), row]));
  const merged = new Map(internationals
    .map((match) => {
      const key = matchKey(match.played_on, match.home_team, match.away_team);
      // The dataset dates a match by where it was played and the sheet by
      // UTC, so a late kickoff in the Americas sits one day apart in the two;
      // the same pair a day either side is the same match.
      // ponytail: two sides never meet on consecutive days, so ±1 is safe;
      // widen only if a source ever dates by more than a timezone.
      const stats = statsByMatch.get(key)
        ?? statsByMatch.get(matchKey(shiftDay(match.played_on, 1), match.home_team, match.away_team))
        ?? statsByMatch.get(matchKey(shiftDay(match.played_on, -1), match.home_team, match.away_team));
      return [key, fromDataset(match, stats)];
    }));
  const played = options.playedFixtures.filter((fixture) =>
    fixture.kicked_off_at.getTime() < options.asOf.getTime());
  for (const fixture of played) {
    // The record wins the collision, which is the point of merging at all: its
    // row is the one carrying the shots and xG.
    //
    // ponytail: the two sides of this key are read off two clocks -- the
    // record's kickoff instant, in UTC, and the day the file says the match
    // was played on -- so a Fixture kicking off after midnight UTC would be
    // two lines once the dataset caught up with it. No Fixture of this
    // Season's recorded schedule kicks off later than 19:45Z and the test
    // below pins what the limit does; the upgrade path is to match the
    // adjacent day as well, which is safe because two national sides do not
    // meet twice inside two days.
    merged.set(
      matchKey(
        utcDate(fixture.kicked_off_at), fixture.home_team, fixture.away_team
      ),
      fromRecord(competitionName, fixture)
    );
  }
  const matches = [...merged.values()];

  return [
    `Recent internationals as of ${options.asOf.toISOString()}`,
    "",
    // What the league section opens with, answered for a Competition that has
    // no table: that it has none, and how much of its own Season has been
    // played. Here rather than anywhere else because here is where the league
    // puts its table and that table's coverage statement -- ahead of the base
    // rates and the two sides.
    ...groupTable(options.groupFixtures ?? [], options.homeTeam, options.asOf),
    seasonResultsLine(played),
    "",
    baseRatesLine(internationals),
    "",
    ...teamSection(matches, played, options.homeTeam),
    "",
    ...teamSection(matches, played, options.awayTeam),
    "",
    ...headToHead(matches, options.homeTeam, options.awayTeam),
    "",
    options.datasetUpdatedOn === null
      ? NO_DATASET_READ
      : `Dataset last updated ${options.datasetUpdatedOn}.`
  ].join("\n");
}

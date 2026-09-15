import {
  baseRatesClause,
  matchCount,
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
  /** The date of the dataset's latest row, or null if it was never read. */
  datasetUpdatedOn: string | null;
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
function matchKey(playedOn: string, home: string, away: string): string {
  return `${playedOn}|${home}|${away}`;
}

function fromDataset(match: InternationalMatch): RecentMatch {
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
    tail: match.neutral ? [`neutral venue in ${match.country}`] : []
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

function matchLine(match: RecentMatch, team: string): string {
  return [
    `- ${match.tournament}`,
    match.playedOn,
    `${match.homeTeam} ${match.homeGoals}-${match.awayGoals} ${match.awayTeam}`,
    outcome(match, team),
    ...match.tail
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
  const merged = new Map(internationals
    .map((match) => [
      matchKey(match.played_on, match.home_team, match.away_team),
      fromDataset(match)
    ]));
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
    baseRatesLine(internationals),
    "",
    ...teamSection(matches, played, options.homeTeam),
    "",
    ...teamSection(matches, played, options.awayTeam),
    "",
    options.datasetUpdatedOn === null
      ? NO_DATASET_READ
      : `Dataset last updated ${options.datasetUpdatedOn}.`
  ].join("\n");
}

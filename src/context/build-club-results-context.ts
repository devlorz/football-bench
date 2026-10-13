import {
  groupTable,
  type GroupFixture,
  type PlayedFixture,
  recordPerformance
} from "./build-internationals-context.js";
import {
  type MatchPerformance,
  NO_RESULT_YET,
  performanceSegments
} from "./build-historical-context.js";

/** One `club_results` row as the packet reads it (migrations 0050, 0051). */
export interface ClubResult extends MatchPerformance {
  source_match_id: string;
  kicked_off_at: Date;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  /** 365Scores' own name for where it was played, never a Competition code. */
  competition_name: string;
  /** When its 365Scores sheet was read, or null if it never was. */
  sheet_read_at?: Date | null;
}

export interface BuildClubResultsContextOptions {
  competition: string;
  asOf: Date;
  homeTeam: string;
  awayTeam: string;
  results: ClubResult[];
  /** The league phase's one group, every Fixture of it, played or not. */
  groupFixtures: GroupFixture[];
  /** This cup's settled Fixtures with the figures stored against each. */
  playedFixtures: PlayedFixture[];
}

/**
 * What the league-phase table decides (ADR-0063), frozen and never derived:
 * an Entrant reading a 36-side table needs to know where its bands fall. One
 * line serves all three cups, whose league phases split the same way.
 */
const LEAGUE_PHASE_BANDS = "Places 1-8 go to the round of 16, places 9-24 "
  + "to the knockout play-off round, places 25-36 are out.";

const BANDS: Readonly<Record<string, string>> = {
  UCL: LEAGUE_PHASE_BANDS,
  UEL: LEAGUE_PHASE_BANDS,
  UECL: LEAGUE_PHASE_BANDS
};

/**
 * Whether a cup's history lines carry their sheets' figures (ADR-0063 as
 * amended 2026-10-13). `UCL` stays scores-only because `match-ucl/2026-27-v1`
 * is frozen and used (ADR-0026); the daily fetch reads sheets only for the
 * cups this says yes for.
 */
const FIGURES: Readonly<Record<string, boolean>> = {
  UCL: false,
  UEL: true,
  UECL: true
};

export function historyCarriesFigures(competition: string): boolean {
  const figures = FIGURES[competition];
  if (figures === undefined) {
    throw new Error(`Competition ${competition} does not say whether its `
      + "history lines carry figures");
  }
  return figures;
}

/** How many of a side's matches the section shows (ADR-0063). */
const MATCHES_SHOWN = 5;

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Every settled Fixture of this cup before the Lock, oldest first, with its
 * shots and xG: from Gameweek 2 every side has at least one match with xG,
 * including those whose leagues have none (spec 0028 story 47).
 */
function playedSection(played: PlayedFixture[]): string[] {
  if (played.length === 0) {
    return [`This cup's played Fixtures: ${NO_RESULT_YET}`];
  }
  return [
    "This cup's played Fixtures:",
    ...played.map((fixture) => [
      `- ${utcDate(fixture.kicked_off_at)}`,
      `${fixture.home_team} ${fixture.home_goals}-${fixture.away_goals} `
        + fixture.away_team,
      recordPerformance(fixture)
    ].join(" | "))
  ];
}

/**
 * A score, and the sheet's figures where this cup shows them and a sheet was
 * read before the Lock. A match with no sheet says nothing more, on the
 * Nations League dataset lines' rule (ADR-0058): a sheet never read is not a
 * hole.
 */
function resultLine(
  result: ClubResult,
  figures: boolean,
  asOf: Date
): string {
  const read = figures && result.sheet_read_at != null
    && result.sheet_read_at.getTime() < asOf.getTime();
  return [
    `- ${result.competition_name}`,
    utcDate(result.kicked_off_at),
    `${result.home_team} ${result.home_goals}-${result.away_goals} `
      + result.away_team,
    ...(read ? [performanceSegments(result).join(", ")] : [])
  ].join(" | ");
}

function teamSection(
  results: ClubResult[],
  team: string,
  figures: boolean,
  asOf: Date
): string[] {
  const recent = results
    .filter((result) =>
      result.home_team === team || result.away_team === team)
    .sort((left, right) =>
      right.kicked_off_at.getTime() - left.kicked_off_at.getTime())
    .slice(0, MATCHES_SHOWN);
  // A short list says so, so that it is not read as a failed fetch.
  const heading = recent.length === MATCHES_SHOWN
    ? `Last ${MATCHES_SHOWN} competitive matches:`
    : recent.length === 0
      ? `Last ${MATCHES_SHOWN} competitive matches: none stored for this side.`
      : `Last ${MATCHES_SHOWN} competitive matches: only ${recent.length} stored `
        + "for this side.";
  return [
    team,
    heading,
    ...recent.map((result) => resultLine(result, figures, asOf))
  ];
}

/**
 * What each side of a club cup's Fixture did last: its five most recent
 * competitive matches before the Lock in any competition, newest first, from
 * 365Scores' results pages (ADR-0063). A cup Fixture is already among them as
 * a score, so nothing is merged from `fixtures`.
 *
 * Parallels the internationals section rather than extending it: that one
 * carries a venue flag, a dataset date and a merge against the record, and
 * none of the three applies to a source that lists every match itself.
 */
export function buildClubResultsContext(
  options: BuildClubResultsContextOptions
): string {
  // Bounded here as well as in the read: what may reach an Entrant is the
  // renderer's claim (ADR-0093).
  const results = options.results.filter((result) =>
    result.kicked_off_at.getTime() < options.asOf.getTime());
  const played = options.playedFixtures.filter((fixture) =>
    fixture.kicked_off_at.getTime() < options.asOf.getTime());
  const bands = BANDS[options.competition];
  if (bands === undefined) {
    throw new Error(`Competition ${options.competition} has no league-phase bands`);
  }
  const figures = historyCarriesFigures(options.competition);
  return [
    `League phase and recent matches as of ${options.asOf.toISOString()}`,
    "",
    // The table and this cup's own results stand where the internationals
    // section puts its group table: ahead of the two sides.
    ...groupTable(options.groupFixtures, options.homeTeam, options.asOf),
    bands,
    "",
    ...playedSection(played),
    "",
    ...teamSection(results, options.homeTeam, figures, options.asOf),
    "",
    ...teamSection(results, options.awayTeam, figures, options.asOf)
  ].join("\n");
}

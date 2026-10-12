/** One `club_results` row as the packet reads it (migration 0050). */
export interface ClubResult {
  source_match_id: string;
  kicked_off_at: Date;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  /** 365Scores' own name for where it was played, never a Competition code. */
  competition_name: string;
}

export interface BuildClubResultsContextOptions {
  asOf: Date;
  homeTeam: string;
  awayTeam: string;
  results: ClubResult[];
}

/** How many of a side's matches the section shows (ADR-0063). */
const MATCHES_SHOWN = 5;

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Scores only, on every line, whatever the competition's sheet carries. */
function resultLine(result: ClubResult): string {
  return [
    `- ${result.competition_name}`,
    utcDate(result.kicked_off_at),
    `${result.home_team} ${result.home_goals}-${result.away_goals} `
      + result.away_team
  ].join(" | ");
}

function teamSection(results: ClubResult[], team: string): string[] {
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
  return [team, heading, ...recent.map(resultLine)];
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
  return [
    `Recent matches as of ${options.asOf.toISOString()}`,
    "",
    ...teamSection(results, options.homeTeam),
    "",
    ...teamSection(results, options.awayTeam)
  ].join("\n");
}

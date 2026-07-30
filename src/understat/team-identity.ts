/**
 * Understat's spelling of a club to football-data.co.uk's, the identity every
 * stored result already uses. Covers the Premier League rosters of both
 * Seasons the benchmark fetches xG for: 2025-26, ingested once so the
 * five-match form window can cross the season boundary, and 2026-27.
 *
 * Undefined is deliberate and is escalated to a validation error at the
 * boundary: a rename on Understat's side must surface as a failure, never as a
 * silently xG-less team.
 */
const UNDERSTAT_TEAM_NAMES: Readonly<Record<string, string>> = {
  Arsenal: "Arsenal",
  "Aston Villa": "Aston Villa",
  Bournemouth: "Bournemouth",
  Brentford: "Brentford",
  Brighton: "Brighton",
  Burnley: "Burnley",
  Chelsea: "Chelsea",
  Coventry: "Coventry",
  "Crystal Palace": "Crystal Palace",
  Everton: "Everton",
  Fulham: "Fulham",
  Hull: "Hull",
  Ipswich: "Ipswich",
  Leeds: "Leeds",
  Liverpool: "Liverpool",
  "Manchester City": "Man City",
  "Manchester United": "Man United",
  "Newcastle United": "Newcastle",
  "Nottingham Forest": "Nott'm Forest",
  Sunderland: "Sunderland",
  Tottenham: "Tottenham",
  "West Ham": "West Ham",
  "Wolverhampton Wanderers": "Wolves"
};

export function resolveUnderstatTeamName(team: string): string | undefined {
  return UNDERSTAT_TEAM_NAMES[team];
}

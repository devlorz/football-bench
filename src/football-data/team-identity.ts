const FOOTBALL_DATA_TEAM_NAMES: Readonly<Record<string, string>> = {
  Arsenal: "Arsenal",
  "Aston Villa": "Aston Villa",
  Bournemouth: "Bournemouth",
  Brentford: "Brentford",
  Brighton: "Brighton",
  Chelsea: "Chelsea",
  "Coventry City": "Coventry",
  "Crystal Palace": "Crystal Palace",
  Everton: "Everton",
  Fulham: "Fulham",
  "Hull City": "Hull",
  "Ipswich Town": "Ipswich",
  Leeds: "Leeds",
  Liverpool: "Liverpool",
  "Man City": "Man City",
  "Manchester United": "Man United",
  "Man Utd": "Man United",
  Newcastle: "Newcastle",
  "Nott'm Forest": "Nott'm Forest",
  Sunderland: "Sunderland",
  "Tottenham Hotspur": "Tottenham",
  Spurs: "Tottenham",
  "Wolverhampton Wanderers": "Wolves"
};

/**
 * Resolves a known FPL Season roster name to football-data.co.uk's identity.
 * Undefined is deliberate: a new roster name must be reviewed, never silently
 * treated as a club with no stored history.
 */
export function resolveFootballDataTeamName(
  team: string
): string | undefined {
  return FOOTBALL_DATA_TEAM_NAMES[team];
}

/**
 * Normalizes a reviewed FPL name while leaving an already-source-native or
 * unknown name unchanged for comparisons within stored result rows.
 */
export function footballDataTeamName(team: string): string {
  return resolveFootballDataTeamName(team) ?? team;
}

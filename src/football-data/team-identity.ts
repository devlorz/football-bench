const FOOTBALL_DATA_TEAM_NAMES: Record<string, string> = {
  "Coventry City": "Coventry",
  "Hull City": "Hull",
  "Ipswich Town": "Ipswich",
  "Manchester United": "Man United",
  "Man Utd": "Man United",
  "Tottenham Hotspur": "Tottenham",
  Spurs: "Tottenham",
  "Wolverhampton Wanderers": "Wolves"
};

/** Resolves an FPL display name to football-data.co.uk's team identity. */
export function footballDataTeamName(team: string): string {
  return FOOTBALL_DATA_TEAM_NAMES[team] ?? team;
}

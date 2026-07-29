export interface FplPlayer {
  fpl_id: number;
  team_name: string;
  web_name: string;
  position: string;
  price_tenths: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  news_added: Date | null;
}

export interface BuildFplContextOptions {
  homeTeam: string;
  awayTeam: string;
  players: FplPlayer[];
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  a: "available",
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable"
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? `unrecognised (${status})`;
}

function price(priceTenths: number): string {
  return `£${(priceTenths / 10).toFixed(1)}m`;
}

function playerSummary(player: FplPlayer): string {
  return `- ${player.web_name} | ${player.position} | `
    + `${price(player.price_tenths)} | status: ${statusLabel(player.status)}`;
}

function absenceSummary(player: FplPlayer): string {
  const chance = player.chance_of_playing_next_round === null
    ? "not provided"
    : `${player.chance_of_playing_next_round}%`;
  const news = player.news.trim() === "" ? "not provided" : player.news;
  const newsAdded = player.news_added === null
    ? "not provided"
    : player.news_added.toISOString();
  return `${playerSummary(player)} | chance of playing next round: ${chance}`
    + ` | news: ${news} | news added: ${newsAdded}`;
}

function teamSection(team: string, players: FplPlayer[]): string[] {
  if (players.length === 0) {
    return [
      team,
      "FPL player data status: no player snapshot loaded for this Gameweek.",
      "Five highest-priced players: unavailable because no snapshot was loaded.",
      "Players not fully available: unavailable because no snapshot was loaded."
    ];
  }
  const teamPlayers = players
    .filter(({ team_name: teamName }) => teamName === team)
    .sort((left, right) =>
      right.price_tenths - left.price_tenths || left.fpl_id - right.fpl_id
    );
  if (teamPlayers.length === 0) {
    return [
      team,
      "FPL player data status: team name did not resolve against the loaded snapshot.",
      "Five highest-priced players: unavailable because the team did not resolve.",
      "Players not fully available: unavailable because the team did not resolve."
    ];
  }

  const flagged = teamPlayers.filter(({ status }) => status !== "a");
  return [
    team,
    "Five highest-priced players:",
    ...teamPlayers.slice(0, 5).map(playerSummary),
    ...(flagged.length === 0
      ? ["Players not fully available: none; all listed players are available."]
      : [
          "Players not fully available:",
          ...flagged.map(absenceSummary)
        ])
  ];
}

export function buildFplContext(options: BuildFplContextOptions): string {
  return [
    "FPL-derived player context",
    "",
    ...teamSection(options.homeTeam, options.players),
    "",
    ...teamSection(options.awayTeam, options.players)
  ].join("\n");
}

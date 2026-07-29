export interface HistoricalMatch {
  season: string;
  division: "Premier League" | "Championship";
  played_on: Date;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
}

export interface BuildHistoricalContextOptions {
  season: string;
  asOf: Date;
  homeTeam: string;
  awayTeam: string;
  matches: HistoricalMatch[];
}

interface TeamRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface TableRecord extends TeamRecord {
  team: string;
  points: number;
}

function previousSeason(season: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(season);
  if (match === null || match[1] === undefined) {
    throw new Error(`Season must look like 2026-27, received ${season}`);
  }
  const start = Number(match[1]) - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function includesTeam(match: HistoricalMatch, team: string): boolean {
  const canonical = footballDataTeamName(team);
  return footballDataTeamName(match.home_team) === canonical
    || footballDataTeamName(match.away_team) === canonical;
}

function playedBefore(match: HistoricalMatch, asOf: Date): boolean {
  return match.played_on.getTime() < asOf.getTime();
}

function emptyRecord(): TeamRecord {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0
  };
}

function teamRecord(matches: HistoricalMatch[], team: string): TeamRecord {
  const canonical = footballDataTeamName(team);
  const record = emptyRecord();
  for (const match of matches) {
    const home = footballDataTeamName(match.home_team) === canonical;
    const away = footballDataTeamName(match.away_team) === canonical;
    if (!home && !away) {
      continue;
    }
    const goalsFor = home ? match.home_goals : match.away_goals;
    const goalsAgainst = home ? match.away_goals : match.home_goals;
    record.played += 1;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) {
      record.wins += 1;
    } else if (goalsFor === goalsAgainst) {
      record.draws += 1;
    } else {
      record.losses += 1;
    }
  }
  return record;
}

function leagueTable(matches: HistoricalMatch[]): TableRecord[] {
  const teams = new Set<string>();
  for (const match of matches) {
    teams.add(footballDataTeamName(match.home_team));
    teams.add(footballDataTeamName(match.away_team));
  }
  return [...teams].map((team) => {
    const record = teamRecord(matches, team);
    return {
      team,
      ...record,
      points: record.wins * 3 + record.draws
    };
  }).sort((left, right) =>
    right.points - left.points
    || (right.goalsFor - right.goalsAgainst)
      - (left.goalsFor - left.goalsAgainst)
    || right.goalsFor - left.goalsFor
    || left.team.localeCompare(right.team)
  );
}

function ordinal(position: number): string {
  const modulo100 = position % 100;
  if (modulo100 >= 11 && modulo100 <= 13) {
    return `${position}th`;
  }
  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

function positionIn(matches: HistoricalMatch[], team: string): number | undefined {
  const canonical = footballDataTeamName(team);
  const index = leagueTable(matches).findIndex(({ team: rowTeam }) =>
    rowTeam === canonical
  );
  return index < 0 ? undefined : index + 1;
}

function formatRecord(record: TeamRecord, emptyText: string): string {
  if (record.played === 0) {
    return emptyText;
  }
  return `${record.played} played, ${record.wins}W ${record.draws}D `
    + `${record.losses}L, GF ${record.goalsFor}, GA ${record.goalsAgainst}.`;
}

function outcome(match: HistoricalMatch, team: string): "W" | "D" | "L" {
  const home = footballDataTeamName(match.home_team)
    === footballDataTeamName(team);
  const goalsFor = home ? match.home_goals : match.away_goals;
  const goalsAgainst = home ? match.away_goals : match.home_goals;
  return goalsFor > goalsAgainst ? "W" : goalsFor === goalsAgainst ? "D" : "L";
}

function matchLine(match: HistoricalMatch, team?: string): string {
  const result = team === undefined ? "" : ` | ${outcome(match, team)}`;
  return `- ${match.season} ${match.division} | `
    + `${match.played_on.toISOString().slice(0, 10)} | `
    + `${match.home_team} ${match.home_goals}-${match.away_goals} `
    + `${match.away_team}${result}`;
}

function priorSeasonLine(
  matches: HistoricalMatch[],
  priorSeason: string,
  team: string
): { line: string; promoted: boolean } {
  const teamMatches = matches.filter((match) =>
    match.season === priorSeason && includesTeam(match, team)
  );
  const division = (["Premier League", "Championship"] as const)
    .find((candidate) =>
      teamMatches.some((match) => match.division === candidate)
    );
  if (division === undefined) {
    return {
      line: `Prior-Season final position: no ${priorSeason} league data.`,
      promoted: false
    };
  }
  const divisionMatches = matches.filter((match) =>
    match.season === priorSeason && match.division === division
  );
  const position = positionIn(divisionMatches, team);
  if (position === undefined) {
    return {
      line: `Prior-Season final position: no ${priorSeason} league data.`,
      promoted: false
    };
  }
  const promoted = division === "Championship";
  return {
    line: `Prior-Season final position: ${ordinal(position)} in `
      + `${priorSeason} ${division}; promoted: ${promoted ? "yes" : "no"}.`,
    promoted
  };
}

function teamSection(
  options: BuildHistoricalContextOptions,
  team: string,
  eligibleMatches: HistoricalMatch[]
): string[] {
  const canonical = footballDataTeamName(team);
  const currentMatches = eligibleMatches.filter((match) =>
    match.season === options.season
    && match.division === "Premier League"
  );
  const currentTeamMatches = currentMatches.filter((match) =>
    includesTeam(match, canonical)
  );
  const homeMatches = currentTeamMatches.filter((match) =>
    footballDataTeamName(match.home_team) === canonical
  );
  const awayMatches = currentTeamMatches.filter((match) =>
    footballDataTeamName(match.away_team) === canonical
  );
  const prior = priorSeasonLine(
    eligibleMatches,
    previousSeason(options.season),
    canonical
  );
  const hasPremierLeagueHistory = eligibleMatches.some((match) =>
    match.division === "Premier League" && includesTeam(match, canonical)
  );
  const form = eligibleMatches
    .filter((match) => includesTeam(match, canonical))
    .sort((left, right) => right.played_on.getTime() - left.played_on.getTime())
    .slice(0, 5);
  const currentPosition = currentTeamMatches.length === 0
    ? undefined
    : positionIn(currentMatches, canonical);

  const lines = [
    team,
    currentPosition === undefined
      ? "Current-Season league position: no current-Season table yet."
      : `Current-Season league position: ${ordinal(currentPosition)} in Premier League.`,
    prior.line
  ];
  if (!hasPremierLeagueHistory) {
    lines.push(
      prior.promoted
        ? "Premier League history: none in stored data; promoted from the Championship."
        : "Premier League history: none in stored data."
    );
  }
  lines.push(
    `Current-Season overall: ${formatRecord(
      teamRecord(currentTeamMatches, canonical),
      "no matches played."
    )}`,
    `Current-Season home split: ${formatRecord(
      teamRecord(homeMatches, canonical),
      "no home matches played."
    )}`,
    `Current-Season away split: ${formatRecord(
      teamRecord(awayMatches, canonical),
      "no away matches played."
    )}`
  );
  if (form.length === 0) {
    lines.push("Last five matches played: no stored matches.");
  } else {
    lines.push(
      "Last five matches played:",
      ...form.map((match) => matchLine(match, canonical))
    );
  }
  return lines;
}

export function buildHistoricalContext(
  options: BuildHistoricalContextOptions
): string {
  const eligibleMatches = options.matches.filter((match) =>
    playedBefore(match, options.asOf)
  );
  const headToHead = eligibleMatches
    .filter((match) =>
      includesTeam(match, options.homeTeam)
      && includesTeam(match, options.awayTeam)
    )
    .sort((left, right) => right.played_on.getTime() - left.played_on.getTime())
    .slice(0, 5);

  return [
    `Historical context as of ${options.asOf.toISOString()}`,
    "",
    ...teamSection(options, options.homeTeam, eligibleMatches),
    "",
    ...teamSection(options, options.awayTeam, eligibleMatches),
    "",
    "Head-to-head history:",
    ...(headToHead.length === 0
      ? ["No prior meeting in stored data."]
      : headToHead.map((match) => matchLine(match)))
  ].join("\n");
}
import { footballDataTeamName } from "../football-data/team-identity.js";

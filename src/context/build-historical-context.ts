import { divisionsOf } from "../football-data/divisions.js";
import {
  footballDataTeamName,
  teamNamesOf,
  type TeamNames,
  resolveFootballDataTeamName
} from "../football-data/team-identity.js";

export interface HistoricalMatch {
  season: string;
  division: string;
  played_on: Date;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  /**
   * Absent and null mean the same thing throughout: the source carried no
   * figure. Never a zero -- a match with no shot data is not a match with no
   * shots, and xG is missing for whole legitimate categories (Championship
   * history, the early-Season window, an Understat outage).
   */
  home_shots?: number | null;
  away_shots?: number | null;
  home_shots_on_target?: number | null;
  away_shots_on_target?: number | null;
  home_xg?: number | null;
  away_xg?: number | null;
}

export interface BuildHistoricalContextOptions {
  competition: string;
  season: string;
  asOf: Date;
  homeTeam: string;
  awayTeam: string;
  matches: HistoricalMatch[];
}

/**
 * The one sentence an uncurated Competition's sections say. Frozen text is a
 * constant: two copies of it are two things to edit and one of them will be
 * missed.
 */
const NO_DIVISIONS = "unavailable; no division history is stored for this "
  + "Competition.";

/**
 * The names this Competition's rows are stored under, read from the one list
 * the fetch writes them by (`football-data/divisions.ts`). Undefined means the
 * Competition has no curated divisions, and therefore no stored rows for the
 * sections built on them to have lost.
 */
function divisionNames(
  competition: string
): { top: string; second: string } | undefined {
  const divisions = divisionsOf(competition);
  return divisions === undefined
    ? undefined
    : { top: divisions[0].name, second: divisions[1].name };
}

type Divisions = NonNullable<ReturnType<typeof divisionNames>>;

interface TeamRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

/**
 * One side's summed record and its points. `club` rather than `team`, which in
 * this vocabulary is a Squad or a Team Sheet (CONTEXT.md); the row is read by
 * the FPL track's context as well as this one.
 */
export interface LeagueTableRow extends TeamRecord {
  club: string;
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

function includesTeam(
  names: TeamNames | undefined,
  match: HistoricalMatch,
  team: string
): boolean {
  const canonical = footballDataTeamName(names, team);
  return footballDataTeamName(names, match.home_team) === canonical
    || footballDataTeamName(names, match.away_team) === canonical;
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

function teamRecord(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  team: string
): TeamRecord {
  const canonical = footballDataTeamName(names, team);
  const record = emptyRecord();
  for (const match of matches) {
    const home = footballDataTeamName(names, match.home_team) === canonical;
    const away = footballDataTeamName(names, match.away_team) === canonical;
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

/**
 * Every side with a stored result among `matches`, summed and put in the
 * competition's own order: points, then goal difference, then goals scored.
 * Club name breaks a tie all three leave, so the order is a function of the
 * results alone and the same results always render the same text.
 */
export function leagueTable(
  names: TeamNames | undefined,
  matches: HistoricalMatch[]
): LeagueTableRow[] {
  const clubs = new Set<string>();
  for (const match of matches) {
    clubs.add(footballDataTeamName(names, match.home_team));
    clubs.add(footballDataTeamName(names, match.away_team));
  }
  return [...clubs].map((club) => {
    const record = teamRecord(names, matches, club);
    return {
      club,
      ...record,
      points: record.wins * 3 + record.draws
    };
  }).sort((left, right) =>
    right.points - left.points
    || (right.goalsFor - right.goalsAgainst)
      - (left.goalsFor - left.goalsAgainst)
    || right.goalsFor - left.goalsFor
    || left.club.localeCompare(right.club)
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

function positionIn(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  team: string
): number | undefined {
  const canonical = footballDataTeamName(names, team);
  const index = leagueTable(names, matches).findIndex(({ club }) =>
    club === canonical
  );
  return index < 0 ? undefined : index + 1;
}

interface StatSpec {
  label: string;
  home: (match: HistoricalMatch) => number | null | undefined;
  away: (match: HistoricalMatch) => number | null | undefined;
  decimals: number;
}

const XG_SPEC: StatSpec = {
  label: "xG",
  home: (match) => match.home_xg,
  away: (match) => match.away_xg,
  decimals: 2
};

const STAT_SPECS: StatSpec[] = [
  {
    label: "shots",
    home: (match) => match.home_shots,
    away: (match) => match.away_shots,
    decimals: 0
  },
  {
    label: "on target",
    home: (match) => match.home_shots_on_target,
    away: (match) => match.away_shots_on_target,
    decimals: 0
  },
  XG_SPEC
];

/**
 * One stat pair summed over a record line's matches, this-team-first, under the
 * both-or-nothing rule the form lines are read by: a match counts only when it
 * carries both sides' figure. The covered count comes back with the sums
 * because every caller renders it -- what a partial pair means is the caller's
 * sentence, not this one's.
 */
function coveredSums(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  canonical: string,
  spec: StatSpec
): { forSum: number; againstSum: number; covered: number } {
  let forSum = 0;
  let againstSum = 0;
  let covered = 0;
  for (const match of matches) {
    const home = footballDataTeamName(names, match.home_team) === canonical;
    const teamValue = home ? spec.home(match) : spec.away(match);
    const oppValue = home ? spec.away(match) : spec.home(match);
    if (typeof teamValue === "number" && typeof oppValue === "number") {
      forSum += teamValue;
      againstSum += oppValue;
      covered += 1;
    }
  }
  return { forSum, againstSum, covered };
}

function coverageOf(covered: number, of: number): string {
  return covered < of ? ` (over ${covered} of ${of} matches)` : "";
}

/**
 * One stat pair as a form line says it: a pair covering fewer matches than the
 * line announces it, and a pair with no covered matches reads `unavailable`
 * rather than a silent zero.
 */
function statSegment(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  canonical: string,
  spec: StatSpec
): string {
  const { forSum, againstSum, covered } =
    coveredSums(names, matches, canonical, spec);
  if (covered === 0) {
    return `${spec.label} unavailable`;
  }
  const pair = `${forSum.toFixed(spec.decimals)}-${againstSum.toFixed(spec.decimals)}`;
  return `${spec.label} ${pair}${coverageOf(covered, matches.length)}`;
}

/**
 * xG for and against per game over the matches of one venue, under the same
 * both-or-nothing rule (ADR-0043): a match counts only when both sides' figure
 * is stored, the rate is over the covered matches and says so when they fall
 * short, and a venue with no covered match reads `unavailable` rather than a
 * silent zero. A promoted club is unavailable by nature -- Understat carries no
 * second division.
 */
function xgRatePerGame(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  canonical: string
): string {
  const { forSum, againstSum, covered } =
    coveredSums(names, matches, canonical, XG_SPEC);
  if (covered === 0) {
    return "unavailable";
  }
  return `${(forSum / covered).toFixed(2)}-${(againstSum / covered).toFixed(2)}`
    + coverageOf(covered, matches.length);
}

function formatRecord(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  canonical: string,
  emptyText: string
): string {
  const record = teamRecord(names, matches, canonical);
  if (record.played === 0) {
    return emptyText;
  }
  const aggregates = STAT_SPECS
    .map((spec) => statSegment(names, matches, canonical, spec))
    .join(", ");
  return `${record.played} played, ${record.wins}W ${record.draws}D `
    + `${record.losses}L, GF ${record.goalsFor}, GA ${record.goalsAgainst}, `
    + `${aggregates}.`;
}

function outcome(
  names: TeamNames | undefined,
  match: HistoricalMatch,
  team: string
): "W" | "D" | "L" {
  const home = footballDataTeamName(names, match.home_team)
    === footballDataTeamName(names, team);
  const goalsFor = home ? match.home_goals : match.away_goals;
  const goalsAgainst = home ? match.away_goals : match.home_goals;
  return goalsFor > goalsAgainst ? "W" : goalsFor === goalsAgainst ? "D" : "L";
}

function bothSides(
  home: number | null | undefined,
  away: number | null | undefined
): string | undefined {
  return typeof home === "number" && typeof away === "number"
    ? `${home}-${away}`
    : undefined;
}

/**
 * Shots, shots on target and xG for the Match, every pair ordered
 * home-team-first so the numbers count from the same end as the scoreline they
 * sit beside. A pair the source did not carry is dropped rather than zeroed;
 * missing xG is stated outright, because an Entrant weighing a number it cannot
 * see is worse off than one told the number is absent.
 */
function performanceSegments(match: HistoricalMatch): string[] {
  const shots = bothSides(match.home_shots, match.away_shots);
  const onTarget = bothSides(
    match.home_shots_on_target,
    match.away_shots_on_target
  );
  return [
    ...(shots === undefined ? [] : [`shots ${shots}`]),
    ...(onTarget === undefined ? [] : [`on target ${onTarget}`]),
    typeof match.home_xg === "number" && typeof match.away_xg === "number"
      ? `xG ${match.home_xg.toFixed(2)}-${match.away_xg.toFixed(2)}`
      : "xG unavailable"
  ];
}

function matchLine(
  names: TeamNames | undefined,
  match: HistoricalMatch,
  team?: string
): string {
  // The head-to-head section stays score-only: performance signals belong on
  // the form lines, where recent performance is what the section is for.
  const result = team === undefined
    ? ""
    : ` | ${outcome(names, match, team)} | ${performanceSegments(match).join(", ")}`;
  return `- ${match.season} ${match.division} | `
    + `${match.played_on.toISOString().slice(0, 10)} | `
    + `${match.home_team} ${match.home_goals}-${match.away_goals} `
    + `${match.away_team}${result}`;
}

function priorSeasonLine(
  names: TeamNames | undefined,
  matches: HistoricalMatch[],
  divisions: Divisions | undefined,
  priorSeason: string,
  team: string
): { line: string; promoted: boolean } {
  const noData = {
    line: `Prior-Season final position: no ${priorSeason} league data.`,
    promoted: false
  };
  if (divisions === undefined) {
    return noData;
  }
  const teamMatches = matches.filter((match) =>
    match.season === priorSeason && includesTeam(names, match, team)
  );
  const division = [divisions.top, divisions.second]
    .find((candidate) =>
      teamMatches.some((match) => match.division === candidate)
    );
  if (division === undefined) {
    return noData;
  }
  const divisionMatches = matches.filter((match) =>
    match.season === priorSeason && match.division === division
  );
  const position = positionIn(names, divisionMatches, team);
  if (position === undefined) {
    return noData;
  }
  const promoted = division === divisions.second;
  const canonical = footballDataTeamName(names, team);
  // The club's rows inside the division the line above names, and only those:
  // a rate mixing two divisions would be the normalisation ADR-0030 refuses.
  const clubMatches = divisionMatches.filter((match) =>
    includesTeam(names, match, canonical)
  );
  const homeMatches = clubMatches.filter((match) =>
    footballDataTeamName(names, match.home_team) === canonical
  );
  const awayMatches = clubMatches.filter((match) =>
    footballDataTeamName(names, match.away_team) === canonical
  );
  const formatPointsPerGame = (of: HistoricalMatch[]): string => {
    const record = teamRecord(names, of, canonical);
    return record.played === 0
      ? "unavailable"
      : ((record.wins * 3 + record.draws) / record.played).toFixed(2);
  };
  return {
    line: `Prior-Season final position: ${ordinal(position)} in `
      + `${priorSeason} ${division}; promoted: ${promoted ? "yes" : "no"}.`
      + `\nPrior-Season points per game: `
      + `${formatPointsPerGame(clubMatches)} overall, `
      + `${formatPointsPerGame(homeMatches)} home, `
      + `${formatPointsPerGame(awayMatches)} away; `
      // Appended to the points-per-game line rather than given one of its own
      // (ADR-0043): one Prior-Season rate line, two rates on it.
      + `xG for and against per game `
      + `${xgRatePerGame(names, clubMatches, canonical)} overall, `
      + `${xgRatePerGame(names, homeMatches, canonical)} home, `
      + `${xgRatePerGame(names, awayMatches, canonical)} away.`,
    promoted
  };
}

function teamSection(
  options: BuildHistoricalContextOptions,
  names: TeamNames | undefined,
  divisions: Divisions | undefined,
  team: string,
  eligibleMatches: HistoricalMatch[],
  currentMatches: HistoricalMatch[]
): string[] {
  const exactStoredIdentity = eligibleMatches.some((match) =>
    match.home_team === team || match.away_team === team
  );
  const resolvedTeam = resolveFootballDataTeamName(names, team)
    ?? (exactStoredIdentity ? team : undefined);
  const canonical = resolvedTeam ?? team;
  const currentTeamMatches = currentMatches.filter((match) =>
    includesTeam(names, match, canonical)
  );
  const homeMatches = currentTeamMatches.filter((match) =>
    footballDataTeamName(names, match.home_team) === canonical
  );
  const awayMatches = currentTeamMatches.filter((match) =>
    footballDataTeamName(names, match.away_team) === canonical
  );
  const prior = priorSeasonLine(
    names,
    eligibleMatches,
    divisions,
    previousSeason(options.season),
    canonical
  );
  const hasTopFlightHistory = eligibleMatches.some((match) =>
    match.division === divisions?.top && includesTeam(names, match, canonical)
  );
  const form = eligibleMatches
    .filter((match) => includesTeam(names, match, canonical))
    .sort((left, right) => right.played_on.getTime() - left.played_on.getTime())
    .slice(0, 5);
  // No current-Season position line: the table above the sections shows it,
  // and ADR-0022 forbids pre-computing what the context already carries.
  const lines = [
    team,
    ...(resolvedTeam === undefined
      ? ["Historical data status: team name did not resolve against stored results."]
      : []),
    prior.line
  ];
  // Silent for a Competition with no curated divisions: "no top-flight
  // history" is a claim about stored results, and there are none to be absent
  // from until its backfill lands.
  if (divisions !== undefined && !hasTopFlightHistory) {
    lines.push(
      prior.promoted
        ? `${divisions.top} history: none in stored data; promoted from the `
          + `${divisions.second}.`
        : `${divisions.top} history: none in stored data.`
    );
  }
  lines.push(
    `Current-Season overall: ${formatRecord(
      names,
      currentTeamMatches,
      canonical,
      "no matches played."
    )}`,
    `Current-Season home split: ${formatRecord(
      names,
      homeMatches,
      canonical,
      "no home matches played."
    )}`,
    `Current-Season away split: ${formatRecord(
      names,
      awayMatches,
      canonical,
      "no away matches played."
    )}`
  );
  if (form.length === 0) {
    lines.push("Last five matches played: no stored matches.");
  } else {
    lines.push(
      "Last five matches played:",
      ...form.map((match) => matchLine(names, match, canonical))
    );
  }
  return lines;
}

/**
 * The current Season's table, once per context and ahead of both team
 * sections, verbose enough to read without a legend. Goal difference is not a
 * column: it orders the rows but an Entrant can subtract. The heading dates
 * the table by its latest included result, the same coverage statement the FPL
 * track makes (ADR-0021), and an empty table says so rather than vanishing.
 */
function tableSection(
  names: TeamNames | undefined,
  divisions: Divisions | undefined,
  currentMatches: HistoricalMatch[]
): string[] {
  if (divisions === undefined) {
    return [`League table: ${NO_DIVISIONS}`];
  }
  if (currentMatches.length === 0) {
    return [
      `${divisions.top} table: no result has been played yet this Season.`
    ];
  }
  const through = Math.max(
    ...currentMatches.map((match) => match.played_on.getTime())
  );
  return [
    `${divisions.top} table (results through `
    + `${new Date(through).toISOString().slice(0, 10)}):`,
    ...leagueTable(names, currentMatches).map((row, index) =>
      `${index + 1}. ${row.club} — Pld ${row.played}, W ${row.wins}, `
      + `D ${row.draws}, L ${row.losses}, GF ${row.goalsFor}, `
      + `GA ${row.goalsAgainst}, Pts ${row.points}`
    )
  ];
}

/**
 * The prior Season's top flight in one line: the three outcome shares, goals
 * per match, and the match count they are computed over (ADR-0043). Once per
 * context and league-wide -- an anchor for turning a read of two clubs into a
 * distribution is not a per-team fact -- and computed from the same stored
 * results the table is, so there is no new data behind it.
 */
function baseRatesSection(
  divisions: Divisions | undefined,
  priorSeason: string,
  eligibleMatches: HistoricalMatch[]
): string[] {
  if (divisions === undefined) {
    return [`Prior-Season base rates: ${NO_DIVISIONS}`];
  }
  const matches = eligibleMatches.filter((match) =>
    match.season === priorSeason && match.division === divisions.top
  );
  if (matches.length === 0) {
    return [
      `Prior-Season base rates: no ${priorSeason} ${divisions.top} results `
      + "stored."
    ];
  }
  const share = (count: number): string =>
    ((count / matches.length) * 100).toFixed(1);
  const homeWins = matches
    .filter((match) => match.home_goals > match.away_goals).length;
  const draws = matches
    .filter((match) => match.home_goals === match.away_goals).length;
  const goals = matches
    .reduce((sum, match) => sum + match.home_goals + match.away_goals, 0);
  return [
    `Prior-Season base rates (${priorSeason} ${divisions.top}, `
    + `${matches.length} match${matches.length === 1 ? "" : "es"}): `
    + `home wins ${share(homeWins)}%, `
    + `draws ${share(draws)}%, `
    + `away wins ${share(matches.length - homeWins - draws)}%, `
    + `${(goals / matches.length).toFixed(2)} goals per match.`
  ];
}

export function buildHistoricalContext(
  options: BuildHistoricalContextOptions
): string {
  const names = teamNamesOf(options.competition);
  const eligibleMatches = options.matches.filter((match) =>
    playedBefore(match, options.asOf)
  );
  const headToHead = eligibleMatches
    .filter((match) =>
      includesTeam(names, match, options.homeTeam)
      && includesTeam(names, match, options.awayTeam)
    )
    .sort((left, right) => right.played_on.getTime() - left.played_on.getTime())
    .slice(0, 5);

  // The one filter both the table and the record lines are built on, applied
  // once: the current Season in this Competition's top flight, and nothing
  // else. An uncurated Competition matches no division and gets no rows,
  // which is what every section built on this says out loud.
  const divisions = divisionNames(options.competition);
  const currentMatches = eligibleMatches.filter((match) =>
    match.season === options.season
    && match.division === divisions?.top
  );

  return [
    `Historical context as of ${options.asOf.toISOString()}`,
    "",
    ...tableSection(names, divisions, currentMatches),
    "",
    ...baseRatesSection(
      divisions, previousSeason(options.season), eligibleMatches
    ),
    "",
    ...teamSection(options, names, divisions, options.homeTeam, eligibleMatches, currentMatches),
    "",
    ...teamSection(options, names, divisions, options.awayTeam, eligibleMatches, currentMatches),
    "",
    "Head-to-head history:",
    ...(headToHead.length === 0
      ? ["No prior meeting in stored data."]
      : headToHead.map((match) => matchLine(names, match)))
  ].join("\n");
}

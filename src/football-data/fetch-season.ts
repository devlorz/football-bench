import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";

type Database = Pick<Client, "query">;

const DIVISIONS = [
  { code: "E0", name: "Premier League" },
  { code: "E1", name: "Championship" }
] as const;

type Division = typeof DIVISIONS[number];

const REQUIRED_COLUMNS = [
  "Div",
  "Date",
  "HomeTeam",
  "AwayTeam",
  "FTHG",
  "FTAG"
] as const;

interface HistoricalMatch {
  season: string;
  division: Division["name"];
  playedOn: Date;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}

export interface FootballDataSourceIssue {
  field: string;
  detail: string;
}

export class FootballDataSourceValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: FootballDataSourceIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "FootballDataSourceValidationError";
  }
}

export class FootballDataSourceHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "FootballDataSourceHttpError";
  }
}

export interface FetchFootballDataSeasonOptions {
  database: Database;
  season: string;
  http: HttpFetcher;
}

function seasonPath(season: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(season);
  if (match === null) {
    throw new Error(`Season must look like 2025-26, received ${season}`);
  }
  const start = match[1];
  const end = match[2];
  if (start === undefined || end === undefined) {
    throw new Error(`Season must look like 2025-26, received ${season}`);
  }
  return `${start.slice(2)}${end}`;
}

function sourceName(season: string, division: Division): string {
  return `football_data:${season}:${division.code}`;
}

function sourceUrl(season: string, division: Division): string {
  return `https://www.football-data.co.uk/mmz4281/${seasonPath(season)}/${division.code}.csv`;
}

function parseCsv(body: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "\"") {
      if (quoted && body[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && body[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("unterminated quoted CSV field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parsePlayedOn(value: string): Date | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function parseGoals(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function parseMatches(
  source: string,
  season: string,
  division: Division,
  body: string
): HistoricalMatch[] {
  let rows: string[][];
  try {
    rows = parseCsv(body.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new FootballDataSourceValidationError(source, [{
      field: "$",
      detail: error instanceof Error ? error.message : String(error)
    }]);
  }

  const header = rows[0] ?? [];
  const indexes = new Map(header.map((column, index) => [column, index]));
  const headerIssues = REQUIRED_COLUMNS
    .filter((column) => !indexes.has(column))
    .map((column) => ({
      field: `header.${column}`,
      detail: "required column is missing"
    }));
  if (headerIssues.length > 0) {
    throw new FootballDataSourceValidationError(source, headerIssues);
  }

  const matches: HistoricalMatch[] = [];
  const issues: FootballDataSourceIssue[] = [];
  for (const [offset, row] of rows.slice(1).entries()) {
    const rowNumber = offset + 2;
    const value = (column: typeof REQUIRED_COLUMNS[number]): string =>
      row[indexes.get(column) ?? -1] ?? "";
    const playedOn = parsePlayedOn(value("Date"));
    const homeGoals = parseGoals(value("FTHG"));
    const awayGoals = parseGoals(value("FTAG"));

    if (value("Div") !== division.code) {
      issues.push({
        field: `row.${rowNumber}.Div`,
        detail: `expected ${division.code}`
      });
    }
    if (playedOn === undefined) {
      issues.push({
        field: `row.${rowNumber}.Date`,
        detail: "expected DD/MM/YYYY"
      });
    }
    if (value("HomeTeam").length === 0) {
      issues.push({
        field: `row.${rowNumber}.HomeTeam`,
        detail: "team name is empty"
      });
    }
    if (value("AwayTeam").length === 0) {
      issues.push({
        field: `row.${rowNumber}.AwayTeam`,
        detail: "team name is empty"
      });
    }
    if (homeGoals === undefined) {
      issues.push({
        field: `row.${rowNumber}.FTHG`,
        detail: "expected a non-negative integer"
      });
    }
    if (awayGoals === undefined) {
      issues.push({
        field: `row.${rowNumber}.FTAG`,
        detail: "expected a non-negative integer"
      });
    }

    if (
      playedOn !== undefined
      && homeGoals !== undefined
      && awayGoals !== undefined
      && value("HomeTeam").length > 0
      && value("AwayTeam").length > 0
      && value("Div") === division.code
    ) {
      matches.push({
        season,
        division: division.name,
        playedOn,
        homeTeam: value("HomeTeam"),
        awayTeam: value("AwayTeam"),
        homeGoals,
        awayGoals
      });
    }
  }

  if (issues.length > 0) {
    throw new FootballDataSourceValidationError(source, issues);
  }
  return matches;
}

export async function fetchFootballDataSeason({
  database,
  season,
  http
}: FetchFootballDataSeasonOptions): Promise<void> {
  const outcomes = await Promise.allSettled(DIVISIONS.map(async (division) => {
    const source = sourceName(season, division);
    const url = sourceUrl(season, division);
    const response = await http(url);
    return { division, source, url, ...response };
  }));
  const responses = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : []
  );

  await storeRawSnapshots(
    database,
    responses.map(({ source, body }) => ({ source, body }))
  );

  const transportFailure = outcomes.find((outcome) =>
    outcome.status === "rejected"
  );
  if (transportFailure?.status === "rejected") {
    throw transportFailure.reason;
  }
  const httpFailure = responses.find(({ status }) =>
    status < 200 || status >= 300
  );
  if (httpFailure !== undefined) {
    throw new FootballDataSourceHttpError(
      httpFailure.source,
      httpFailure.status,
      httpFailure.url
    );
  }

  const matches = responses.flatMap(({ source, division, body }) =>
    parseMatches(source, season, division, body)
  );

  await database.query("begin");
  try {
    await database.query(
      `delete from historical_matches
        where season = $1
          and division = any($2::text[])`,
      [season, DIVISIONS.map(({ name }) => name)]
    );
    for (const match of matches) {
      await database.query(
        `insert into historical_matches (
           season, division, played_on, home_team, away_team,
           home_goals, away_goals
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          match.season,
          match.division,
          match.playedOn,
          match.homeTeam,
          match.awayTeam,
          match.homeGoals,
          match.awayGoals
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

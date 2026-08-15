import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import { resolveUnderstatTeamName } from "./team-identity.js";

type Database = Pick<Client, "query">;

const LEAGUE = "EPL";

interface MatchXg {
  season: string;
  understatMatchId: string;
  kickedOffAt: Date;
  homeTeam: string;
  awayTeam: string;
  homeXg: number;
  awayXg: number;
}

export interface UnderstatSourceIssue {
  field: string;
  detail: string;
}

export class UnderstatSourceValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: UnderstatSourceIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "UnderstatSourceValidationError";
  }
}

export class UnderstatSourceHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "UnderstatSourceHttpError";
  }
}

export interface FetchUnderstatSeasonXgOptions {
  database: Database;
  season: string;
  http: HttpFetcher;
}

function understatSeason(season: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(season);
  if (match?.[1] === undefined) {
    throw new Error(`Season must look like 2026-27, received ${season}`);
  }
  return match[1];
}

function sourceUrl(season: string): string {
  return `https://understat.com/getLeagueData/${LEAGUE}/${understatSeason(season)}`;
}

/**
 * Understat blocks a request with no User-Agent, and answers one without the
 * AJAX header with a full HTML page instead of the JSON its own frontend gets.
 */
function requestHeaders(season: string): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0",
    "X-Requested-With": "XMLHttpRequest",
    Referer: `https://understat.com/league/${LEAGUE}/${understatSeason(season)}`,
    Accept: "application/json"
  };
}

/**
 * Understat sends "2026-08-15 11:30:00" with no zone; the instants are UTC.
 */
function parseKickOff(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseXg(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function parseMatches(
  source: string,
  season: string,
  body: string
): MatchXg[] {
  let payload: { dates?: unknown };
  try {
    payload = JSON.parse(body) as { dates?: unknown };
  } catch (error) {
    // Dropping the AJAX header makes Understat answer with a full HTML page
    // rather than JSON, so this is a shape change like any other.
    throw new UnderstatSourceValidationError(source, [{
      field: "$",
      detail: error instanceof Error ? error.message : String(error)
    }]);
  }
  if (!Array.isArray(payload.dates)) {
    throw new UnderstatSourceValidationError(source, [{
      field: "dates",
      detail: "expected an array of matches"
    }]);
  }

  const matches: MatchXg[] = [];
  const issues: UnderstatSourceIssue[] = [];
  for (const [index, entry] of payload.dates.entries()) {
    const match = (entry ?? {}) as {
      id?: unknown;
      datetime?: unknown;
      h?: { title?: unknown };
      a?: { title?: unknown };
      xG?: { h?: unknown; a?: unknown };
    };
    const homeTeam = match.h?.title;
    const awayTeam = match.a?.title;

    // Deliberately ahead of the not-yet-played skip below. Upcoming matches
    // already carry both titles, so a pre-season fetch confirms every spelling
    // in the feed while there is still no stored xG for a rename to cost.
    // Checking after the skip would first exercise the mapping in the fetch
    // that follows the Season's opening Gameweek.
    for (const [side, team] of [["h", homeTeam], ["a", awayTeam]] as const) {
      if (typeof team !== "string" || team.length === 0) {
        issues.push({
          field: `dates.${index}.${side}.title`,
          detail: "team name is missing"
        });
      } else if (resolveUnderstatTeamName(team) === undefined) {
        issues.push({
          field: `dates.${index}.${side}.title`,
          detail: "unknown Understat team name"
        });
      }
    }

    // No xG field at all means the match has not been played. Skipped, never
    // stored as a zero.
    if (match.xG === undefined || match.xG === null) {
      continue;
    }

    const kickedOffAt = parseKickOff(match.datetime);
    const homeXg = parseXg(match.xG.h);
    const awayXg = parseXg(match.xG.a);

    if (typeof match.id !== "string" || match.id.length === 0) {
      issues.push({
        field: `dates.${index}.id`,
        detail: "expected a match id"
      });
    }
    if (kickedOffAt === undefined) {
      issues.push({
        field: `dates.${index}.datetime`,
        detail: "expected YYYY-MM-DD HH:MM:SS"
      });
    }
    if (homeXg === undefined) {
      issues.push({
        field: `dates.${index}.xG.h`,
        detail: "expected a non-negative decimal string"
      });
    }
    if (awayXg === undefined) {
      issues.push({
        field: `dates.${index}.xG.a`,
        detail: "expected a non-negative decimal string"
      });
    }

    if (
      typeof match.id === "string"
      && match.id.length > 0
      && kickedOffAt !== undefined
      && typeof homeTeam === "string"
      && resolveUnderstatTeamName(homeTeam) !== undefined
      && typeof awayTeam === "string"
      && resolveUnderstatTeamName(awayTeam) !== undefined
      && homeXg !== undefined
      && awayXg !== undefined
    ) {
      matches.push({
        season,
        understatMatchId: match.id,
        kickedOffAt,
        homeTeam,
        awayTeam,
        homeXg,
        awayXg
      });
    }
  }

  if (issues.length > 0) {
    throw new UnderstatSourceValidationError(source, issues);
  }
  return matches;
}

export async function fetchUnderstatSeasonXg({
  database,
  season,
  http
}: FetchUnderstatSeasonXgOptions): Promise<void> {
  const url = sourceUrl(season);
  const source = `understat:${season}:${LEAGUE}`;
  const response = await http(url, {
    method: "GET",
    headers: requestHeaders(season)
  });

  // Archived before anything is read from it, so an unusable response is
  // still evidence.
  await storeRawSnapshots(database, [{ source, body: response.body }]);

  if (response.status < 200 || response.status >= 300) {
    throw new UnderstatSourceHttpError(source, response.status, url);
  }

  const matches = parseMatches(source, season, response.body);

  await database.query("begin");
  try {
    for (const match of matches) {
      await database.query(
        `insert into understat_match_xg (
           competition, season, understat_match_id, kicked_off_at,
           home_team, away_team, home_xg, away_xg
         ) values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (season, understat_match_id) do update set
           competition   = excluded.competition,
           kicked_off_at = excluded.kicked_off_at,
           home_team     = excluded.home_team,
           away_team     = excluded.away_team,
           home_xg       = excluded.home_xg,
           away_xg       = excluded.away_xg`,
        [
          // Premier League as a literal at this boundary: Understat's league
          // is a path segment this fetch hard-codes, so the Competition it
          // writes and the league it reads move together or not at all.
          "PL",
          match.season,
          match.understatMatchId,
          match.kickedOffAt,
          match.homeTeam,
          match.awayTeam,
          match.homeXg,
          match.awayXg
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

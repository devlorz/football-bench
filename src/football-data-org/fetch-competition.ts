import type { Client } from "pg";
import { z } from "zod";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  writeCompetitionSchedule,
  type ScheduledMatch,
  type WriteCompetitionScheduleResult
} from "../fetch/write-schedule.js";

// Re-exported because this is where they have always been imported from, and
// because a caller of this fetch has no reason to learn that the deadline
// derivation moved (ticket 0071).
export {
  KickoffInsideDeadlineError,
  type MovedAttachment,
  type RefusedAttachment
} from "../fetch/write-schedule.js";

type Database = Pick<Client, "query">;

const API_ROOT = "https://api.football-data.org/v4";

/**
 * The statuses that take a Fixture off the live calendar. They join the same
 * path a `null` matchday takes, which is the path the FPL fetch has used for a
 * withdrawn Fixture since ADR-0024: a never-Locked one is deleted because the
 * feed can rebuild it, a Locked one is marked `deferred` and keeps its
 * Prediction (ADR-0013). A postponed match here keeps its old matchday and a
 * placeholder date until it is rescheduled, so reading the status is the only
 * way to tell it apart from a Fixture that is still on.
 */
const WITHDRAWN_STATUSES = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);

/** A result is final under either of these; `AWARDED` is a forfeit. */
const SETTLED_STATUSES = new Set(["FINISHED", "AWARDED"]);

const teamSchema = z.looseObject({ name: z.string().min(1) });

const matchSchema = z.looseObject({
  id: z.number().int().positive(),
  utcDate: z.iso.datetime(),
  status: z.string().min(1),
  matchday: z.number().int().positive().nullable(),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  score: z.looseObject({
    fullTime: z.looseObject({
      home: z.number().int().nonnegative().nullable(),
      away: z.number().int().nonnegative().nullable()
    })
  })
}).check(({ value: match, issues }) => {
  // A settled match with no goals would be scoreable with nothing to score.
  if (!SETTLED_STATUSES.has(match.status)) {
    return;
  }
  for (const side of ["home", "away"] as const) {
    if (match.score.fullTime[side] === null) {
      issues.push({
        code: "custom",
        input: match.score.fullTime[side],
        path: ["score", "fullTime", side],
        message: `${match.status} match ${match.id} has no ${side} score`
      });
    }
  }
});

const matchesSchema = z.looseObject({ matches: z.array(matchSchema) });

export type FootballDataOrgMatch = z.infer<typeof matchSchema>;

export interface FootballDataOrgIssue {
  field: string;
  detail: string;
}

export class FootballDataOrgValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: FootballDataOrgIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "FootballDataOrgValidationError";
  }
}

export class FootballDataOrgHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "FootballDataOrgHttpError";
  }
}

/**
 * The per-Competition stale-source guard (ADR-0036). A listed Competition is
 * one an operator opened because they want it fetched, and every one of these
 * leagues publishes its whole schedule before the Season starts — so an empty
 * response is a wrong Competition code, a wrong Season or a dead token, never
 * a quiet "not yet". Refusing it here is what keeps an empty Gameweek from
 * Locking with nothing in it.
 */
export class StaleCompetitionSourceError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string
  ) {
    super(
      `Competition ${competition} produced no scheduled Fixture for Season `
      + `${season}; check the Competition code, FOOTBALL_DATA_SEASON and the `
      + `football-data.org token before the Gameweek Locks empty`
    );
    this.name = "StaleCompetitionSourceError";
  }
}

export class MissingFootballDataOrgTokenError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads football-data.org, which needs `
      + "FOOTBALL_DATA_ORG_TOKEN"
    );
    this.name = "MissingFootballDataOrgTokenError";
  }
}

export function sourceName(competition: string, season: string): string {
  return `football_data_org:${season}:${competition}`;
}

/**
 * football-data.org names a Season by the calendar year it opens in, so
 * `2026-27` is `season=2026`.
 */
function sourceUrl(competition: string, season: string): string {
  const match = /^(\d{4})-\d{2}$/.exec(season);
  if (match === null) {
    throw new Error(`Season must look like 2026-27, received ${season}`);
  }
  return `${API_ROOT}/competitions/${competition}/matches?season=${match[1]}`;
}

export function parseFootballDataOrgMatches(
  source: string,
  body: string
): FootballDataOrgMatch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new FootballDataOrgValidationError(source, [{
      field: "$",
      detail: "invalid JSON"
    }]);
  }
  const result = matchesSchema.safeParse(parsed);
  if (!result.success) {
    throw new FootballDataOrgValidationError(
      source,
      result.error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "$",
        detail: issue.message
      }))
    );
  }
  return result.data.matches;
}

function settledResult(match: FootballDataOrgMatch): string | null {
  const { home, away } = match.score.fullTime;
  if (!SETTLED_STATUSES.has(match.status) || home === null || away === null) {
    return null;
  }
  const result: FixtureResult = {
    home_goals: home,
    away_goals: away,
    outcome: outcomeOf(home, away)
  };
  return JSON.stringify(result);
}

export type FetchFootballDataOrgCompetitionResult =
  WriteCompetitionScheduleResult;

export interface FetchFootballDataOrgCompetitionOptions {
  database: Database;
  competition: string;
  season: string;
  apiToken: string | null;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * One Competition's schedule, kickoffs and results from football-data.org,
 * written to the same `gameweeks` and `fixtures` the FPL path writes — the
 * seam is the tables, so nothing downstream of `fixtures` knows which source
 * fed it (ADR-0036).
 *
 * One request per Competition per daily fetch, which is five a day against a
 * free tier that allows ten a minute.
 */
export async function fetchFootballDataOrgCompetition({
  database,
  competition,
  season,
  apiToken,
  http,
  now
}: FetchFootballDataOrgCompetitionOptions): Promise<FetchFootballDataOrgCompetitionResult> {
  if (apiToken === null) {
    throw new MissingFootballDataOrgTokenError(competition);
  }
  const source = sourceName(competition, season);
  const url = sourceUrl(competition, season);
  const response = await http(url, {
    method: "GET",
    headers: { "X-Auth-Token": apiToken }
  });
  // Archived before validation, so a changed or unusable response is still
  // evidence a human can read.
  await storeRawSnapshots(database, [{ source, body: response.body }]);
  if (response.status < 200 || response.status >= 300) {
    throw new FootballDataOrgHttpError(source, response.status, url);
  }

  const observedAt = now();
  const matches = parseFootballDataOrgMatches(source, response.body);
  const withdrawnIds = matches.flatMap((match) =>
    match.matchday === null || WITHDRAWN_STATUSES.has(match.status)
      ? [match.id]
      : []
  );
  const scheduled = matches.flatMap<ScheduledMatch>((match) =>
    match.matchday !== null && !WITHDRAWN_STATUSES.has(match.status)
      ? [{
        fixtureId: match.id,
        matchday: match.matchday,
        kickoffAt: new Date(match.utcDate),
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        settled: SETTLED_STATUSES.has(match.status),
        result: settledResult(match)
      }]
      : []
  );
  // The guard is about the source producing nothing, so it counts what the
  // source sent rather than what survived the withdrawal filter. A response
  // whose every match is postponed is a source working perfectly and a league
  // in chaos; telling that operator to check their Competition code and their
  // token would send them looking for a fault that is not theirs.
  if (matches.length === 0) {
    throw new StaleCompetitionSourceError(competition, season);
  }
  return writeCompetitionSchedule({
    database,
    competition,
    season,
    observedAt,
    scheduled,
    withdrawnIds
  });
}

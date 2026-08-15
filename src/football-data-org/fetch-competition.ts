import type { Client } from "pg";
import { z } from "zod";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import { deriveDeadline } from "./derived-deadline.js";

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

/**
 * The loud alert of ADR-0036, story 13. A Prediction must always precede
 * kick-off, and the ninety-minute buffer is the whole margin — so a kickoff
 * that lands inside the deadline in force is raised and the fetch writes
 * nothing, rather than being absorbed by a silent relock.
 */
export class KickoffInsideDeadlineError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string,
    public readonly gameweek: number,
    public readonly deadlineAt: Date,
    public readonly kickoffAt: Date
  ) {
    super(
      `Competition ${competition} Season ${season} Gameweek ${gameweek} has a `
      + `kickoff at ${kickoffAt.toISOString()} inside its deadline of `
      + `${deadlineAt.toISOString()}; the Lock margin was breached and nothing `
      + `has been written`
    );
    this.name = "KickoffInsideDeadlineError";
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
}: FetchFootballDataOrgCompetitionOptions): Promise<void> {
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
  const scheduled = matches.flatMap((match) =>
    match.matchday !== null && !WITHDRAWN_STATUSES.has(match.status)
      ? [{ ...match, matchday: match.matchday, kickoffAt: new Date(match.utcDate) }]
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

  const kickoffsByGameweek = new Map<number, Date[]>();
  for (const match of scheduled) {
    const kickoffs = kickoffsByGameweek.get(match.matchday) ?? [];
    kickoffs.push(match.kickoffAt);
    kickoffsByGameweek.set(match.matchday, kickoffs);
  }

  const stored = await database.query(
    `select gw, deadline_at
       from gameweeks
      where competition = $1 and season = $2`,
    [competition, season]
  );
  const storedDeadlines = new Map<number, Date>(
    stored.rows.map(({ gw, deadline_at: deadlineAt }) => [
      gw as number,
      deadlineAt as Date
    ])
  );

  // Only the Gameweeks this response scheduled something for. A Gameweek whose
  // every Fixture was withdrawn is absent, and keeps the deadline it already
  // had: with no kickoff there is nothing to derive a new one from, and the
  // stored instant is the last one the schedule justified. It has no Fixtures
  // left to predict either way, so what the stale deadline can still do is
  // report a Lock for an empty Gameweek — visible in the record rather than
  // acted on. The alternative, deleting it, would take its Locked Fixtures'
  // foreign key with it.
  const deadlines = new Map(
    [...kickoffsByGameweek].map(([gameweek, kickoffs]) => [
      gameweek,
      deriveDeadline(
        kickoffs,
        storedDeadlines.get(gameweek) ?? null,
        observedAt
      )
    ])
  );
  for (const [gameweek, decision] of deadlines) {
    if (decision.breachedBy !== null) {
      throw new KickoffInsideDeadlineError(
        competition,
        season,
        gameweek,
        decision.deadlineAt,
        decision.breachedBy
      );
    }
  }

  // The Gameweek a Fixture first seen after its own deadline belongs to, on
  // the FPL path's terms: it cannot be Locked into a Gameweek whose Lock has
  // already passed, so it joins the next one still open.
  const nextOpenGameweek = [...deadlines]
    .filter(([, { locked }]) => !locked)
    .sort(([leftGw, left], [rightGw, right]) =>
      left.deadlineAt.getTime() - right.deadlineAt.getTime() || leftGw - rightGw
    )[0]?.[0];

  await database.query("begin");
  try {
    for (const [gameweek, decision] of deadlines) {
      // A Locked Gameweek's deadline is a stored fact and is not rewritten,
      // even with the same value: the write that could move it is the write
      // that must not exist. One Locked Gameweek is written all the same —
      // the one the record has never seen, which a Competition adopted after
      // its Season began arrives holding. It has no stored deadline to move,
      // and its Fixtures have nowhere to point without it.
      if (!decision.locked || !storedDeadlines.has(gameweek)) {
        await database.query(
          `insert into gameweeks (competition, season, gw, deadline_at)
           values ($1, $2, $3, $4)
           on conflict (competition, season, gw)
           do update set deadline_at = excluded.deadline_at`,
          [competition, season, gameweek, decision.deadlineAt]
        );
      }
    }

    if (withdrawnIds.length > 0) {
      await database.query(
        `delete from fixtures
          where competition = $1 and season = $2
            and fixture_id = any($3::integer[])
            and locked_in_gw is null`,
        [competition, season, withdrawnIds]
      );
      await database.query(
        `update fixtures f
            set deferred = true,
                updated_at = now()
           from gameweeks locked_gameweek
          where f.competition = $1
            and f.season = $2
            and f.fixture_id = any($3::integer[])
            and f.locked_in_gw = locked_gameweek.gw
            and f.competition = locked_gameweek.competition
            and f.season = locked_gameweek.season
            and locked_gameweek.deadline_at <= $4
            and not f.deferred`,
        [competition, season, withdrawnIds, observedAt]
      );
      // Only Locked rows survive the deletion above. The mark reports the live
      // calendar, where `deferred` records history (ADR-0024).
      await database.query(
        `update fixtures
            set unscheduled = true,
                updated_at = now()
          where competition = $1 and season = $2
            and fixture_id = any($3::integer[])
            and not unscheduled`,
        [competition, season, withdrawnIds]
      );
    }

    for (const match of scheduled) {
      // A Fixture whose Gameweek Locked before the record ever saw it joins
      // the next open Gameweek (ADR-0015) — unless it has already been played.
      // A played Fixture was never predictable: handing it a `locked_in_gw`
      // that points at an open Gameweek would queue it for Entrants who can
      // read its score, because the predict path selects on
      // `coalesce(locked_in_gw, gw)` and asks nothing about the result. It
      // stays `null`, which leaves it under its own Locked Gameweek — history
      // the context can read and the scorer ignores.
      //
      // The FPL path this was copied from cannot reach the case, because its
      // fetch has always started before Gameweek 1. This one is reached the
      // first time a Competition is adopted mid-Season, which ticket 8's
      // "launch at Gameweek 3" escape hatch makes a real plan rather than a
      // hypothetical.
      const lockedInGameweek =
        deadlines.get(match.matchday)?.locked === true
        && settledResult(match) === null
          ? nextOpenGameweek ?? null
          : null;
      await database.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at, result
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (competition, season, fixture_id)
         do update set
           gw = excluded.gw,
           result = coalesce(excluded.result, fixtures.result),
           home_team = excluded.home_team,
           away_team = excluded.away_team,
           kickoff_at = excluded.kickoff_at,
           unscheduled = false,
           deferred = fixtures.deferred or (
             fixtures.locked_in_gw is not null
             and fixtures.locked_in_gw <> excluded.gw
             and exists (
               select 1
                 from gameweeks locked_gameweek
                where locked_gameweek.competition = fixtures.competition
                  and locked_gameweek.season = fixtures.season
                  and locked_gameweek.gw = fixtures.locked_in_gw
                  and locked_gameweek.deadline_at <= $10
             )
           ),
           updated_at = now()`,
        [
          competition,
          season,
          match.id,
          match.matchday,
          lockedInGameweek,
          match.homeTeam.name,
          match.awayTeam.name,
          match.kickoffAt,
          settledResult(match),
          observedAt
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

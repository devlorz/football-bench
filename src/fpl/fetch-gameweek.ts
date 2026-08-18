import type { Client } from "pg";
import { z } from "zod";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";

const FPL_BOOTSTRAP_URL =
  "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_FIXTURES_URL =
  "https://fantasy.premierleague.com/api/fixtures/";

const eventSchema = z.looseObject({
  id: z.number().int().positive(),
  deadline_time: z.iso.datetime(),
  is_next: z.boolean(),
  data_checked: z.boolean()
});

const teamSchema = z.looseObject({
  id: z.number().int().positive(),
  name: z.string().min(1),
  /**
   * The club's three-letter code, which the FPL screens print wherever a name
   * does not fit. Required rather than optional: it is on every club of every
   * bootstrap, and a code that arrives sometimes would leave the Team Sheet
   * printing names for half the field and codes for the other half.
   */
  short_name: z.string().min(1)
});

const elementTypeSchema = z.looseObject({
  id: z.number().int().positive(),
  singular_name_short: z.string().min(1)
});

const playerSchema = z.looseObject({
  id: z.number().int().positive(),
  team: z.number().int().positive(),
  web_name: z.string().min(1),
  element_type: z.number().int().positive(),
  now_cost: z.number().int().nonnegative(),
  status: z.string().min(1),
  chance_of_playing_next_round: z.number().int().min(0).max(100).nullable(),
  news: z.string(),
  news_added: z.iso.datetime().nullable(),
  /**
   * A club's known set-piece and penalty takers, in the order FPL ranks
   * them. Populated for the roughly 60-80 of ~590 players FPL lists a taker
   * for on any given bootstrap; null is the source's own silence, not a
   * missing fact.
   *
   * Required (`nullable`, never `nullish`): every archived bootstrap carries
   * all three keys on every element, so a player missing one of them is the
   * source's own shape breaking, not an untaken duty, and the Lock should
   * fail loudly rather than silently accept a bootstrap it cannot fully read.
   */
  penalties_order: z.number().int().positive().nullable(),
  direct_freekicks_order: z.number().int().positive().nullable(),
  corners_and_indirect_freekicks_order: z.number().int().positive().nullable()
});

const bootstrapSchema = z.looseObject({
  events: z.array(eventSchema),
  teams: z.array(teamSchema),
  element_types: z.array(elementTypeSchema),
  elements: z.array(playerSchema)
});

const fixtureSchema = z.looseObject({
  id: z.number().int().positive(),
  event: z.number().int().positive().nullable(),
  kickoff_time: z.iso.datetime().nullable(),
  team_h: z.number().int().positive(),
  team_a: z.number().int().positive(),
  finished: z.boolean(),
  finished_provisional: z.boolean(),
  team_h_score: z.number().int().nonnegative().nullable(),
  team_a_score: z.number().int().nonnegative().nullable()
}).check(({ value: fixture, issues }) => {
  // A finished Fixture without goals would be scoreable with nothing to score.
  for (const side of ["team_h_score", "team_a_score"] as const) {
    if (fixture.finished && fixture[side] === null) {
      issues.push({
        code: "custom",
        input: fixture[side],
        path: [side],
        message: `finished Fixture ${fixture.id} has no ${side}`
      });
    }
  }
});

const fixturesSchema = z.array(fixtureSchema);

type Database = Pick<Client, "query">;

/**
 * `finished` alone decides scoreability: `finished_provisional` may still be
 * true once `finished` turns true, so the two are never combined.
 */
function settledResult(
  fixture: z.infer<typeof fixtureSchema>
): string | null {
  const { finished, team_h_score: home, team_a_score: away } = fixture;
  if (!finished || home === null || away === null) {
    return null;
  }
  const result: FixtureResult = {
    home_goals: home,
    away_goals: away,
    outcome: outcomeOf(home, away)
  };
  return JSON.stringify(result);
}

export interface FetchFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  http: HttpFetcher;
  now: () => Date;
}

export type FetchFplDailyOptions = Omit<FetchFplGameweekOptions, "gameweek">;

export interface FetchFplDailyResult {
  gameweek: number | null;
  playerSnapshotStored: boolean;
  /** Gameweeks FPL reports `data_checked`, never inferred from the clock. */
  settledGameweeks: number[];
}

export interface FplSourceIssue {
  field: string;
  detail: string;
}

export type FplSource = "fpl_bootstrap" | "fpl_fixtures" | "fpl_live";

export class FplSourceValidationError extends Error {
  public readonly field: string;

  constructor(
    public readonly source: FplSource,
    public readonly issues: FplSourceIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "FplSourceValidationError";
    this.field = issues[0]?.field ?? "$";
  }
}

export class FplSourceHttpError extends Error {
  constructor(
    public readonly source: FplSource,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "FplSourceHttpError";
  }
}

function parseJson(source: FplSource, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new FplSourceValidationError(source, [{
      field: "$",
      detail: "invalid JSON"
    }]);
  }
}

export function parseFplSource<T>(
  source: FplSource,
  schema: z.ZodType<T>,
  body: string
): T {
  const result = schema.safeParse(parseJson(source, body));
  if (!result.success) {
    throw new FplSourceValidationError(
      source,
      result.error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "$",
        detail: issue.message
      }))
    );
  }
  return result.data;
}

async function fetchFpl({
  database,
  season,
  http,
  now
}: FetchFplDailyOptions, requestedGameweek?: number): Promise<FetchFplDailyResult> {
  const requests = [
    {
      source: "fpl_bootstrap" as const,
      url: FPL_BOOTSTRAP_URL
    },
    {
      source: "fpl_fixtures" as const,
      url: FPL_FIXTURES_URL
    }
  ];
  const outcomes = await Promise.allSettled(requests.map(async (request) => ({
    ...request,
    ...await http(request.url)
  })));
  const responses = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : []
  );
  const observedAt = now();

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
    throw new FplSourceHttpError(
      httpFailure.source,
      httpFailure.status,
      httpFailure.url
    );
  }
  const bootstrapBody = responses.find(
    ({ source }) => source === "fpl_bootstrap"
  )?.body;
  const fixturesBody = responses.find(
    ({ source }) => source === "fpl_fixtures"
  )?.body;
  if (bootstrapBody === undefined || fixturesBody === undefined) {
    throw new Error("FPL fetch completed without both source responses");
  }

  const bootstrap = parseFplSource(
    "fpl_bootstrap",
    bootstrapSchema,
    bootstrapBody
  );
  const fixtures = parseFplSource("fpl_fixtures", fixturesSchema, fixturesBody);
  const nextEvents = bootstrap.events.filter(({ is_next: isNext }) => isNext);
  if (requestedGameweek === undefined && nextEvents.length > 1) {
    throw new FplSourceValidationError("fpl_bootstrap", [{
      field: "events",
      detail: "expected at most one next Gameweek"
    }]);
  }
  const gameweek = requestedGameweek ?? nextEvents[0]?.id;
  const playerSnapshotEvent = bootstrap.events.find(
    ({ id }) => id === gameweek
  );
  if (gameweek !== undefined && playerSnapshotEvent === undefined) {
    throw new FplSourceValidationError("fpl_bootstrap", [{
      field: "events",
      detail: `Gameweek ${gameweek} is missing`
    }]);
  }

  // Both identities a club has, resolved from one map: a Fixture names the two
  // clubs playing and a player names the one he plays for, and reading the name
  // off one map and the code off another is two chances to disagree about which
  // club an id is.
  const teams = new Map(
    bootstrap.teams.map(({ id, name, short_name: code }) =>
      [id, { name, code }] as const)
  );
  const eventIds = new Set(bootstrap.events.map(({ id }) => id));
  const positions = new Map(
    bootstrap.element_types.map(({ id, singular_name_short: position }) => [
      id,
      position
    ])
  );
  const players = bootstrap.elements.map((player, index) => {
    const team = teams.get(player.team);
    if (team === undefined) {
      throw new FplSourceValidationError("fpl_bootstrap", [{
        field: `elements.${index}.team`,
        detail: `unknown team id ${player.team}`
      }]);
    }
    const position = positions.get(player.element_type);
    if (position === undefined) {
      throw new FplSourceValidationError("fpl_bootstrap", [{
        field: `elements.${index}.element_type`,
        detail: `unknown element type id ${player.element_type}`
      }]);
    }
    return { ...player, teamName: team.name, teamCode: team.code, position };
  });
  const unscheduledFixtureIds = fixtures.flatMap(({ id, event }) =>
    event === null ? [id] : []
  );
  const rows = fixtures.flatMap((fixture, index) => {
    if (fixture.event === null) {
      return [];
    }
    if (!eventIds.has(fixture.event)) {
      throw new FplSourceValidationError("fpl_fixtures", [{
        field: `${index}.event`,
        detail: `unknown Gameweek ${fixture.event}`
      }]);
    }
    if (fixture.kickoff_time === null) {
      throw new FplSourceValidationError("fpl_fixtures", [{
        field: `${index}.kickoff_time`,
        detail: `Fixture ${fixture.id} has no kick-off`
      }]);
    }
    const homeTeam = teams.get(fixture.team_h)?.name;
    const awayTeam = teams.get(fixture.team_a)?.name;
    if (homeTeam === undefined) {
      throw new FplSourceValidationError("fpl_fixtures", [{
        field: `${index}.team_h`,
        detail: `unknown team id ${fixture.team_h}`
      }]);
    }
    if (awayTeam === undefined) {
      throw new FplSourceValidationError("fpl_fixtures", [{
        field: `${index}.team_a`,
        detail: `unknown team id ${fixture.team_a}`
      }]);
    }
    return [{
      ...fixture,
      event: fixture.event,
      kickoff_time: fixture.kickoff_time,
      homeTeam,
      awayTeam
    }];
  });
  const requestedEvents = requestedGameweek === undefined
    ? bootstrap.events
    : bootstrap.events.filter(({ id }) => id === requestedGameweek);
  const fixturesToStore = requestedGameweek === undefined
    ? rows
    : rows.filter(({ event }) => event === requestedGameweek);
  const storedGameweeks = await database.query(
    `select gw, deadline_at
       from gameweeks
      where season = $1 and gw = any($2::integer[])`,
    [season, bootstrap.events.map(({ id }) => id)]
  );
  const storedDeadlines = new Map<number, Date>(
    storedGameweeks.rows.map(({ gw, deadline_at: deadlineAt }) => [
      gw as number,
      deadlineAt as Date
    ])
  );
  const lockedGameweeks = new Set(requestedEvents.flatMap(({ id }) => {
    const storedDeadline = storedDeadlines.get(id);
    return storedDeadline !== undefined
      && observedAt.getTime() >= storedDeadline.getTime()
      ? [id]
      : [];
  }));
  const effectiveDeadline = (event: typeof bootstrap.events[number]): Date => {
    const storedDeadline = storedDeadlines.get(event.id);
    return storedDeadline !== undefined
      && observedAt.getTime() >= storedDeadline.getTime()
      ? storedDeadline
      : new Date(event.deadline_time);
  };
  const nextOpenGameweek = bootstrap.events
    .map((event) => ({ id: event.id, deadline: effectiveDeadline(event) }))
    .filter(({ deadline }) => observedAt.getTime() < deadline.getTime())
    .sort((left, right) =>
      left.deadline.getTime() - right.deadline.getTime()
      || left.id - right.id
    )[0]?.id;
  const eventsToStore = requestedGameweek === undefined
    ? bootstrap.events
    : bootstrap.events.filter(({ id }) =>
      id === requestedGameweek || id === nextOpenGameweek
    );
  const playerSnapshotStored =
    gameweek !== undefined
    && playerSnapshotEvent !== undefined
    && !lockedGameweeks.has(gameweek)
    && observedAt.getTime()
      < new Date(playerSnapshotEvent.deadline_time).getTime();

  await database.query("begin");
  try {
    for (const event of eventsToStore) {
      if (!lockedGameweeks.has(event.id)) {
        await database.query(
          `insert into gameweeks (season, gw, deadline_at)
           values ($1, $2, $3)
           on conflict (competition, season, gw)
           do update set deadline_at = excluded.deadline_at`,
          [season, event.id, event.deadline_time]
        );
      }
    }

    if (playerSnapshotStored && gameweek !== undefined) {
      await database.query(
        "delete from fpl_players where season = $1 and gw = $2",
        [season, gameweek]
      );
      for (const player of players) {
        await database.query(
          `insert into fpl_players (
             season, gw, fpl_id, team_name, short_name, web_name, position,
             price_tenths, status, chance_of_playing_next_round, news,
             news_added, observed_at, penalties_order, direct_freekicks_order,
             corners_and_indirect_freekicks_order
           )
           values (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16
           )`,
          [
            season,
            gameweek,
            player.id,
            player.teamName,
            player.teamCode,
            player.web_name,
            player.position,
            player.now_cost,
            player.status,
            player.chance_of_playing_next_round,
            player.news,
            player.news_added,
            observedAt,
            player.penalties_order,
            player.direct_freekicks_order,
            player.corners_and_indirect_freekicks_order
          ]
        );
      }
    }

    if (unscheduledFixtureIds.length > 0) {
      // A never-Locked withdrawn Fixture holds nothing the feed cannot rebuild,
      // and no Prediction can reference it before its Lock (ADR-0024). Each
      // statement below skips rows already in the state it writes, so observing
      // the same withdrawal on a later fetch touches nothing.
      await database.query(
        `delete from fixtures
          where season = $1
            and fixture_id = any($2::integer[])
            and locked_in_gw is null`,
        [season, unscheduledFixtureIds]
      );
      await database.query(
        `update fixtures f
            set deferred = true,
                updated_at = now()
           from gameweeks locked_gameweek
          where f.season = $1
            and f.fixture_id = any($2::integer[])
            and f.locked_in_gw = locked_gameweek.gw
            and f.season = locked_gameweek.season
            and locked_gameweek.deadline_at <= $3
            and not f.deferred`,
        [season, unscheduledFixtureIds, observedAt]
      );
      // Only Locked rows survive the deletion above. The mark reports the live
      // calendar, where `deferred` records history (ADR-0024).
      await database.query(
        `update fixtures
            set unscheduled = true,
                updated_at = now()
          where season = $1
            and fixture_id = any($2::integer[])
            and not unscheduled`,
        [season, unscheduledFixtureIds]
      );
    }

    for (const fixture of fixturesToStore) {
      const scheduledEvent = bootstrap.events.find(
        ({ id }) => id === fixture.event
      );
      const lockedInGameweek = scheduledEvent !== undefined
        && observedAt.getTime() >= effectiveDeadline(scheduledEvent).getTime()
        ? nextOpenGameweek ?? null
        : null;
      await database.query(
        `insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team, kickoff_at,
           result
         )
         values ($1, $2, $3, $4, $5, $6, $7, $9)
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
                where locked_gameweek.season = fixtures.season
                  and locked_gameweek.gw = fixtures.locked_in_gw
                  and locked_gameweek.deadline_at <= $8
             )
           ),
           updated_at = now()`,
        [
          season,
          fixture.id,
          fixture.event,
          lockedInGameweek,
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.kickoff_time,
          observedAt,
          settledResult(fixture)
        ]
      );
    }
    await database.query("commit");
    return {
      gameweek: gameweek ?? null,
      playerSnapshotStored,
      settledGameweeks: bootstrap.events.flatMap(
        ({ id, data_checked: dataChecked }) => dataChecked ? [id] : []
      )
    };
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

export async function fetchFplGameweek(
  options: FetchFplGameweekOptions
): Promise<void> {
  await fetchFpl(options, options.gameweek);
}

export async function fetchFplDaily(
  options: FetchFplDailyOptions
): Promise<FetchFplDailyResult> {
  return fetchFpl(options);
}

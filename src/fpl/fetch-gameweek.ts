import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";

const FPL_BOOTSTRAP_URL =
  "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_FIXTURES_URL =
  "https://fantasy.premierleague.com/api/fixtures/";

const eventSchema = z.looseObject({
  id: z.number().int().positive(),
  deadline_time: z.iso.datetime()
});

const teamSchema = z.looseObject({
  id: z.number().int().positive(),
  name: z.string().min(1)
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
  news_added: z.iso.datetime().nullable()
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
  team_a: z.number().int().positive()
});

const fixturesSchema = z.array(fixtureSchema);

type Database = Pick<Client, "query">;

export interface FetchFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
  http: HttpFetcher;
}

export interface FplSourceIssue {
  field: string;
  detail: string;
}

export class FplSourceValidationError extends Error {
  public readonly field: string;

  constructor(
    public readonly source: "fpl_bootstrap" | "fpl_fixtures",
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
    public readonly source: FplSourceValidationError["source"],
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "FplSourceHttpError";
  }
}

function parseJson(source: FplSourceValidationError["source"], body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new FplSourceValidationError(source, [{
      field: "$",
      detail: "invalid JSON"
    }]);
  }
}

function parseSource<T>(
  source: FplSourceValidationError["source"],
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

async function getBody(
  http: HttpFetcher,
  source: FplSourceValidationError["source"],
  url: string
): Promise<string> {
  const response = await http(url);
  if (response.status < 200 || response.status >= 300) {
    throw new FplSourceHttpError(source, response.status, url);
  }
  return response.body;
}

export async function fetchFplGameweek({
  database,
  season,
  gameweek,
  http
}: FetchFplGameweekOptions): Promise<void> {
  const [bootstrapBody, fixturesBody] = await Promise.all([
    getBody(http, "fpl_bootstrap", FPL_BOOTSTRAP_URL),
    getBody(http, "fpl_fixtures", FPL_FIXTURES_URL)
  ]);

  await storeRawSnapshots(database, [
    { source: "fpl_bootstrap", body: bootstrapBody },
    { source: "fpl_fixtures", body: fixturesBody }
  ]);

  const bootstrap = parseSource(
    "fpl_bootstrap",
    bootstrapSchema,
    bootstrapBody
  );
  const fixtures = parseSource("fpl_fixtures", fixturesSchema, fixturesBody);
  const event = bootstrap.events.find(({ id }) => id === gameweek);
  if (event === undefined) {
    throw new FplSourceValidationError("fpl_bootstrap", [{
      field: "events",
      detail: `Gameweek ${gameweek} is missing`
    }]);
  }

  const teamNames = new Map(bootstrap.teams.map(({ id, name }) => [id, name]));
  const positions = new Map(
    bootstrap.element_types.map(({ id, singular_name_short: position }) => [
      id,
      position
    ])
  );
  const players = bootstrap.elements.map((player, index) => {
    const teamName = teamNames.get(player.team);
    if (teamName === undefined) {
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
    return { ...player, teamName, position };
  });
  const gameweekFixtures = fixtures.filter(({ event: gw }) => gw === gameweek);
  const rows = gameweekFixtures.map((fixture, index) => {
    if (fixture.kickoff_time === null) {
      throw new FplSourceValidationError("fpl_fixtures", [{
        field: `${index}.kickoff_time`,
        detail: `Fixture ${fixture.id} has no kick-off`
      }]);
    }
    const homeTeam = teamNames.get(fixture.team_h);
    const awayTeam = teamNames.get(fixture.team_a);
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
    return {
      ...fixture,
      kickoff_time: fixture.kickoff_time,
      homeTeam,
      awayTeam
    };
  });

  await database.query("begin");
  try {
    await database.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ($1, $2, $3)
       on conflict (season, gw)
       do update set deadline_at = excluded.deadline_at`,
      [season, gameweek, event.deadline_time]
    );

    await database.query(
      "delete from fpl_players where season = $1 and gw = $2",
      [season, gameweek]
    );
    for (const player of players) {
      await database.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          season,
          gameweek,
          player.id,
          player.teamName,
          player.web_name,
          player.position,
          player.now_cost,
          player.status,
          player.chance_of_playing_next_round,
          player.news,
          player.news_added
        ]
      );
    }

    for (const fixture of rows) {
      await database.query(
        `insert into fixtures (
           season, fpl_id, gw, home_team, away_team, kickoff_at
         )
         values ($1, $2, $3, $4, $5, $6)
         on conflict (season, fpl_id)
         do update set
           gw = excluded.gw,
           home_team = excluded.home_team,
           away_team = excluded.away_team,
           kickoff_at = excluded.kickoff_at,
           updated_at = now()`,
        [
          season,
          fixture.id,
          gameweek,
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.kickoff_time
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

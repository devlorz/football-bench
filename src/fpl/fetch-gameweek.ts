import { createHash } from "node:crypto";
import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";

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

const bootstrapSchema = z.looseObject({
  events: z.array(eventSchema),
  teams: z.array(teamSchema)
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

function sha256(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
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

  await database.query("begin");
  try {
    await database.query(
      `insert into raw_snapshots (source, sha256, body)
       values ($1, $2, $3), ($4, $5, $6)
       on conflict (source, sha256)
       do update set last_seen_at = now()`,
      [
        "fpl_bootstrap",
        sha256(bootstrapBody),
        bootstrapBody,
        "fpl_fixtures",
        sha256(fixturesBody),
        fixturesBody
      ]
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }

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

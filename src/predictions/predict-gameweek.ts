import { createHash } from "node:crypto";
import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import {
  buildMatchContext,
  loadMatchContextData
} from "./build-match-context.js";
import {
  attemptMatchCalls,
  requireCallConcurrency,
  type MatchCall,
  type StoredContext
} from "./attempt-match-calls.js";
import {
  matchPromptOf,
  type MatchPromptFixture
} from "./openrouter-entrant.js";
import type { AttemptTrigger } from "./prediction-trigger.js";
import type { ModelRole } from "../season-roster.js";
import {
  readGapAlert,
  type GapAlert
} from "./gap-alert.js";

type Database = Pick<Client, "query">;

export interface PredictGameweekOptions {
  database: Database;
  competition: string;
  season: string;
  gameweek: number;
  concurrency: number;
  apiKey: string;
  http: HttpFetcher;
  now: () => Date;
  trigger?: AttemptTrigger;
}

type FixtureRow = MatchPromptFixture;

interface EntrantRow {
  id: string;
  base_model: string;
  provider: string;
  prompt_version: string;
  quantization: string | null;
}

interface WorkItemRow extends FixtureRow {
  entrant_id: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  role: ModelRole;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function storeContext(
  database: Database,
  competition: string,
  season: string,
  gameweek: number,
  fixture: FixtureRow,
  body: string
): Promise<StoredContext> {
  const inserted = await database.query<{ id: number }>(
    `insert into contexts (
       competition, season, gw, track, fixture_id, hash, body
     )
     values ($1, $2, $3, 'match', $4, $5, $6)
     on conflict (
       competition, season, gw, track,
       (coalesce(fixture_id, -1)), (coalesce(model_id, ''))
     ) do nothing
     returning id`,
    [competition, season, gameweek, fixture.fixture_id, sha256(body), body]
  );
  const id = inserted.rows[0]?.id;
  if (id !== undefined) {
    return { id, body };
  }

  const stored = await database.query<{ id: number; body: string }>(
    `select id, body
       from contexts
      where competition = $1
        and season = $2
        and gw = $3
        and track = 'match'
        and fixture_id = $4`,
    [competition, season, gameweek, fixture.fixture_id]
  );
  const context = stored.rows[0];
  if (context === undefined) {
    throw new Error(`Match context for Fixture ${fixture.fixture_id} was not stored`);
  }
  return context;
}

async function loadStoredContext(
  database: Database,
  competition: string,
  season: string,
  gameweek: number,
  fixtureId: number,
  trigger: Exclude<AttemptTrigger, "main">
): Promise<StoredContext> {
  const stored = await database.query<{ id: number; body: string }>(
    `select id, body
       from contexts
      where competition = $1
        and season = $2
        and gw = $3
        and track = 'match'
        and fixture_id = $4`,
    [competition, season, gameweek, fixtureId]
  );
  const context = stored.rows[0];
  if (context === undefined) {
    const runName = trigger === "fill" ? "Fill" : "Manual fill";
    throw new Error(
      `${runName} requires a stored Match context for Fixture ${fixtureId}`
    );
  }
  return context;
}

export async function predictGameweek({
  database,
  competition,
  season,
  gameweek,
  concurrency,
  apiKey,
  http,
  now,
  trigger = "main"
}: PredictGameweekOptions): Promise<GapAlert | null> {
  requireCallConcurrency(concurrency);

  // Which seats are this track's is read off the Prompt Version, exactly as
  // `startFplTrack` reads off its own. Both tracks mark a competitor with
  // `role = 'entrant'` and share one `models` table, so the role alone stopped
  // telling them apart the moment the FPL track had seats: every one of them
  // would have been a Match Entrant carrying the wrong Prompt Version, which
  // this function used to refuse outright.
  //
  // The refusal it replaces asserted that every Entrant is a Match Entrant.
  // That premise has expired rather than the check having been weakened.
  const entrantResult = await database.query<EntrantRow>(
    `select id, base_model, provider, quantization, prompt_version
       from models
      where role = 'entrant' and prompt_version = $1
      order by id`,
    [matchPromptOf(competition).version]
  );
  if (entrantResult.rows.length === 0) {
    throw new Error(`No Entrants are configured for ${competition}`);
  }

  const work = await database.query<WorkItemRow>(
    `select
       f.fixture_id, f.home_team, f.away_team, f.kickoff_at,
       m.id as entrant_id, m.base_model, m.provider, m.quantization, m.role
      from fixtures f
      cross join models m
      where f.competition = $1
        and f.season = $2
        and coalesce(f.locked_in_gw, f.gw) = $3
        and m.role = 'entrant'
        and m.prompt_version = $4
        and not exists (
          select 1
            from predictions p
           where p.model_id = m.id
             and p.competition = f.competition
             and p.season = f.season
             and p.fixture_id = f.fixture_id
        )
      order by f.fixture_id, m.id`,
    [competition, season, gameweek, matchPromptOf(competition).version]
  );

  const contextData = trigger === "main"
    ? await loadMatchContextData(database, competition, season, gameweek)
    : null;

  const contexts = new Map<number, StoredContext>();
  for (const item of work.rows) {
    if (!contexts.has(item.fixture_id)) {
      contexts.set(
        item.fixture_id,
        trigger === "main"
          ? await storeContext(
            database,
            competition,
            season,
            gameweek,
            item,
            buildMatchContext(item, contextData!)
          )
          : await loadStoredContext(
            database,
            competition,
            season,
            gameweek,
            item.fixture_id,
            trigger
          )
      );
    }
  }

  const calls: MatchCall[] = work.rows.map((item) => {
    const context = contexts.get(item.fixture_id);
    if (context === undefined) {
      throw new Error(
        `Match context for Fixture ${item.fixture_id} was not prepared`
      );
    }
    return {
      model_id: item.entrant_id,
      base_model: item.base_model,
      provider: item.provider,
      quantization: item.quantization,
      // The stored role, not the literal this query filters on: what decides
      // whether the Lock refuses is the column, so the column is what travels.
      role: item.role,
      fixture_id: item.fixture_id,
      context
    };
  });

  await attemptMatchCalls({
    database,
    competition,
    season,
    gameweek,
    concurrency,
    apiKey,
    http,
    now,
    trigger,
    calls
  });
  return readGapAlert(database, competition, season, gameweek, now);
}

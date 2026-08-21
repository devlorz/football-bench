import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import type { GapAlert } from "../predictions/gap-alert.js";
import { predictGameweek } from "../predictions/predict-gameweek.js";
import type { DryRunArchive } from "./load-archive.js";
import { prepareArchivedGameweek } from "./prepare-archived-gameweek.js";
import { resolveDryRunInstant } from "./dry-run-clock.js";
import { readGameweekDeadline } from "./gameweek-deadline.js";

type Database = Pick<Client, "query">;

export interface PreviewForecast {
  fixtureId: number;
  fixture: string;
  entrant: string;
  home: number;
  draw: number;
  away: number;
  predictedHome: number;
  predictedAway: number;
  repairs: number;
}

export interface PreviewContext {
  fixtureId: number;
  fixture: string;
  body: string;
}

export interface PreviewResult {
  contexts: PreviewContext[];
  forecasts: PreviewForecast[];
  gapAlert: GapAlert | null;
  tokensIn: number;
  tokensOut: number;
  elapsedMs: number;
}

export interface PreviewGameweekOptions {
  target: Database;
  archive: DryRunArchive;
  /**
   * The Competition being previewed, whose seats answer and whose Fixtures are
   * asked. Taken rather than assumed since La Liga: a bench over one
   * Competition's Gameweek is the only reading the other cannot give.
   */
  competition: string;
  season: string;
  footballDataSeason: string;
  gameweek: number;
  apiKey: string;
  http: HttpFetcher;
  concurrency: number;
  entrantCallTimeoutMs: number;
  /**
   * The instant to run at, dated from the Gameweek's own Lock exactly as the
   * dry run dates it. The wall clock served while a preview only ever looked
   * at a Gameweek still to come; a bench over one already played answers after
   * its Lock, and an Entrant answering after its Lock is refused.
   */
  at: string;
}

/**
 * Asks the real roster what it forecasts for a Gameweek, writing to a throwaway
 * database so the Season's own Predictions are never consumed.
 *
 * The Gameweek data is replayed from the archive exactly as the dry run replays
 * it, so the context an Entrant sees here is the context it would see for real.
 * Only the answer is live. That is the whole point: the dry run proves the path
 * with archived answers, this shows what the Base Models actually say.
 */
export async function previewGameweek({
  target,
  archive,
  competition,
  season,
  footballDataSeason,
  gameweek,
  apiKey,
  http,
  concurrency,
  entrantCallTimeoutMs,
  at
}: PreviewGameweekOptions): Promise<PreviewResult> {
  await prepareArchivedGameweek({
    target,
    archive,
    competition,
    season,
    footballDataSeason
  });

  const deadline = await readGameweekDeadline(
    target, competition, season, gameweek
  );
  const instant = resolveDryRunInstant(at, deadline);

  const startedAt = Date.now();
  const gapAlert = await predictGameweek({
    database: target,
    competition,
    season,
    gameweek,
    concurrency,
    apiKey,
    entrantCallTimeoutMs,
    http,
    now: () => instant,
    trigger: "main"
  });
  const elapsedMs = Date.now() - startedAt;

  const forecasts = await target.query<PreviewForecast>(
    `select f.fixture_id as "fixtureId",
            f.home_team || ' v ' || f.away_team as fixture,
            m.name as entrant,
            (p.probs->>'H')::float8 as home,
            (p.probs->>'D')::float8 as draw,
            (p.probs->>'A')::float8 as away,
            p.pred_home as "predictedHome",
            p.pred_away as "predictedAway",
            p.attempts_used as repairs
       from predictions p
       join fixtures f
         on f.competition = p.competition and f.season = p.season
        and f.fixture_id = p.fixture_id
       join models m on m.id = p.model_id
      where p.competition = $1 and p.season = $2
      order by f.fixture_id, m.name`,
    [competition, season]
  );

  const contexts = await target.query<PreviewContext>(
    `select c.fixture_id as "fixtureId",
            f.home_team || ' v ' || f.away_team as fixture,
            c.body
       from contexts c
       join fixtures f
         on f.competition = c.competition and f.season = c.season
        and f.fixture_id = c.fixture_id
      where c.competition = $1 and c.season = $2 and c.gw = $3
        and c.track = 'match'
      order by c.fixture_id`,
    [competition, season, gameweek]
  );

  const usage = await target.query<{
    tokensIn: number;
    tokensOut: number;
  }>(
    `select coalesce(sum(tokens_in), 0)::int as "tokensIn",
            coalesce(sum(tokens_out), 0)::int as "tokensOut"
       from attempts where competition = $1 and season = $2`,
    [competition, season]
  );

  return {
    contexts: contexts.rows,
    forecasts: forecasts.rows,
    gapAlert,
    tokensIn: usage.rows[0]?.tokensIn ?? 0,
    tokensOut: usage.rows[0]?.tokensOut ?? 0,
    elapsedMs
  };
}

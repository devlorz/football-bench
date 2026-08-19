import { resolveDryRunInstant } from "../dry-run/dry-run-clock.js";
import { DEFAULT_HTTP_TIMEOUT_MS } from "../http.js";
import { SEASON_ROSTER_SIZE } from "../season-roster.js";
import {
  parseAttemptTrigger,
  type AttemptTrigger
} from "../predictions/prediction-trigger.js";
import type {
  PreflightTarget
} from "../preflight/preflight-base-models.js";

export interface FetchJobConfig {
  databaseUrl: string;
  season: string;
  gameweek: number;
}

export interface HistoricalFetchJobConfig {
  databaseUrl: string;
  competition: string;
  season: string;
}

/**
 * What the daily scoring run reads. No key and no Gameweek: the scorer calls
 * nobody, and reads every Gameweek the Season's Locks own rather than one an
 * operator or a workflow input names.
 */
export interface ScoreJobConfig {
  databaseUrl: string;
  season: string;
}

export interface DailyFetchJobConfig {
  databaseUrl: string;
  season: string;
  footballDataSeason: string;
  /**
   * Optional, unlike every other credential here: the Premier League reads
   * the FPL API and needs none, so a deployment that runs one league is not
   * asked for a secret it cannot spend. A listed Competition that does read
   * football-data.org refuses its own fetch loudly when this is absent, which
   * puts the error where the missing token actually matters.
   */
  footballDataOrgToken: string | null;
}

/**
 * What any scheduled run that calls Entrants needs: a database, a Season, a
 * key to call with, and a bound on how many are called at once. It belongs to
 * neither track — both have Entrants, and both resolve their Gameweek from the
 * stored deadlines rather than from the environment, so neither reads one.
 *
 * The two track names below stay, because which job reads a config is worth
 * saying at every call site. What they must not be is one defined in terms of
 * the other: the shared reader returning `ScheduledPredictJobConfig` made the
 * FPL track's configuration a kind of the Match track's, which is a
 * relationship neither has to the other.
 */
export interface ScheduledEntrantJobConfig {
  databaseUrl: string;
  season: string;
  concurrency: number;
  openRouterApiKey: string;
}

export type ScheduledPredictJobConfig = ScheduledEntrantJobConfig;

/** What the FPL rehearsal reads. It calls no provider, so it needs no key. */
export interface FplRehearsalJobConfig {
  databaseUrl: string;
  season: string;
  concurrency: number;
}

export interface PredictJobConfig extends ScheduledEntrantJobConfig {
  gameweek: number;
  trigger: AttemptTrigger;
}

/**
 * What both FPL jobs read. The timeout knob is the FPL track's alone: its
 * opening prompt is the one reasoning models chew on for minutes, and the
 * Match track's per-Fixture prompts have never approached the ceiling
 * (spec 0010).
 */
export interface ScheduledFplJobConfig extends ScheduledEntrantJobConfig {
  entrantCallTimeoutMs: number;
}

export interface FplStartJobConfig extends ScheduledFplJobConfig {
  gameweek: number;
}

export interface PreviewJobConfig extends DailyFetchJobConfig {
  competition: string;
  gameweek: number;
  concurrency: number;
  openRouterApiKey: string;
  at: string;
}

export interface DryRunJobConfig extends DailyFetchJobConfig {
  gameweek: number;
  at: string;
  concurrency: number;
}

/**
 * What an Exhibition replay reads: the one row it replays, and nothing about
 * which Gameweeks to cover. The run resolves the Settled ones itself (ADR-0032),
 * so there is no Gameweek here to disagree with the record.
 *
 * The four fields it shares with `ScheduledEntrantJobConfig` are written out
 * rather than inherited from it. They are read by the same function, because
 * they are the same variables — but an Exhibition Run is not an Entrant's job
 * and nothing scheduled runs it, so the name would have said two false things
 * to save four lines.
 */
export interface ExhibitionJobConfig {
  databaseUrl: string;
  season: string;
  concurrency: number;
  openRouterApiKey: string;
  exhibitionModelId: string;
}

export interface FplExhibitionJobConfig {
  databaseUrl: string;
  season: string;
  openRouterApiKey: string;
  entrantCallTimeoutMs: number;
  exhibitionModelId: string;
}

export type PreflightJobConfig = {
  databaseUrl: string;
  season: string;
  fixtureId: number;
  openRouterApiKey: string;
} & PreflightTarget;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredSeason(environment: NodeJS.ProcessEnv): string {
  const season = required(environment, "SEASON");
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("SEASON must use YYYY-YY format");
  }
  return season;
}

export function readHistoricalFetchJobConfig(
  environment: NodeJS.ProcessEnv
): HistoricalFetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = required(environment, "HISTORICAL_SEASON");
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error("HISTORICAL_SEASON must use YYYY-YY format");
  }
  // Required rather than defaulted to `PL`, and the hazard being avoided is
  // this file's own rather than the database's. Migration 0024 dropped the
  // `'PL'` default, so a column left unset is a loud not-null violation; what
  // nothing downstream can catch is a Competition that is *stated* and wrong.
  // A default here would state `PL` on the operator's behalf, and the run that
  // meant to backfill Spain would file it under the Premier League with no
  // collision, no check, and a packet that reads normally.
  const competition = required(environment, "HISTORICAL_COMPETITION");
  return { databaseUrl, competition, season };
}

export function readScoreJobConfig(
  environment: NodeJS.ProcessEnv
): ScoreJobConfig {
  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    season: requiredSeason(environment)
  };
}

export function readDailyFetchJobConfig(
  environment: NodeJS.ProcessEnv
): DailyFetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const footballDataSeason = required(environment, "FOOTBALL_DATA_SEASON");
  if (!/^\d{4}-\d{2}$/.test(footballDataSeason)) {
    throw new Error("FOOTBALL_DATA_SEASON must use YYYY-YY format");
  }
  return {
    databaseUrl,
    season,
    footballDataSeason,
    footballDataOrgToken: environment.FOOTBALL_DATA_ORG_TOKEN?.trim() || null
  };
}

export function readFetchJobConfig(
  environment: NodeJS.ProcessEnv
): FetchJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const gameweekText = required(environment, "GAMEWEEK");
  const gameweek = Number(gameweekText);

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("GAMEWEEK must be an integer from 1 to 38");
  }

  return { databaseUrl, season, gameweek };
}

export function readPredictJobConfig(
  environment: NodeJS.ProcessEnv
): PredictJobConfig {
  const trigger = parseAttemptTrigger(environment.PREDICTION_TRIGGER);

  return {
    ...readScheduledPredictJobConfig(environment),
    gameweek: readFetchJobConfig(environment).gameweek,
    trigger
  };
}

/**
 * A whole-number knob with a default — how many Entrants a job may call at
 * once, how long one of those calls may take. Shared because every job that
 * reads one rejects the same values for the same reason, and names its own
 * variable when it does.
 */
function readPositiveInteger(
  environment: NodeJS.ProcessEnv,
  variable: string,
  fallback: number
): number {
  const value = Number(environment[variable]?.trim() || String(fallback));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${variable} must be a positive integer`);
  }
  return value;
}

/**
 * Reads a `ScheduledEntrantJobConfig` for whichever track asks for one.
 *
 * The concurrency variable is a parameter because the two must stay separate:
 * the tracks share a deadline (ADR-0006) and nothing else, and the FPL prompt
 * is several times the Match prompt's size, so one number for both would tie
 * two costs that have no reason to move together. It is the only thing that
 * differs, which is why everything else is read once here.
 */
function readScheduledJobConfig(
  environment: NodeJS.ProcessEnv,
  concurrencyVariable: string,
  concurrencyDefault: number
): ScheduledEntrantJobConfig {
  const concurrency = readPositiveInteger(
    environment,
    concurrencyVariable,
    concurrencyDefault
  );

  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    season: requiredSeason(environment),
    concurrency,
    openRouterApiKey: required(environment, "OPENROUTER_API_KEY")
  };
}

export function readScheduledPredictJobConfig(
  environment: NodeJS.ProcessEnv
): ScheduledPredictJobConfig {
  return readScheduledJobConfig(
    environment,
    "PREDICT_CONCURRENCY",
    SEASON_ROSTER_SIZE
  );
}

/**
 * The FPL action run's configuration, which resolves its Gameweek from the
 * stored deadlines exactly as the scheduled Prediction run does.
 *
 * Its own concurrency knob rather than `PREDICT_CONCURRENCY`. The two runs
 * share a deadline (ADR-0006) and are scheduled apart on purpose, and the FPL
 * prompt is several times the Match prompt's size — one number for both would
 * tie two costs that have no reason to move together.
 */
export function readScheduledFplJobConfig(
  environment: NodeJS.ProcessEnv
): ScheduledFplJobConfig {
  return {
    ...readScheduledJobConfig(
      environment,
      "FPL_CONCURRENCY",
      SEASON_ROSTER_SIZE
    ),
    entrantCallTimeoutMs: readPositiveInteger(
      environment,
      "ENTRANT_CALL_TIMEOUT_MS",
      DEFAULT_HTTP_TIMEOUT_MS
    )
  };
}

/**
 * The same, plus the Gameweek the operator chooses to start the track at.
 * That Gameweek is never inferred (ADR-0003): the track joins the Season
 * where the operator says and runs forward from there.
 */
export function readFplStartJobConfig(
  environment: NodeJS.ProcessEnv
): FplStartJobConfig {
  return {
    ...readScheduledFplJobConfig(environment),
    gameweek: readFetchJobConfig(environment).gameweek
  };
}

/**
 * What a rehearsal needs: the database holding the archive it replays, the
 * Season it plays as, and how many Entrants it may call at once.
 *
 * No OpenRouter key, unlike every other job that calls Entrants — a rehearsal
 * answers its own calls from a script, and asking for a key it cannot spend
 * would invite an operator to hand it a real one.
 */
export function readFplRehearsalJobConfig(
  environment: NodeJS.ProcessEnv
): FplRehearsalJobConfig {
  return {
    databaseUrl: required(environment, "DATABASE_URL"),
    season: requiredSeason(environment),
    concurrency: readPositiveInteger(
      environment,
      "FPL_CONCURRENCY",
      SEASON_ROSTER_SIZE
    )
  };
}

export function readDryRunJobConfig(
  environment: NodeJS.ProcessEnv
): DryRunJobConfig {
  const dailyFetch = readDailyFetchJobConfig(environment);
  const { gameweek } = readFetchJobConfig(environment);
  const at = environment.DRY_RUN_AT?.trim() || "deadline-6h";
  const concurrency = Number(
    environment.PREDICT_CONCURRENCY?.trim() || String(SEASON_ROSTER_SIZE)
  );
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }
  // Read now so an unusable instant fails before a cluster is built for it.
  resolveDryRunInstant(at, new Date(0));

  return {
    ...dailyFetch,
    gameweek,
    at,
    concurrency
  };
}

/**
 * The Match track's own concurrency bound is reused rather than given a
 * variable of its own: an Exhibition Run makes the same calls over the same
 * prompts, so a second knob would be a second answer to a question the Match
 * track has already answered.
 */
export function readExhibitionJobConfig(
  environment: NodeJS.ProcessEnv
): ExhibitionJobConfig {
  return {
    ...readScheduledPredictJobConfig(environment),
    exhibitionModelId: required(environment, "EXHIBITION_MODEL_ID")
  };
}

/**
 * Which track one Exhibition replay walks, defaulting to the Match track it
 * was first written for. One entry point takes both (spec 0013), because the
 * two share the operator, the model row and the reason for running — what
 * differs is only which record is replayed.
 */
export function readExhibitionTrack(
  environment: NodeJS.ProcessEnv
): "match" | "fpl" {
  const track = environment.TRACK?.trim() || "match";
  if (track !== "match" && track !== "fpl") {
    throw new Error("TRACK must be match or fpl");
  }
  return track;
}

/**
 * The same four variables the Match track reads, with the call timeout that
 * track's prompt needs (spec 0010) in place of the concurrency bound: a season
 * path is replayed in order, each Gameweek's context carrying the Squad the one
 * before it left, so there is never a second call to bound. Read through the
 * Match reader rather than beside it, so the four they share cannot drift.
 */
export function readFplExhibitionJobConfig(
  environment: NodeJS.ProcessEnv
): FplExhibitionJobConfig {
  const { concurrency: _unbounded, ...shared } =
    readExhibitionJobConfig(environment);
  return {
    ...shared,
    entrantCallTimeoutMs: readPositiveInteger(
      environment,
      "ENTRANT_CALL_TIMEOUT_MS",
      DEFAULT_HTTP_TIMEOUT_MS
    )
  };
}

export function readPreflightJobConfig(
  environment: NodeJS.ProcessEnv
): PreflightJobConfig {
  const databaseUrl = required(environment, "DATABASE_URL");
  const season = requiredSeason(environment);
  const fixtureId = Number(required(environment, "FIXTURE_ID"));
  const openRouterApiKey = required(environment, "OPENROUTER_API_KEY");
  // One Exhibition, or the roster — never both, because an Exhibition is not
  // on the roster and there is nothing for a count to mean beside it. Refused
  // rather than resolved by precedence: an operator who set both stated two
  // different intentions, and dropping one of them silently would run the
  // check they did not mean while telling them nothing.
  const exhibitionModelId = environment.EXHIBITION_MODEL_ID?.trim() || null;
  const entrantCount = environment.EXPECTED_ENTRANT_COUNT?.trim() || null;

  if (!Number.isInteger(fixtureId) || fixtureId < 1) {
    throw new Error("FIXTURE_ID must be a positive integer");
  }
  if (exhibitionModelId !== null && entrantCount !== null) {
    throw new Error(
      "EXHIBITION_MODEL_ID and EXPECTED_ENTRANT_COUNT cannot both be set"
    );
  }
  if (exhibitionModelId !== null) {
    return {
      databaseUrl,
      season,
      fixtureId,
      exhibitionModelId,
      openRouterApiKey
    };
  }

  const expectedEntrantCount = Number(
    required(environment, "EXPECTED_ENTRANT_COUNT")
  );
  if (!Number.isInteger(expectedEntrantCount) || expectedEntrantCount < 1) {
    throw new Error("EXPECTED_ENTRANT_COUNT must be a positive integer");
  }

  return {
    databaseUrl,
    season,
    fixtureId,
    expectedEntrantCount,
    openRouterApiKey
  };
}

/**
 * The preview calls the real roster, so it needs the key the prediction job
 * uses, and the dry run's instant for the same reason the dry run has one: a
 * bench over a Gameweek already played answers after its Lock unless the run
 * is dated from the Lock itself.
 */
export function readPreviewJobConfig(
  environment: NodeJS.ProcessEnv
): PreviewJobConfig {
  const dailyFetch = readDailyFetchJobConfig(environment);
  const { gameweek } = readFetchJobConfig(environment);
  const concurrency = Number(
    environment.PREDICT_CONCURRENCY?.trim() || String(SEASON_ROSTER_SIZE)
  );
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("PREDICT_CONCURRENCY must be a positive integer");
  }
  const openRouterApiKey = required(environment, "OPENROUTER_API_KEY");
  // Defaulted rather than required, because a preview writes to a database
  // that exists for the run and is thrown away: a wrong Competition costs a
  // rehearsal and nothing else. Read here rather than in the CLI so one job has
  // one place its input is read and shaped, the way every other field is.
  const competition = environment.COMPETITION?.trim().toUpperCase() || "PL";
  if (!/^[A-Z]{2,3}$/.test(competition)) {
    throw new Error("COMPETITION must be a Competition code such as PL or PD");
  }
  const at = environment.PREVIEW_AT?.trim() || "deadline-6h";
  // Read now so an unusable instant fails before a cluster is built for it.
  resolveDryRunInstant(at, new Date(0));

  return {
    ...dailyFetch,
    competition,
    gameweek,
    concurrency,
    openRouterApiKey,
    at
  };
}

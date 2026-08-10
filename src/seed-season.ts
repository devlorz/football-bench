import { createHash } from "node:crypto";
import pg, { type Client as PgClient } from "pg";
import {
  outcomeOf, OUTCOMES, type FixtureResult, type Outcome, type Probs
} from "./fixture-result.js";
import { MATCH_PROMPT_VERSION } from "./predictions/openrouter-entrant.js";
import { scoreMatchSeason } from "./predictions/score-match-gameweek.js";

const { Client } = pg;

type Database = Pick<PgClient, "query">;

/**
 * Where a Base Model comes from (CONTEXT.md). Read by the dashboard and by
 * nothing else, which is why it lives in `models.config` rather than in a
 * column of its own.
 */
type BaseModelClass = "Frontier" | "First-party" | "Open-weight";

/**
 * The nine seats of ADR-0014: three Frontier, one more First-party, five
 * Open-weight. The ids are the design of record's.
 */
const ROSTER: ReadonlyArray<{
  id: string;
  name: string;
  baseModel: string;
  provider: string;
  /**
   * Pinned on the open-weight seats and null on the rest (ADR-0009,
   * ADR-0014): a served open-weight Base Model is a different model at a
   * different precision, so an unpinned one is not one Entrant across a
   * Season. A first-party seat has nothing to pin.
   */
  quantization: string | null;
  baseModelClass: BaseModelClass;
}> = [
  {
    id: "claude/v1", name: "Claude", baseModel: "anthropic/claude-opus-4.5",
    provider: "anthropic", quantization: null,
    baseModelClass: "Frontier"
  },
  {
    id: "gpt/v1", name: "GPT", baseModel: "openai/gpt-5.2",
    provider: "openai", quantization: null,
    baseModelClass: "Frontier"
  },
  {
    id: "gemini/v1", name: "Gemini", baseModel: "google/gemini-3-pro",
    provider: "google-vertex", quantization: null,
    baseModelClass: "Frontier"
  },
  {
    id: "grok/v1", name: "Grok", baseModel: "x-ai/grok-4",
    provider: "xai", quantization: null,
    baseModelClass: "First-party"
  },
  {
    id: "kimi/v1", name: "Kimi", baseModel: "moonshotai/kimi-k2",
    provider: "moonshotai", quantization: "fp8",
    baseModelClass: "Open-weight"
  },
  {
    id: "glm/v1", name: "GLM", baseModel: "z-ai/glm-4.6",
    provider: "z-ai", quantization: "fp8",
    baseModelClass: "Open-weight"
  },
  {
    id: "deepseek/v1", name: "DeepSeek", baseModel: "deepseek/deepseek-v3.2",
    provider: "deepseek", quantization: "fp8",
    baseModelClass: "Open-weight"
  },
  {
    id: "qwen/v1", name: "Qwen", baseModel: "qwen/qwen3-max",
    provider: "alibaba", quantization: "fp8",
    baseModelClass: "Open-weight"
  },
  {
    id: "minimax/v1", name: "MiniMax", baseModel: "minimax/minimax-m2",
    provider: "minimax", quantization: "fp8",
    baseModelClass: "Open-weight"
  }
];

const TEAMS = [
  "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
  "Burnley", "Chelsea", "Crystal Palace", "Everton", "Fulham",
  "Leeds", "Liverpool", "Manchester City", "Manchester United",
  "Newcastle", "Nottingham Forest", "Sheffield United", "Sunderland",
  "Tottenham", "West Ham"
];

/** The Gameweeks the seed covers: fourteen to settle and a fifteenth to lock. */
const GAMEWEEKS = 15;

/**
 * One Gameweek short of ten Fixtures, so nothing downstream can assume ten.
 * The fourteenth rather than the fifteenth: the design's Fixtures page is
 * drawn on Gameweek 15 with ten.
 */
const SHORT_GAMEWEEK = 14;

const FIRST_DEADLINE = Date.UTC(2026, 7, 14, 17, 30);
const WEEK = 7 * 24 * 60 * 60 * 1000;

const deadlineOf = (gameweek: number): Date =>
  new Date(FIRST_DEADLINE + (gameweek - 1) * WEEK);

/**
 * When the main Prediction run answered a Gameweek: deadline −6h, as the
 * scheduled path runs it.
 *
 * Every context and Prediction is stamped with it rather than left to `now()`,
 * for two reasons. The Lock is the whole claim the Fixtures page makes — a
 * Prediction stored before its deadline — and a seed run in a year the Season's
 * deadlines have passed would stamp rows that contradict it. And every row the
 * seed writes has to come out the same on the next run, which a wall clock in a
 * timestamp column cannot do. The rows the scorer writes on the way past are
 * its own; see `SEED_SCORED_AT`.
 */
const mainRunOf = (gameweek: number): Date =>
  new Date(deadlineOf(gameweek).getTime() - 6 * 60 * 60 * 1000);

/** When the roster was entered and the schedule first read: before Gameweek 1. */
export const SEED_ENTERED_AT =
  new Date(FIRST_DEADLINE - 30 * 24 * 60 * 60 * 1000);

interface SeedFixture {
  fplId: number;
  gw: number;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
}

/**
 * The circle method: each Gameweek pairs every team exactly once, so no team
 * plays itself or appears twice in a round the way a modulo shift would let
 * it. Fixture ids are `(gw - 1) * 10 + slot`, which leaves the design's
 * Gameweek 15 on 141–150 even with a short Gameweek before it.
 */
function fixturesOf(gameweek: number): SeedFixture[] {
  const rotated = [
    TEAMS[0]!,
    ...TEAMS.slice(1).slice(-(gameweek - 1) % (TEAMS.length - 1) || undefined),
    ...TEAMS.slice(1).slice(0, -(gameweek - 1) % (TEAMS.length - 1) || undefined)
  ];
  const half = TEAMS.length / 2;
  const kickoff = deadlineOf(gameweek).getTime() + 90 * 60 * 1000;
  const slots = gameweek === SHORT_GAMEWEEK ? half - 1 : half;
  return Array.from({ length: slots }, (_, slot) => {
    const home = rotated[slot]!;
    const away = rotated[TEAMS.length - 1 - slot]!;
    // Alternating home and away by Gameweek, so a team is not always at home.
    const swap = (gameweek + slot) % 2 === 1;
    return {
      fplId: (gameweek - 1) * half + slot + 1,
      gw: gameweek,
      homeTeam: swap ? away : home,
      awayTeam: swap ? home : away,
      kickoffAt: new Date(kickoff + slot * 2 * 60 * 60 * 1000)
    };
  });
}

/**
 * A stable number in `[0, 1)` for a named draw. The seed is data, not a
 * simulation: the same command has to produce the same Season on every machine,
 * so nothing here reads a random source.
 */
function draw(...parts: Array<string | number>): number {
  const digest = createHash("sha256").update(parts.join(":")).digest();
  return digest.readUInt32BE(0) / 2 ** 32;
}

const goalsOf = (fplId: number, side: string): number =>
  Math.floor(draw("goals", fplId, side) * 3.4);

/** Weight on the named Outcome, with the rest split over the other two. */
function probsFor(outcome: Outcome, confidence: number): Probs {
  const rest = (1 - confidence) / 2;
  return Object.fromEntries(
    OUTCOMES.map((each) => [each, each === outcome ? confidence : rest])
  ) as Probs;
}

/**
 * How often an Entrant names the right scoreline. Spread across the roster so
 * the leaderboard has an order to read rather than nine equal rows; the seat
 * with the lowest share is still well above naming nothing.
 */
const skillOf = (index: number): number => 0.34 - index * 0.02;

/** The one Entrant that Gaps, and the Fixtures it never answered. */
const GAPPED_ENTRANT = "minimax/v1";
const GAPPED_FIXTURES = new Set([
  // A settled Fixture, so the Entrant's own `n` falls behind the Season's
  // settled-Fixture count.
  (SHORT_GAMEWEEK - 1) * 10 + 3,
  // And one in the locked-but-unplayed Gameweek, so the design's Fixtures page
  // has a slot to render empty.
  (GAMEWEEKS - 1) * 10 + 7
]);

/**
 * The one Prediction whose likeliest Outcome disagrees with the scoreline it
 * names, so the Fixtures page's danger treatment has something to render.
 */
const INCOHERENT_ENTRANT = "qwen/v1";
const INCOHERENT_FIXTURE = (GAMEWEEKS - 1) * 10 + 3;

/**
 * The instant every seeded `scores` row is stamped with. Fixed, so two runs of
 * the seed leave the same rows, and so a test can re-run the scorer over the
 * seed and compare what it wrote row for row.
 *
 * Every row the seed writes itself carries a stamp derived from the Season's
 * schedule. The one exception is outside its reach: the scorer enters the three
 * Reference Line `models` rows on the way past and lets `created_at` default,
 * so those three timestamps move between runs. Nothing reads them — the
 * dashboard's roster is the Entrants — and pinning them would mean changing the
 * scorer, which this spec puts out of scope.
 *
 * The morning after Gameweek 14's last Fixture settled and before Gameweek
 * 15's Prediction run, which is where the design's state sits: scored through
 * 14, committed on 15.
 */
export const SEED_SCORED_AT = new Date("2026-11-15T10:00:00Z");

/**
 * Refuses anything but a database on this machine.
 *
 * The seed writes a whole invented Season, and the one mistake worth guarding
 * is pointing it at a deployed database because `DATABASE_URL` was still
 * exported from an earlier command. A hostname is a weak proof of locality and
 * a tunnel would pass it — it is a guard against the accident, not against
 * somebody determined to do it.
 */
export function assertLocalDatabase(connectionString: string): void {
  // The driver is asked where it would connect rather than the string being
  // read here, because only the driver knows: an empty or repeated `?host=`,
  // a URL with no authority at all, and `PGHOST` in the environment each
  // decide the answer, and every rule this file invented for them would be one
  // more place to be wrong about. Constructing a Client opens nothing.
  const { host } = new Client({ connectionString });
  const local = host.startsWith("/")
    || ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local) {
    throw new Error(
      `The seed only runs against a local database, and ${host} is not one`
    );
  }
}

/**
 * Points the session's unqualified table names at `public`.
 *
 * Everything below writes unqualified — as the migrations do, and as every
 * other job in the repo does — while the check below reads `public` by name.
 * Those are the same schema only as long as the search path says so, and a
 * `search_path` set on the role or handed over in the connection string would
 * make the seed certify one schema empty and fill another. `pg_catalog` is
 * deliberately not named: unnamed, it is searched first, which is what keeps a
 * table called `pg_class` from shadowing the catalog.
 */
export async function pinPublicSchema(database: Database): Promise<void> {
  await database.query("set search_path to public");
}

/**
 * Refuses a database that already holds anything.
 *
 * The command's contract is an empty database, and this is what checks it
 * rather than assuming it. Being local is not the same as being disposable: a
 * stale `DATABASE_URL`, or a tunnel with a deployed database on the far end,
 * both reach a host this file calls local, and emptying one of those is a loss
 * no error message afterwards can undo. Emptying is therefore something the
 * operator asks for by name, never something a seed does on the way past.
 *
 * Every table rather than the ones the seed writes. `historical_matches` is
 * the case that names the rule: the seed never touches it, and the scorer
 * reads it for the Elo Reference Line, so rows left in it move numbers the
 * seed is supposed to produce identically every time. A table added later
 * that some other job reads would be the same story, and listing tables here
 * by hand is how that goes unnoticed. Migration bookkeeping is excluded,
 * being the one table a migrated empty database is meant to have rows in.
 */
export async function assertEmptyDatabase(database: Database): Promise<void> {
  const tables = await database.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
        and table_name <> 'schema_migrations'
      order by table_name`
  );

  const occupied: string[] = [];
  for (const { table_name } of tables.rows) {
    const held = await database.query(
      `select 1 from "${table_name.replace(/"/g, '""')}" limit 1`
    );
    if (held.rowCount !== null && held.rowCount > 0) {
      occupied.push(table_name);
    }
  }

  if (occupied.length > 0) {
    throw new Error(
      "The seed needs an empty database, and this one already holds "
      + `${occupied.join(", ")}. `
      + "Re-run with --reset to drop the public schema and rebuild it."
    );
  }
}

/** How far the seed goes; each stopping point is the previous plus one thing. */
export type SeedStop = "pre-season" | "pending" | "the design's";

export interface SeedSeasonOptions {
  database: Database;
  season: string;
  stopAt: SeedStop;
  /**
   * How the seeded Season is scored. Injected so a test can watch the database
   * at the moment before the scorer runs, which is the only place the claim
   * that the seed writes no `scores` row itself can be checked.
   */
  score?: (options: {
    database: Database;
    season: string;
    now: () => Date;
  }) => Promise<unknown>;
}

/**
 * Fills an empty database with the Season the dashboard was designed against,
 * stopping at one of three points. It writes no `scores` row: every figure a
 * page reads comes from running the real scorer over what this wrote.
 *
 * A development and test tool. It is never run against a deployed database.
 */
export async function seedSeason({
  database,
  season,
  stopAt,
  score = scoreMatchSeason
}: SeedSeasonOptions): Promise<void> {
  // Every row the seed writes itself, in one transaction: a run that fails
  // half way through leaves nothing rather than a database that is neither
  // empty enough to seed again nor complete enough to read.
  await database.query("begin");
  try {
    await writeSeason(database, season, stopAt);
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
  if (stopAt === "pre-season") {
    return;
  }

  // The real scorer, before the fifteenth Gameweek is locked: it is what a
  // daily run would have written on the morning after Gameweek 14 settled, and
  // it leaves the leaderboard through 14 while the Fixtures page shows 15.
  // It opens its own transaction, so it runs outside the one above.
  await score({ database, season, now: () => SEED_SCORED_AT });

  if (stopAt === "the design's") {
    await database.query("begin");
    try {
      await lockAndPredict(database, season, GAMEWEEKS);
      await database.query("commit");
    } catch (error) {
      await database.query("rollback");
      throw error;
    }
  }
}

async function writeSeason(
  database: Database,
  season: string,
  stopAt: SeedStop
): Promise<void> {
  for (const entrant of ROSTER) {
    await database.query(
      `insert into models (
         id, name, base_model, provider, quantization, prompt_version, role,
         config, created_at
       ) values ($1, $2, $3, $4, $5, $6, 'entrant', $7, $8)`,
      [
        entrant.id,
        entrant.name,
        entrant.baseModel,
        entrant.provider,
        entrant.quantization,
        MATCH_PROMPT_VERSION,
        JSON.stringify({ baseModelClass: entrant.baseModelClass }),
        SEED_ENTERED_AT
      ]
    );
  }

  // Only as far as the Fixtures go: pre-season is the roster and Gameweek 1,
  // and a Gameweek 15 row sitting in a pre-season database is a deadline the
  // page could read and the state does not have.
  const through = stopAt === "pre-season" ? 1 : GAMEWEEKS;
  for (let gameweek = 1; gameweek <= through; gameweek += 1) {
    await database.query(
      "insert into gameweeks (season, gw, deadline_at) values ($1, $2, $3)",
      [season, gameweek, deadlineOf(gameweek)]
    );
    for (const fixture of fixturesOf(gameweek)) {
      await database.query(
        `insert into fixtures (
           season, fpl_id, gw, home_team, away_team, kickoff_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          season, fixture.fplId, fixture.gw,
          fixture.homeTeam, fixture.awayTeam, fixture.kickoffAt, SEED_ENTERED_AT
        ]
      );
    }
  }
  if (stopAt === "pre-season") {
    return;
  }

  for (let gameweek = 1; gameweek < GAMEWEEKS; gameweek += 1) {
    await lockAndPredict(database, season, gameweek);
    for (const fixture of fixturesOf(gameweek)) {
      const home = goalsOf(fixture.fplId, "home");
      const away = goalsOf(fixture.fplId, "away");
      await database.query(
        `update fixtures set result = $3, updated_at = $4
          where season = $1 and fpl_id = $2`,
        [
          season,
          fixture.fplId,
          JSON.stringify({
            home_goals: home, away_goals: away, outcome: outcomeOf(home, away)
          } satisfies FixtureResult),
          // Two hours after kickoff, which is when the feed would have
          // declared it settled.
          new Date(fixture.kickoffAt.getTime() + 2 * 60 * 60 * 1000)
        ]
      );
    }
  }
}

/**
 * What the Prediction run leaves behind for one Gameweek: the Lock on every
 * Fixture, the context each Entrant was sent, and the Predictions themselves.
 */
async function lockAndPredict(
  database: Database,
  season: string,
  gameweek: number
): Promise<void> {
  for (const fixture of fixturesOf(gameweek)) {
    await database.query(
      `update fixtures set locked_in_gw = $3
        where season = $1 and fpl_id = $2`,
      [season, fixture.fplId, gameweek]
    );
    const body = `${fixture.homeTeam} v ${fixture.awayTeam}: seeded context`;
    const context = await database.query<{ id: string }>(
      `insert into contexts (season, gw, track, fpl_id, hash, body, built_at)
       values ($1, $2, 'match', $3, $4, $5, $6) returning id`,
      [
        season,
        gameweek,
        fixture.fplId,
        // Over the body, exactly as the predict path hashes it: the hash the
        // page shows is a claim about what the Entrant was sent, and one taken
        // over anything else could not check it.
        createHash("sha256").update(body, "utf8").digest("hex"),
        body,
        mainRunOf(gameweek)
      ]
    );
    const contextId = context.rows[0]!.id;

    for (const [index, entrant] of ROSTER.entries()) {
      if (entrant.id === GAPPED_ENTRANT && GAPPED_FIXTURES.has(fixture.fplId)) {
        continue;
      }
      const right =
        draw("skill", entrant.id, fixture.fplId) < skillOf(index);
      const home = right
        ? goalsOf(fixture.fplId, "home")
        : Math.floor(draw("pred-home", entrant.id, fixture.fplId) * 3.4);
      const away = right
        ? goalsOf(fixture.fplId, "away")
        : Math.floor(draw("pred-away", entrant.id, fixture.fplId) * 3.4);
      const named = outcomeOf(home, away);
      const incoherent =
        entrant.id === INCOHERENT_ENTRANT
        && fixture.fplId === INCOHERENT_FIXTURE;
      const likeliest = incoherent
        ? OUTCOMES[(OUTCOMES.indexOf(named) + 1) % OUTCOMES.length]!
        : named;
      await database.query(
        `insert into predictions (
           model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
           rationale, attempts_used, predicted_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entrant.id,
          season,
          fixture.fplId,
          JSON.stringify(probsFor(
            likeliest,
            0.44 + draw("confidence", entrant.id, fixture.fplId) * 0.3
          )),
          home,
          away,
          contextId,
          `${fixture.homeTeam} v ${fixture.awayTeam}: seeded rationale from `
          + `${entrant.name}, which forecasts ${home}-${away}.`,
          // Some seats cost a Repair, so zero on the page reads as valid first
          // time rather than as a column nobody fills.
          draw("repairs", entrant.id, fixture.fplId) < 0.12 ? 1 : 0,
          mainRunOf(gameweek)
        ]
      );
    }
  }
}

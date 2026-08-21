import { createHash } from "node:crypto";
import pg, { type Client as PgClient } from "pg";
import {
  outcomeOf, OUTCOMES, type FixtureResult, type Outcome, type Probs
} from "./fixture-result.js";
import { FPL_PROMPT_VERSION } from "./context/build-fpl-track-context.js";
import {
  applyGameweekAction, openingManagerState, rolledOverState, VIOLATIONS,
  type GameweekAction, type ManagerState, type PoolPlayer, type TeamSheet
} from "./fpl/apply-gameweek-action.js";
import type { GapCause } from "./predictions/gap-alert.js";
import { storeManagerState } from "./fpl/manager-state-store.js";
import {
  scoreFplGameweek, type ScoreFplGameweekOptions
} from "./fpl/score-fpl-gameweek.js";
import { MAX_REPAIRS } from "./repairs.js";
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

/**
 * The Entrant's FPL seat, beside its Match one. The shape production uses —
 * `fpl/` and the Base Model's short name — over the ids this file gives the
 * Match seats, which carry a `/v1` the FPL track has no equivalent of.
 */
const fplSeatOf = (matchSeatId: string): string =>
  `fpl/${matchSeatId.split("/")[0]}`;

/**
 * The twenty, and the three-letter code each plays under — the identity the FPL
 * screens print wherever a club's name does not fit, which is the shirt and the
 * opponent slot on a Team Sheet.
 *
 * Real codes against the seed's own spellings: FPL writes three of these clubs
 * `Man City`, `Nott'm Forest` and `Spurs`, and this file has always spelled them
 * out. The point of storing a code at all is that it cannot be worked out from
 * the name — `AVL` and `NFO` are not slices of "Aston Villa" and "Nottingham
 * Forest" — so the seed carries one per club rather than deriving it, exactly as
 * the Lock does.
 */
const CLUB_CODES: Readonly<Record<string, string>> = {
  Arsenal: "ARS",
  "Aston Villa": "AVL",
  Bournemouth: "BOU",
  Brentford: "BRE",
  Brighton: "BHA",
  Burnley: "BUR",
  Chelsea: "CHE",
  "Crystal Palace": "CRY",
  Everton: "EVE",
  Fulham: "FUL",
  Leeds: "LEE",
  Liverpool: "LIV",
  "Manchester City": "MCI",
  "Manchester United": "MUN",
  Newcastle: "NEW",
  "Nottingham Forest": "NFO",
  "Sheffield United": "SHU",
  Sunderland: "SUN",
  Tottenham: "TOT",
  "West Ham": "WHU"
};

/** Read off the codes above, so a club cannot be fielded without one. */
const TEAMS = Object.keys(CLUB_CODES);

const codeOf = (club: string): string => {
  const code = CLUB_CODES[club];
  if (code === undefined) {
    throw new Error(`The seed fields ${club} and gives it no three-letter code`);
  }
  return code;
};

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
    competition: string;
    season: string;
    now: () => Date;
  }) => Promise<unknown>;
  /** The same, for the FPL track and for the same reason. */
  scoreFpl?: (options: ScoreFplGameweekOptions) => Promise<unknown>;
  /**
   * The last FPL Gameweek to write a Manager State for, defaulting to the whole
   * seeded run.
   *
   * A test knob with one job: the squads page shows the Gameweek whose Team
   * Sheets are the latest locked (ADR-0048), and `manager_states` is
   * insert-only, so a fixture cannot delete its way back to an earlier
   * Gameweek. A suite that wants to read Gameweek 4's Sheet stops the seed
   * there instead.
   */
  fplThrough?: number;
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
  score = scoreMatchSeason,
  scoreFpl = scoreFplGameweek,
  fplThrough = FPL_GAMEWEEKS
}: SeedSeasonOptions): Promise<void> {
  // Every row the seed writes itself, in one transaction: a run that fails
  // half way through leaves nothing rather than a database that is neither
  // empty enough to seed again nor complete enough to read.
  await database.query("begin");
  try {
    await writeSeason(database, season, stopAt, fplThrough);
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
  await score({
    database, competition: "PL", season, now: () => SEED_SCORED_AT
  });

  // And the FPL track's, one Gameweek at a time, exactly as the scheduled run
  // reaches them: the record at each Gameweek is what the rank movement
  // between two of them is read from, and one call at the last Gameweek would
  // write that Gameweek alone.
  for (let gameweek = 1; gameweek <= fplThrough; gameweek += 1) {
    await scoreFpl({ database, season, gameweek });
  }

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
  stopAt: SeedStop,
  fplThrough: number
): Promise<void> {
  for (const entrant of ROSTER) {
    // One seat per track per Base Model (CONTEXT.md, Season Roster): a seat is
    // entered for a track, both carry `role = 'entrant'`, and the Prompt
    // Version is what tells them apart.
    for (const [id, promptVersion] of [
      [entrant.id, MATCH_PROMPT_VERSION],
      [fplSeatOf(entrant.id), FPL_PROMPT_VERSION]
    ]) {
      await database.query(
        `insert into models (
           id, name, base_model, provider, quantization, prompt_version, role,
           config, created_at
         ) values ($1, $2, $3, $4, $5, $6, 'entrant', $7, $8)`,
        [
          id,
          entrant.name,
          entrant.baseModel,
          entrant.provider,
          entrant.quantization,
          promptVersion,
          JSON.stringify({ baseModelClass: entrant.baseModelClass }),
          SEED_ENTERED_AT
        ]
      );
    }
  }

  // The Competition the seeded Season is played in. Written before its first
  // Gameweek and at every stopping point, because a Season with Gameweeks and
  // no active Competition is a state the record cannot reach: it is what the
  // scheduler and the fetch walk (ADR-0035), so a seeded database without it
  // is one where every job finds nothing to do and says so as success.
  await database.query(
    "insert into competitions (competition, season) values ('PL', $1)",
    [season]
  );

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
           season, fixture_id, gw, home_team, away_team, kickoff_at, updated_at
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
          where season = $1 and fixture_id = $2`,
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

  await writeFplSeason(database, season, fplThrough);
}

/**
 * The FPL Gameweeks the seed plays. Five, of which four are scored: enough for
 * the rank movement between two cumulative snapshots, and one more so that the
 * Gameweek nobody scores has Settled Gameweeks on both sides of it.
 */
const FPL_GAMEWEEKS = 5;

/**
 * The Gameweek one Entrant never answered. Its points are Settled and every
 * other Entrant acted in it, and it is scored for none of them: a Gameweek one
 * Entrant Gapped is removed from every Season path (ADR-0011), which is the
 * hole inside the Settled span the pages have to announce rather than skip.
 */
const FPL_GAP_GAMEWEEK = 4;

/**
 * Why the Gapped Entrant produced nothing. Typed against the causes an attempt
 * row can record, so the seed cannot invent a cause no reporter counts.
 */
const FPL_GAP_CAUSE: GapCause = "provider";

interface SeedFplPlayer extends PoolPlayer {
  webName: string;
  /** FPL's known penalty taker order, where FPL names one. */
  penaltiesOrder?: number;
  /** FPL's known direct-free-kick taker order, where FPL names one. */
  directFreekicksOrder?: number;
}

/**
 * The players the seeded Season is played over: fifteen that make a legal
 * opening Squad, and six more to Transfer between.
 *
 * The fifteen cost £98.5m of the £100.0m budget, take no more than three
 * players from any one club, and fill the squad quota exactly — two
 * goalkeepers, five defenders, five midfielders and three forwards. The six
 * alternates come from clubs the fifteen do not use, so a Transfer is judged
 * on its own price and not on a club limit it happens to trip.
 */
const SEED_FPL_POOL: readonly SeedFplPlayer[] = [
  { fplId: 1, webName: "Raya", club: "Arsenal", position: "GKP", priceTenths: 50 },
  { fplId: 2, webName: "Pickford", club: "Everton", position: "GKP", priceTenths: 40 },
  { fplId: 3, webName: "Saliba", club: "Arsenal", position: "DEF", priceTenths: 60 },
  { fplId: 4, webName: "Timber", club: "Arsenal", position: "DEF", priceTenths: 55 },
  { fplId: 5, webName: "Konate", club: "Liverpool", position: "DEF", priceTenths: 55 },
  { fplId: 6, webName: "Branthwaite", club: "Everton", position: "DEF", priceTenths: 45 },
  { fplId: 7, webName: "Cucurella", club: "Chelsea", position: "DEF", priceTenths: 50 },
  {
    fplId: 8, webName: "Salah", club: "Liverpool", position: "MID",
    priceTenths: 110, penaltiesOrder: 1, directFreekicksOrder: 2
  },
  { fplId: 9, webName: "Palmer", club: "Chelsea", position: "MID", priceTenths: 95 },
  { fplId: 10, webName: "Ndiaye", club: "Everton", position: "MID", priceTenths: 60 },
  { fplId: 11, webName: "Semenyo", club: "Bournemouth", position: "MID", priceTenths: 65 },
  { fplId: 12, webName: "Rogers", club: "Aston Villa", position: "MID", priceTenths: 55 },
  { fplId: 13, webName: "Isak", club: "Liverpool", position: "FWD", priceTenths: 95 },
  { fplId: 14, webName: "Jackson", club: "Chelsea", position: "FWD", priceTenths: 70 },
  { fplId: 15, webName: "Watkins", club: "Aston Villa", position: "FWD", priceTenths: 80 },
  { fplId: 16, webName: "Gordon", club: "Newcastle", position: "MID", priceTenths: 70 },
  { fplId: 17, webName: "Wissa", club: "Newcastle", position: "FWD", priceTenths: 65 },
  { fplId: 18, webName: "Van de Ven", club: "Tottenham", position: "DEF", priceTenths: 50 },
  { fplId: 19, webName: "Kudus", club: "Tottenham", position: "MID", priceTenths: 65 },
  { fplId: 20, webName: "Sels", club: "Nottingham Forest", position: "GKP", priceTenths: 45 },
  { fplId: 21, webName: "Muniz", club: "Fulham", position: "FWD", priceTenths: 60 }
];

/** The fifteen every Entrant opens with, and how they are seated. */
const FPL_OPENING_SQUAD = SEED_FPL_POOL.slice(0, 15).map(({ fplId }) => fplId);
const FPL_STARTERS = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];
const FPL_BENCH = [2, 7, 12, 15];

/**
 * The one player whose price rises after everybody bought him, and the one
 * whose price falls, so Selling Price is exercised in both directions: Salah
 * is sold for what was paid plus half the rise, Jackson for what he is now
 * worth. Both are in the opening fifteen and neither is ever Transferred out,
 * so every Entrant carries the pair to the last Gameweek.
 */
const FPL_RISER = 8;
const FPL_FALLER = 14;

/** The pool as that Gameweek's Lock found it, with the two prices moved. */
function fplPoolAt(gameweek: number): SeedFplPlayer[] {
  return SEED_FPL_POOL.map((player) => ({
    ...player,
    priceTenths: player.priceTenths
      + (player.fplId === FPL_RISER ? Math.min(gameweek - 1, 2) * 5 : 0)
      - (player.fplId === FPL_FALLER && gameweek >= FPL_GAP_GAMEWEEK ? 5 : 0)
  }));
}

/**
 * A stable points total for one player in one Gameweek. Wide enough that a
 * captain's armband decides an order the nine Entrants would otherwise share,
 * since they open on the same fifteen and differ first in whom they captain.
 */
const fplPointsOf = (gameweek: number, fplId: number): number =>
  Math.floor(draw("fpl-points", gameweek, fplId) * 13);

/** The same eleven under a different armband: one Team Sheet per seat. */
function fplSheetOf(seat: number, bench: number[] = FPL_BENCH): TeamSheet {
  return {
    starters: FPL_STARTERS,
    bench,
    captain: FPL_STARTERS[seat % FPL_STARTERS.length]!,
    viceCaptain: FPL_STARTERS[(seat + 1) % FPL_STARTERS.length]!
  };
}

/**
 * What one seat does in one Gameweek: an action and the Repairs it cost, a
 * Roll Over, or nothing at all.
 */
type SeedFplGameweek =
  | { action: GameweekAction; rationale: string; repairs: number }
  | "roll over"
  | "silent";

/**
 * Which of those each seat does, Gameweek by Gameweek. Between them the nine
 * play every state a screen has to render: a Hit, a banked Free Transfer, a
 * Chip, a Roll Over, a Repair and a Gap.
 *
 * Seats are named by index rather than by id: which Base Model takes the Hit
 * is nothing, and naming one here would read as a claim about it.
 */
function fplGameweekOf(
  seat: number,
  gameweek: number,
  standing: ManagerState
): SeedFplGameweek {
  const bankFreeTransfer = (): GameweekAction => ({
    transfersIn: [],
    transfersOut: [],
    chip: null,
    // Its own Team Sheet, which is the opening one until it Transfers.
    teamSheet: standing.teamSheet ?? fplSheetOf(seat)
  });

  if (gameweek === 1) {
    return {
      action: {
        transfersIn: [...FPL_OPENING_SQUAD],
        transfersOut: [],
        chip: null,
        teamSheet: fplSheetOf(seat)
      },
      rationale: "The opening fifteen.",
      repairs: 0
    };
  }
  if (gameweek === 2 && seat === 0) {
    // Two Transfers against the one Free Transfer a Gameweek grants, so the
    // second costs a Hit. Both are bench players swapped for their own
    // positions, which leaves the eleven and the armband where they were.
    return {
      action: {
        transfersIn: [17, 19],
        transfersOut: [15, 12],
        chip: null,
        teamSheet: fplSheetOf(seat, [2, 7, 19, 17])
      },
      rationale: "Two bench Transfers, worth the Hit.",
      repairs: 0
    };
  }
  if (gameweek === 2 && seat === 2) {
    // One Transfer, and a Repair spent reaching it.
    return {
      action: {
        transfersIn: [17],
        transfersOut: [15],
        chip: null,
        teamSheet: fplSheetOf(seat, [2, 7, 12, 17])
      },
      rationale: "One Transfer, banked Free Transfer spent.",
      repairs: 1
    };
  }
  if (gameweek === 3 && seat === 3) {
    return {
      action: { ...bankFreeTransfer(), chip: "bench_boost" },
      rationale: "Bench Boost, standing pat otherwise.",
      repairs: 0
    };
  }
  if (gameweek === 3 && seat === 4) {
    return "roll over";
  }
  if (gameweek === FPL_GAP_GAMEWEEK && seat === ROSTER.length - 1) {
    return "silent";
  }
  // Everybody else banks the Gameweek's Free Transfer.
  return {
    action: bankFreeTransfer(),
    rationale: "Standing pat, banking the Free Transfer.",
    repairs: 0
  };
}

/**
 * The FPL track's Season: five Gameweeks played by nine Entrants over the pool
 * above, with the prices, the settled player points and the refused attempts
 * that produced them.
 *
 * Every Manager State is the real reducer's, folded Gameweek by Gameweek as
 * the run folds it — nothing here writes a Squad, a bank or a Free Transfer
 * count by hand, so a state the rules would refuse stops the seed rather than
 * reaching a page.
 */
async function writeFplSeason(
  database: Database,
  season: string,
  through: number
): Promise<void> {
  const states = new Map<number, ManagerState>();

  for (let gameweek = 1; gameweek <= through; gameweek += 1) {
    const pool = fplPoolAt(gameweek);
    for (const player of pool) {
      await database.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, short_name, web_name, position,
           price_tenths, status, chance_of_playing_next_round, news, news_added,
           observed_at, penalties_order, direct_freekicks_order
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, 'a', null, '', null, $9, $10, $11
         )`,
        [
          season, gameweek, player.fplId, player.club, codeOf(player.club),
          player.webName, player.position, player.priceTenths,
          mainRunOf(gameweek), player.penaltiesOrder ?? null,
          player.directFreekicksOrder ?? null
        ]
      );
      // Every Gameweek the seed plays is Settled — absence of these rows is
      // what says a Gameweek is not (migration 0011), so a Gameweek nobody
      // scores has to be one the points settled for. The stat columns beyond
      // minutes and points are zero: no page in the FPL section reads them,
      // and inventing goals to match a points total would be a second story
      // about the same Gameweek.
      await database.query(
        `insert into fpl_player_points (
           season, gw, fpl_id, minutes, total_points, goals_scored, assists,
           clean_sheets, bonus, yellow_cards, red_cards, saves,
           expected_goals, expected_assists, expected_goals_conceded
         ) values ($1, $2, $3, 90, $4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
        [season, gameweek, player.fplId, fplPointsOf(gameweek, player.fplId)]
      );
    }

    for (const [seat, entrant] of ROSTER.entries()) {
      const entrantId = fplSeatOf(entrant.id);
      const standing = states.get(seat) ?? openingManagerState();
      const played = fplGameweekOf(seat, gameweek, standing);

      // The failed calls, and only those: an attempt row is the record of a
      // provider call, and the seed made none, so it writes the rows the
      // record is read from — the violation profile's, the Gap's cause and the
      // last violation a page shows — rather than inventing a response body
      // for a call that never happened.
      const refuse = async (
        kind: string,
        detail: string,
        times: number
      ): Promise<void> => {
        for (let attempt = 0; attempt < times; attempt += 1) {
          await database.query(
            `insert into attempts (
               model_id, season, gw, track, attempt_no, ok, error_kind,
               error_detail, trigger, attempted_at
             ) values ($1, $2, $3, 'fpl', $4, false, $5, $6, 'main', $7)`,
            [
              entrantId, season, gameweek, attempt, kind, detail,
              mainRunOf(gameweek)
            ]
          );
        }
      };

      if (played === "silent") {
        // The Gap, with the reason it happened on record: a provider that
        // never answered any of the four calls. A Gap with no attempt behind
        // it is one the run never reached the Entrant for, which is not how
        // this one came about — and the cause is what a reader is owed for an
        // absence that is itself a reported result (CONTEXT.md, Gap).
        await refuse(
          FPL_GAP_CAUSE,
          "OpenRouter returned HTTP 503.",
          MAX_REPAIRS + 1
        );
        // A Gameweek nobody acted in is a Gameweek nothing was done in, so the
        // Entrant carries what a Roll Over would have left it — the same fold
        // the run does across a Gameweek that stored nothing.
        states.set(seat, rolledOverState(standing));
        continue;
      }
      const rolled = played === "roll over";
      const repairs = rolled ? MAX_REPAIRS : played.repairs;
      // One row per refused call, which is one more than the Repairs for a
      // Roll Over and exactly the Repairs otherwise: the conversation is the
      // first answer and up to three Repairs (ADR-0004), so an action legal at
      // the second attempt was refused once and cost one Repair, while a Roll
      // Over is every one of the four refused and the whole allowance spent.
      // A ledger three refusals long could not have produced a Roll Over.
      //
      // The Entrant is refused in the Season's own words: `VIOLATIONS` is
      // frozen for the Season (ADR-0004), and a sentence written out here
      // would be one a page could render that production never says.
      await refuse(
        VIOLATIONS.formation.kind,
        VIOLATIONS.formation.message,
        rolled ? MAX_REPAIRS + 1 : repairs
      );

      let state: ManagerState;
      if (rolled) {
        state = rolledOverState(standing);
      } else {
        // The reducer prices the Gameweek from the pool without the names the
        // context builder shows.
        const outcome = applyGameweekAction(
          standing,
          played.action,
          pool.map(({ webName: _, ...player }) => player),
          gameweek
        );
        if ("violation" in outcome) {
          throw new Error(
            `the seeded action for ${entrantId} at Gameweek ${gameweek} is `
            + `illegal: ${outcome.violation.kind}`
          );
        }
        state = outcome.state;
      }
      await storeManagerState(database, {
        entrantId,
        season,
        gameweek,
        state,
        attemptsUsed: repairs,
        rolledOver: rolled,
        rationale: rolled ? null : played.rationale,
        predictedAt: mainRunOf(gameweek)
      });
      states.set(seat, state);
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
        where season = $1 and fixture_id = $2`,
      [season, fixture.fplId, gameweek]
    );
    const body = `${fixture.homeTeam} v ${fixture.awayTeam}: seeded context`;
    const context = await database.query<{ id: string }>(
      `insert into contexts (season, gw, track, fixture_id, hash, body, built_at)
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
           model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
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

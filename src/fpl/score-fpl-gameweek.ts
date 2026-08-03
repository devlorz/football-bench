import type { Client } from "pg";
import {
  VIOLATION_KINDS,
  type Chip,
  type Position,
  type TeamSheet
} from "./apply-gameweek-action.js";
import {
  DEMONSTRATION_QUALIFICATION,
  emptyRepairDistribution,
  repairBucket,
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC,
  REPAIRS_METRIC,
  REPAIRS_SEASON_TO_DATE_METRIC,
  ROLL_OVER_RATE_METRIC,
  ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
  emptyViolationProfile,
  VIOLATION_PROFILE_METRIC,
  VIOLATION_PROFILE_SEASON_TO_DATE_METRIC
} from "./demonstration-record.js";
import {
  scoreTeamSheet,
  type PlayerGameweekPoints,
  type PlayerPosition,
  type ScoreDetail
} from "./score-team-sheet.js";

type Database = Pick<Client, "query">;

export interface ScoreFplGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
}

interface ManagerStateRow {
  model_id: string;
  team_sheet: TeamSheet;
  hits: number;
  chip_active: Chip | null;
  attempts_used: number;
  rolled_over: boolean;
}

/**
 * What one Entrant's Gameweek came to: what its Team Sheet scored, and how it
 * behaved on the way to naming one.
 *
 * The two travel together because the record stores them at the same `gw` and
 * on the same condition — an unsettled Gameweek writes neither, so that a
 * Gameweek's eight rows are eight or none rather than a behavioural half that
 * runs a Gameweek ahead of the points.
 */
interface EntrantGameweek {
  points: number;
  detail: ScoreDetail;
  /** Repairs the action cost, whether or not it ever became legal. */
  repairs: number;
  rolledOver: boolean;
  /** How many times each rule of the game was broken, kind by kind. */
  violations: Record<string, number>;
}

/**
 * What the Gameweek's attempt rows say each Entrant broke.
 *
 * Read from `attempts` rather than from the Manager State, because the Manager
 * State is written once and says nothing about the three responses that may
 * have preceded it — the rows are the only record the violations exist in.
 *
 * A Gameweek can hold attempts from more than one run: a provider failure
 * leaves its row and stores nothing, and a later run over the same Gameweek
 * leaves its own. Every row on the Gameweek counts, and only the kinds a rule
 * can produce are asked for.
 */
async function violationsByEntrant(
  database: Database,
  season: string,
  gameweek: number
): Promise<Map<string, Record<string, number>>> {
  const counted = await database.query<{
    model_id: string;
    error_kind: string;
    count: number;
  }>(
    `select model_id, error_kind, count(*)::int as count
       from attempts
      where season = $1 and gw = $2 and track = 'fpl'
        and error_kind = any($3)
      group by model_id, error_kind`,
    [season, gameweek, [...VIOLATION_KINDS]]
  );
  const profiles = new Map<string, Record<string, number>>();
  for (const row of counted.rows) {
    const profile = profiles.get(row.model_id) ?? emptyViolationProfile();
    profile[row.error_kind] = row.count;
    profiles.set(row.model_id, profile);
  }
  return profiles;
}

/**
 * The Gameweek every Entrant's Season path starts at.
 *
 * There is no column for it and there must not be one. A Gameweek either holds
 * every Entrant's opening or holds nothing — `startFplTrack` commits all nine
 * or none — so the earliest Gameweek any Manager State belongs to *is* the
 * starting Gameweek. A stored column would be a second answer to a question
 * that already has one, and nothing would keep the two in agreement.
 *
 * Null before the track has started, which is every Gameweek's answer until
 * one opening is committed.
 */
async function startingGameweek(
  database: Database,
  season: string
): Promise<number | null> {
  const result = await database.query<{ gw: number | null }>(
    `select min(gw)::int as gw from manager_states where season = $1`,
    [season]
  );
  return result.rows[0]?.gw ?? null;
}

/**
 * Every Entrant's points for one Gameweek, or null when the Gameweek has not
 * settled.
 *
 * A Gameweek with no stored player points has not settled — absence of rows is
 * that record (migration 0011) — and null is how that is told apart from a
 * Gameweek in which everybody scored zero, which is a real result.
 */
async function scoreOneGameweek(
  database: Database,
  season: string,
  gameweek: number
): Promise<Map<string, EntrantGameweek> | null> {
  const settled = await database.query<{
    fpl_id: number;
    minutes: number;
    total_points: number;
  }>(
    `select fpl_id, minutes, total_points
       from fpl_player_points
      where season = $1 and gw = $2`,
    [season, gameweek]
  );
  if (settled.rows.length === 0) {
    return null;
  }
  const points: PlayerGameweekPoints[] = settled.rows.map((row) => ({
    fplId: row.fpl_id,
    minutes: row.minutes,
    totalPoints: row.total_points
  }));

  const settledIds = new Set(points.map(({ fplId }) => fplId));

  // Positions come from the Season rather than from this Gameweek's locked
  // pool: scoring prices nobody, and a Gameweek whose pre-Lock snapshot was
  // missed still has to be scoreable. Reading across Gameweeks is only sound
  // while the Season agrees on a player's position, so the query proves that
  // rather than picking a snapshot and hoping.
  const listed = await database.query<{ fpl_id: number; positions: Position[] }>(
    `select fpl_id, array_agg(distinct position) as positions
       from fpl_players
      where season = $1
      group by fpl_id`,
    [season]
  );
  const positionOf = new Map(
    listed.rows.map((row) => [row.fpl_id, row.positions])
  );

  const states = await database.query<ManagerStateRow>(
    `select model_id, team_sheet, hits, chip_active, attempts_used, rolled_over
       from manager_states
      where season = $1 and gw = $2
      order by model_id`,
    [season, gameweek]
  );

  // Every rule below is about what a Team Sheet needs to be scored at all, and
  // all of them are checked before a single row is written: a Gameweek that
  // cannot be scored for one Entrant must not be half-scored for the others.
  for (const state of states.rows) {
    const named = [
      ...state.team_sheet.starters,
      ...state.team_sheet.bench
    ];
    for (const fplId of named) {
      if (!settledIds.has(fplId)) {
        throw new Error(
          `the Gameweek has no settled points for player ${fplId}, `
          + "so it is not wholly settled and cannot be scored"
        );
      }
      const held = positionOf.get(fplId) ?? [];
      if (held.length === 0) {
        throw new Error(
          `the Season records no position for player ${fplId}, `
          + "so the substitution rules cannot judge his Team Sheet"
        );
      }
      if (held.length > 1) {
        throw new Error(
          `the Season records player ${fplId} as ${held.join(" and ")}, `
          + "so his position cannot be read across Gameweeks"
        );
      }
    }
  }

  const positions: PlayerPosition[] = [...positionOf].flatMap(
    ([fplId, held]) => held.length === 1 && held[0] !== undefined
      ? [{ fplId, position: held[0] }]
      : []
  );

  const broken = await violationsByEntrant(database, season, gameweek);

  return new Map(states.rows.map((state) => [
    state.model_id,
    {
      ...scoreTeamSheet({
        teamSheet: state.team_sheet,
        positions,
        points,
        hits: state.hits,
        chip: state.chip_active
      }),
      // `attempts_used` is the Repairs the Gameweek cost: an action legal
      // first time stores zero, and a Roll Over stores the whole allowance it
      // spent without ever reaching a legal action.
      repairs: state.attempts_used,
      rolledOver: state.rolled_over,
      violations: broken.get(state.model_id) ?? emptyViolationProfile()
    }
  ]));
}

/** One Gameweek an Entrant's cumulative record is made of. */
interface ScoredEntry extends EntrantGameweek {
  gw: number;
}

async function storeMetric(
  database: Database,
  entrantId: string,
  season: string,
  gameweek: number,
  metric: string,
  value: number,
  n: number | null,
  detail: unknown
): Promise<void> {
  // Re-running must leave the row as it was, so the same inputs upsert to the
  // same value and detail rather than inserting a second row or moving the one
  // already there.
  await database.query(
    `insert into scores (model_id, season, gw, track, metric, value, n, detail)
     values ($1, $2, $3, 'fpl', $4, $5, $6, $7)
     on conflict (model_id, season, gw, track, metric)
     do update set value = excluded.value, n = excluded.n,
                   detail = excluded.detail`,
    [entrantId, season, gameweek, metric, value, n, JSON.stringify(detail)]
  );
}

/**
 * Writes the FPL demonstration record for one Gameweek: what each Entrant
 * scored, and what the Season has come to through the same Gameweek.
 *
 * Reads stored Manager States and stored player points and nothing else — no
 * network call, no clock, and no re-derivation of a decision already made — so
 * running it twice over the same stored inputs produces the same rows.
 *
 * The cumulative values are folded from the Season's own Gameweeks rather than
 * from the score rows already written, so that a Gameweek scored out of order,
 * or one that settled late, cannot leave a total that depends on which order
 * the Gameweeks happened to be scored in.
 */
export async function scoreFplGameweek({
  database,
  season,
  gameweek
}: ScoreFplGameweekOptions): Promise<void> {
  const start = await startingGameweek(database, season);
  if (start === null || gameweek < start) {
    return;
  }

  const scored = await scoreOneGameweek(database, season, gameweek);
  if (scored === null) {
    return;
  }

  const history = new Map<string, ScoredEntry[]>();
  const record = (gw: number, byEntrant: Map<string, EntrantGameweek>): void => {
    for (const [entrantId, entry] of byEntrant) {
      const kept = history.get(entrantId) ?? [];
      kept.push({ gw, ...entry });
      history.set(entrantId, kept);
    }
  };
  for (let earlier = start; earlier < gameweek; earlier += 1) {
    const before = await scoreOneGameweek(database, season, earlier);
    if (before !== null) {
      record(earlier, before);
    }
  }
  record(gameweek, scored);

  for (const [entrantId, entry] of scored) {
    const path = history.get(entrantId) ?? [];
    const store = (
      metric: string,
      value: number,
      n: number | null,
      detail: unknown
    ) => storeMetric(database, entrantId, season, gameweek, metric, value, n,
      detail);

    await store(
      FPL_POINTS_METRIC,
      entry.points,
      null,
      { ...entry.detail, qualification: DEMONSTRATION_QUALIFICATION }
    );
    await store(
      FPL_POINTS_SEASON_TO_DATE_METRIC,
      path.reduce((total, { points }) => total + points, 0),
      path.length,
      {
        qualification: DEMONSTRATION_QUALIFICATION,
        startingGameweek: start,
        gameweeks: path.map(({ gw, points }) => ({ gw, points }))
      }
    );

    await store(
      REPAIRS_METRIC,
      entry.repairs,
      null,
      {
        bucket: repairBucket(entry.repairs, entry.rolledOver),
        rolledOver: entry.rolledOver
      }
    );
    const distribution = emptyRepairDistribution();
    for (const played of path) {
      const bucket = repairBucket(played.repairs, played.rolledOver);
      distribution[bucket] = (distribution[bucket] ?? 0) + 1;
    }
    await store(
      REPAIRS_SEASON_TO_DATE_METRIC,
      path.reduce((total, { repairs }) => total + repairs, 0) / path.length,
      path.length,
      { startingGameweek: start, distribution }
    );

    const total = (profile: Record<string, number>): number =>
      Object.values(profile).reduce((sum, count) => sum + count, 0);
    await store(
      VIOLATION_PROFILE_METRIC,
      total(entry.violations),
      null,
      { kinds: entry.violations }
    );
    const kinds = emptyViolationProfile();
    for (const played of path) {
      for (const [kind, count] of Object.entries(played.violations)) {
        kinds[kind] = (kinds[kind] ?? 0) + count;
      }
    }
    await store(
      VIOLATION_PROFILE_SEASON_TO_DATE_METRIC,
      total(kinds),
      path.length,
      { startingGameweek: start, kinds }
    );

    await store(ROLL_OVER_RATE_METRIC, entry.rolledOver ? 1 : 0, null, null);
    const rolledOver = path.filter(({ rolledOver: over }) => over);
    await store(
      ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
      rolledOver.length / path.length,
      path.length,
      { startingGameweek: start, gameweeks: rolledOver.map(({ gw }) => gw) }
    );
  }
}

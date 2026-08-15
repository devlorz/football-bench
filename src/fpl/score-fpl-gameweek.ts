import type { Client } from "pg";
import {
  VIOLATION_KINDS,
  type ViolationKind,
  type Chip,
  type Position,
  type TeamSheet
} from "./apply-gameweek-action.js";
import {
  DEMONSTRATION_QUALIFICATION,
  repairBucket,
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC,
  REPAIRS_METRIC,
  REPAIRS_SEASON_TO_DATE_METRIC,
  ROLL_OVER_RATE_METRIC,
  ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
  emptyViolationProfile,
  VIOLATION_PROFILE_METRIC,
  VIOLATION_PROFILE_SEASON_TO_DATE_METRIC,
  type FplDemonstrationMetric,
  type ViolationProfile
} from "./demonstration-record.js";
import { emptyRepairDistribution } from "../repairs.js";
import {
  loadStartedRoster,
  loadStartingGameweek
} from "./manager-state-store.js";
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
  violations: ViolationProfile;
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
): Promise<Map<string, ViolationProfile>> {
  // The query asks for the seven and nothing else, so what comes back is a
  // `ViolationKind` by construction rather than by hope.
  const counted = await database.query<{
    model_id: string;
    error_kind: ViolationKind;
    count: number;
  }>(
    `select model_id, error_kind, count(*)::int as count
       from attempts
      where season = $1 and gw = $2 and track = 'fpl'
        and error_kind = any($3)
      group by model_id, error_kind`,
    [season, gameweek, [...VIOLATION_KINDS]]
  );
  const profiles = new Map<string, ViolationProfile>();
  for (const row of counted.rows) {
    const profile = profiles.get(row.model_id) ?? emptyViolationProfile();
    profile[row.error_kind] = row.count;
    profiles.set(row.model_id, profile);
  }
  return profiles;
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
  //
  // Each names the Gameweek it is about. One call now walks the Season from
  // its starting Gameweek, so an unattributed "no settled points for player 4"
  // leaves an operator to work out which of a dozen Gameweeks produced it —
  // and these are the refusals a partly-removed Gameweek arrives through,
  // which is precisely when the answer matters.
  const refuse = (why: string): never => {
    throw new Error(`Gameweek ${gameweek} of ${season} ${why}`);
  };
  for (const state of states.rows) {
    const named = [
      ...state.team_sheet.starters,
      ...state.team_sheet.bench
    ];
    for (const fplId of named) {
      if (!settledIds.has(fplId)) {
        refuse(
          `has no settled points for player ${fplId}, so it is not wholly `
          + "settled and cannot be scored; nothing has been changed"
        );
      }
      const held = positionOf.get(fplId) ?? [];
      if (held.length === 0) {
        refuse(
          `names player ${fplId}, for whom the Season records no position, so `
          + "the substitution rules cannot judge his Team Sheet"
        );
      }
      if (held.length > 1) {
        refuse(
          `names player ${fplId}, whom the Season records as `
          + `${held.join(" and ")}, so his position cannot be read across `
          + "Gameweeks"
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

interface StoredMetric {
  entrantId: string;
  season: string;
  gameweek: number;
  metric: FplDemonstrationMetric;
  value: number;
  /** How many Gameweeks a cumulative value was taken over; null for one. */
  n: number | null;
  detail: unknown;
}

async function storeMetric(
  database: Database,
  { entrantId, season, gameweek, metric, value, n, detail }: StoredMetric
): Promise<void> {
  // Re-running must leave the row as it was, so the same inputs upsert to the
  // same value and detail rather than inserting a second row or moving the one
  // already there.
  await database.query(
    `insert into scores (model_id, season, gw, track, metric, value, n, detail)
     values ($1, $2, $3, 'fpl', $4, $5, $6, $7)
     on conflict (model_id, competition, season, gw, track, metric)
     do update set value = excluded.value, n = excluded.n,
                   detail = excluded.detail`,
    [entrantId, season, gameweek, metric, value, n, JSON.stringify(detail)]
  );
}

/**
 * Every Gameweek whose record is already on record.
 *
 * Two things are read off it. A published Gameweek *after* the one being
 * scored is rewritten, because a late settlement leaves its Season total taken
 * over a path with a hole in it — while its own value is still right, since a
 * Gameweek's points do not change because an earlier one settled. And a
 * published Gameweek that no longer scores at all is a refusal, below.
 *
 * Only Gameweeks already published are rewritten. A later Gameweek nobody has
 * scored yet is not this operation's to score: it will fold in the whole path
 * when it is scored on its own.
 */
async function publishedGameweeks(
  database: Database,
  season: string
): Promise<Set<number>> {
  const rows = await database.query<{ gw: number }>(
    `select distinct gw
       from scores
      where season = $1 and track = 'fpl'`,
    [season]
  );
  return new Set(rows.rows.map((row) => row.gw));
}

/** Writes one Gameweek's eight rows for every Entrant that played it. */
async function writeRecord(
  database: Database,
  season: string,
  gameweek: number,
  start: number,
  played: Map<string, EntrantGameweek>,
  history: Map<string, ScoredEntry[]>
): Promise<void> {
  for (const [entrantId, entry] of played) {
    const path = history.get(entrantId) ?? [];
    const store = (
      metric: FplDemonstrationMetric,
      value: number,
      n: number | null,
      detail: unknown
    ) => storeMetric(database, {
      entrantId, season, gameweek, metric, value, n, detail
    });

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
    for (const before of path) {
      const bucket = repairBucket(before.repairs, before.rolledOver);
      distribution[bucket] = (distribution[bucket] ?? 0) + 1;
    }
    await store(
      REPAIRS_SEASON_TO_DATE_METRIC,
      path.reduce((total, { repairs }) => total + repairs, 0) / path.length,
      path.length,
      { startingGameweek: start, distribution }
    );

    const total = (profile: ViolationProfile): number =>
      Object.values(profile).reduce((sum, count) => sum + count, 0);
    await store(
      VIOLATION_PROFILE_METRIC,
      total(entry.violations),
      null,
      { kinds: entry.violations }
    );
    const kinds = emptyViolationProfile();
    for (const before of path) {
      for (const kind of VIOLATION_KINDS) {
        kinds[kind] += before.violations[kind];
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

/**
 * Walks the Season from its starting Gameweek, folding each Entrant's path as
 * it goes, and writes the record at `gameweek` and at every Gameweek after it
 * whose record was already published.
 */
async function writeRecordThrough(
  database: Database,
  season: string,
  gameweek: number
): Promise<void> {
  const start = await loadStartingGameweek(database, season);
  if (start === null || gameweek < start) {
    return;
  }
  const roster = await loadStartedRoster(database, season, start);
  const published = await publishedGameweeks(database, season);
  const targets = new Set([
    gameweek,
    ...[...published].filter((gw) => gw > gameweek)
  ]);
  const through = Math.max(...targets);

  const history = new Map<string, ScoredEntry[]>();
  for (let gw = start; gw <= through; gw += 1) {
    const played = await scoreOneGameweek(database, season, gw);
    // Two ways a Gameweek is not the Season's, and they come to the same
    // thing: it has not settled, or it is not every Entrant's. A Gameweek
    // published for nine Entrants of ten would give those nine a season
    // path a Gameweek longer than the tenth's, which is the comparison the
    // whole track exists to make — so ADR-0011's answer holds here as it does
    // for the Match track, and one Entrant's Gap removes the Gameweek from
    // every path, including from the Entrants that were working fine. The
    // remedy is a fill run while the Lock is still open, not a record of
    // unequal lengths.
    const absent = played === null
      ? []
      : roster.filter((entrantId) => !played.has(entrantId));
    if (played === null || absent.length > 0) {
      // A Gameweek already on record that has stopped scoring is refused, and
      // nothing is changed. Returning quietly would leave its rows standing
      // with nothing behind them and nobody told; deleting them would let
      // absent data destroy published data, so that a half-restored database
      // would silently unpublish a Gameweek. Neither state is reachable from
      // the code — stored points are only ever inserted or updated, and
      // `manager_states` refuses a delete outright — so what this answers is
      // an operator at the database.
      if (published.has(gw)) {
        throw new Error(
          `Gameweek ${gw} of ${season} holds a stored FPL record and `
          + (played === null
            ? "its points are not settled"
            : `${absent.join(", ")} stored no Manager State for it`)
          + "; nothing has been changed"
        );
      }
      // Otherwise it is simply not part of the record: skipped, along with
      // everything this call would have rewritten, because nothing downstream
      // has changed. Nothing has been written yet either — no target is
      // earlier than the Gameweek asked for.
      if (gw === gameweek) {
        return;
      }
      continue;
    }
    for (const [entrantId, entry] of played) {
      history.set(entrantId, [...history.get(entrantId) ?? [], { gw, ...entry }]);
    }
    if (targets.has(gw)) {
      await writeRecord(database, season, gw, start, played, history);
    }
  }
}

/**
 * Writes the FPL demonstration record for one Gameweek: what each Entrant
 * scored, and what the Season has come to through the same Gameweek.
 *
 * Reads stored Manager States, attempts and stored player points and nothing
 * else — no network call, no clock, and no re-derivation of a decision already
 * made — so running it twice over the same stored inputs produces the same
 * rows.
 *
 * Cumulative values are folded from the Season's own Gameweeks rather than
 * added to the totals already stored, and a Gameweek that settles late rewrites
 * every published Gameweek after it. Between them, what the record says never
 * depends on the order its Gameweeks happened to be scored in.
 *
 * All of it commits together. A Gameweek's eight rows are the points and the
 * behaviour that produced them, and half of that pair is worse than none of it:
 * a reader cannot tell a Gameweek whose behaviour is still to be written from
 * one whose Entrant behaved impeccably.
 */
export async function scoreFplGameweek({
  database,
  season,
  gameweek
}: ScoreFplGameweekOptions): Promise<void> {
  await database.query("begin");
  try {
    await writeRecordThrough(database, season, gameweek);
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

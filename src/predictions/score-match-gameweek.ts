import type { Client } from "pg";
import {
  outcomeOf,
  type FixtureResult
} from "../fixture-result.js";

type Database = Pick<Client, "query">;

/**
 * Match Points rank the leaderboard and support no claim on their own
 * (ADR-0012). The tiers reward one scoreline at a time, so four Entrants that
 * name 3-0 and five that name 3-1 are separated by three points a Fixture while
 * the probability layer says they forecast it identically.
 *
 * Stored in the detail of every row a ranking can be read off rather than added
 * at publication, so a value cannot reach a reader without it — the same reason
 * the FPL track carries its demonstration qualification.
 */
export const MATCH_POINTS_QUALIFICATION =
  "Match Points rank the leaderboard and are not evidence: they score one "
  + "named scoreline per Fixture, and whether one Entrant forecasts better "
  + "than another is only supported by the probability layer's Paired "
  + "Differences and their interval.";

/** One Gameweek's Match Points, and the Season's through the same Gameweek. */
export const MATCH_POINTS_METRIC = "match_points";
export const MATCH_POINTS_SEASON_TO_DATE_METRIC = "match_points_season_to_date";

/** The share of scored Fixtures whose exact scoreline the Entrant named. */
export const SCORE_PCT_METRIC = "score_pct";
export const SCORE_PCT_SEASON_TO_DATE_METRIC = "score_pct_season_to_date";

/** The share of scored Fixtures whose outcome the Entrant got right. */
export const OUTCOME_PCT_METRIC = "outcome_pct";
export const OUTCOME_PCT_SEASON_TO_DATE_METRIC = "outcome_pct_season_to_date";

/**
 * What one Predicted Score earns against a settled result: 5 for the scoreline,
 * 3 for the goal difference, 2 for the outcome, 0 otherwise.
 *
 * The tiers are exclusive and nest strictly — an exact scoreline is also the
 * right goal difference is also the right outcome — so each Fixture is worth
 * one of four values and nothing is double-counted.
 */
export function matchPoints(
  predictedHome: number,
  predictedAway: number,
  result: FixtureResult
): number {
  const { home_goals: home, away_goals: away } = result;
  if (predictedHome === home && predictedAway === away) {
    return 5;
  }
  if (predictedHome - predictedAway === home - away) {
    return 3;
  }
  return outcomeOf(predictedHome, predictedAway) === result.outcome ? 2 : 0;
}

/** One settled Fixture as one Entrant predicted it. */
interface ScoredFixture {
  gw: number;
  fplId: number;
  predicted: [number, number];
  result: [number, number];
  outcome: string;
  points: number;
}

interface ScoredRow {
  gw: number;
  fpl_id: number;
  model_id: string;
  pred_home: number;
  pred_away: number;
  result: FixtureResult;
}

/**
 * Every Prediction the Season has a settled result for, keyed by Entrant.
 *
 * Attribution is `locked_in_gw` rather than `gw` (ADR-0013, ADR-0015): a
 * deferred Fixture belongs to the Gameweek whose Lock its Predictions were
 * committed under, not the Gameweek it was eventually played in.
 *
 * A Fixture with no result contributes nothing by being absent, which is also
 * how a Fixture that is never played needs no state of its own.
 */
async function scoredFixtures(
  database: Database,
  season: string
): Promise<Map<string, ScoredFixture[]>> {
  const rows = await database.query<ScoredRow>(
    `select f.locked_in_gw as gw, f.fpl_id, p.model_id, p.pred_home,
            p.pred_away, f.result
       from fixtures f
       join predictions p on p.season = f.season and p.fpl_id = f.fpl_id
      where f.season = $1 and f.result is not null
        and f.locked_in_gw is not null
      order by f.locked_in_gw, f.fpl_id, p.model_id`,
    [season]
  );

  const byEntrant = new Map<string, ScoredFixture[]>();
  for (const row of rows.rows) {
    const scored: ScoredFixture = {
      gw: row.gw,
      fplId: row.fpl_id,
      predicted: [row.pred_home, row.pred_away],
      result: [row.result.home_goals, row.result.away_goals],
      outcome: row.result.outcome,
      points: matchPoints(row.pred_home, row.pred_away, row.result)
    };
    byEntrant.set(row.model_id, [...byEntrant.get(row.model_id) ?? [], scored]);
  }
  return byEntrant;
}

interface StoredMetric {
  entrantId: string;
  season: string;
  gameweek: number;
  metric: string;
  value: number;
  n: number;
  detail: unknown;
}

async function storeMetric(
  database: Database,
  { entrantId, season, gameweek, metric, value, n, detail }: StoredMetric
): Promise<void> {
  // `scored_at` is left alone by the update, so a re-run over unchanged inputs
  // leaves the row byte for byte as it was rather than restamping it.
  await database.query(
    `insert into scores (model_id, season, gw, track, metric, value, n, detail)
     values ($1, $2, $3, 'match', $4, $5, $6, $7)
     on conflict (model_id, season, gw, track, metric)
     do update set value = excluded.value, n = excluded.n,
                   detail = excluded.detail`,
    [entrantId, season, gameweek, metric, value, n, JSON.stringify(detail)]
  );
}

/**
 * The three readable rows for one Entrant over one set of Fixtures, under the
 * metric names the caller names — the same three measures serve one Gameweek
 * and the Season through it, and only what they are called and what detail
 * traces them apart differs.
 */
async function writeReadableRows(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  fixtures: ScoredFixture[],
  cumulative: boolean
): Promise<void> {
  const n = fixtures.length;

  // A cumulative row's detail is its Gameweeks rather than its Fixtures: the
  // per-Fixture trace is already on each Gameweek's own row, and repeating the
  // Season's every Fixture on every snapshot would grow with the square of the
  // Season.
  const gameweeks = [...new Set(fixtures.map(({ gw }) => gw))].sort(
    (one, other) => one - other
  );
  const perGameweek = <T>(of: (own: ScoredFixture[]) => T) =>
    gameweeks.map((gw) => {
      const own = fixtures.filter((fixture) => fixture.gw === gw);
      return { gw, n: own.length, ...of(own) };
    });

  const store = (metric: string, value: number, detail: unknown) =>
    storeMetric(database, {
      entrantId, season, gameweek, metric, value, n, detail
    });

  await store(
    cumulative ? MATCH_POINTS_SEASON_TO_DATE_METRIC : MATCH_POINTS_METRIC,
    fixtures.reduce((total, { points }) => total + points, 0),
    {
      qualification: MATCH_POINTS_QUALIFICATION,
      ...cumulative
        ? {
          gameweeks: perGameweek((own) => ({
            points: own.reduce((total, { points }) => total + points, 0)
          }))
        }
        : { fixtures: fixtures.map(({ gw: _gw, ...rest }) => rest) }
    }
  );

  // The tiers nest, so both shares are read off the points rather than
  // recomputed: only an exact scoreline scores 5, and everything from 2 up got
  // the outcome right.
  for (const [metric, cumulativeMetric, hit] of [
    [
      SCORE_PCT_METRIC,
      SCORE_PCT_SEASON_TO_DATE_METRIC,
      ({ points }: ScoredFixture) => points === 5
    ],
    [
      OUTCOME_PCT_METRIC,
      OUTCOME_PCT_SEASON_TO_DATE_METRIC,
      ({ points }: ScoredFixture) => points >= 2
    ]
  ] as const) {
    const hits = (of: ScoredFixture[]) =>
      of.filter(hit).map(({ fplId }) => fplId);
    await store(
      cumulative ? cumulativeMetric : metric,
      hits(fixtures).length / n,
      cumulative
        ? { gameweeks: perGameweek((own) => ({ hits: hits(own) })) }
        : { hits: hits(fixtures) }
    );
  }
}

/**
 * Which Gameweeks this run rewrites: the one asked for, and every later
 * Gameweek already published.
 *
 * A corrected or late-settling result changes its own Gameweek's row and every
 * cumulative snapshot taken after it, so the snapshots downstream are recomputed
 * from the same stored Fixtures rather than left describing a Season that no
 * longer happened. A later Gameweek nobody has scored yet is not this call's to
 * score: it will fold in the whole Season when it is scored on its own.
 */
async function targetGameweeks(
  database: Database,
  season: string,
  gameweek: number
): Promise<number[]> {
  const published = await database.query<{ gw: number }>(
    "select distinct gw from scores where season = $1 and track = 'match'",
    [season]
  );
  return [
    gameweek,
    ...published.rows.map(({ gw }) => gw).filter((gw) => gw > gameweek)
  ].sort((one, other) => one - other);
}

export interface ScoreMatchGameweekOptions {
  database: Database;
  season: string;
  gameweek: number;
}

/**
 * Writes the readable Match Points record for one Gameweek: what each Entrant
 * scored on it, and what the Season has come to through the same Gameweek.
 *
 * Reads stored Fixtures and Predictions and nothing else — no network call and
 * no clock, since scoreability is `fixtures.result` being present rather than
 * anything about when the job ran — so running it twice over the same rows
 * produces the same rows.
 *
 * A Gameweek with nothing settled writes nothing rather than a record of zeros:
 * an unplayed Gameweek and a badly forecast one must not look alike.
 */
export async function scoreMatchGameweek({
  database,
  season,
  gameweek
}: ScoreMatchGameweekOptions): Promise<void> {
  const byEntrant = await scoredFixtures(database, season);
  if (![...byEntrant.values()].some((scored) =>
    scored.some((fixture) => fixture.gw === gameweek)
  )) {
    return;
  }

  await database.query("begin");
  try {
    for (const target of await targetGameweeks(database, season, gameweek)) {
      for (const [entrantId, scored] of byEntrant) {
        const own = scored.filter(({ gw }) => gw === target);
        if (own.length > 0) {
          await writeReadableRows(
            database, season, target, entrantId, own, false
          );
        }
        const through = scored.filter(({ gw }) => gw <= target);
        if (through.length > 0) {
          await writeReadableRows(
            database, season, target, entrantId, through, true
          );
        }
      }
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

import type { Client } from "pg";
import {
  argmaxOutcome,
  outcomeOf,
  OUTCOMES,
  type FixtureResult,
  type Outcome,
  type Probs
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

/** Mean Ranked Probability Score over the scored Fixtures. Lower is better. */
export const RPS_METRIC = "rps";
export const RPS_SEASON_TO_DATE_METRIC = "rps_season_to_date";

/** Mean Brier score over the scored Fixtures. Lower is better. */
export const BRIER_METRIC = "brier";
export const BRIER_SEASON_TO_DATE_METRIC = "brier_season_to_date";

/** The share of scored Fixtures whose likeliest outcome settled. */
export const ACCURACY_METRIC = "accuracy";
export const ACCURACY_SEASON_TO_DATE_METRIC = "accuracy_season_to_date";

/**
 * The share of Predictions whose likeliest outcome is the one their Predicted
 * Score implies.
 *
 * Reads only the Prediction, so an unsettled Fixture counts and a corrected
 * result cannot move the figure — unlike every other metric here.
 */
export const COHERENCE_METRIC = "coherence";
export const COHERENCE_SEASON_TO_DATE_METRIC = "coherence_season_to_date";

/**
 * Ranked Probability Score for one Prediction, over the ordered outcomes
 * `H`, `D`, `A`: the mean squared error of the cumulative distribution against
 * the cumulative outcome, so calling an Away win when Home settled is punished
 * harder than calling a Draw (spec 0002).
 *
 * Normalised by the number of cumulative terms, which is one fewer than the
 * outcomes — the last is 1 on both sides and carries nothing — putting the
 * value in `[0, 1]`.
 */
export function rankedProbabilityScore(
  probs: Probs,
  outcome: Outcome
): number {
  let cumulativeProbability = 0;
  let cumulativeOutcome = 0;
  let total = 0;
  for (const each of OUTCOMES.slice(0, -1)) {
    cumulativeProbability += probs[each];
    cumulativeOutcome += each === outcome ? 1 : 0;
    total += (cumulativeProbability - cumulativeOutcome) ** 2;
  }
  return total / (OUTCOMES.length - 1);
}

/**
 * Brier score for one Prediction: `Σ (p − o)²` over all three outcomes,
 * unnormalised, range `[0, 2]`.
 *
 * The pinned convention (spec 0002). Published variants differ by a factor of
 * two, so a figure computed here is comparable with someone else's only
 * because this one is fixed and tested against a hand-computed value.
 */
export function brierScore(probs: Probs, outcome: Outcome): number {
  return OUTCOMES.reduce(
    (total, each) => total + (probs[each] - (each === outcome ? 1 : 0)) ** 2,
    0
  );
}

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

/**
 * One Fixture as one Entrant predicted it. Everything a result decides is null
 * until the Fixture settles, so an unsettled Fixture is present for the metrics
 * that read the Prediction alone and absent from the ones that need an outcome.
 */
interface PredictedFixture {
  gw: number;
  fplId: number;
  predicted: [number, number];
  probs: Probs;
  /** The Outcome the probabilities call likeliest, ties broken canonically. */
  likeliest: Outcome;
  coherent: boolean;
  /** Everything the result decides, set together or not at all. */
  settled: SettledDetail | null;
}

interface SettledDetail {
  result: [number, number];
  outcome: Outcome;
  points: number;
  rps: number;
  brier: number;
  accurate: boolean;
}

type SettledFixture = PredictedFixture & { settled: SettledDetail };

const settledOf = (fixtures: PredictedFixture[]): SettledFixture[] =>
  fixtures.filter((fixture): fixture is SettledFixture =>
    fixture.settled !== null
  );

interface PredictedRow {
  gw: number;
  fpl_id: number;
  model_id: string;
  probs: Probs;
  pred_home: number;
  pred_away: number;
  result: FixtureResult | null;
}

/**
 * Every Prediction the Season holds, keyed by Entrant, with the result beside
 * it where one has settled.
 *
 * Attribution is `locked_in_gw` rather than `gw` (ADR-0013, ADR-0015): a
 * deferred Fixture belongs to the Gameweek whose Lock its Predictions were
 * committed under, not the Gameweek it was eventually played in.
 *
 * A Fixture that is never played needs no state of its own: it simply never
 * gains a result, and every outcome-dependent metric passes over it.
 */
async function predictedFixtures(
  database: Database,
  season: string
): Promise<Map<string, PredictedFixture[]>> {
  const rows = await database.query<PredictedRow>(
    `select f.locked_in_gw as gw, f.fpl_id, p.model_id, p.probs, p.pred_home,
            p.pred_away, f.result
       from fixtures f
       join predictions p on p.season = f.season and p.fpl_id = f.fpl_id
      where f.season = $1 and f.locked_in_gw is not null
      order by f.locked_in_gw, f.fpl_id, p.model_id`,
    [season]
  );

  const byEntrant = new Map<string, PredictedFixture[]>();
  for (const row of rows.rows) {
    const likeliest = argmaxOutcome(row.probs);
    const result = row.result;
    const predicted: PredictedFixture = {
      gw: row.gw,
      fplId: row.fpl_id,
      predicted: [row.pred_home, row.pred_away],
      probs: row.probs,
      likeliest,
      coherent: likeliest === outcomeOf(row.pred_home, row.pred_away),
      settled: result === null
        ? null
        : {
          result: [result.home_goals, result.away_goals],
          outcome: result.outcome,
          points: matchPoints(row.pred_home, row.pred_away, result),
          rps: rankedProbabilityScore(row.probs, result.outcome),
          brier: brierScore(row.probs, result.outcome),
          accurate: likeliest === result.outcome
        }
    };
    byEntrant.set(
      row.model_id, [...byEntrant.get(row.model_id) ?? [], predicted]
    );
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
  scoredAt: Date;
}

async function storeMetric(
  database: Database,
  { entrantId, season, gameweek, metric, value, n, detail, scoredAt }:
    StoredMetric
): Promise<void> {
  // A row the run did not change is not written at all, so `scored_at` keeps
  // saying when the figure it stamps was arrived at: a re-run over unchanged
  // inputs leaves the row byte for byte as it was, and a correction that moves
  // the value moves the stamp with it rather than backdating the new figure to
  // when the old one was computed.
  //
  // The stamp is the injected clock's, not the database's, so it is the one
  // seam this scorer has and a test can state it rather than read it back.
  await database.query(
    `insert into scores (
       model_id, season, gw, track, metric, value, n, detail, scored_at
     ) values ($1, $2, $3, 'match', $4, $5, $6, $7, $8)
     on conflict (model_id, season, gw, track, metric)
     do update set value = excluded.value, n = excluded.n,
                   detail = excluded.detail, scored_at = excluded.scored_at
              where scores.value is distinct from excluded.value
                 or scores.n is distinct from excluded.n
                 or scores.detail is distinct from excluded.detail`,
    [
      entrantId, season, gameweek, metric, value, n, JSON.stringify(detail),
      scoredAt
    ]
  );
}

/**
 * Every row for one Entrant over one set of Fixtures, under the metric names
 * the caller asks for — the same measures serve one Gameweek and the Season
 * through it, and only what they are called and what detail traces them apart
 * differs.
 *
 * Everything but Coherence is computed over the settled Fixtures alone: an
 * unsettled Fixture is absent rather than a miss. Coherence reads the
 * Prediction against itself and so reads them all, which is why it carries its
 * own `n`.
 */
async function writeRows(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  predicted: PredictedFixture[],
  cumulative: boolean,
  scoredAt: Date
): Promise<void> {
  const settled = settledOf(predicted);

  // A cumulative row's detail is grouped by Gameweek and traced to the Fixture
  // beneath it. The grouping is what a reader wants — a Season total is read as
  // a shape over Gameweeks — and the Fixtures under it are what makes the row
  // answer a surprising total on its own rather than by joining it back to the
  // Gameweek rows that also hold them.
  const perGameweek = <F extends PredictedFixture, T>(
    fixtures: F[],
    summarise: (scoped: F[]) => T
  ) =>
    [...new Set(fixtures.map(({ gw }) => gw))]
      .sort((one, other) => one - other)
      .map((gw) => {
        const scoped = fixtures.filter((fixture) => fixture.gw === gw);
        return { gw, n: scoped.length, ...summarise(scoped) };
      });

  const store = (
    metric: string,
    value: number,
    n: number,
    detail: unknown
  ) =>
    storeMetric(database, {
      entrantId, season, gameweek, metric, value, n, detail, scoredAt
    });

  if (settled.length > 0) {
    const pointsDetail = (scoped: SettledFixture[]) => ({
      fixtures: scoped.map(({ fplId, predicted: named, settled: result }) => ({
        fplId,
        predicted: named,
        result: result.result,
        outcome: result.outcome,
        points: result.points
      }))
    });
    const totalPoints = (scoped: SettledFixture[]) =>
      scoped.reduce((total, { settled: result }) => total + result.points, 0);

    await store(
      cumulative ? MATCH_POINTS_SEASON_TO_DATE_METRIC : MATCH_POINTS_METRIC,
      totalPoints(settled),
      settled.length,
      {
        qualification: MATCH_POINTS_QUALIFICATION,
        ...cumulative
          ? {
            gameweeks: perGameweek(settled, (scoped) => ({
              points: totalPoints(scoped),
              ...pointsDetail(scoped)
            }))
          }
          : pointsDetail(settled)
      }
    );

    // RPS and Brier aggregate as the mean of their per-Fixture values, so a
    // Gameweek of three Fixtures and a Season of thirty are on one scale.
    for (const [metric, cumulativeMetric, key] of [
      [RPS_METRIC, RPS_SEASON_TO_DATE_METRIC, "rps"],
      [BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC, "brier"]
    ] as const) {
      const mean = (scoped: SettledFixture[]) =>
        scoped.reduce((total, fixture) => total + fixture.settled[key], 0)
          / scoped.length;
      const detail = (scoped: SettledFixture[]) => ({
        fixtures: scoped.map((fixture) => ({
          fplId: fixture.fplId,
          probs: fixture.probs,
          outcome: fixture.settled.outcome,
          [key]: fixture.settled[key]
        }))
      });
      await store(
        cumulative ? cumulativeMetric : metric,
        mean(settled),
        settled.length,
        cumulative
          ? {
            gameweeks: perGameweek(settled, (scoped) => ({
              mean: mean(scoped),
              ...detail(scoped)
            }))
          }
          : detail(settled)
      );
    }
  }

  // The Match Points tiers nest, so both readable shares are read off the
  // points rather than recomputed: only an exact scoreline scores 5, and
  // everything from 2 up got the outcome right.
  //
  // A readable share names its Fixtures by id, because the Match Points row
  // beside it already holds every scoreline. A probability share names what it
  // read instead — the distribution and the outcome it called likeliest —
  // because nothing else stored says why a Fixture fell on the side it did.
  const shares: [
    string,
    string,
    PredictedFixture[],
    (fixture: PredictedFixture) => boolean,
    (fixture: PredictedFixture) => unknown
  ][] = [
    [
      SCORE_PCT_METRIC, SCORE_PCT_SEASON_TO_DATE_METRIC, settled,
      ({ settled: result }) => result?.points === 5,
      ({ fplId }) => fplId
    ],
    [
      OUTCOME_PCT_METRIC, OUTCOME_PCT_SEASON_TO_DATE_METRIC, settled,
      ({ settled: result }) => result !== null && result.points >= 2,
      ({ fplId }) => fplId
    ],
    [
      ACCURACY_METRIC, ACCURACY_SEASON_TO_DATE_METRIC, settled,
      ({ settled: result }) => result?.accurate === true,
      ({ fplId, probs, likeliest, settled: result }) =>
        ({ fplId, probs, likeliest, outcome: result?.outcome })
    ],
    [
      COHERENCE_METRIC, COHERENCE_SEASON_TO_DATE_METRIC, predicted,
      ({ coherent }) => coherent,
      ({ fplId, probs, likeliest, predicted: named }) =>
        ({ fplId, probs, likeliest, predicted: named })
    ]
  ];
  for (const [metric, cumulativeMetric, fixtures, hit, describe] of shares) {
    if (fixtures.length === 0) {
      continue;
    }
    // Both sides of the fraction are named, not only the numerator: the hits
    // over the hits and misses together is the value, so the row is auditable
    // without the Gameweek's Fixture list to say what the denominator was.
    const split = (scoped: PredictedFixture[]) => ({
      hits: scoped.filter(hit).map(describe),
      misses: scoped.filter((fixture) => !hit(fixture)).map(describe)
    });
    await store(
      cumulative ? cumulativeMetric : metric,
      split(fixtures).hits.length / fixtures.length,
      fixtures.length,
      cumulative ? { gameweeks: perGameweek(fixtures, split) } : split(fixtures)
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
  /** Stamps `scored_at` and decides nothing else. */
  now: () => Date;
}

/**
 * Writes the Match track record for one Gameweek: what each Entrant scored on
 * it, and what the Season has come to through the same Gameweek.
 *
 * Reads stored Fixtures and Predictions and nothing else — no network call, and
 * no reading of the clock beyond stamping the rows, since scoreability is
 * `fixtures.result` being present rather than anything about when the job ran.
 * Running it twice over the same rows therefore leaves the same rows, stamp
 * included.
 *
 * A Gameweek with nothing settled writes no outcome-dependent row rather than a
 * record of zeros: an unplayed Gameweek and a badly forecast one must not look
 * alike. Coherence is the exception, because it reads the Prediction against
 * itself: it is reported for every Prediction the Gameweek's Lock owns, which
 * is what makes it answerable the moment the Lock passes.
 *
 * A Gameweek nobody predicted has nothing to say either way, so it returns
 * before opening a transaction.
 */
export async function scoreMatchGameweek({
  database,
  season,
  gameweek,
  now
}: ScoreMatchGameweekOptions): Promise<void> {
  const byEntrant = await predictedFixtures(database, season);
  if (![...byEntrant.values()].some((predicted) =>
    predicted.some((fixture) => fixture.gw === gameweek)
  )) {
    return;
  }

  // One reading for the whole run, so every row a single scoring pass writes
  // carries the same stamp however long the pass takes.
  const scoredAt = now();

  await database.query("begin");
  try {
    for (const target of await targetGameweeks(database, season, gameweek)) {
      for (const [entrantId, predicted] of byEntrant) {
        const own = predicted.filter(({ gw }) => gw === target);
        if (own.length > 0) {
          await writeRows(
            database, season, target, entrantId, own, false, scoredAt
          );
        }
        const through = predicted.filter(({ gw }) => gw <= target);
        if (through.length > 0) {
          await writeRows(
            database, season, target, entrantId, through, true, scoredAt
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

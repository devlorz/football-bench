import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  argmaxOutcome,
  outcomeOf,
  OUTCOMES,
  type FixtureResult,
  type Outcome,
  type Probs
} from "../fixture-result.js";
import { footballDataTeamName } from "../football-data/team-identity.js";
import { emptyRepairDistribution } from "../repairs.js";
import { GAP_CAUSES, type GapCause } from "./gap-alert.js";
import { MATCH_PROMPT_VERSION } from "./openrouter-entrant.js";

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
 * The share of the Fixtures a Lock owns that an Entrant produced no Prediction
 * for, with the causes beneath it.
 *
 * The counterpart to every metric above: those are computed over what an
 * Entrant answered and say nothing about what it did not, so an Entrant that
 * is absent must not be indistinguishable from one that forecast badly. It is
 * behavioural and so reads no result — a Fixture nobody has played is still a
 * Fixture this Entrant either answered or did not.
 */
export const GAP_RATE_METRIC = "gap_rate";
export const GAP_RATE_SEASON_TO_DATE_METRIC = "gap_rate_season_to_date";

/**
 * How many Repairs each Prediction cost before it was valid, as a distribution
 * over the Fixtures the Lock owns, with the mean over the ones that reached a
 * valid Prediction as its value.
 *
 * The mean alone cannot tell a Base Model that needs one Repair on every
 * Fixture from one that answers three cleanly and then Gaps the fourth, and
 * those are different Base Models — so the value is the mean and the detail is
 * the shape, as the FPL track's `repairs` row is built.
 *
 * `n` is the Fixtures the distribution was taken over, which is the Lock's and
 * not the mean's denominator: the mean is over `n` less the `failed` and
 * `unattempted` buckets, since a Fixture that never reached a valid Prediction
 * has no count of Repairs that did. Those two are kept apart here for the same
 * reason the Gap profile keeps them apart — spending the whole allowance and
 * never being asked are different failures, and only one is the Base Model's.
 */
export const ATTEMPTS_TO_VALID_METRIC = "attempts_to_valid";
export const ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC =
  "attempts_to_valid_season_to_date";

/**
 * A Gap the attempt rows explain no further: nothing was ever asked of this
 * Entrant on this Fixture.
 *
 * Its own bucket rather than folded into the causes, because a Base Model that
 * refused four times and one the run never reached are different failures, and
 * only one of them is the Base Model's.
 */
const UNATTEMPTED = "unattempted";

/** How many Gaps each cause accounts for. */
export type GapProfile = Record<GapCause | typeof UNATTEMPTED, number>;

/** The breakdown before any Gap is counted: every cause at zero. */
function emptyGapProfile(): GapProfile {
  return Object.fromEntries(
    [...GAP_CAUSES, UNATTEMPTED].map((cause) => [cause, 0])
  ) as GapProfile;
}

/**
 * The mean Paired Difference in RPS between one Entrant and its snapshot's
 * Comparison Anchor.
 *
 * Cumulative only, and so named without a per-Gameweek counterpart: a
 * comparison is a statement about the Season through a Gameweek, and ten
 * Fixtures of one Gameweek are far too few to make one (ADR-0012, ADR-0016).
 */
export const RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC =
  "rps_paired_difference_season_to_date";

/**
 * Why an interval spanning zero is published rather than suppressed, stored in
 * the detail of the rows it applies to for the same reason the Match Points
 * qualification is: a reader must not be able to reach the figure without it.
 *
 * ADR-0009 omitted the Positive Control deliberately, and this sentence is what
 * that omission costs at the point it is felt.
 */
export const NO_POSITIVE_CONTROL_QUALIFICATION =
  "This interval spans zero, which is a result and not a scoring failure. No "
  + "Positive Control is entered, so a spanning interval cannot distinguish "
  + "two Base Models that are genuinely close from a setup that resolves "
  + "nothing at all.";

/** The resampling spec 0002 pins: 10,000 draws, 95%, percentile method. */
const BOOTSTRAP_RESAMPLES = 10_000;
const BOOTSTRAP_LEVEL = 0.95;

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
 * A uniform generator over `[0, 1)` from one 32-bit seed — mulberry32, chosen
 * because it is short enough to read and has no state a caller can disturb.
 *
 * The resampling needs an arbitrary but fixed order, not cryptographic quality:
 * what a reader checks is that the same inputs give the same interval, and that
 * is a property of seeding it from those inputs rather than of the generator.
 */
function uniformFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** An interval and everything a reader needs to reproduce it. */
export interface BootstrapInterval {
  low: number;
  high: number;
  level: number;
  resamples: number;
  method: "percentile";
  seed: number;
}

/**
 * The 95% percentile-bootstrap interval of the mean of `differences`, seeded
 * from the differences themselves.
 *
 * No random-number generator is injected, so determinism is a property of this
 * function rather than of how a caller wires it: the same Paired Differences in
 * the same order always produce the same interval, which is what makes
 * ADR-0005's claim that scoring can be re-run and back-filled true rather than
 * aspirational.
 *
 * The seed is the leading 32 bits of the SHA-256 of the ordered differences.
 * Reading them as text keeps the seed a function of the numbers themselves and
 * not of how they happen to be laid out in memory.
 */
export function bootstrapInterval(differences: number[]): BootstrapInterval {
  const seed = createHash("sha256")
    .update(differences.join(","))
    .digest()
    .readUInt32BE(0);
  const random = uniformFrom(seed);

  // ponytail: 10,000 resamples per comparison per recomputed snapshot, which a
  // full Season recomputation multiplies by eight Entrants and every published
  // Gameweek. It is the pinned figure and it is fast enough at Season scale; if
  // a back-fill ever drags, cache the interval on the unchanged snapshots
  // rather than resampling fewer times.
  const means: number[] = [];
  for (let resample = 0; resample < BOOTSTRAP_RESAMPLES; resample += 1) {
    let total = 0;
    for (let draw = 0; draw < differences.length; draw += 1) {
      total += differences[Math.floor(random() * differences.length)]!;
    }
    means.push(total / differences.length);
  }
  means.sort((one, other) => one - other);

  // The percentile method reads the resampled means at the tails directly. Both
  // ends are pinned to a stated index rather than interpolated, so the interval
  // is a value the resamples actually produced.
  const tail = (1 - BOOTSTRAP_LEVEL) / 2;
  return {
    low: means[Math.floor(tail * BOOTSTRAP_RESAMPLES)]!,
    high: means[Math.ceil((1 - tail) * BOOTSTRAP_RESAMPLES) - 1]!,
    level: BOOTSTRAP_LEVEL,
    resamples: BOOTSTRAP_RESAMPLES,
    method: "percentile",
    seed
  };
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
 * One Fixture as one forecaster saw it, whether that forecaster is an Entrant
 * or a Reference Line. Everything a result decides is null until the Fixture
 * settles, so an unsettled Fixture is present for the metrics that read the
 * forecast alone and absent from the ones that need an outcome.
 */
interface ForecastFixture {
  gw: number;
  fplId: number;
  probs: Probs;
  /** The Outcome the probabilities call likeliest, ties broken canonically. */
  likeliest: Outcome;
  settled: ForecastSettled | null;
}

interface ForecastSettled {
  result: [number, number];
  outcome: Outcome;
  rps: number;
  brier: number;
  accurate: boolean;
}

/**
 * One Fixture as one Entrant predicted it: a forecast with the Predicted Score
 * beside it, and everything only a named scoreline can be scored on.
 *
 * A Reference Line names none, which is why the two are separate types rather
 * than one with nullable fields — the scoreline rows are not written for it and
 * a null would have to be checked at each of them.
 */
interface PredictedFixture extends ForecastFixture {
  predicted: [number, number];
  coherent: boolean;
  /** The Repairs this Prediction cost before it was valid. */
  repairs: number;
  settled: SettledDetail | null;
}

interface SettledDetail extends ForecastSettled {
  points: number;
}

type Settled<F extends ForecastFixture> =
  F & { settled: NonNullable<F["settled"]> };

type SettledForecast = Settled<ForecastFixture>;
type SettledFixture = Settled<PredictedFixture>;

const settledOf = <F extends ForecastFixture>(fixtures: F[]): Settled<F>[] =>
  fixtures.filter((fixture): fixture is Settled<F> =>
    fixture.settled !== null
  );

const totalPoints = (fixtures: SettledFixture[]): number =>
  fixtures.reduce((total, { settled }) => total + settled.points, 0);

/**
 * RPS and Brier aggregate as the mean of their per-Fixture values, so a
 * Gameweek of three Fixtures and a Season of thirty are on one scale — and so
 * the figure a comparison ranks Entrants by is the figure their own rows carry.
 */
const meanOf = (
  fixtures: SettledForecast[],
  key: "rps" | "brier"
): number =>
  fixtures.reduce((total, { settled }) => total + settled[key], 0)
    / fixtures.length;

interface PredictedRow {
  gw: number;
  fpl_id: number;
  model_id: string;
  probs: Probs;
  pred_home: number;
  pred_away: number;
  repairs: number;
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
            p.pred_away, p.attempts_used as repairs, f.result
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
      repairs: row.repairs,
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

/**
 * A cumulative row's detail is grouped by Gameweek and traced to the Fixture
 * beneath it. The grouping is what a reader wants — a Season total is read as a
 * shape over Gameweeks — and the Fixtures under it are what makes the row
 * answer a surprising total on its own rather than by joining it back to the
 * Gameweek rows that also hold them.
 *
 * Keyed on the `gw` alone, so the Fixtures an Entrant answered and the Fixtures
 * its Lock owned are grouped by the one function.
 */
const perGameweek = <F extends { gw: number }, T>(
  fixtures: F[],
  summarise: (scoped: F[]) => T
) =>
  [...new Set(fixtures.map(({ gw }) => gw))]
    .sort((one, other) => one - other)
    .map((gw) => {
      const scoped = fixtures.filter((fixture) => fixture.gw === gw);
      return { gw, n: scoped.length, ...summarise(scoped) };
    });

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

/** One row for whoever the caller is writing, under the name it asks for. */
type StoreRow = (
  metric: string,
  value: number,
  n: number,
  detail: unknown
) => Promise<void>;

/**
 * `forecasterId` rather than an Entrant id: a Reference Line writes rows
 * through here too, and it is not an Entrant (CONTEXT.md). The column beneath
 * is `model_id`, which is what both are a row of.
 */
const storeRow = (
  database: Database,
  season: string,
  gameweek: number,
  forecasterId: string,
  scoredAt: Date
): StoreRow =>
  (metric, value, n, detail) =>
    storeMetric(database, {
      entrantId: forecasterId,
      season,
      gameweek,
      metric,
      value,
      n,
      detail,
      scoredAt
    });

/**
 * One share of the Fixtures given, with both sides of the fraction named — the
 * hits over the hits and misses together is the value, so the row is auditable
 * without the Gameweek's Fixture list to say what the denominator was.
 */
async function writeShare<F extends { gw: number }>(
  store: StoreRow,
  metric: string,
  fixtures: F[],
  hit: (fixture: F) => boolean,
  describe: (fixture: F) => unknown,
  cumulative: boolean
): Promise<void> {
  if (fixtures.length === 0) {
    return;
  }
  const split = (scoped: F[]) => ({
    hits: scoped.filter(hit).map(describe),
    misses: scoped.filter((fixture) => !hit(fixture)).map(describe)
  });
  await store(
    metric,
    split(fixtures).hits.length / fixtures.length,
    fixtures.length,
    cumulative ? { gameweeks: perGameweek(fixtures, split) } : split(fixtures)
  );
}

/**
 * The probability layer over the settled Fixtures given: RPS, Brier and
 * accuracy.
 *
 * Everything a Reference Line is scored on, and the part of an Entrant's record
 * that carries a claim (ADR-0012) — one function, so a line and an Entrant are
 * measured by the same code and not merely by the same definition.
 *
 * A probability row names what it read — the distribution and the Outcome it
 * called likeliest — because nothing else stored says why a Fixture fell on the
 * side it did.
 */
async function writeProbabilityRows(
  store: StoreRow,
  settled: SettledForecast[],
  cumulative: boolean
): Promise<void> {
  if (settled.length === 0) {
    return;
  }
  for (const [metric, cumulativeMetric, key] of [
    [RPS_METRIC, RPS_SEASON_TO_DATE_METRIC, "rps"],
    [BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC, "brier"]
  ] as const) {
    const mean = (scoped: SettledForecast[]) => meanOf(scoped, key);
    const detail = (scoped: SettledForecast[]) => ({
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

  await writeShare(
    store,
    cumulative ? ACCURACY_SEASON_TO_DATE_METRIC : ACCURACY_METRIC,
    settled,
    ({ settled: result }) => result.accurate,
    ({ fplId, probs, likeliest, settled: result }) =>
      ({ fplId, probs, likeliest, outcome: result.outcome }),
    cumulative
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
  const store = storeRow(database, season, gameweek, entrantId, scoredAt);

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
  }

  await writeProbabilityRows(store, settled, cumulative);

  // The Match Points tiers nest, so both readable shares are read off the
  // points rather than recomputed: only an exact scoreline scores 5, and
  // everything from 2 up got the outcome right.
  //
  // A readable share names its Fixtures by id, because the Match Points row
  // beside it already holds every scoreline.
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
      COHERENCE_METRIC, COHERENCE_SEASON_TO_DATE_METRIC, predicted,
      ({ coherent }) => coherent,
      ({ fplId, probs, likeliest, predicted: named }) =>
        ({ fplId, probs, likeliest, predicted: named })
    ]
  ];
  for (const [metric, cumulativeMetric, fixtures, hit, describe] of shares) {
    await writeShare(
      store,
      cumulative ? cumulativeMetric : metric,
      fixtures,
      hit,
      describe,
      cumulative
    );
  }
}

/** One Fixture a Lock owns, whoever answered it and whether or not it settled. */
interface LockedFixture {
  gw: number;
  fplId: number;
  /** Both sides and when they met, which only the Elo replay below reads. */
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
  result: FixtureResult | null;
}

/**
 * Every Fixture the Season's Locks own: the denominator every behavioural
 * metric is taken over, and the Fixture list every Reference Line forecasts.
 *
 * Read from `fixtures` rather than from the Predictions, because a Fixture no
 * Entrant answered is exactly the one a Gap rate exists to report and a
 * Reference Line still forecasts, and it appears in no Prediction by
 * definition. The behavioural metrics take no notice of `result`: whether a
 * Fixture has been played says nothing about whether it was answered.
 */
async function lockedFixtures(
  database: Database,
  season: string
): Promise<LockedFixture[]> {
  const rows = await database.query<{
    gw: number;
    fpl_id: number;
    home_team: string;
    away_team: string;
    kickoff_at: Date;
    result: FixtureResult | null;
  }>(
    `select locked_in_gw as gw, fpl_id, home_team, away_team, kickoff_at,
            result
       from fixtures
      where season = $1 and locked_in_gw is not null
      order by locked_in_gw, fpl_id`,
    [season]
  );
  return rows.rows.map(
    ({ gw, fpl_id, home_team, away_team, kickoff_at, result }) => ({
      gw,
      fplId: fpl_id,
      homeTeam: home_team,
      awayTeam: away_team,
      kickoffAt: kickoff_at,
      result
    })
  );
}

export const REFERENCE_HOME = "reference-home";
export const REFERENCE_UNIFORM = "reference-uniform";
export const REFERENCE_ELO = "reference-elo";

/**
 * Every Reference Line, with the name its `models` row carries.
 *
 * One list, so a line cannot be scored with no row to hang off, or gain a row
 * nothing scores. None of them names a scoreline, so all are scored on the
 * probability layer alone, never ranked and never able to win (CONTEXT.md,
 * ADR-0012).
 */
const REFERENCE_LINES: { id: string; name: string }[] = [
  { id: REFERENCE_HOME, name: "Home Reference Line" },
  { id: REFERENCE_UNIFORM, name: "Uniform Reference Line" },
  { id: REFERENCE_ELO, name: "Elo Reference Line" }
];

/**
 * The same roster by id alone, for a reader that needs to know which lines a
 * run should have scored without knowing what each is called.
 */
export const REFERENCE_LINE_IDS = REFERENCE_LINES.map(({ id }) => id);

/**
 * The two trivial rules a reader orients by: the long-run Home advantage, and
 * knowing nothing at all.
 *
 * The probabilities are pinned constants rather than anything fitted, which is
 * what makes these two deterministic across a back-fill: the same Fixture
 * scores the same on the first run and on a recomputation a Season later. Elo
 * is not among them because it is derived rather than declared, and reaches the
 * same determinism by replaying the same stored results every time.
 */
const CONSTANT_REFERENCE_LINES: { id: string; probs: Probs }[] = [
  { id: REFERENCE_HOME, probs: { H: 0.44, D: 0.28, A: 0.28 } },
  { id: REFERENCE_UNIFORM, probs: { H: 1 / 3, D: 1 / 3, A: 1 / 3 } }
];

/**
 * One Reference Line's forecast of every Fixture given, computed in memory.
 *
 * No `predictions` row is written for it: a Reference Line answers nothing and
 * is asked nothing, so a stored Prediction would put it in every query that
 * asks who predicted a Fixture — the complete-case intersection first among
 * them (ADR-0011). Re-deriving a forecast costs nothing: two of the three lines
 * are constants, and the third is a replay over Fixtures already in hand.
 */
const referenceForecast = (
  probsOf: (fixture: LockedFixture) => Probs,
  fixtures: LockedFixture[]
): ForecastFixture[] =>
  fixtures.map((fixture) => {
    const { gw, fplId, result } = fixture;
    const probs = probsOf(fixture);
    const likeliest = argmaxOutcome(probs);
    return {
      gw,
      fplId,
      probs,
      likeliest,
      settled: result === null
        ? null
        : {
          result: [result.home_goals, result.away_goals],
          outcome: result.outcome,
          rps: rankedProbabilityScore(probs, result.outcome),
          brier: brierScore(probs, result.outcome),
          accurate: likeliest === result.outcome
        }
    };
  });

/** Where a club no stored result mentions starts. */
const ELO_START = 1500;
/** What one result moves a rating by, and what playing at home is worth. */
const ELO_K = 20;
const ELO_HOME_ADVANTAGE = 60;
/** The share of every Elo forecast the draw takes (spec 0002). */
const ELO_DRAW = 0.28;

/**
 * The Home side's expected score under the pinned logistic mapping: 1 for a
 * win, a half for a draw, so it is one number covering three outcomes.
 */
const eloExpectation = (home: number, away: number): number =>
  1 / (1 + 10 ** ((away - home - ELO_HOME_ADVANTAGE) / 400));

/**
 * What two ratings say about one Fixture: that one number spread over the three
 * outcomes.
 *
 * The draw is the pinned constant the Home Reference Line was recalibrated to
 * and the rest follows from the expectation being `H + D/2` by definition, so
 * the split says exactly what Elo said and adds one assumption rather than a
 * second fitted model. A rating gap wide enough to send either side past its
 * share is clamped, which keeps a distribution a distribution; the draw holds
 * its 0.28 through the clamp, so the two clamped outcomes are 0.72 and 0.
 *
 * ponytail: the draw does not narrow as the gap widens, which it does in
 * reality. A gap-sensitive draw needs its own pinned constants and its own
 * recalibration (spec 0002), and this line exists for orientation rather than
 * to forecast well.
 *
 * Exported for the clamp, which a rating gap only reaches after a Season of
 * results and so cannot be stated as one at the scoring seam.
 */
export function eloProbabilities(home: number, away: number): Probs {
  const homeProb = Math.min(
    Math.max(eloExpectation(home, away) - ELO_DRAW / 2, 0),
    1 - ELO_DRAW
  );
  return { H: homeProb, D: ELO_DRAW, A: 1 - ELO_DRAW - homeProb };
}

/**
 * Every Fixture in the order it was played, ties broken by Fixture id.
 *
 * Two Fixtures kicking off at the same instant is ordinary — a Gameweek's
 * Saturday holds several — and which of them a rating change reaches first
 * would otherwise be whatever order the rows arrived in.
 */
const chronological = (fixtures: LockedFixture[]): LockedFixture[] =>
  [...fixtures].sort((one, other) =>
    one.kickoffAt.getTime() - other.kickoffAt.getTime()
      || one.fplId - other.fplId
  );

/** One result, as the replay reads it: who met, and how it went. */
interface EloResult {
  homeTeam: string;
  awayTeam: string;
  outcome: Outcome;
}

/**
 * The Season before the one being scored, in the `YYYY-YY` form every stored
 * Season uses. `2026-27` is seeded from `2025-26`.
 */
const priorSeason = (season: string): string => {
  const start = Number(season.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

/**
 * The prior Season's results, in the order they were played.
 *
 * Both stored divisions count: a promoted club spent the prior Season in the
 * Championship, and starting it level with a club that survived the Premier
 * League would say less than its own results do. A club neither division
 * mentions starts level, which is the most anything stored supports.
 */
async function priorSeasonResults(
  database: Database,
  season: string
): Promise<EloResult[]> {
  const rows = await database.query<{
    home_team: string;
    away_team: string;
    home_goals: number;
    away_goals: number;
  }>(
    `select home_team, away_team, home_goals, away_goals
       from historical_matches
      where season = $1
      order by played_on, home_team, away_team`,
    [priorSeason(season)]
  );
  return rows.rows.map(({ home_team, away_team, home_goals, away_goals }) => ({
    homeTeam: home_team,
    awayTeam: away_team,
    outcome: outcomeOf(home_goals, away_goals)
  }));
}

/**
 * The Elo line's forecast of every Fixture given, replayed in memory from the
 * prior Season's results through this one's.
 *
 * Every Fixture is forecast from the ratings as they stood before it, which is
 * what the chronological pass is for: a result reaching its own forecast would
 * let the line score a Fixture it had already seen.
 *
 * Ratings are keyed on football-data.co.uk's identity, because that is what the
 * history is stored under and a Fixture names its clubs as FPL does. A name
 * neither source has been reviewed for resolves to itself and simply matches
 * nothing, which leaves that club level rather than merged with another.
 *
 * ponytail: ratings carry across the Season boundary untouched. Regressing them
 * toward 1500 between Seasons is the usual practice and would need its own
 * pinned constant; nothing has asked for one.
 */
const eloForecast = (
  history: EloResult[],
  fixtures: LockedFixture[]
): ForecastFixture[] => {
  const ratings = new Map<string, number>();
  const rating = (team: string): number => ratings.get(team) ?? ELO_START;
  const record = ({ homeTeam, awayTeam, outcome }: EloResult): void => {
    const expectation = eloExpectation(rating(homeTeam), rating(awayTeam));
    const scored = outcome === "H" ? 1 : outcome === "D" ? 0.5 : 0;
    const change = ELO_K * (scored - expectation);
    ratings.set(homeTeam, rating(homeTeam) + change);
    ratings.set(awayTeam, rating(awayTeam) - change);
  };

  history.forEach(record);

  const forecast = new Map<number, Probs>();
  for (const { fplId, homeTeam, awayTeam, result } of chronological(fixtures)) {
    const home = footballDataTeamName(homeTeam);
    const away = footballDataTeamName(awayTeam);
    forecast.set(fplId, eloProbabilities(rating(home), rating(away)));
    // After the forecast, never before it: a Fixture is answered on what stood
    // when it kicked off. An unsettled Fixture moves nothing and is passed
    // over, which is also what makes a later-settled deferred Fixture reach
    // every rating it should once it does settle.
    if (result !== null) {
      record({ homeTeam: home, awayTeam: away, outcome: result.outcome });
    }
  }
  // Every Fixture was just forecast, so the lookup below cannot miss; the
  // Fixtures are mapped in their own order rather than the replay's, because
  // the detail a row carries reads in Gameweek order like every other.
  return referenceForecast(({ fplId }) => forecast.get(fplId)!, fixtures);
};

/**
 * The `models` rows the Reference Lines' scores hang off, written here because
 * this is the only thing that needs them and each line is defined above rather
 * than by anything a Season is set up with.
 *
 * They carry the Match track's Prompt Version, which is what says which track
 * a seat is entered for — but the `reference` role keeps them out of every
 * roster, so none can stand as a Comparison Anchor or empty a complete case.
 *
 * The row is overwritten rather than left alone where one already exists: the
 * definitions above are the only ones there are, and a row carrying `entrant`
 * under one of these ids would put a rule nobody was asked to follow on the
 * leaderboard with nothing to say so. `base_model` is the line's own id because
 * the column is not null and there is no underlying LLM to name.
 */
async function ensureReferenceLines(database: Database): Promise<void> {
  for (const { id, name } of REFERENCE_LINES) {
    await database.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ($1, $2, $1, 'none', $3, 'reference')
       on conflict (id) do update
          set name = excluded.name, base_model = excluded.base_model,
              provider = excluded.provider,
              prompt_version = excluded.prompt_version,
              role = excluded.role`,
      [id, name, MATCH_PROMPT_VERSION]
    );
  }
}

/** What the attempt rows say one Entrant spent on one Fixture. */
interface AttemptSummary {
  attempts: number;
  /** The kind the last failing attempt recorded, or null if none failed. */
  cause: GapCause | null;
}

const attemptKey = (entrantId: string, fplId: number): string =>
  `${entrantId}\u0000${fplId}`;

/**
 * How many times each Entrant was asked for each Fixture, and what the last
 * failure was.
 *
 * The last failure is the cause a Gap is reported under, which is the rule
 * `readGapAlert` already reports live Gaps by: the Repairs before it are what
 * the Gap survived on the way, and the row that finally left it missing is what
 * it is down to. Both are counted, so a Base Model asked four times and one the
 * run never reached are not read the same way.
 */
async function attemptsByFixture(
  database: Database,
  season: string
): Promise<Map<string, AttemptSummary>> {
  const rows = await database.query<{
    model_id: string;
    fpl_id: number;
    attempts: number;
    cause: GapCause | null;
  }>(
    `select model_id, fpl_id, count(*)::int as attempts,
            (array_agg(error_kind order by attempted_at desc, id desc)
               filter (where not ok))[1] as cause
       from attempts
      where season = $1 and track = 'match' and fpl_id is not null
      group by model_id, fpl_id`,
    [season]
  );
  return new Map(rows.rows.map((row) => [
    attemptKey(row.model_id, row.fpl_id),
    { attempts: row.attempts, cause: row.cause }
  ]));
}

/**
 * One Entrant's Gap rate over the Fixtures given, with every Gap traced to the
 * attempts that failed to fill it.
 *
 * Written for every Entrant of the roster and not only for the ones that
 * answered: an Entrant with no successful Prediction gets no readable row at
 * all, since a share over no Fixture is not zero, and this is the row that says
 * it was absent rather than wrong.
 */
async function writeGapRate(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  fixtures: LockedFixture[],
  answered: Set<number>,
  tried: Map<string, AttemptSummary>,
  cumulative: boolean,
  scoredAt: Date
): Promise<void> {
  const split = (scoped: LockedFixture[]) => {
    const causes = emptyGapProfile();
    const gaps = scoped
      .filter(({ fplId }) => !answered.has(fplId))
      .map(({ fplId }) => {
        const summary = tried.get(attemptKey(entrantId, fplId));
        const cause = summary?.cause ?? UNATTEMPTED;
        causes[cause] += 1;
        return { fplId, cause, attempts: summary?.attempts ?? 0 };
      });
    return { causes, gaps };
  };
  const whole = split(fixtures);

  // The Fixtures answered are not named here. The denominator is `n`, and the
  // `attempts_to_valid` row beside this one already names every Fixture that
  // did produce a Prediction and what it cost.
  await storeMetric(database, {
    entrantId,
    season,
    gameweek,
    metric: cumulative ? GAP_RATE_SEASON_TO_DATE_METRIC : GAP_RATE_METRIC,
    value: whole.gaps.length / fixtures.length,
    n: fixtures.length,
    detail: cumulative ? { gameweeks: perGameweek(fixtures, split) } : whole,
    scoredAt
  });
}

/**
 * One Entrant's attempts-to-valid over the Fixtures given.
 *
 * Nothing is written for an Entrant that reached no valid Prediction at all.
 * A mean over none of them is not zero, and a stored zero would read as an
 * Entrant that answered first time every time — the exact opposite of what
 * happened. The Gap rate beside it is the row that reports the absence, as it
 * is for every other measure taken over what an Entrant answered.
 */
async function writeAttemptsToValid(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  fixtures: LockedFixture[],
  repairsBy: Map<number, number>,
  tried: Map<string, AttemptSummary>,
  cumulative: boolean,
  scoredAt: Date
): Promise<void> {
  const valid = (scoped: LockedFixture[]) =>
    scoped.flatMap(({ fplId }) => {
      const repairs = repairsBy.get(fplId);
      return repairs === undefined ? [] : [{ fplId, repairs }];
    });
  const own = valid(fixtures);
  if (own.length === 0) {
    return;
  }

  const split = (scoped: LockedFixture[], reached: typeof own) => {
    const distribution: Record<string, number> = {
      ...emptyRepairDistribution(),
      [UNATTEMPTED]: 0
    };
    for (const { repairs } of reached) {
      const bucket = String(repairs);
      distribution[bucket] = (distribution[bucket] ?? 0) + 1;
    }
    // Everything the Lock owned that never reached a valid Prediction, split
    // the way the Gap profile splits it: a Base Model that spent its Repairs
    // and got nowhere is not a Fixture the run never asked it about, and a
    // single `failed` bucket over both would make a `0.75` failure rate out of
    // a Season the Entrant was only asked a quarter of.
    const missing = scoped.filter(({ fplId }) => !repairsBy.has(fplId));
    const unattempted = missing.filter(({ fplId }) =>
      tried.get(attemptKey(entrantId, fplId)) === undefined).length;
    distribution[UNATTEMPTED] = unattempted;
    distribution["failed"] = missing.length - unattempted;
    return { distribution, fixtures: reached };
  };

  await storeMetric(database, {
    entrantId,
    season,
    gameweek,
    metric: cumulative
      ? ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC
      : ATTEMPTS_TO_VALID_METRIC,
    value: own.reduce((total, { repairs }) => total + repairs, 0) / own.length,
    n: fixtures.length,
    detail: cumulative
      ? { gameweeks: perGameweek(fixtures, (gw) => split(gw, valid(gw))) }
      : split(fixtures, own),
    scoredAt
  });
}

/** What one published comparison stores beside its mean and its `n`. */
export interface PairedDifferenceDetail {
  anchor: string;
  entrant: string;
  fixtures: {
    gw: number;
    fplId: number;
    anchorRps: number;
    entrantRps: number;
    /**
     * The Entrant's RPS less the Comparison Anchor's. RPS is a loss, so a
     * positive difference is the anchor forecasting that Fixture better.
     */
    difference: number;
  }[];
  interval: BootstrapInterval;
  /**
   * Present only when the interval spans zero, which is a result rather than a
   * scoring failure.
   */
  qualification?: string;
}

/**
 * The declared comparison set for one cumulative Gameweek snapshot: one
 * complete-case RPS comparison against the snapshot's Comparison Anchor for
 * every other Entrant retained in the Season roster (ADR-0016).
 *
 * The Comparison Anchor is chosen over each candidate's own scoreable Fixtures
 * through this Gameweek — highest Match Points, then lower RPS, then Entrant
 * id — which is the same data the snapshot's own rows are computed from. It
 * selects a reference and does not break the Match Points tie itself.
 *
 * The comparison is then complete-case (ADR-0011): only Fixtures every retained
 * Entrant predicted, so one Entrant's Gap removes that Fixture from every
 * published comparison and not merely from its own. Pairwise deletion would let
 * the published set contradict itself. Reference Lines write no Prediction, so
 * requiring one of every `models` row rather than of the roster would empty
 * every complete case the Season has.
 *
 * The declared set is replaced rather than merely upserted: the rows are keyed
 * by the Entrant they belong to, so a leader change would otherwise leave the
 * former anchor's row in place beside the new anchor's set, naming an anchor
 * the snapshot no longer has. Rows outside the set go; the ones inside it are
 * upserted, so an unchanged comparison keeps the `scored_at` of the run that
 * computed it.
 */
async function writeComparisons(
  database: Database,
  season: string,
  gameweek: number,
  roster: string[],
  byEntrant: Map<string, PredictedFixture[]>,
  scoredAt: Date
): Promise<void> {
  const through = new Map(roster.map((entrantId) => [
    entrantId,
    settledOf(byEntrant.get(entrantId) ?? []).filter(({ gw }) => gw <= gameweek)
  ]));

  // The last tie-break compares Entrant ids by code point rather than by
  // `localeCompare`, whose order depends on the ICU data the machine happens to
  // carry. Two Entrants level on Match Points and on RPS to the last bit would
  // otherwise be separated differently on different machines, which is the one
  // thing the pinned rule exists to stop.
  const [anchor] = [...through]
    .filter(([, fixtures]) => fixtures.length > 0)
    .map(([entrantId, fixtures]) => ({
      entrantId,
      fixtures,
      points: totalPoints(fixtures),
      rps: meanOf(fixtures, "rps")
    }))
    .sort((one, other) =>
      other.points - one.points
      || one.rps - other.rps
      || (one.entrantId < other.entrantId ? -1 : 1));

  // The Fixtures the anchor predicted that every other retained Entrant also
  // predicted, in the Gameweek-then-Fixture order they were read in.
  //
  // One retained Entrant that predicted nothing at all leaves this empty and so
  // publishes no comparison for the snapshot, removing any it had published
  // before. That is complete-case pairing meaning what it says (ADR-0011): the
  // shared Fixture set really is empty, and a published interval that quietly
  // dropped the silent Entrant would be the pairwise deletion the ADR rejects.
  const shared = anchor?.fixtures.filter((fixture) =>
    roster.every((entrantId) =>
      through.get(entrantId)?.some(({ fplId }) => fplId === fixture.fplId)))
    ?? [];

  const declared: string[] = [];
  if (anchor !== undefined && shared.length > 0) {
    for (const entrantId of roster.filter((id) => id !== anchor.entrantId)) {
      // Every shared Fixture is one this Entrant predicted, by the definition
      // of the intersection above.
      const own = through.get(entrantId) ?? [];
      const fixtures = shared.map((anchorFixture) => {
        const entrantFixture = own.find(
          ({ fplId }) => fplId === anchorFixture.fplId
        )!;
        return {
          gw: anchorFixture.gw,
          fplId: anchorFixture.fplId,
          anchorRps: anchorFixture.settled.rps,
          entrantRps: entrantFixture.settled.rps,
          difference: entrantFixture.settled.rps - anchorFixture.settled.rps
        };
      });
      // Paired Fixture by Fixture before it is aggregated, which is what
      // cancels out how hard each Fixture was and leaves only which Entrant
      // forecast it better.
      const differences = fixtures.map(({ difference }) => difference);
      const interval = bootstrapInterval(differences);
      const detail: PairedDifferenceDetail = {
        anchor: anchor.entrantId,
        entrant: entrantId,
        fixtures,
        interval,
        // The qualification's presence is what marks an interval spanning
        // zero. A stored flag saying the same thing could drift from the
        // bounds sitting beside it.
        ...interval.low <= 0 && interval.high >= 0
          ? { qualification: NO_POSITIVE_CONTROL_QUALIFICATION }
          : {}
      };
      await storeMetric(database, {
        entrantId,
        season,
        gameweek,
        metric: RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
        value: differences.reduce((total, each) => total + each, 0)
          / differences.length,
        n: differences.length,
        detail,
        scoredAt
      });
      declared.push(entrantId);
    }
  }

  await database.query(
    `delete from scores
      where season = $1 and gw = $2 and track = 'match' and metric = $3
        and model_id <> all ($4::text[])`,
    [season, gameweek, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC, declared]
  );
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

/**
 * The Season roster: every Match Entrant `models` holds. No exclusion is
 * representable and removing one would need its own decision (CONTEXT.md).
 * Reference Lines are not in it, and so neither empty a complete case nor stand
 * as a Comparison Anchor.
 *
 * An FPL seat holds the same `entrant` role and is told apart by its Prompt
 * Version, here as in every other place that asks who was asked to answer. The
 * role alone would carry the whole FPL roster into a Match complete case and
 * empty it, since an FPL seat writes no Match Prediction.
 */
export async function matchRoster(database: Database): Promise<string[]> {
  const stored = await database.query<{ id: string }>(
    `select id from models
      where role = 'entrant' and prompt_version = $1
      order by id`,
    [MATCH_PROMPT_VERSION]
  );
  return stored.rows.map(({ id }) => id);
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
 * Reads stored Fixtures, Predictions and attempts and nothing else — no network
 * call, and no reading of the clock beyond stamping the rows, since scoreability
 * is `fixtures.result` being present rather than anything about when the job
 * ran. Running it twice over the same rows therefore leaves the same rows, stamp
 * included.
 *
 * A Gameweek with nothing settled writes no outcome-dependent row rather than a
 * record of zeros: an unplayed Gameweek and a badly forecast one must not look
 * alike. Coherence and the behavioural rows are the exceptions, because they
 * read the Prediction against itself, or the absence of one against the Lock's
 * Fixtures: they are answerable the moment the Lock passes.
 *
 * A Gameweek whose Lock owns no Fixture has nothing to say either way, so it
 * returns before opening a transaction. A Gameweek nobody predicted is not that
 * Gameweek: every Entrant Gapped every Fixture of it, and reporting that is what
 * `gap_rate` is for.
 */
export async function scoreMatchGameweek({
  database,
  season,
  gameweek,
  now
}: ScoreMatchGameweekOptions): Promise<void> {
  const locked = await lockedFixtures(database, season);
  if (!locked.some(({ gw }) => gw === gameweek)) {
    return;
  }
  const byEntrant = await predictedFixtures(database, season);
  const tried = await attemptsByFixture(database, season);

  // One reading for the whole run, so every row a single scoring pass writes
  // carries the same stamp however long the pass takes.
  const scoredAt = now();

  const roster = await matchRoster(database);

  // Over every Fixture the Season's Locks own rather than only this Gameweek's,
  // so scoring one Gameweek back-fills the lines across the Season the Entrants
  // already cover.
  const references = [
    ...CONSTANT_REFERENCE_LINES.map(({ id, probs }) =>
      ({ id, forecast: referenceForecast(() => probs, locked) })),
    {
      id: REFERENCE_ELO,
      forecast: eloForecast(
        await priorSeasonResults(database, season), locked
      )
    }
  ];

  await database.query("begin");
  try {
    await ensureReferenceLines(database);
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
      // Over the roster rather than over the Entrants that answered: the
      // Entrant with nothing above is precisely the one a Gap rate reports.
      for (const entrantId of roster) {
        // Keyed by Fixture alone: a Fixture id is unique within a Season, and
        // the Fixture lists below are already scoped to the Gameweeks in view.
        const repairsBy = new Map(
          (byEntrant.get(entrantId) ?? []).map(
            ({ fplId, repairs }) => [fplId, repairs]
          )
        );
        const answered = new Set(repairsBy.keys());
        for (const [fixtures, cumulative] of [
          [locked.filter(({ gw }) => gw === target), false],
          [locked.filter(({ gw }) => gw <= target), true]
        ] as const) {
          if (fixtures.length === 0) {
            continue;
          }
          await writeGapRate(
            database, season, target, entrantId, fixtures, answered, tried,
            cumulative, scoredAt
          );
          await writeAttemptsToValid(
            database, season, target, entrantId, fixtures, repairsBy, tried,
            cumulative, scoredAt
          );
        }
      }
      // The probability layer and nothing else: a Reference Line names no
      // scoreline to earn Match Points on, and was never asked for a Prediction
      // to Gap or Repair.
      for (const { id, forecast } of references) {
        const store = storeRow(database, season, target, id, scoredAt);
        await writeProbabilityRows(
          store, settledOf(forecast.filter(({ gw }) => gw === target)), false
        );
        await writeProbabilityRows(
          store, settledOf(forecast.filter(({ gw }) => gw <= target)), true
        );
      }
      await writeComparisons(
        database, season, target, roster, byEntrant, scoredAt
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

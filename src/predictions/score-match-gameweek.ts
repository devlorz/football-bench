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

const totalPoints = (fixtures: SettledFixture[]): number =>
  fixtures.reduce((total, { settled }) => total + settled.points, 0);

/**
 * RPS and Brier aggregate as the mean of their per-Fixture values, so a
 * Gameweek of three Fixtures and a Season of thirty are on one scale — and so
 * the figure a comparison ranks Entrants by is the figure their own rows carry.
 */
const meanOf = (
  fixtures: SettledFixture[],
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

    for (const [metric, cumulativeMetric, key] of [
      [RPS_METRIC, RPS_SEASON_TO_DATE_METRIC, "rps"],
      [BRIER_METRIC, BRIER_SEASON_TO_DATE_METRIC, "brier"]
    ] as const) {
      const mean = (scoped: SettledFixture[]) => meanOf(scoped, key);
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

  // The Season roster is every Entrant `models` holds; no exclusion is
  // representable and removing one would need its own decision (CONTEXT.md).
  // Reference Lines are not in it, and so neither empty a complete case nor
  // stand as a Comparison Anchor.
  const roster = (await database.query<{ id: string }>(
    "select id from models where role = 'entrant' order by id"
  )).rows.map(({ id }) => id);

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

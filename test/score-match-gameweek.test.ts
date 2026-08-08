import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  outcomeOf,
  type FixtureResult,
  type Probs
} from "../src/fixture-result.js";
import {
  ACCURACY_METRIC,
  ACCURACY_SEASON_TO_DATE_METRIC,
  BET_HIT_PCT_METRIC,
  BET_HIT_PCT_SEASON_TO_DATE_METRIC,
  BET_POINTS_METRIC,
  BET_POINTS_QUALIFICATION,
  BET_POINTS_SEASON_TO_DATE_METRIC,
  BRIER_METRIC,
  BRIER_SEASON_TO_DATE_METRIC,
  COHERENCE_METRIC,
  COHERENCE_SEASON_TO_DATE_METRIC,
  ATTEMPTS_TO_VALID_METRIC,
  ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC,
  GAP_RATE_METRIC,
  GAP_RATE_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_METRIC,
  MATCH_POINTS_QUALIFICATION,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  NO_POSITIVE_CONTROL_QUALIFICATION,
  OUTCOME_PCT_METRIC,
  OUTCOME_PCT_SEASON_TO_DATE_METRIC,
  eloProbabilities,
  REFERENCE_ELO,
  REFERENCE_HOME,
  REFERENCE_UNIFORM,
  RPS_METRIC,
  RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
  RPS_SEASON_TO_DATE_METRIC,
  SCORE_PCT_METRIC,
  SCORE_PCT_SEASON_TO_DATE_METRIC,
  scoreMatchGameweek,
  type BetSlipDetail,
  type PairedDifferenceDetail
} from "../src/predictions/score-match-gameweek.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The four Entrants exist to hold the four exclusive Match Points cases. */
const ENTRANTS = ["entrant/a", "entrant/b", "entrant/c", "entrant/d"];

/** When a scoring run happened. Stated, so a stamp can be asserted. */
const SCORED_AT = new Date("2026-08-24T10:00:00Z");
const CORRECTED_AT = new Date("2026-09-07T10:00:00Z");

describe("scoring the readable Match Points layer", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z')`
    );
    for (const id of ENTRANTS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $1, 'provider/base-model', 'provider', $2, 'entrant')`,
        [id, MATCH_PROMPT_VERSION]
      );
    }
  });

  /**
   * A Fixture the Predictions of `lockedInGw` were committed against. It is
   * played in `gw`, which is the same Gameweek unless the Fixture was deferred.
   */
  const storeFixture = async (
    fplId: number,
    lockedInGw: number,
    gw = lockedInGw,
    /** Only the Elo line reads either, so both default out of the way. */
    {
      teams = [`Home ${fplId}`, `Away ${fplId}`],
      kickoff = "2026-08-21T19:00:00Z"
    }: { teams?: [string, string]; kickoff?: string } = {}
  ): Promise<void> => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [SEASON, fplId, gw, lockedInGw, teams[0], teams[1], kickoff]
    );
    await client.query(
      `insert into contexts (season, gw, track, fpl_id, hash, body)
       values ($1, $2, 'match', $3, $4, 'context')`,
      [SEASON, lockedInGw, fplId, `hash-${fplId}`]
    );
  };

  const settle = async (
    fplId: number,
    home: number,
    away: number
  ): Promise<void> => {
    await client.query(
      "update fixtures set result = $3 where season = $1 and fpl_id = $2",
      [
        SEASON,
        fplId,
        // The same shape and the same derivation the fetch stores, so the
        // fixture cannot drift into proving the scorer against a result no
        // Season would ever hold.
        JSON.stringify({
          home_goals: home,
          away_goals: away,
          outcome: outcomeOf(home, away)
        } satisfies FixtureResult)
      ]
    );
  };

  const predict = async (
    entrantId: string,
    fplId: number,
    home: number,
    away: number,
    probs: Probs = { H: 0.5, D: 0.3, A: 0.2 },
    /** The Repairs the valid Prediction cost, as `predict-gameweek` counts. */
    repairs = 0
  ): Promise<void> => {
    await client.query(
      `insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
         attempts_used
       )
       select $1, $2, $3, $6, $4, $5, c.id, $7
         from contexts c
        where c.season = $2 and c.track = 'match' and c.fpl_id = $3`,
      [entrantId, SEASON, fplId, home, away, JSON.stringify(probs), repairs]
    );
  };

  /**
   * One attempt row, ok when `cause` is null. Rows land in call order, so the
   * last failing one written is the one a Gap's cause is read off.
   */
  const attempt = async (
    entrantId: string,
    fplId: number,
    lockedInGw: number,
    cause: string | null
  ): Promise<void> => {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fpl_id, attempt_no, ok, error_kind,
         trigger
       ) values ($1, $2, $3, 'match', $4, 0, $5, $6, 'main')`,
      [entrantId, SEASON, lockedInGw, fplId, cause === null, cause]
    );
  };

  const score = (gameweek: number, at = SCORED_AT): Promise<void> =>
    scoreMatchGameweek({
      database: client,
      season: SEASON,
      gameweek,
      now: () => at
    });

  const storedValue = async (
    entrantId: string,
    gameweek: number,
    metric: string
  ): Promise<
    { value: number; n: number | null; detail: unknown; scoredAt: Date } | null
  > => {
    const stored = await client.query<{
      value: string;
      n: number | null;
      detail: unknown;
      scored_at: Date;
    }>(
      `select value, n, detail, scored_at
         from scores
        where model_id = $1 and season = $2 and gw = $3 and track = 'match'
          and metric = $4`,
      [entrantId, SEASON, gameweek, metric]
    );
    const row = stored.rows[0];
    return row === undefined
      ? null
      : {
        value: Number(row.value),
        n: row.n,
        detail: row.detail,
        scoredAt: row.scored_at
      };
  };

  test("awards 5, 3, 2 and 0 on the four exclusive cases", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    // Hand-computed against a 2-1 Home win: the exact scoreline, the same goal
    // difference with a different scoreline, the same outcome with a different
    // goal difference, and a scoreline that gets none of it.
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/b", 1, 3, 2);
    await predict("entrant/c", 1, 3, 0);
    await predict("entrant/d", 1, 1, 1);

    await score(1);

    expect((await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))?.value)
      .toBe(5);
    expect((await storedValue("entrant/b", 1, MATCH_POINTS_METRIC))?.value)
      .toBe(3);
    expect((await storedValue("entrant/c", 1, MATCH_POINTS_METRIC))?.value)
      .toBe(2);
    expect((await storedValue("entrant/d", 1, MATCH_POINTS_METRIC))?.value)
      .toBe(0);
  });

  test("reports Score % and Outcome % over the Fixtures it predicted", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    // 5 for the exact 2-1, then 3 for a 1-1 that draws the drawn Fixture
    // without naming its scoreline: 8 points, one exact of two, both outcomes.
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 1, 1);

    await score(1);

    expect(await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))
      .toMatchObject({ value: 8, n: 2 });
    expect(await storedValue("entrant/a", 1, SCORE_PCT_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    expect(await storedValue("entrant/a", 1, OUTCOME_PCT_METRIC))
      .toMatchObject({ value: 1, n: 2 });
  });

  test("leaves a Fixture with no settled result out of every aggregate", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 4, 0);

    await score(1);

    // The unplayed Fixture is absent rather than a miss: five points from one
    // Fixture, not five from two.
    expect(await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))
      .toMatchObject({ value: 5, n: 1 });
    expect(await storedValue("entrant/a", 1, SCORE_PCT_METRIC))
      .toMatchObject({ value: 1, n: 1 });
  });

  test("writes no row for an Entrant that Gapped the whole Gameweek", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1);

    await score(1);

    // Nothing settled is not nothing scored. Storing Score % of 0 for an
    // Entrant that never answered would read as a forecast that got everything
    // wrong, which is the distinction Gap rate exists to keep — so the
    // readable layer is silent about it and `gap_rate` reports it.
    expect(await storedValue("entrant/b", 1, MATCH_POINTS_METRIC)).toBeNull();
    expect(await storedValue("entrant/b", 1, SCORE_PCT_METRIC)).toBeNull();
    expect(await storedValue("entrant/b", 1, BET_POINTS_METRIC)).toBeNull();
    expect(await storedValue("entrant/b", 1, BET_HIT_PCT_METRIC)).toBeNull();
    expect(await storedValue(
      "entrant/b", 1, MATCH_POINTS_SEASON_TO_DATE_METRIC
    )).toBeNull();
  });

  test("writes nothing that needs an outcome for an unplayed Gameweek", async () => {
    await storeFixture(1, 1);
    await predict("entrant/a", 1, 2, 1);

    await score(1);

    // Nothing that needs an outcome is written, so an unplayed Gameweek cannot
    // be mistaken for a badly forecast one. What is written reads the
    // Prediction, or the absence of one, and nothing else: Coherence and the
    // behavioural metrics are all answerable the moment the Lock passes.
    const stored = await client.query<{ metric: string }>(
      "select distinct metric from scores order by metric"
    );
    expect(stored.rows.map(({ metric }) => metric)).toEqual([
      ATTEMPTS_TO_VALID_METRIC,
      ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC,
      COHERENCE_METRIC,
      COHERENCE_SEASON_TO_DATE_METRIC,
      GAP_RATE_METRIC,
      GAP_RATE_SEASON_TO_DATE_METRIC
    ]);
  });

  test("attributes a deferred Fixture to the Gameweek that locked it", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1, 2);
    await settle(1, 2, 1);
    await settle(2, 1, 0);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 1, 0);

    await score(1);

    // Both are Gameweek 1's, because Gameweek 1's Lock is what its Entrants
    // committed under — the Gameweek it was eventually played in says nothing
    // about what they knew.
    expect(await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))
      .toMatchObject({ value: 10, n: 2 });
    expect(await storedValue("entrant/a", 2, MATCH_POINTS_METRIC)).toBeNull();
  });

  test("stores the per-Fixture breakdown and the ranking qualification", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/b", 1, 3, 2);

    await score(1);

    expect((await storedValue("entrant/b", 1, MATCH_POINTS_METRIC))?.detail)
      .toEqual({
        qualification: MATCH_POINTS_QUALIFICATION,
        fixtures: [
          {
            fplId: 1,
            predicted: [3, 2],
            result: [2, 1],
            outcome: "H",
            points: 3
          }
        ]
      });
    // Both sides of each fraction, so the row says which Fixture was in its
    // denominator rather than only how many were.
    expect((await storedValue("entrant/b", 1, SCORE_PCT_METRIC))?.detail)
      .toEqual({ hits: [], misses: [1] });
    expect((await storedValue("entrant/b", 1, OUTCOME_PCT_METRIC))?.detail)
      .toEqual({ hits: [1], misses: [] });
  });

  test("stores the Season through the same Gameweek beside it", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 1, 1);

    await score(1);
    await score(2);

    // Gameweek 2's own row is the 3 it earned; the snapshot beside it is the
    // Season's 8 over both Fixtures.
    expect(await storedValue("entrant/a", 2, MATCH_POINTS_METRIC))
      .toMatchObject({ value: 3, n: 1 });
    expect(await storedValue("entrant/a", 2, MATCH_POINTS_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 8, n: 2 });
    expect(await storedValue("entrant/a", 2, SCORE_PCT_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    expect(await storedValue("entrant/a", 2, OUTCOME_PCT_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 1, n: 2 });
    expect(await storedValue("entrant/a", 1, MATCH_POINTS_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 5, n: 1 });
    // Grouped by Gameweek and traced to the Fixture, so the snapshot answers
    // where its 8 came from without a join back to the Gameweek rows.
    expect((await storedValue(
      "entrant/a", 2, MATCH_POINTS_SEASON_TO_DATE_METRIC
    ))?.detail).toEqual({
      qualification: MATCH_POINTS_QUALIFICATION,
      gameweeks: [
        {
          gw: 1,
          n: 1,
          points: 5,
          fixtures: [
            { fplId: 1, predicted: [2, 1], result: [2, 1], outcome: "H", points: 5 }
          ]
        },
        {
          gw: 2,
          n: 1,
          points: 3,
          fixtures: [
            { fplId: 2, predicted: [1, 1], result: [0, 0], outcome: "D", points: 3 }
          ]
        }
      ]
    });
    expect((await storedValue(
      "entrant/a", 2, SCORE_PCT_SEASON_TO_DATE_METRIC
    ))?.detail).toEqual({
      gameweeks: [
        { gw: 1, n: 1, hits: [1], misses: [] },
        { gw: 2, n: 1, hits: [], misses: [2] }
      ]
    });
  });

  test("recomputes later snapshots when an earlier result is corrected", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 1, 1);
    await score(1);
    await score(2);

    // The Home win is overturned to a 1-1 draw: the exact 2-1 becomes a miss,
    // so Gameweek 1 falls to 0 and the Season through Gameweek 2 to the 3 the
    // second Fixture earned.
    await settle(1, 1, 1);
    await score(1, CORRECTED_AT);

    expect(await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))
      .toMatchObject({ value: 0, n: 1 });
    expect(await storedValue("entrant/a", 2, MATCH_POINTS_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 3, n: 2 });
    expect(await storedValue("entrant/a", 2, SCORE_PCT_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 0, n: 2 });

    // The second ranking tracks the correction under the same gate: against the
    // 1-1 the 2-1 loses the Home win and over 2.5 on a total of two, and keeps
    // under 3.5, under 4.5 and BTTS yes — three where it had five.
    expect(await storedValue("entrant/a", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 3, n: 1 });

    // The corrected figure carries when it was arrived at, not when the figure
    // it replaced was — and the Gameweek 2 row the correction did not move
    // still carries the run that did compute it.
    expect((await storedValue("entrant/a", 1, MATCH_POINTS_METRIC))?.scoredAt)
      .toEqual(CORRECTED_AT);
    expect((await storedValue("entrant/a", 2, MATCH_POINTS_METRIC))?.scoredAt)
      .toEqual(SCORED_AT);
  });

  test("re-running over the same stored rows changes nothing", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    for (const id of ENTRANTS) {
      await predict(id, 1, 2, 1);
    }
    await score(1);
    const first = await client.query(
      "select * from scores order by model_id, metric"
    );

    await score(1);

    const second = await client.query(
      "select * from scores order by model_id, metric"
    );
    // `scored_at` included: an upsert that touched it would make every re-run
    // look like a new result.
    expect(second.rows).toEqual(first.rows);
  });

  /**
   * One distribution used across the probability tests, so every expected
   * figure below can be checked against it by hand.
   */
  const PROBS: Probs = { H: 0.6, D: 0.25, A: 0.15 };

  test("computes RPS and Brier against hand-computed values", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await settle(2, 0, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 2, 1, PROBS);

    await score(1);

    // Home win, so the outcome vector is [1, 0, 0].
    //   Brier = 0.4² + 0.25² + 0.15²                     = 0.245
    //   RPS   = ((0.6 − 1)² + (0.85 − 1)²) / 2           = 0.09125
    // Away win, so it is [0, 0, 1].
    //   Brier = 0.6² + 0.25² + 0.85²                     = 1.145
    //   RPS   = ((0.6 − 0)² + (0.85 − 0)²) / 2           = 0.54125
    // Both means over the two Fixtures.
    expect((await storedValue("entrant/a", 1, RPS_METRIC))?.value)
      .toBeCloseTo(0.31625, 12);
    expect((await storedValue("entrant/a", 1, BRIER_METRIC))?.value)
      .toBeCloseTo(0.695, 12);
    expect(await storedValue("entrant/a", 1, RPS_METRIC))
      .toMatchObject({ n: 2 });
  });

  test("stores Brier unnormalised, so halving it would fail", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);

    await score(1);

    // The pinned convention is Σ(p − o)² over all three outcomes, range [0, 2].
    // The common halved variant would store 0.1225 here.
    expect((await storedValue("entrant/a", 1, BRIER_METRIC))?.value)
      .toBeCloseTo(0.245, 12);
  });

  test("reads accuracy off the probability argmax", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await settle(2, 0, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 2, 1, PROBS);

    await score(1);

    // Home is likeliest on both; the Home win agrees and the Away win does not.
    expect(await storedValue("entrant/a", 1, ACCURACY_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    // The distribution and the outcome it called likeliest travel with the
    // row: nothing else stored says why a Fixture fell on the side it did.
    expect((await storedValue("entrant/a", 1, ACCURACY_METRIC))?.detail)
      .toEqual({
        hits: [{ fplId: 1, probs: PROBS, likeliest: "H", outcome: "H" }],
        misses: [{ fplId: 2, probs: PROBS, likeliest: "H", outcome: "A" }]
      });
  });

  test("reads Coherence off the Predicted Score, not the result", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 0, 1);
    await settle(2, 0, 1);
    // Home is likeliest on both. The first names a Home scoreline and agrees
    // with itself; the second names an Away one and does not. Both lost to the
    // same Away win, which Coherence has no opinion about.
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 1, 2, PROBS);

    await score(1);

    expect(await storedValue("entrant/a", 1, COHERENCE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    // The Predicted Score travels with it rather than the outcome, because
    // that is the half of the comparison Coherence actually made.
    expect((await storedValue("entrant/a", 1, COHERENCE_METRIC))?.detail)
      .toEqual({
        hits: [{ fplId: 1, probs: PROBS, likeliest: "H", predicted: [2, 1] }],
        misses: [{ fplId: 2, probs: PROBS, likeliest: "H", predicted: [1, 2] }]
      });
  });

  test("breaks a tied maximum by canonical H, D, A order", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    // 0.40 / 0.40 / 0.20 is Home, not Draw: the rule is arbitrary and pinned,
    // so a Home win is a hit and a 1-1 Predicted Score is incoherent.
    await predict("entrant/a", 1, 1, 1, { H: 0.4, D: 0.4, A: 0.2 });

    await score(1);

    expect(await storedValue("entrant/a", 1, ACCURACY_METRIC))
      .toMatchObject({ value: 1, n: 1 });
    expect(await storedValue("entrant/a", 1, COHERENCE_METRIC))
      .toMatchObject({ value: 0, n: 1 });
  });

  test("counts an unsettled Fixture in Coherence but no outcome metric", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 1, 2, PROBS);

    await score(1);

    // RPS, Brier and accuracy need an outcome, so the unplayed Fixture is
    // absent from them rather than counted as a failure. Coherence needs only
    // the Prediction, so it reads both — and the incoherent one is a miss.
    expect(await storedValue("entrant/a", 1, RPS_METRIC))
      .toMatchObject({ n: 1 });
    expect(await storedValue("entrant/a", 1, ACCURACY_METRIC))
      .toMatchObject({ value: 1, n: 1 });
    expect(await storedValue("entrant/a", 1, COHERENCE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
  });

  test("stores per-Fixture probability detail beside every aggregate", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);

    await score(1);

    expect((await storedValue("entrant/a", 1, RPS_METRIC))?.detail).toEqual({
      fixtures: [
        { fplId: 1, probs: PROBS, outcome: "H", rps: expect.closeTo(0.09125, 12) }
      ]
    });
    expect((await storedValue("entrant/a", 1, BRIER_METRIC))?.detail).toEqual({
      fixtures: [
        { fplId: 1, probs: PROBS, outcome: "H", brier: expect.closeTo(0.245, 12) }
      ]
    });
  });

  test("stores probability snapshots through the same Gameweek", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 1, 2, PROBS);

    await score(1);
    await score(2);

    // Gameweek 2's own Brier is the Away win's 1.145; the snapshot beside it is
    // the mean of that and Gameweek 1's 0.245.
    expect((await storedValue("entrant/a", 2, BRIER_METRIC))?.value)
      .toBeCloseTo(1.145, 12);
    expect((await storedValue(
      "entrant/a", 2, BRIER_SEASON_TO_DATE_METRIC
    ))?.value).toBeCloseTo(0.695, 12);
    expect((await storedValue(
      "entrant/a", 2, RPS_SEASON_TO_DATE_METRIC
    ))?.value).toBeCloseTo(0.31625, 12);
    // Home was likeliest on both, and only the Home win settled.
    expect(await storedValue("entrant/a", 2, ACCURACY_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    // The Away-win Fixture was named 1-2 under a Home-likeliest distribution,
    // so one of the Season's two Predictions is coherent.
    expect(await storedValue("entrant/a", 2, COHERENCE_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    expect((await storedValue(
      "entrant/a", 2, RPS_SEASON_TO_DATE_METRIC
    ))?.detail).toEqual({
      gameweeks: [
        {
          gw: 1,
          n: 1,
          mean: expect.closeTo(0.09125, 12),
          fixtures: [
            {
              fplId: 1,
              probs: PROBS,
              outcome: "H",
              rps: expect.closeTo(0.09125, 12)
            }
          ]
        },
        {
          gw: 2,
          n: 1,
          mean: expect.closeTo(0.54125, 12),
          fixtures: [
            {
              fplId: 2,
              probs: PROBS,
              outcome: "A",
              rps: expect.closeTo(0.54125, 12)
            }
          ]
        }
      ]
    });
  });

  test("recomputes probability snapshots when a result is corrected", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 1);
    await predict("entrant/a", 1, 2, 1, PROBS);
    await predict("entrant/a", 2, 1, 2, PROBS);
    await score(1);
    await score(2);

    // Gameweek 1's Home win is overturned to an Away win, so both Fixtures now
    // score the Away 0.54125 and the snapshot moves with them.
    await settle(1, 0, 1);
    await score(1, CORRECTED_AT);

    expect((await storedValue("entrant/a", 1, RPS_METRIC))?.value)
      .toBeCloseTo(0.54125, 12);
    expect((await storedValue(
      "entrant/a", 2, RPS_SEASON_TO_DATE_METRIC
    ))?.value).toBeCloseTo(0.54125, 12);
    // Coherence reads the Prediction, so a corrected result cannot move it.
    expect(await storedValue("entrant/a", 2, COHERENCE_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2, scoredAt: SCORED_AT });
  });

  /** One Entrant's Predicted Score and probabilities for one Fixture. */
  type Prediction = [home: number, away: number, probs: Probs];

  /**
   * Two settled Gameweek 1 Fixtures every Entrant predicted — a 2-1 Home win
   * and a 0-0 draw — with every figure below computed by hand from these.
   *
   * The normalised RPS is the mean of its two cumulative terms, so a Home
   * result scores `((H − 1)² + A²) / 2` and a Draw `(H² + A²) / 2`, which is
   * all the arithmetic any of these expectations needs:
   *
   * | Entrant | points | RPS F1 | RPS F2 | difference F1 | difference F2 |
   * |---|---|---|---|---|---|
   * | a | 10 | 0.10  | 0.04   | anchor  | anchor   |
   * | b | 6  | 0.20  | 0.065  | 0.10    | 0.025    |
   * | c | 0  | 0.50  | 0.20   | 0.40    | 0.16     |
   * | d | 5  | 0.145 | 0.0625 | 0.045   | 0.0225   |
   */
  const COMPARISON_SCENARIO: Record<string, [Prediction, Prediction]> = {
    "entrant/a": [
      [2, 1, { H: 0.6, D: 0.2, A: 0.2 }],
      [0, 0, { H: 0.2, D: 0.6, A: 0.2 }]
    ],
    "entrant/b": [
      [1, 0, { H: 0.4, D: 0.4, A: 0.2 }],
      [1, 1, { H: 0.3, D: 0.5, A: 0.2 }]
    ],
    "entrant/c": [
      [0, 1, { H: 0.2, D: 0.2, A: 0.6 }],
      [2, 0, { H: 0.6, D: 0.2, A: 0.2 }]
    ],
    "entrant/d": [
      [3, 1, { H: 0.5, D: 0.3, A: 0.2 }],
      [1, 1, { H: 0.25, D: 0.5, A: 0.25 }]
    ]
  };

  const seedComparisons = async (
    scenario: Record<string, [Prediction, Prediction]> = COMPARISON_SCENARIO
  ): Promise<void> => {
    await storeFixture(1, 1);
    // Deferred: locked in Gameweek 1 and played in Gameweek 2, so every figure
    // below is also a statement that a comparison follows the Lock rather than
    // the calendar. Nothing in the arithmetic moves, which is the point.
    await storeFixture(2, 1, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    for (const [entrantId, named] of Object.entries(scenario)) {
      for (const [index, [home, away, probs]] of named.entries()) {
        await predict(entrantId, index + 1, home, away, probs);
      }
    }
  };

  const comparisons = async (
    gameweek: number
  ): Promise<{ model_id: string; detail: PairedDifferenceDetail }[]> => {
    const stored = await client.query<{
      model_id: string;
      detail: PairedDifferenceDetail;
    }>(
      `select model_id, detail from scores
        where season = $1 and gw = $2 and track = 'match' and metric = $3
        order by model_id`,
      [SEASON, gameweek, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC]
    );
    return stored.rows;
  };

  test("publishes a hand-computed Paired Difference against the anchor", async () => {
    await seedComparisons();

    await score(1);

    // Entrant a leads on Match Points with 10, so it is the anchor and has no
    // row of its own; every other Entrant of the Season roster has one.
    expect((await comparisons(1)).map(({ model_id }) => model_id))
      .toEqual(["entrant/b", "entrant/c", "entrant/d"]);

    const stored = await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    // The mean of the two Fixture-by-Fixture differences, not the difference of
    // the two means — they coincide on a complete case, but the detail below is
    // what says which one was formed.
    expect(stored?.value).toBeCloseTo(0.0625, 12);
    expect(stored?.n).toBe(2);
    expect(stored?.detail).toMatchObject({
      anchor: "entrant/a",
      entrant: "entrant/b",
      fixtures: [
        {
          gw: 1,
          fplId: 1,
          anchorRps: expect.closeTo(0.1, 12),
          entrantRps: expect.closeTo(0.2, 12),
          difference: expect.closeTo(0.1, 12)
        },
        {
          gw: 1,
          fplId: 2,
          anchorRps: expect.closeTo(0.04, 12),
          entrantRps: expect.closeTo(0.065, 12),
          difference: expect.closeTo(0.025, 12)
        }
      ]
    });

    // Positive is the Entrant scoring worse than the anchor: RPS is a loss, so
    // the sign says the anchor forecast these two Fixtures better.
    expect((await storedValue(
      "entrant/c", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    ))?.value).toBeCloseTo(0.28, 12);
    expect((await storedValue(
      "entrant/d", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    ))?.value).toBeCloseTo(0.03375, 12);
  });

  test("drops a Fixture one retained Entrant Gapped from every comparison", async () => {
    await seedComparisons();
    // A third Fixture that a, b and c all predicted, and predicted wildly
    // differently — 0.9 against the result would move any comparison including
    // it. Entrant d Gapped it, so the complete case is the first two Fixtures
    // and no published comparison may use it, not even one between Entrants
    // that both answered.
    await storeFixture(3, 1);
    await settle(3, 5, 0);
    await predict("entrant/a", 3, 5, 0, { H: 0.9, D: 0.05, A: 0.05 });
    await predict("entrant/b", 3, 0, 5, { H: 0.05, D: 0.05, A: 0.9 });
    await predict("entrant/c", 3, 1, 1, { H: 0.05, D: 0.9, A: 0.05 });

    await score(1);

    const stored = await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    expect(stored?.value).toBeCloseTo(0.0625, 12);
    expect(stored?.n).toBe(2);
    // Every published comparison, not only the one that happens to be read
    // first: the Fixture leaves the complete case, so it leaves all of them.
    for (const { detail } of await comparisons(1)) {
      expect(detail.fixtures.map(({ fplId }) => fplId)).toEqual([1, 2]);
    }
  });

  test("publishes nothing when a retained Entrant predicted nothing", async () => {
    await seedComparisons();
    await score(1);
    expect(await comparisons(1)).toHaveLength(3);

    // A ninth Entrant joins the roster having answered nothing. The complete
    // case is now empty, so the whole declared set goes rather than being
    // republished over the Fixtures the silent Entrant happens not to have
    // touched — that would be the pairwise deletion ADR-0011 rejects, and the
    // published rows would no longer mean what they say.
    await client.query(
      `insert into models (id, name, base_model, provider, prompt_version, role)
       values ('entrant/e', 'E', 'provider/base-model', 'provider', $1,
               'entrant')`,
      [MATCH_PROMPT_VERSION]
    );
    await score(1, CORRECTED_AT);

    expect(await comparisons(1)).toEqual([]);
  });

  test("keeps a Reference Line out of the complete-case intersection", async () => {
    await client.query(
      `insert into models (id, name, base_model, provider, prompt_version, role)
       values ('reference-home', 'Home', 'home', 'none', $1, 'reference')`,
      [MATCH_PROMPT_VERSION]
    );
    await seedComparisons();

    await score(1);

    // A Reference Line writes no Prediction, so requiring one of every `models`
    // row would empty every complete case the Season ever has.
    expect(await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toMatchObject({ n: 2 });
    expect(await storedValue(
      "reference-home", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toBeNull();
  });

  test("keeps an FPL seat out of the complete-case intersection", async () => {
    await client.query(
      `insert into models (id, name, base_model, provider, prompt_version, role)
       values ('fpl/a', 'A', 'provider/base-model', 'provider', $1, 'entrant')`,
      [FPL_PROMPT_VERSION]
    );
    await seedComparisons();

    await score(1);

    // An FPL seat holds the `entrant` role and writes no Match Prediction, so a
    // roster read off the role alone would carry nine of them and empty every
    // complete case the Season has. What separates the two tracks' seats is the
    // Prompt Version, here as it is everywhere else that asks who was asked.
    expect(await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toMatchObject({ n: 2 });
    expect(await storedValue(
      "fpl/a", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toBeNull();
  });

  test("leaves no row against a former anchor when the anchor changes", async () => {
    await seedComparisons();
    await score(1);
    expect((await comparisons(1)).map(({ model_id }) => model_id))
      .toEqual(["entrant/b", "entrant/c", "entrant/d"]);

    // The Home win is corrected to a 0-1 Away win. Entrant a's exact scoreline
    // becomes a miss and c's becomes exact: both hold 5 Match Points, and c
    // takes the anchor on the lower RPS through Gameweek 1 — 0.15 against a's
    // 0.27.
    await settle(1, 0, 1);
    await score(1, CORRECTED_AT);

    const republished = await comparisons(1);
    expect(republished.map(({ model_id }) => model_id))
      .toEqual(["entrant/a", "entrant/b", "entrant/d"]);
    // Every surviving row names the new anchor: a set in which one row still
    // pointed at the old one would be three comparisons against two references
    // rather than the one declared set the snapshot publishes.
    expect(republished.map(({ detail }) => detail.anchor))
      .toEqual(["entrant/c", "entrant/c", "entrant/c"]);
    const stored = await storedValue(
      "entrant/a", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    // a is now worse on the corrected Fixture by 0.40 and better on the drawn
    // one by 0.16, so the mean stays positive at 0.12.
    expect(stored?.value).toBeCloseTo(0.12, 12);
  });

  test("selects each snapshot's anchor from its own Gameweeks alone", async () => {
    await seedComparisons();
    // Two Gameweek 2 Fixtures that entrant/d wins outright, taking it to 15
    // Match Points against entrant/a's 10. Everyone predicts both, so the
    // Gameweek 2 complete case is all four Fixtures.
    for (const fplId of [3, 4]) {
      await storeFixture(fplId, 2);
      await settle(fplId, 1, 0);
      await predict("entrant/a", fplId, 3, 3);
      await predict("entrant/b", fplId, 0, 2);
      await predict("entrant/c", fplId, 0, 2);
      await predict("entrant/d", fplId, 1, 0);
    }

    await score(1);
    await score(2);

    // The Gameweek 1 snapshot keeps the anchor its own Fixtures chose. A later
    // Gameweek is not evidence about what the Season looked like through this
    // one, and a snapshot that moved with it would stop being a snapshot.
    expect((await comparisons(1)).map(({ model_id }) => model_id))
      .toEqual(["entrant/b", "entrant/c", "entrant/d"]);
    expect(await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toMatchObject({ n: 2 });

    // Through Gameweek 2 the anchor is entrant/d, and every Entrant is paired
    // with it over all four Fixtures. All four Gameweek 2 Predictions share one
    // distribution, so they contribute nothing to any difference: entrant/a's
    // mean is the two Gameweek 1 differences of −0.045 and −0.0225 over four
    // Fixtures — better than the anchor on the evidence while behind it on the
    // readable rank, which is the separation the two layers exist to keep.
    const stored = await storedValue(
      "entrant/a", 2, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    expect(stored?.detail).toMatchObject({ anchor: "entrant/d" });
    expect(stored?.n).toBe(4);
    expect(stored?.value).toBeCloseTo(-0.016875, 12);
    expect(await storedValue(
      "entrant/d", 2, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    )).toBeNull();
  });

  test("stores an interval spanning zero as a qualified result", async () => {
    await seedComparisons({
      ...COMPARISON_SCENARIO,
      // Better than the anchor on the Home win by 0.075 and worse on the draw
      // by 0.105: the two differences straddle zero, so the percentile interval
      // must too.
      "entrant/b": [
        [1, 0, { H: 0.8, D: 0.1, A: 0.1 }],
        [1, 1, { H: 0.5, D: 0.3, A: 0.2 }]
      ]
    });

    await score(1);

    const stored = await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    expect(stored?.value).toBeCloseTo(0.015, 12);
    const detail = stored?.detail as PairedDifferenceDetail;
    expect(detail.interval.low).toBeLessThan(0);
    expect(detail.interval.high).toBeGreaterThan(0);
    // Not a failure and not an omission: the row is stored, marked, and carries
    // the reminder that no Positive Control exists to tell a genuinely close
    // pair from a setup that resolves nothing.
    expect(detail.qualification).toBe(NO_POSITIVE_CONTROL_QUALIFICATION);
  });

  test("bounds the interval by the resampled differences", async () => {
    await seedComparisons();

    await score(1);

    const detail = (await storedValue(
      "entrant/b", 1, RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    ))?.detail as PairedDifferenceDetail;
    // Every resample's mean lies between the smallest and the largest of the
    // Fixture differences, so a percentile interval that escaped them would be
    // reading something other than its own inputs.
    expect(detail.interval.low).toBeGreaterThan(0.024);
    expect(detail.interval.high).toBeLessThan(0.101);
    expect(detail.interval).toMatchObject({
      level: 0.95,
      resamples: 10_000,
      method: "percentile"
    });
    // Wholly above zero, so it carries no qualification: the reminder belongs
    // to an interval that spans it, not to every comparison published.
    expect(detail.qualification).toBeUndefined();
  });

  test("produces a byte-identical interval on a separate invocation", async () => {
    await seedComparisons();
    await score(1);
    const first = await comparisons(1);

    // Not a re-run over stored rows — the rows are gone and the whole
    // comparison is computed again from the Predictions. The seed comes from
    // the differences themselves, so no injected generator decides this.
    await client.query("delete from scores");
    await score(1, CORRECTED_AT);

    expect((await comparisons(1)).map(({ detail }) => JSON.stringify(detail)))
      .toEqual(first.map(({ detail }) => JSON.stringify(detail)));
  });

  /** No Gap of any cause: what a clean Entrant's breakdown looks like. */
  const NO_GAPS = {
    schema: 0,
    probs_sum: 0,
    refusal: 0,
    provider: 0,
    timeout: 0,
    rate_limit: 0,
    deadline: 0,
    unattempted: 0
  };

  test("reports no Gap for an Entrant that answered every Fixture", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 0, 0);

    await score(1);

    expect(await storedValue("entrant/a", 1, GAP_RATE_METRIC))
      .toMatchObject({ value: 0, n: 2, detail: { causes: NO_GAPS, gaps: [] } });
  });

  test("counts each Gap under the cause its last failed attempt recorded", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await predict("entrant/a", 1, 2, 1);
    // Two failures on the same Fixture. The Repair was asked for after the
    // provider came back, so `schema` is what the Gap is finally down to and
    // `provider` is what it survived on the way — the last failure is the
    // cause, and both are attempts.
    await attempt("entrant/a", 2, 1, "provider");
    await attempt("entrant/a", 2, 1, "schema");

    await score(1);

    expect(await storedValue("entrant/a", 1, GAP_RATE_METRIC)).toMatchObject({
      value: 0.5,
      n: 2,
      detail: {
        causes: { ...NO_GAPS, schema: 1 },
        gaps: [{ fplId: 2, cause: "schema", attempts: 2 }]
      }
    });
  });

  test("separates mixed causes within one Entrant's Gameweek", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await storeFixture(3, 1);
    await attempt("entrant/a", 1, 1, "refusal");
    await attempt("entrant/a", 2, 1, "deadline");
    // Nothing was ever asked of this Entrant on Fixture 3 — the run did not
    // reach it. The absence is a Gap like any other and cannot be filed under
    // a stored cause, because there is no attempt row to read one off.
    await score(1);

    expect(await storedValue("entrant/a", 1, GAP_RATE_METRIC)).toMatchObject({
      value: 1,
      n: 3,
      detail: {
        causes: { ...NO_GAPS, refusal: 1, deadline: 1, unattempted: 1 },
        gaps: [
          { fplId: 1, cause: "refusal", attempts: 1 },
          { fplId: 2, cause: "deadline", attempts: 1 },
          { fplId: 3, cause: "unattempted", attempts: 0 }
        ]
      }
    });
  });

  test("reports a Gap rate for an Entrant with no successful Prediction", async () => {
    await storeFixture(1, 1);
    await predict("entrant/a", 1, 2, 1);
    await attempt("entrant/b", 1, 1, "timeout");

    await score(1);

    // The readable layer writes this Entrant no row at all, since a share over
    // no Fixture is not zero. `gap_rate` is the row that says it was absent
    // rather than wrong, so it is written precisely when the others are not.
    expect(await storedValue("entrant/b", 1, MATCH_POINTS_METRIC)).toBeNull();
    expect(await storedValue("entrant/b", 1, GAP_RATE_METRIC))
      .toMatchObject({ value: 1, n: 1 });
  });

  test("counts Gaps over the Fixtures the Lock owns, settled or not", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 0, 0);
    await attempt("entrant/b", 2, 1, "rate_limit");
    await predict("entrant/b", 1, 2, 1);

    await score(1);

    // Whether a Fixture has been played says nothing about whether an Entrant
    // answered it, so both Fixtures are in both denominators. A behavioural
    // metric is answerable the moment the Lock passes.
    expect(await storedValue("entrant/a", 1, GAP_RATE_METRIC))
      .toMatchObject({ value: 0, n: 2 });
    expect(await storedValue("entrant/b", 1, GAP_RATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
  });

  test("accumulates the Gap rate over the Gameweeks before it", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await storeFixture(3, 2);
    await storeFixture(4, 2);
    for (const fplId of [1, 2, 3]) {
      await predict("entrant/a", fplId, 2, 1);
    }
    await attempt("entrant/a", 4, 2, "provider");

    await score(1);
    await score(2);

    expect(await storedValue("entrant/a", 2, GAP_RATE_METRIC))
      .toMatchObject({ value: 0.5, n: 2 });
    // One Gap in four Fixtures across the two Gameweeks, and the shape over
    // them: the Season figure alone cannot tell a Gameweek that failed
    // entirely from a Gap in each of two.
    expect(await storedValue("entrant/a", 2, GAP_RATE_SEASON_TO_DATE_METRIC))
      .toMatchObject({
        value: 0.25,
        n: 4,
        detail: {
          gameweeks: [
            { gw: 1, n: 2, causes: NO_GAPS, gaps: [] },
            {
              gw: 2,
              n: 2,
              causes: { ...NO_GAPS, provider: 1 },
              gaps: [{ fplId: 4, cause: "provider", attempts: 1 }]
            }
          ]
        }
      });
  });

  test("distributes attempts-to-valid over the Repairs each Prediction cost", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await storeFixture(3, 1);
    await storeFixture(4, 1);
    await predict("entrant/a", 1, 2, 1, undefined, 0);
    await predict("entrant/a", 2, 2, 1, undefined, 2);
    await attempt("entrant/a", 3, 1, "schema");
    // Fixture 4 was never asked of this Entrant at all.

    await score(1);

    // The distribution is over the four Fixtures the Lock owns, so `n` is four.
    // The mean is taken over the two that became valid: a Fixture that never
    // did has no number of Repairs that reached one. The other two are kept
    // apart — one spent its allowance and got nowhere, the other was never
    // asked, and folding them together would report a Base Model's failure
    // rate as double what it was.
    expect(await storedValue("entrant/a", 1, ATTEMPTS_TO_VALID_METRIC))
      .toMatchObject({
        value: 1,
        n: 4,
        detail: {
          distribution: {
            "0": 1,
            "1": 0,
            "2": 1,
            "3": 0,
            failed: 1,
            unattempted: 1
          },
          fixtures: [{ fplId: 1, repairs: 0 }, { fplId: 2, repairs: 2 }]
        }
      });
  });

  test("writes no attempts-to-valid row for an Entrant that never reached one", async () => {
    await storeFixture(1, 1);
    await predict("entrant/a", 1, 2, 1);
    await attempt("entrant/b", 1, 1, "refusal");

    await score(1);

    // A mean over no valid Prediction is not zero, and a stored zero would read
    // as an Entrant that answered first time every time — the exact opposite of
    // what happened. The Gap rate of 1 beside it is what says so.
    expect(await storedValue("entrant/b", 1, ATTEMPTS_TO_VALID_METRIC))
      .toBeNull();
    expect(await storedValue("entrant/b", 1, GAP_RATE_METRIC))
      .toMatchObject({ value: 1, n: 1 });
  });

  test("accumulates attempts-to-valid over the Gameweeks before it", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await storeFixture(3, 2);
    await predict("entrant/a", 1, 2, 1, undefined, 3);
    await predict("entrant/a", 2, 2, 1, undefined, 1);
    await attempt("entrant/a", 3, 2, "timeout");

    await score(1);
    await score(2);

    expect(await storedValue(
      "entrant/a", 2, ATTEMPTS_TO_VALID_SEASON_TO_DATE_METRIC
    )).toMatchObject({
      value: 2,
      n: 3,
      detail: {
        gameweeks: [
          {
            gw: 1,
            n: 1,
            distribution: {
              "0": 0, "1": 0, "2": 0, "3": 1, failed: 0, unattempted: 0
            },
            fixtures: [{ fplId: 1, repairs: 3 }]
          },
          {
            gw: 2,
            n: 2,
            distribution: {
              "0": 0, "1": 1, "2": 0, "3": 0, failed: 1, unattempted: 0
            },
            fixtures: [{ fplId: 2, repairs: 1 }]
          }
        ]
      }
    });
  });

  test("scores the Home Reference Line on a Fixture nobody predicted", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);

    await score(1);

    // `[0.44, 0.28, 0.28]` against a Home win. RPS counts the two cumulative
    // terms: (0.44 − 1)² + (0.72 − 1)², over two.
    expect(await storedValue(REFERENCE_HOME, 1, RPS_METRIC))
      .toMatchObject({ value: expect.closeTo(0.196, 12), n: 1 });
  });

  test("scores both Reference Lines on the same Away win", async () => {
    await storeFixture(1, 1);
    await settle(1, 0, 1);

    await score(1);

    // Home: cumulative 0.44 and 0.72 against 0 and 0, so (0.1936 + 0.5184) / 2;
    // Brier 0.44² + 0.28² + (0.28 − 1)².
    expect(await storedValue(REFERENCE_HOME, 1, RPS_METRIC))
      .toMatchObject({ value: expect.closeTo(0.356, 12), n: 1 });
    expect(await storedValue(REFERENCE_HOME, 1, BRIER_METRIC))
      .toMatchObject({ value: expect.closeTo(0.7904, 12), n: 1 });
    // Uniform: (1/9 + 4/9) / 2, and 4/9 + 1/9 + 1/9 unnormalised.
    expect(await storedValue(REFERENCE_UNIFORM, 1, RPS_METRIC))
      .toMatchObject({ value: expect.closeTo(5 / 18, 12), n: 1 });
    expect(await storedValue(REFERENCE_UNIFORM, 1, BRIER_METRIC))
      .toMatchObject({ value: expect.closeTo(2 / 3, 12), n: 1 });
    // Both call Home likeliest — the Uniform line by the pinned tie-break —
    // and both got this Fixture wrong.
    expect(await storedValue(REFERENCE_HOME, 1, ACCURACY_METRIC))
      .toMatchObject({ value: 0, n: 1 });
    expect(await storedValue(REFERENCE_UNIFORM, 1, ACCURACY_METRIC))
      .toMatchObject({ value: 0, n: 1 });
  });

  test("writes no scoreline or behavioural row for a Reference Line", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1);

    await score(1);

    // A Reference Line is not a competitor: it names no scoreline to be ranked
    // on — so neither readable ranking can hold it — and was never asked for a
    // Prediction it could Gap or Repair.
    for (const metric of [
      MATCH_POINTS_METRIC,
      BET_POINTS_METRIC,
      BET_HIT_PCT_METRIC,
      SCORE_PCT_METRIC,
      OUTCOME_PCT_METRIC,
      COHERENCE_METRIC,
      GAP_RATE_METRIC,
      ATTEMPTS_TO_VALID_METRIC
    ]) {
      expect(await storedValue(REFERENCE_HOME, 1, metric)).toBeNull();
    }

    // Its forecast is retained in the score's detail and nowhere else. A stored
    // Prediction would enter every query that asks who predicted a Fixture.
    const written = await client.query(
      "select 1 from predictions where model_id = $1", [REFERENCE_HOME]
    );
    expect(written.rowCount).toBe(0);
    expect((await storedValue(REFERENCE_HOME, 1, RPS_METRIC))?.detail).toEqual({
      fixtures: [
        {
          fplId: 1,
          probs: { H: 0.44, D: 0.28, A: 0.28 },
          outcome: "H",
          rps: expect.closeTo(0.196, 12)
        }
      ]
    });
  });

  /** Every row one Reference Line holds for one Gameweek, in a stable order. */
  const referenceRows = async (
    gameweek: number,
    line = REFERENCE_HOME
  ): Promise<unknown[]> => (
    await client.query(
      `select metric, value, n, detail
         from scores
        where model_id = $1 and season = $2 and gw = $3 and track = 'match'
        order by metric`,
      [line, SEASON, gameweek]
    )
  ).rows;

  test("back-fills a Reference Line into the cumulative snapshot", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 1);

    // The first Gameweek is never asked for, so the line covers it as back-fill
    // off the stored Fixtures rather than off having been scored at the time.
    await score(2);

    expect(await storedValue(REFERENCE_HOME, 2, RPS_METRIC))
      .toMatchObject({ value: expect.closeTo(0.356, 12), n: 1 });
    // The mean of 0.196 on the Home win and 0.356 on the Away win.
    expect(await storedValue(REFERENCE_HOME, 2, RPS_SEASON_TO_DATE_METRIC))
      .toMatchObject({
        value: expect.closeTo(0.276, 12),
        n: 2,
        detail: {
          gameweeks: [
            { gw: 1, n: 1, mean: expect.closeTo(0.196, 12) },
            { gw: 2, n: 1, mean: expect.closeTo(0.356, 12) }
          ]
        }
      });
  });

  test("scores a Reference Line the same in either batch shape", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 1);
    await settle(2, 0, 1);

    await score(2);
    const inOneRun = await referenceRows(2);

    await client.query("truncate scores");
    await score(1);
    await score(2);

    // A Gameweek at a time, which is how a live Season reaches them, against
    // one run that finds both Fixtures already stored. The Reference Lines are
    // a function of the Fixtures alone, so the two must not differ.
    expect(await referenceRows(2)).toEqual(inOneRun);
    expect(inOneRun).not.toHaveLength(0);
  });

  test("recomputes a Reference Line when a result is corrected", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);

    await score(1);
    // The Home win the line called was really an Away win: 0.196 becomes 0.356
    // without anyone having predicted anything differently.
    await settle(1, 0, 1);
    await score(1, CORRECTED_AT);

    expect(await storedValue(REFERENCE_HOME, 1, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.356, 12),
      scoredAt: CORRECTED_AT
    });
  });

  test("scores the Elo Reference Line from level ratings", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);

    await score(1);

    // Nothing stored says either side is better, so both sit at 1500 and only
    // the Home advantage separates them: d = 1500 + 60 − 1500 = 60, and
    // E = 1 / (1 + 10^(−60/400)) = 1 / 1.70794578438414 = 0.585498678671810.
    //
    // The mapping holds the draw at 0.28 and splits the rest off E = H + D/2:
    // H = E − 0.14 = 0.445498678671810, A = 1 − 0.28 − H = 0.274501321328190.
    //
    // Against the Home win, RPS counts the two cumulative terms:
    // ((0.445498678671810 − 1)² + (0.725498678671810 − 1)²) / 2
    //   = (0.307577... + 0.075245...) / 2 = 0.191411345382816.
    expect(await storedValue(REFERENCE_ELO, 1, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.191411345382816, 12),
      n: 1,
      detail: {
        fixtures: [
          {
            fplId: 1,
            probs: {
              H: expect.closeTo(0.445498678671810, 12),
              D: 0.28,
              A: expect.closeTo(0.274501321328190, 12)
            },
            outcome: "H",
            rps: expect.closeTo(0.191411345382816, 12)
          }
        ]
      }
    });
    // Brier over the same three, unnormalised: (0.445498678671810 − 1)²
    //   + 0.28² + 0.274501321328190² = 0.307568... + 0.0784 + 0.075351...
    expect(await storedValue(REFERENCE_ELO, 1, BRIER_METRIC)).toMatchObject({
      value: expect.closeTo(0.461222690765632, 12),
      n: 1
    });
    // Home is the likeliest of the three at 0.445498678671810, and Home won.
    expect(await storedValue(REFERENCE_ELO, 1, ACCURACY_METRIC))
      .toMatchObject({ value: 1, n: 1 });
  });

  /** One result the prior Season left behind, under the identity it is held by. */
  const played = (
    homeTeam: string,
    awayTeam: string,
    homeGoals: number,
    awayGoals: number,
    playedOn = "2026-05-10T14:00:00Z"
  ): Promise<unknown> =>
    client.query(
      `insert into historical_matches (
         season, division, played_on, home_team, away_team, home_goals,
         away_goals
       ) values ('2025-26', 'Premier League', $1, $2, $3, $4, $5)`,
      [playedOn, homeTeam, awayTeam, homeGoals, awayGoals]
    );

  test("seeds Elo ratings from the prior Season's results", async () => {
    // Stored history names clubs as football-data.co.uk does, and a Fixture
    // names them as FPL does. Tottenham is one of the clubs the two disagree
    // about, so a line that skipped the resolution would leave Spurs at 1500
    // and forecast this Fixture level.
    await played("Tottenham", "Everton", 3, 0);
    await storeFixture(1, 1, 1, { teams: ["Spurs", "Everton"] });
    await settle(1, 1, 1);

    await score(1);

    // Both sides began the prior Season at 1500, so Tottenham's home win was
    // worth K × (1 − E) = 20 × (1 − 0.585498678671810) = 8.29002642656381,
    // taking them to 1508.29002642656381 and Everton to 1491.70997357343619.
    //
    // This Season's Fixture is therefore forecast at
    // d = 1508.29002642656381 + 60 − 1491.70997357343619 = 76.58005285312762,
    // E = 1 / (1 + 10^(−76.58005285312762/400)) = 0.608456837835021,
    // so H = 0.468456837835021, D = 0.28, A = 0.251543162164979.
    //
    // Against the draw, RPS = (0.468456837835021² + (0.748456837835021 − 1)²)
    //   / 2 = (0.219451... + 0.063273...) / 2 = 0.141362885673172.
    expect(await storedValue(REFERENCE_ELO, 1, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.141362885673172, 12),
      n: 1,
      detail: {
        fixtures: [
          {
            fplId: 1,
            probs: {
              H: expect.closeTo(0.468456837835021, 12),
              D: 0.28,
              A: expect.closeTo(0.251543162164979, 12)
            }
          }
        ]
      }
    });
  });

  test("forecasts each Fixture from the ratings that stood before it", async () => {
    // The same two clubs twice in one Gameweek, the lower Fixture id kicking
    // off second. Ordering the replay by id rather than by kick-off would swap
    // the two forecasts below.
    await storeFixture(1, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T16:30:00Z"
    });
    await storeFixture(2, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T14:00:00Z"
    });
    await settle(1, 2, 1);
    await settle(2, 2, 1);

    await score(1);

    // Fixture 2 is played first with nothing behind it, so it is forecast level
    // at H = 0.445498678671810 and scores 0.191411345382816 on the Home win.
    //
    // Its result then moves Spurs to 1508.29002642656381 and Everton to
    // 1491.70997357343619, which is what Fixture 1 is forecast from:
    // H = 0.468456837835021, and RPS = ((0.468456837835021 − 1)²
    //   + (0.748456837835021 − 1)²) / 2 = 0.172906047838151.
    //
    // Fixture 1's own 2-1 reaches neither forecast. A result that could reach
    // its own would let the line score a Fixture it had already seen.
    expect(await storedValue(REFERENCE_ELO, 1, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.182158696610484, 12),
      n: 2,
      detail: {
        fixtures: [
          {
            fplId: 1,
            probs: { H: expect.closeTo(0.468456837835021, 12) },
            rps: expect.closeTo(0.172906047838151, 12)
          },
          {
            fplId: 2,
            probs: { H: expect.closeTo(0.445498678671810, 12) },
            rps: expect.closeTo(0.191411345382816, 12)
          }
        ]
      }
    });
  });

  test("keeps the Elo line off the leaderboard and out of the roster", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/b", 1, 1, 1);

    await score(1);

    // A rating is not a scoreline, so there is nothing for the readable layer
    // to rank; and the line was never asked, so there is nothing to Gap or
    // Repair. It is no Entrant either, so no comparison is published for it and
    // its silence can never empty a complete case.
    for (const metric of [
      MATCH_POINTS_METRIC,
      SCORE_PCT_METRIC,
      OUTCOME_PCT_METRIC,
      COHERENCE_METRIC,
      GAP_RATE_METRIC,
      ATTEMPTS_TO_VALID_METRIC,
      RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    ]) {
      expect(await storedValue(REFERENCE_ELO, 1, metric)).toBeNull();
    }
    expect(await storedValue(REFERENCE_ELO, 1, RPS_METRIC)).not.toBeNull();

    const written = await client.query(
      "select 1 from predictions where model_id = $1", [REFERENCE_ELO]
    );
    expect(written.rowCount).toBe(0);

    // The role is what every roster query reads, so a row carrying `entrant`
    // here would put the line on the leaderboard with nothing to say so.
    const model = await client.query<{ role: string }>(
      "select role from models where id = $1", [REFERENCE_ELO]
    );
    expect(model.rows[0]?.role).toBe("reference");
  });

  test("recomputes downstream Elo forecasts when an earlier result is corrected", async () => {
    await storeFixture(1, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T14:00:00Z"
    });
    await storeFixture(2, 2, 2, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-29T14:00:00Z"
    });
    await settle(1, 2, 1);
    await settle(2, 1, 1);

    await score(2);

    // Gameweek 1's Home win put Spurs on 1508.29002642656381 and Everton on
    // 1491.70997357343619, so Gameweek 2 is forecast at H = 0.468456837835021
    // and scores 0.141362885673172 on the draw.
    expect(await storedValue(REFERENCE_ELO, 2, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.141362885673172, 12),
      n: 1
    });

    await settle(1, 0, 1);
    await score(2, CORRECTED_AT);

    // The same Fixture was really an Away win, so K × (0 − 0.585498678671810)
    // = −11.70997357343619 leaves Spurs on 1488.29002642656381 and Everton on
    // 1511.70997357343619. Gameweek 2 is then forecast at d = 36.58005285312762,
    // E = 0.552449268825046 and H = 0.412449268825046, scoring
    // (0.412449268825046² + (0.692449268825046 − 1)²) / 2 = 0.132350925800282.
    //
    // Nobody predicted differently and Gameweek 2's own result did not change:
    // the replay is what carries the correction forward.
    expect(await storedValue(REFERENCE_ELO, 2, RPS_METRIC)).toMatchObject({
      value: expect.closeTo(0.132350925800282, 12),
      n: 1,
      scoredAt: CORRECTED_AT
    });
  });

  test("replays the same Elo path in either batch shape", async () => {
    await played("Tottenham", "Everton", 3, 0);
    await storeFixture(1, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T14:00:00Z"
    });
    await storeFixture(2, 2, 2, {
      teams: ["Everton", "Spurs"],
      kickoff: "2026-08-29T14:00:00Z"
    });
    await settle(1, 2, 1);
    await settle(2, 0, 2);

    await score(2);
    const inOneRun = await referenceRows(2, REFERENCE_ELO);

    await client.query("truncate scores");
    await score(1);
    await score(2);

    // A Gameweek at a time, which is how a live Season reaches them, against
    // one run that finds both Fixtures already stored. The replay starts from
    // the prior Season either way and reads no state a run leaves behind, so a
    // Gameweek scored twice cannot move a rating twice.
    expect(await referenceRows(2, REFERENCE_ELO)).toEqual(inOneRun);
    expect(inOneRun).not.toHaveLength(0);
  });

  test("passes an unsettled Fixture over without moving a rating", async () => {
    // Played first and never settled, so the two below are forecast as though
    // it had not been played at all.
    await storeFixture(1, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T12:00:00Z"
    });
    await storeFixture(2, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T14:00:00Z"
    });
    await storeFixture(3, 1, 1, {
      teams: ["Spurs", "Everton"],
      kickoff: "2026-08-22T16:30:00Z"
    });
    await settle(2, 2, 1);
    await settle(3, 2, 1);

    await score(1);

    // Fixture 2 is still forecast level at H = 0.445498678671810: the unsettled
    // Fixture ahead of it moved nothing. Fixture 3 then reads Fixture 2's Home
    // win alone, at H = 0.468456837835021 — not two Home wins.
    //
    // The unsettled Fixture is absent from the row rather than a miss, which is
    // why n is 2 over three Fixtures.
    expect(await storedValue(REFERENCE_ELO, 1, RPS_METRIC)).toMatchObject({
      n: 2,
      detail: {
        fixtures: [
          { fplId: 2, probs: { H: expect.closeTo(0.445498678671810, 12) } },
          { fplId: 3, probs: { H: expect.closeTo(0.468456837835021, 12) } }
        ]
      }
    });
  });

  test("awards one point per winning leg of the Bet Slip", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1);
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    // Hand-computed against the two results. The 2-1 is a Home win totalling
    // three with both sides scoring; the 0-0 is a goalless draw.
    //
    // a on the 2-1 naming 2-1: Home, over 2.5, under 3.5, under 4.5, BTTS yes.
    //   Every leg the result settles — five.
    // b on the 0-0 naming 3-2: Home against a draw, over all three lines
    //   against a total of none, BTTS yes against neither side scoring — zero.
    // c on the 2-1 naming 0-0: the draw against a Home win, under 2.5 against
    //   three goals and BTTS no against both scoring all lose, but under 3.5
    //   and under 4.5 both land — two, the conservative slip collecting the
    //   high lines cheaply.
    // d on the 0-0 naming 1-1: the draw and all three unders land, BTTS yes
    //   against neither side scoring does not — four.
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/b", 2, 3, 2);
    await predict("entrant/c", 1, 0, 0);
    await predict("entrant/d", 2, 1, 1);

    await score(1);

    expect(await storedValue("entrant/a", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 5, n: 1 });
    expect(await storedValue("entrant/b", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 0, n: 1 });
    expect(await storedValue("entrant/c", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 2, n: 1 });
    expect(await storedValue("entrant/d", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 4, n: 1 });
  });

  test("stores every leg of every slip and the ranking qualification", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    await predict("entrant/c", 1, 0, 0);

    await score(1);

    // The conservative slip against the 2-1, leg by leg as a person reads it:
    // the draw lost, under 2.5 lost against three goals, the two higher unders
    // won, and BTTS no lost against both sides scoring.
    expect((await storedValue("entrant/c", 1, BET_POINTS_METRIC))?.detail)
      .toEqual({
        qualification: BET_POINTS_QUALIFICATION,
        fixtures: [
          {
            fplId: 1,
            predicted: [0, 0],
            result: [2, 1],
            slip: [
              { market: "result", position: "D", settled: "H", won: false },
              {
                market: "over_under_2.5",
                position: "under",
                settled: "over",
                won: false
              },
              {
                market: "over_under_3.5",
                position: "under",
                settled: "under",
                won: true
              },
              {
                market: "over_under_4.5",
                position: "under",
                settled: "under",
                won: true
              },
              { market: "btts", position: "no", settled: "yes", won: false }
            ]
          }
        ]
      });
  });

  test("settles the result leg by the scoreline, never by probs", async () => {
    await storeFixture(1, 1);
    await settle(1, 2, 1);
    // Incoherent on purpose: Home is likeliest under the probabilities and the
    // scoreline names an Away win. The slip is the scoreline's, so the result
    // leg loses against the Home win — reading the argmax would have won it and
    // made this slip a 3.
    await predict("entrant/a", 1, 0, 1, { H: 0.8, D: 0.1, A: 0.1 });

    await score(1);

    const stored = await storedValue("entrant/a", 1, BET_POINTS_METRIC);
    expect(stored).toMatchObject({ value: 2, n: 1 });
    expect((stored?.detail as BetSlipDetail).fixtures[0]?.slip[0])
      .toEqual({ market: "result", position: "A", settled: "H", won: false });
  });

  test("divides Bet hit % by the markets actually bet", async () => {
    for (const fplId of [1, 2, 3, 4]) {
      await storeFixture(fplId, 1);
    }
    await settle(1, 2, 1);
    await settle(2, 0, 0);
    // Fixture 3 is predicted and unplayed; Fixture 4 is settled and Gapped.
    await settle(4, 3, 1);
    await predict("entrant/a", 1, 0, 0);
    await predict("entrant/a", 2, 1, 1);
    await predict("entrant/a", 3, 2, 0);

    await score(1);

    // Two slips were placed, so ten markets were bet. The 0-0 against the 2-1
    // won the two high unders; the 1-1 against the 0-0 won everything but BTTS:
    // six of ten. Neither the Fixture with no result nor the Gap enters the
    // denominator — one absent slip would otherwise pull the rate down as if
    // its five markets had lost.
    expect(await storedValue("entrant/a", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 6, n: 2 });
    expect(await storedValue("entrant/a", 1, BET_HIT_PCT_METRIC)).toMatchObject({
      value: 0.6,
      n: 2,
      detail: {
        won: 6,
        bet: 10,
        markets: {
          result: 0.5,
          "over_under_2.5": 0.5,
          "over_under_3.5": 1,
          "over_under_4.5": 1,
          btts: 0
        }
      }
    });
  });

  test("folds a late-settling deferred slip into its locked Gameweek", async () => {
    await storeFixture(1, 1);
    await storeFixture(2, 1, 2);
    await storeFixture(3, 2);
    await settle(1, 2, 1);
    await settle(3, 0, 0);
    // The 2-1 named exactly is five legs; the 1-1 against the goalless draw
    // wins everything but BTTS, four. The deferred Fixture is unplayed for now.
    await predict("entrant/a", 1, 2, 1);
    await predict("entrant/a", 2, 1, 0);
    await predict("entrant/a", 3, 1, 1);
    await predict("entrant/b", 1, 2, 1);

    await score(1);
    await score(2);

    expect(await storedValue("entrant/a", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 5, n: 1 });
    expect(await storedValue(
      "entrant/a", 2, BET_POINTS_SEASON_TO_DATE_METRIC
    )).toMatchObject({ value: 9, n: 2 });

    // The deferred Fixture finishes 1-1 a Gameweek later. Against the 1-0 named
    // under Gameweek 1's Lock: the Home win loses and BTTS no loses, the three
    // unders all land on a total of two — three legs.
    await settle(2, 1, 1);
    await score(1, CORRECTED_AT);

    // Gameweek 1's own row gains it, because Gameweek 1's Lock is what it was
    // committed under, and the snapshot through Gameweek 2 gains it as well
    // rather than staying permanently short of it.
    expect(await storedValue("entrant/a", 1, BET_POINTS_METRIC))
      .toMatchObject({ value: 8, n: 2 });
    expect(await storedValue("entrant/a", 1, BET_HIT_PCT_METRIC))
      .toMatchObject({ value: 0.8, n: 2 });
    expect(await storedValue("entrant/a", 2, BET_POINTS_METRIC))
      .toMatchObject({ value: 4, n: 1 });
    expect(await storedValue(
      "entrant/a", 2, BET_POINTS_SEASON_TO_DATE_METRIC
    )).toMatchObject({
      value: 12,
      n: 3,
      detail: {
        gameweeks: [
          { gw: 1, n: 2, points: 8 },
          { gw: 2, n: 1, points: 4 }
        ]
      }
    });
    // Twelve winning legs of the fifteen the three slips stated.
    expect(await storedValue(
      "entrant/a", 2, BET_HIT_PCT_SEASON_TO_DATE_METRIC
    )).toMatchObject({ value: 0.8, n: 3, detail: { won: 12, bet: 15 } });

    // The Entrant that answered only Gameweek 1's first Fixture keeps the one
    // slip it placed: the Gap forfeits its five markets in the total silently,
    // and no row is invented for it.
    expect(await storedValue(
      "entrant/b", 2, BET_POINTS_SEASON_TO_DATE_METRIC
    )).toMatchObject({ value: 5, n: 1 });
  });

  test("settles integer totals against the .5 lines with no push", async () => {
    // One Fixture either side of each line, named exactly: totals of 2, 3, 4
    // and 5 goals. Every line is a half, so each total falls strictly on one
    // side of each of them and a slip naming the total exactly wins all five
    // legs — 20 Bet Points over the four Fixtures, with no third position for a
    // push to be reported under.
    const totals: [number, [number, number], string[]][] = [
      [1, [1, 1], ["under", "under", "under"]],
      [2, [2, 1], ["over", "under", "under"]],
      [3, [2, 2], ["over", "over", "under"]],
      [4, [3, 2], ["over", "over", "over"]]
    ];
    for (const [fplId, [home, away]] of totals) {
      await storeFixture(fplId, 1);
      await settle(fplId, home, away);
      await predict("entrant/a", fplId, home, away);
    }

    await score(1);

    const stored = await storedValue("entrant/a", 1, BET_POINTS_METRIC);
    expect(stored).toMatchObject({ value: 20, n: 4 });
    expect((stored?.detail as BetSlipDetail).fixtures.map(({ slip }) =>
      slip.filter(({ market }) => market.startsWith("over_under"))
        .map(({ settled }) => settled)))
      .toEqual(totals.map(([, , sides]) => sides));
  });
});

describe("the Elo mapping at its clamp", () => {
  // A gap this wide takes a Season of results to build, so it is stated here
  // rather than replayed at the scoring seam, where the ratings behind it could
  // not be computed by hand.

  test("holds the draw and empties the outsider past the clamp", () => {
    // d = 2000 + 60 − 1500 = 560, so E = 1 / (1 + 10^(−1.4))
    //   = 1 / 1.039810717 = 0.961713... and H = E − 0.14 = 0.821713...,
    // which is past the 0.72 the draw's fixed 0.28 leaves. Home takes the 0.72
    // and Away is left nothing rather than the distribution summing past one.
    expect(eloProbabilities(2000, 1500)).toEqual({ H: 0.72, D: 0.28, A: 0 });

    // The same gap the other way: d = 1500 + 60 − 2000 = −440,
    // E = 1 / (1 + 10^1.1) = 1 / 13.589254 = 0.073588..., so H = −0.066411...
    // before the clamp holds it at 0, leaving Away the whole 0.72.
    expect(eloProbabilities(1500, 2000)).toEqual({ H: 0, D: 0.28, A: 0.72 });
  });

  test("leaves a gap short of the clamp alone", () => {
    // d = 1800 + 60 − 1500 = 360, E = 1 / (1 + 10^(−0.9))
    //   = 1 / 1.125892541 = 0.888195..., so H = 0.748195... would clamp — but
    // one step less does not: d = 1700 + 60 − 1500 = 260,
    // E = 1 / (1 + 10^(−0.65)) = 1 / 1.2238721139 = 0.8170788342,
    // H = E − 0.14 = 0.6770788342 and A = 1 − 0.28 − H = 0.0429211658.
    const probs = eloProbabilities(1700, 1500);
    expect(probs.H).toBeCloseTo(0.6770788342, 10);
    expect(probs.D).toBe(0.28);
    expect(probs.A).toBeCloseTo(0.0429211658, 10);
  });
});

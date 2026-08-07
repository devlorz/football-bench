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
  BRIER_METRIC,
  BRIER_SEASON_TO_DATE_METRIC,
  COHERENCE_METRIC,
  COHERENCE_SEASON_TO_DATE_METRIC,
  MATCH_POINTS_METRIC,
  MATCH_POINTS_QUALIFICATION,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  OUTCOME_PCT_METRIC,
  OUTCOME_PCT_SEASON_TO_DATE_METRIC,
  RPS_METRIC,
  RPS_SEASON_TO_DATE_METRIC,
  SCORE_PCT_METRIC,
  SCORE_PCT_SEASON_TO_DATE_METRIC,
  scoreMatchGameweek
} from "../src/predictions/score-match-gameweek.js";

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
      `truncate scores, contexts, predictions, fixtures, models, gameweeks
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
         ) values ($1, $1, 'provider/base-model', 'provider', 'match/v1',
                   'entrant')`,
        [id]
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
    gw = lockedInGw
  ): Promise<void> => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values ($1, $2, $3, $4, $5, $6, '2026-08-21T19:00:00Z')`,
      [SEASON, fplId, gw, lockedInGw, `Home ${fplId}`, `Away ${fplId}`]
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
    probs: Probs = { H: 0.5, D: 0.3, A: 0.2 }
  ): Promise<void> => {
    await client.query(
      `insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
         attempts_used
       )
       select $1, $2, $3, $6, $4, $5, c.id, 0
         from contexts c
        where c.season = $2 and c.track = 'match' and c.fpl_id = $3`,
      [entrantId, SEASON, fplId, home, away, JSON.stringify(probs)]
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
    expect(await storedValue(
      "entrant/b", 1, MATCH_POINTS_SEASON_TO_DATE_METRIC
    )).toBeNull();
  });

  test("reports only Coherence for a Gameweek with no settled result", async () => {
    await storeFixture(1, 1);
    await predict("entrant/a", 1, 2, 1);

    await score(1);

    // Nothing that needs an outcome is written, so an unplayed Gameweek cannot
    // be mistaken for a badly forecast one. Coherence needs only the Prediction
    // and is answerable the moment the Lock passes, so it is written.
    const stored = await client.query<{ metric: string }>(
      "select metric from scores order by metric"
    );
    expect(stored.rows.map(({ metric }) => metric))
      .toEqual([COHERENCE_METRIC, COHERENCE_SEASON_TO_DATE_METRIC]);
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
});

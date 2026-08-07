import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { outcomeOf, type FixtureResult } from "../src/fixture-result.js";
import {
  MATCH_POINTS_METRIC,
  MATCH_POINTS_QUALIFICATION,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  OUTCOME_PCT_METRIC,
  OUTCOME_PCT_SEASON_TO_DATE_METRIC,
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
    away: number
  ): Promise<void> => {
    await client.query(
      `insert into predictions (
         model_id, season, fpl_id, probs, pred_home, pred_away, context_id,
         attempts_used
       )
       select $1, $2, $3, '{"H":0.5,"D":0.3,"A":0.2}', $4, $5, c.id, 0
         from contexts c
        where c.season = $2 and c.track = 'match' and c.fpl_id = $3`,
      [entrantId, SEASON, fplId, home, away]
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

  test("writes no row for a Gameweek with no settled result", async () => {
    await storeFixture(1, 1);
    await predict("entrant/a", 1, 2, 1);

    await score(1);

    const stored = await client.query("select 1 from scores");
    expect(stored.rowCount).toBe(0);
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
});

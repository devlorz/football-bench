import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { outcomeOf, type FixtureResult } from "../src/fixture-result.js";
import {
  MATCH_POINTS_METRIC,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  GAP_RATE_METRIC,
  scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";

const { Client } = pg;

const SEASON = "2026-27";
const ENTRANT = "entrant/a";
/** A second seat, so a complete case and a Gap both have somebody to be.  */
const OTHER = "entrant/b";
const ENTRANTS = [ENTRANT, OTHER];

const SCORED_AT = new Date("2026-08-28T10:00:00Z");
const RESCORED_AT = new Date("2026-08-29T10:00:00Z");

describe("scoring a whole Season in one daily run", () => {
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

  const storeFixture = async (
    fplId: number,
    lockedInGw: number
  ): Promise<void> => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, locked_in_gw, home_team, away_team, kickoff_at
       ) values ($1, $2, $3, $3, $4, $5, '2026-08-21T19:00:00Z')`,
      [SEASON, fplId, lockedInGw, `Home ${fplId}`, `Away ${fplId}`]
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

  const scoreSeason = (at = SCORED_AT): Promise<number[]> =>
    scoreMatchSeason({ database: client, season: SEASON, now: () => at });

  const points = async (
    entrantId: string,
    gameweek: number,
    metric: string = MATCH_POINTS_METRIC
  ): Promise<number | null> => {
    const stored = await client.query<{ value: string }>(
      `select value from scores
        where model_id = $1 and season = $2 and gw = $3 and track = 'match'
          and metric = $4`,
      [entrantId, SEASON, gameweek, metric]
    );
    const [row] = stored.rows;
    return row === undefined ? null : Number(row.value);
  };

  /** A two-Gameweek Season both Entrants answered in full. */
  const playTwoGameweeks = async (): Promise<void> => {
    await storeFixture(1, 1);
    await storeFixture(2, 2);
    await settle(1, 2, 0);
    await settle(2, 1, 1);
    for (const id of ENTRANTS) {
      await predict(id, 1, 2, 0);
      await predict(id, 2, 0, 0);
    }
  };

  test("scores every Gameweek the Season's Locks own, not only the last", async () => {
    await playTwoGameweeks();

    expect(await scoreSeason()).toEqual([1, 2]);

    // Gameweek 1 is exact, Gameweek 2 the right goal difference at a
    // different score: 5 and 3, so 8 through the Season.
    expect(await points(ENTRANT, 1)).toBe(5);
    expect(await points(ENTRANT, 2)).toBe(3);
    expect(await points(ENTRANT, 2, MATCH_POINTS_SEASON_TO_DATE_METRIC))
      .toBe(8);
  });

  test("stamps every row of one run with a single scoring instant", async () => {
    await playTwoGameweeks();
    await scoreSeason();

    const stamps = await client.query<{ scored_at: Date }>(
      "select distinct scored_at from scores where season = $1",
      [SEASON]
    );
    expect(stamps.rows).toEqual([{ scored_at: SCORED_AT }]);
  });

  test("recomputes an earlier Gameweek whose result was corrected", async () => {
    await playTwoGameweeks();
    await scoreSeason();
    expect(await points(ENTRANT, 1)).toBe(5);

    // The Gameweek the daily run would never revisit if it scored only the
    // Season's latest Lock: `scoreMatchGameweek` looks forward, never back.
    // 5-1 against a predicted 2-0: the right winner at the wrong goal
    // difference, so 2 rather than 5, and 5 rather than 8 through the Season.
    await settle(1, 5, 1);
    await scoreSeason(RESCORED_AT);

    expect(await points(ENTRANT, 1)).toBe(2);
    expect(await points(ENTRANT, 2, MATCH_POINTS_SEASON_TO_DATE_METRIC))
      .toBe(5);
  });

  test("re-running over unchanged rows duplicates nothing", async () => {
    await playTwoGameweeks();
    await scoreSeason();
    const rows = (): Promise<unknown[]> =>
      client.query("select * from scores order by gw, model_id, metric")
        .then(({ rows: stored }) => stored);

    const first = await rows();
    await scoreSeason();

    // Every column, not the count: an upsert that rewrote a value or restamped
    // a row would keep the count and still not be the same record. The stamp is
    // among them, and stays put because the clock decides nothing but itself.
    expect(await rows()).toEqual(first);
  });

  test("a Season with nothing settled writes no zero-valued score", async () => {
    await storeFixture(1, 1);
    await predict(ENTRANT, 1, 2, 0);

    expect(await scoreSeason()).toEqual([1]);

    expect(await points(ENTRANT, 1)).toBeNull();
    // The Gap the other Entrant left is still answerable without a result.
    expect(await points(OTHER, 1, GAP_RATE_METRIC)).toBe(1);
  });

  test("a Season whose Fixtures own no Lock scores nothing", async () => {
    await client.query(
      `insert into fixtures (
         season, fpl_id, gw, home_team, away_team, kickoff_at
       ) values ($1, 1, 1, 'Home', 'Away', '2026-08-21T19:00:00Z')`,
      [SEASON]
    );

    expect(await scoreSeason()).toEqual([]);
    expect((await client.query("select * from scores")).rowCount).toBe(0);
  });
});

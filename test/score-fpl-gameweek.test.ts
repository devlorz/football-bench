import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import {
  DEMONSTRATION_QUALIFICATION,
  FPL_POINTS_METRIC
} from "../src/fpl/demonstration-record.js";
import { storeManagerState } from "../src/fpl/manager-state-store.js";
import { rolledOverState } from "../src/fpl/apply-gameweek-action.js";
import { FPL_POOL, FPL_POOL_ALTERNATES } from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import {
  BENCH_BOOST,
  FREE_HIT_REBUILD,
  OPENING_ACTION as OPENING
} from "./fpl-action-fixture.js";
import {
  EVERYONE_PLAYED,
  FREE_HIT_GAMEWEEK,
  absent
} from "./fpl-points-fixture.js";
import type { PlayerGameweekPoints } from "../src/fpl/score-team-sheet.js";

const { Client } = pg;

describe("scoring a Gameweek from what is stored", () => {
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
      `truncate
         scores, manager_states, fpl_player_points, fpl_players, attempts,
         contexts, predictions, fixtures, models, gameweeks
       restart identity cascade`
    );
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z');
       insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values (
         'entrant/v1', 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
         'fpl/2026-27-v1', 'entrant'
       ), (
         'entrant/v2', 'Second Entrant', 'anthropic/claude-x', 'anthropic',
         'fpl/2026-27-v1', 'entrant'
       )`
    );
    for (const player of FPL_POOL) {
      await client.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added, observed_at
         ) values (
           '2026-27', 1, $1, $2, $3, $4, $5, 'a', null, '', null,
           '2026-08-21T17:00:00Z'
         )`,
        [
          player.fplId,
          player.club,
          player.webName,
          player.position,
          player.priceTenths
        ]
      );
    }

    // The same opening Team Sheet for both, so the only thing that can move
    // one Entrant's total away from the other's is the Hits its own Manager
    // State recorded.
    const opened = legalStateFrom(OPENING);
    for (const [entrantId, hits] of [["entrant/v1", 0], ["entrant/v2", 4]] as const) {
      await storeManagerState(client, {
        entrantId,
        season: "2026-27",
        gameweek: 1,
        state: { ...opened, hits },
        attemptsUsed: 0,
        predictedAt: new Date("2026-08-21T17:00:00Z")
      });
    }
  });

  async function settle(
    points: readonly PlayerGameweekPoints[],
    gameweek = 1
  ): Promise<void> {
    for (const player of points) {
      await client.query(
        `insert into fpl_player_points (season, gw, fpl_id, minutes, total_points)
         values ('2026-27', $1, $2, $3, $4)`,
        [gameweek, player.fplId, player.minutes, player.totalPoints]
      );
    }
  }

  /** Every score row there is, for the Gameweeks that must write none. */
  async function storedScores(): Promise<unknown[]> {
    const rows = await client.query(
      `select model_id, track, metric, value::int as value, detail
         from scores
        order by model_id, metric`
    );
    return rows.rows;
  }

  /**
   * The Gameweek's own points and nothing else. The cumulative and behavioural
   * metrics stored beside them are the demonstration record's, and they are
   * asserted where they are decided — `fpl-demonstration-record.test.ts`.
   */
  async function storedPoints(): Promise<unknown[]> {
    const rows = await client.query(
      `select model_id, track, metric, value::int as value, detail
         from scores
        where metric = $1
        order by model_id`,
      [FPL_POINTS_METRIC]
    );
    return rows.rows;
  }

  test("writes one scored row per Entrant with the total and its record", async () => {
    await settle(EVERYONE_PLAYED);

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });

    // Everybody played, so nobody was replaced: the eleven score
    // 6+2+5+1+2+9+3+7+2+4+8 = 49 and Palmer's armband adds 9 for 58. The
    // second Entrant played the identical Team Sheet and owed a Hit, so 54.
    expect(await storedPoints()).toEqual([
      {
        model_id: "entrant/v1",
        track: "fpl",
        metric: "fpl_points",
        value: 58,
        detail: {
          players: [
            { fplId: 1, points: 6, multiplier: 1 },
            { fplId: 3, points: 2, multiplier: 1 },
            { fplId: 4, points: 5, multiplier: 1 },
            { fplId: 5, points: 1, multiplier: 1 },
            { fplId: 6, points: 2, multiplier: 1 },
            { fplId: 8, points: 9, multiplier: 2 },
            { fplId: 9, points: 3, multiplier: 1 },
            { fplId: 10, points: 7, multiplier: 1 },
            { fplId: 11, points: 2, multiplier: 1 },
            { fplId: 13, points: 4, multiplier: 1 },
            { fplId: 14, points: 8, multiplier: 1 }
          ],
          substitutions: [],
          captain: 8,
          hits: 0,
          chip: null,
          // Wherever a points value is stored, the sentence that says what
          // ranking it is stored for goes with it.
          qualification: DEMONSTRATION_QUALIFICATION
        }
      },
      {
        model_id: "entrant/v2",
        track: "fpl",
        metric: "fpl_points",
        value: 54,
        detail: expect.objectContaining({ hits: 4 })
      }
    ]);
  });

  test("scores nothing for a Gameweek whose points have not settled", async () => {
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });

    // No stored points is the record that the Gameweek is unsettled, so an
    // Entrant that would have scored 58 has no row at all rather than a zero.
    expect(await storedScores()).toEqual([]);
  });

  test("scores a Gameweek whose own player snapshot was never taken", async () => {
    // Gameweek 2 has no rows in `fpl_players` at all — its pre-Lock snapshot
    // window was missed. Positions are the Season's, not the Gameweek's, so
    // the substitution rules still know a goalkeeper from a forward and the
    // Gameweek remains scoreable, which is the whole reason migration 0011
    // refuses to tie stored points to that snapshot.
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(OPENING),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    // Garner missed, so the Gameweek cannot be scored without knowing that
    // Kelleher is a goalkeeper and Cucurella is not: the ten score
    // 6+2+5+1+2+9+3+7+4+8 = 47, Cucurella comes on for 9, and Palmer's armband
    // adds 9 for 65.
    await settle(absent([11]), 2);

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });

    expect(await storedPoints()).toEqual([
      {
        model_id: "entrant/v1",
        track: "fpl",
        metric: FPL_POINTS_METRIC,
        value: 65,
        detail: expect.objectContaining({
          captain: 8,
          substitutions: [{ out: 11, in: 7 }]
        })
      }
    ]);
  });

  test("refuses a Gameweek whose points are stored for only some players", async () => {
    // Garner's row is missing. Read as it stands he played no minutes, which
    // would bring Cucurella on for him and store 65 — a substitution the
    // Gameweek never saw, from a Gameweek that is not wholly settled. Some
    // rows is not the same record as all rows.
    await settle(EVERYONE_PLAYED.filter((player) => player.fplId !== 11));

    await expect(
      scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 })
    ).rejects.toThrow(/11/);

    expect(await storedScores()).toEqual([]);
  });

  test("refuses a Team Sheet holding a player of no known position", async () => {
    await settle(EVERYONE_PLAYED);
    await client.query("delete from fpl_players where fpl_id = 11");

    // Counting him toward no position would read as a midfield one man short
    // and could move a substitution, so the Gameweek is refused instead.
    await expect(
      scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 })
    ).rejects.toThrow(/11/);

    expect(await storedScores()).toEqual([]);
  });

  test("refuses a player whose position disagrees across the Season", async () => {
    await settle(EVERYONE_PLAYED);
    await client.query(
      `insert into fpl_players (
         season, gw, fpl_id, team_name, web_name, position, price_tenths,
         status, chance_of_playing_next_round, news, news_added, observed_at
       ) values (
         '2026-27', 2, 5, 'Brentford', 'Collins', 'MID', 50, 'a', null, '',
         null, '2026-08-28T17:00:00Z'
       )`
    );

    // Collins is a defender in one snapshot and a midfielder in another. Taking
    // the later row silently would decide a formation on a coin toss, so the
    // disagreement is refused rather than resolved.
    await expect(
      scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 })
    ).rejects.toThrow(/5/);

    expect(await storedScores()).toEqual([]);
  });

  test("scores a Rolled Over Gameweek from the Team Sheet still standing", async () => {
    // Rolling over is preferred to scoring zero because zero is a punishment
    // large enough to drown out every other signal, while a stale Squad
    // degrades gradually (ADR-0004). This is where that is either true or an
    // intention: the row is scored exactly as any other, and nothing about it
    // reaches the scorer except the Team Sheet, the Hits and the Chip.
    //
    // The second Entrant owed a four-point Hit in Gameweek 1, and this
    // Gameweek made no Transfer to owe one for — so the same eleven that
    // scored 54 under the Hit score 58 without it.
    await storeManagerState(client, {
      entrantId: "entrant/v2",
      season: "2026-27",
      gameweek: 2,
      state: rolledOverState({ ...legalStateFrom(OPENING), hits: 4 }),
      attemptsUsed: 3,
      rolledOver: true,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    await settle(EVERYONE_PLAYED, 2);

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });

    expect(await storedPoints()).toEqual([
      {
        model_id: "entrant/v2",
        track: "fpl",
        metric: FPL_POINTS_METRIC,
        value: 58,
        detail: expect.objectContaining({
          captain: 8,
          substitutions: [],
          hits: 0,
          chip: null
        })
      }
    ]);
  });

  test("scores a Free Hit Gameweek from the temporary Squad it stored", async () => {
    // The three players the Free Hit brought in need positions, and positions
    // are the Season's: this is the Gameweek 2 snapshot they arrive in.
    for (const player of FPL_POOL_ALTERNATES.filter(
      ({ fplId }) => [17, 18, 19].includes(fplId)
    )) {
      await client.query(
        `insert into fpl_players (
           season, gw, fpl_id, team_name, web_name, position, price_tenths,
           status, chance_of_playing_next_round, news, news_added, observed_at
         ) values (
           '2026-27', 2, $1, $2, $3, $4, $5, 'a', null, '', null,
           '2026-08-28T17:00:00Z'
         )`,
        [
          player.fplId,
          player.club,
          player.webName,
          player.position,
          player.priceTenths
        ]
      );
    }

    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(FREE_HIT_REBUILD, legalStateFrom(OPENING), 2),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    await settle(FREE_HIT_GAMEWEEK, 2);

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });

    // The borrowed eleven score 6+2+12+1+2+9+14+7+2+4+8 = 67, and Palmer's
    // armband adds 9 for 76. The permanent eleven the Entrant still owns would
    // have scored 58, so nothing here could have come from the stashed Squad.
    expect(await storedPoints()).toEqual([
      {
        model_id: "entrant/v1",
        track: "fpl",
        metric: FPL_POINTS_METRIC,
        value: 76,
        detail: expect.objectContaining({
          players: expect.arrayContaining([
            { fplId: 17, points: 12, multiplier: 1 },
            { fplId: 18, points: 14, multiplier: 1 }
          ]),
          substitutions: [],
          captain: 8,
          hits: 0
        })
      }
    ]);
  });

  test("scores a Bench Boost Gameweek from the Chip the row recorded", async () => {
    // The Chip is not in the Team Sheet and not in the points: it is in the
    // Manager State the reducer wrote, so it has to be read back out of the
    // same row the Team Sheet and the Hits come from. A Gameweek that scored
    // 58 without it scores the whole fifteen with it.
    await storeManagerState(client, {
      entrantId: "entrant/v1",
      season: "2026-27",
      gameweek: 2,
      state: legalStateFrom(BENCH_BOOST, legalStateFrom(OPENING), 2),
      attemptsUsed: 0,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    await settle(EVERYONE_PLAYED, 2);

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 2 });

    // The eleven score 49, the bench 10+9+11+12 = 42, and Palmer's armband
    // adds 9 for 100.
    expect(await storedPoints()).toEqual([
      {
        model_id: "entrant/v1",
        track: "fpl",
        metric: FPL_POINTS_METRIC,
        value: 100,
        detail: expect.objectContaining({
          substitutions: [],
          captain: 8,
          chip: "bench_boost"
        })
      }
    ]);
  });

  test("leaves the rows untouched when it runs again", async () => {
    await settle(EVERYONE_PLAYED);
    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });
    const first = await storedScores();

    await scoreFplGameweek({ database: client, season: "2026-27", gameweek: 1 });

    expect(await storedScores()).toEqual(first);
  });
});

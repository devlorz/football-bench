import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import type { ManagerState } from "../src/fpl/apply-gameweek-action.js";
import {
  DEMONSTRATION_QUALIFICATION,
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC,
  REPAIRS_METRIC,
  REPAIRS_SEASON_TO_DATE_METRIC,
  ROLL_OVER_RATE_METRIC,
  ROLL_OVER_RATE_SEASON_TO_DATE_METRIC,
  VIOLATION_PROFILE_METRIC,
  VIOLATION_PROFILE_SEASON_TO_DATE_METRIC
} from "../src/fpl/demonstration-record.js";
import { storeManagerState } from "../src/fpl/manager-state-store.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import type { PlayerGameweekPoints } from "../src/fpl/score-team-sheet.js";
import { rolledOverState } from "../src/fpl/apply-gameweek-action.js";
import {
  BENCH_BOOST,
  OPENING_ACTION,
  STAND_PAT
} from "./fpl-action-fixture.js";
import { EVERYONE_PLAYED } from "./fpl-points-fixture.js";
import { FPL_POOL } from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The opening Squad both Entrants start from, and standing pat on it after. */
const OPENED = legalStateFrom(OPENING_ACTION);
const STOOD_PAT = legalStateFrom(STAND_PAT, OPENED, 2);

describe("the FPL demonstration record", () => {
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
         ('2026-27', 2, '2026-08-28T17:30:00Z'),
         ('2026-27', 3, '2026-09-04T17:30:00Z'),
         ('2026-27', 4, '2026-09-11T17:30:00Z'),
         ('2026-27', 5, '2026-09-18T17:30:00Z');
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
  });

  async function seed({
    gameweek,
    entrantId = "entrant/v1",
    state = OPENED,
    repairs = 0,
    rolledOver = false
  }: {
    gameweek: number;
    entrantId?: string;
    state?: ManagerState;
    repairs?: number;
    rolledOver?: boolean;
  }): Promise<void> {
    await storeManagerState(client, {
      entrantId,
      season: SEASON,
      gameweek,
      state,
      attemptsUsed: repairs,
      rolledOver,
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });
  }

  async function settle(
    gameweek: number,
    points: readonly PlayerGameweekPoints[] = EVERYONE_PLAYED
  ): Promise<void> {
    for (const player of points) {
      await client.query(
        `insert into fpl_player_points (season, gw, fpl_id, minutes, total_points)
         values ('2026-27', $1, $2, $3, $4)`,
        [gameweek, player.fplId, player.minutes, player.totalPoints]
      );
    }
  }

  /**
   * One call to an Entrant, as `askForGameweekAction` leaves it: a kind for
   * everything that was not a legal action in time, and null for the one that
   * was.
   */
  async function attempt({
    gameweek,
    entrantId = "entrant/v1",
    attemptNo,
    kind = null,
    track = "fpl"
  }: {
    gameweek: number;
    entrantId?: string;
    attemptNo: number;
    kind?: string | null;
    track?: string;
  }): Promise<void> {
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, attempt_no, ok, error_kind, error_detail,
         trigger
       ) values ($1, '2026-27', $2, $3, $4, $5, $6, $7, 'main')`,
      [
        entrantId,
        gameweek,
        track,
        attemptNo,
        kind === null,
        kind,
        kind === null ? null : `a ${kind} failure`
      ]
    );
  }

  async function score(gameweek: number): Promise<void> {
    await scoreFplGameweek({ database: client, season: SEASON, gameweek });
  }

  async function stored(metrics: readonly string[]): Promise<unknown[]> {
    const rows = await client.query(
      `select model_id, gw, metric, value::float8 as value, n, detail
         from scores
        where track = 'fpl' and metric = any($1)
        order by model_id, gw, metric`,
      [metrics]
    );
    return rows.rows;
  }

  test("carries the Season total forward beside each Gameweek's own", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT });
    await settle(1);
    await settle(2);

    await score(1);
    await score(2);

    // The same eleven score 58 in each Gameweek, so the Season total through
    // Gameweek 2 is 116 — a number neither Gameweek's own row holds, and the
    // one the demonstration ranking is read off.
    expect(
      await stored([FPL_POINTS_METRIC, FPL_POINTS_SEASON_TO_DATE_METRIC])
    ).toEqual([
      {
        model_id: "entrant/v1",
        gw: 1,
        metric: "fpl_points",
        value: 58,
        n: null,
        detail: expect.objectContaining({
          captain: 8,
          qualification: DEMONSTRATION_QUALIFICATION
        })
      },
      {
        model_id: "entrant/v1",
        gw: 1,
        metric: "fpl_points_season_to_date",
        value: 58,
        n: 1,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 1,
          gameweeks: [{ gw: 1, points: 58 }]
        }
      },
      {
        model_id: "entrant/v1",
        gw: 2,
        metric: "fpl_points",
        value: 58,
        n: null,
        detail: expect.objectContaining({
          qualification: DEMONSTRATION_QUALIFICATION
        })
      },
      {
        model_id: "entrant/v1",
        gw: 2,
        metric: "fpl_points_season_to_date",
        value: 116,
        n: 2,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 1,
          gameweeks: [{ gw: 1, points: 58 }, { gw: 2, points: 58 }]
        }
      }
    ]);
  });

  test("counts the Repairs each Gameweek cost and how they were distributed", async () => {
    // Five Gameweeks the Entrant reached in five different ways: legal first
    // time, legal after one Repair, after two, after three, and a fifth that
    // was never legal and Rolled Over. The last two both used all three
    // Repairs, which is exactly why the distribution needs a `failed` bucket
    // rather than reading the count and calling three of three a success.
    const played = [
      { gameweek: 1, repairs: 0, state: OPENED },
      { gameweek: 2, repairs: 1, state: STOOD_PAT },
      { gameweek: 3, repairs: 2, state: STOOD_PAT },
      { gameweek: 4, repairs: 3, state: STOOD_PAT },
      { gameweek: 5, repairs: 3, state: STOOD_PAT, rolledOver: true }
    ];
    for (const gameweek of played) {
      await seed(gameweek);
      await settle(gameweek.gameweek);
    }

    for (const { gameweek } of played) {
      await score(gameweek);
    }

    const row = (gw: number, metric: string, value: number, n: number | null,
      detail: unknown) => ({
      model_id: "entrant/v1", gw, metric, value, n, detail
    });

    expect(await stored([REPAIRS_METRIC])).toEqual([
      row(1, "repairs", 0, null, { bucket: "0", rolledOver: false }),
      row(2, "repairs", 1, null, { bucket: "1", rolledOver: false }),
      row(3, "repairs", 2, null, { bucket: "2", rolledOver: false }),
      row(4, "repairs", 3, null, { bucket: "3", rolledOver: false }),
      // Three Repairs used and still illegal. The count is the same as the
      // Gameweek above it and the bucket is not.
      row(5, "repairs", 3, null, { bucket: "failed", rolledOver: true })
    ]);

    // 0 + 1 + 2 + 3 + 3 = 9 Repairs over five Gameweeks: a mean of 1.8, and
    // each Gameweek's own row is the mean of the Season so far.
    expect(await stored([REPAIRS_SEASON_TO_DATE_METRIC])).toEqual([
      row(1, "repairs_season_to_date", 0, 1, {
        startingGameweek: 1,
        distribution: { "0": 1, "1": 0, "2": 0, "3": 0, failed: 0 }
      }),
      row(2, "repairs_season_to_date", 0.5, 2, {
        startingGameweek: 1,
        distribution: { "0": 1, "1": 1, "2": 0, "3": 0, failed: 0 }
      }),
      row(3, "repairs_season_to_date", 1, 3, {
        startingGameweek: 1,
        distribution: { "0": 1, "1": 1, "2": 1, "3": 0, failed: 0 }
      }),
      row(4, "repairs_season_to_date", 1.5, 4, {
        startingGameweek: 1,
        distribution: { "0": 1, "1": 1, "2": 1, "3": 1, failed: 0 }
      }),
      row(5, "repairs_season_to_date", 1.8, 5, {
        startingGameweek: 1,
        distribution: { "0": 1, "1": 1, "2": 1, "3": 1, failed: 1 }
      })
    ]);
  });

  test("records a Rolled Over Gameweek as one, and the Season as a fraction", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT, repairs: 3, rolledOver: true });
    await settle(1);
    await settle(2);

    await score(1);
    await score(2);

    // One Gameweek in two, so the rate through Gameweek 2 is a half — and the
    // Gameweek it came from is named, because a fraction that cannot be traced
    // back to a Manager State is a number nobody can check.
    expect(await stored([
      ROLL_OVER_RATE_METRIC,
      ROLL_OVER_RATE_SEASON_TO_DATE_METRIC
    ])).toEqual([
      {
        model_id: "entrant/v1",
        gw: 1,
        metric: "roll_over_rate",
        value: 0,
        n: null,
        detail: null
      },
      {
        model_id: "entrant/v1",
        gw: 1,
        metric: "roll_over_rate_season_to_date",
        value: 0,
        n: 1,
        detail: { startingGameweek: 1, gameweeks: [] }
      },
      {
        model_id: "entrant/v1",
        gw: 2,
        metric: "roll_over_rate",
        value: 1,
        n: null,
        detail: null
      },
      {
        model_id: "entrant/v1",
        gw: 2,
        metric: "roll_over_rate_season_to_date",
        value: 0.5,
        n: 2,
        detail: { startingGameweek: 1, gameweeks: [2] }
      }
    ]);
  });

  test("profiles the rules each Entrant broke, and only the rules", async () => {
    for (const entrantId of ["entrant/v1", "entrant/v2"]) {
      await seed({ gameweek: 1, entrantId });
      await seed({ gameweek: 2, entrantId, state: STOOD_PAT });
    }
    await settle(1);
    await settle(2);

    // A first run that never reached the Base Model, then the run that
    // produced the action. A provider failure is not an illegal action and a
    // response that was not an action at all breaks no rule of the game, so
    // neither belongs in a profile of how an Entrant manages a Squad — but
    // both are attempt rows on the same Gameweek, and only a profile that
    // names the kinds it counts can leave them out.
    await attempt({ gameweek: 1, attemptNo: 0, kind: "provider" });
    await attempt({ gameweek: 1, attemptNo: 0, kind: "club_limit" });
    await attempt({ gameweek: 1, attemptNo: 1, kind: "schema" });
    await attempt({ gameweek: 1, attemptNo: 2 });
    await attempt({ gameweek: 2, attemptNo: 0, kind: "formation" });
    await attempt({ gameweek: 2, attemptNo: 1, kind: "captain" });
    await attempt({ gameweek: 2, attemptNo: 2 });

    await attempt({
      gameweek: 1, entrantId: "entrant/v2", attemptNo: 0, kind: "budget"
    });
    await attempt({ gameweek: 1, entrantId: "entrant/v2", attemptNo: 1 });
    await attempt({ gameweek: 2, entrantId: "entrant/v2", attemptNo: 0 });

    await score(1);
    await score(2);

    const profile = (counts: Record<string, number>) => ({
      budget: 0,
      squad_quota: 0,
      club_limit: 0,
      unknown_player: 0,
      formation: 0,
      captain: 0,
      chip_unavailable: 0,
      ...counts
    });
    const row = (
      model_id: string,
      gw: number,
      metric: string,
      value: number,
      n: number | null,
      detail: unknown
    ) => ({ model_id, gw, metric, value, n, detail });

    expect(await stored([
      VIOLATION_PROFILE_METRIC,
      VIOLATION_PROFILE_SEASON_TO_DATE_METRIC
    ])).toEqual([
      row("entrant/v1", 1, "violation_profile", 1, null, {
        kinds: profile({ club_limit: 1 })
      }),
      row("entrant/v1", 1, "violation_profile_season_to_date", 1, 1, {
        startingGameweek: 1,
        kinds: profile({ club_limit: 1 })
      }),
      row("entrant/v1", 2, "violation_profile", 2, null, {
        kinds: profile({ formation: 1, captain: 1 })
      }),
      row("entrant/v1", 2, "violation_profile_season_to_date", 3, 2, {
        startingGameweek: 1,
        kinds: profile({ club_limit: 1, formation: 1, captain: 1 })
      }),
      row("entrant/v2", 1, "violation_profile", 1, null, {
        kinds: profile({ budget: 1 })
      }),
      row("entrant/v2", 1, "violation_profile_season_to_date", 1, 1, {
        startingGameweek: 1,
        kinds: profile({ budget: 1 })
      }),
      // The second Entrant was legal first time in Gameweek 2, and a Gameweek
      // that broke nothing is a zero rather than a missing row.
      row("entrant/v2", 2, "violation_profile", 0, null, {
        kinds: profile({})
      }),
      row("entrant/v2", 2, "violation_profile_season_to_date", 1, 2, {
        startingGameweek: 1,
        kinds: profile({ budget: 1 })
      })
    ]);
  });

  test("counts nothing from a Gameweek before the track started", async () => {
    // The track joined at Gameweek 2 (spec 0003, §Joining mid-Season). The
    // Season's points for Gameweek 1 are settled and stored — the Match track
    // needed them — and none of them belongs to this record: no Entrant played
    // that Gameweek, so counting it would give every Entrant a path one
    // Gameweek longer than the one it ran.
    await seed({ gameweek: 2 });
    await seed({ gameweek: 3, state: STOOD_PAT });
    await settle(1);
    await settle(2);
    await settle(3);

    await score(1);
    await score(2);
    await score(3);

    expect(await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).toEqual([
      {
        model_id: "entrant/v1",
        gw: 2,
        metric: "fpl_points_season_to_date",
        value: 58,
        n: 1,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 2,
          gameweeks: [{ gw: 2, points: 58 }]
        }
      },
      {
        model_id: "entrant/v1",
        gw: 3,
        metric: "fpl_points_season_to_date",
        value: 116,
        n: 2,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 2,
          gameweeks: [{ gw: 2, points: 58 }, { gw: 3, points: 58 }]
        }
      }
    ]);
  });

  test("skips an unsettled Gameweek without breaking the Season total", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT });
    await seed({ gameweek: 3, state: STOOD_PAT });
    // Gameweek 2's points have not been declared final, so it is scored by
    // nothing and is not the Gameweek in which everybody scored zero.
    await settle(1);
    await settle(3);

    await score(1);
    await score(2);
    await score(3);

    const rows = await client.query(
      `select distinct gw from scores where track = 'fpl' order by gw`
    );
    expect(rows.rows).toEqual([{ gw: 1 }, { gw: 3 }]);

    expect((await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).at(-1)).toEqual({
      model_id: "entrant/v1",
      gw: 3,
      metric: "fpl_points_season_to_date",
      value: 116,
      n: 2,
      detail: {
        qualification: DEMONSTRATION_QUALIFICATION,
        startingGameweek: 1,
        gameweeks: [{ gw: 1, points: 58 }, { gw: 3, points: 58 }]
      }
    });
  });

  test("scores a settled Gameweek nobody scored in as a real nothing", async () => {
    await seed({ gameweek: 1 });
    // Everybody played and nobody returned a point. That is a result, and the
    // Gameweek above it that stored no points at all is not.
    await settle(
      1,
      EVERYONE_PLAYED.map((player) => ({ ...player, totalPoints: 0 }))
    );

    await score(1);

    expect(await stored([FPL_POINTS_METRIC, FPL_POINTS_SEASON_TO_DATE_METRIC]))
      .toEqual([
        expect.objectContaining({ metric: "fpl_points", value: 0 }),
        expect.objectContaining({
          metric: "fpl_points_season_to_date",
          value: 0,
          n: 1
        })
      ]);
  });

  test("names the Season, the Gameweek, the Entrant and the track on every row", async () => {
    await seed({ gameweek: 1 });
    await settle(1);

    await score(1);

    const rows = await client.query(
      `select count(*)::int as rows,
              count(distinct (model_id, season, gw, track))::int as keys
         from scores`
    );
    // Eight metrics under one key: the Season, the Gameweek, the Entrant and
    // the track are what every one of them is filed under.
    expect(rows.rows).toEqual([{ rows: 8, keys: 1 }]);
  });

  test("writes the same rows again when it runs again", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT, repairs: 2 });
    await attempt({ gameweek: 2, attemptNo: 0, kind: "budget" });
    await attempt({ gameweek: 2, attemptNo: 1, kind: "formation" });
    await attempt({ gameweek: 2, attemptNo: 2 });
    await settle(1);
    await settle(2);
    await score(1);
    await score(2);
    const first = await client.query(
      `select model_id, season, gw, track, metric, value::float8 as value, n,
              detail
         from scores order by model_id, gw, metric`
    );

    await score(1);
    await score(2);

    const again = await client.query(
      `select model_id, season, gw, track, metric, value::float8 as value, n,
              detail
         from scores order by model_id, gw, metric`
    );
    expect(again.rows).toEqual(first.rows);
    expect(again.rows).toHaveLength(16);
  });

  test("rewrites the Season totals already published when a Gameweek settles late", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT });
    await seed({ gameweek: 3, state: STOOD_PAT });
    await settle(1);
    await settle(3);
    await score(1);
    await score(3);

    // Gameweek 3 was published while Gameweek 2 was still unsettled, so its
    // Season total is two Gameweeks.
    expect((await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).at(-1)).toEqual(
      expect.objectContaining({ gw: 3, value: 116, n: 2 })
    );

    // Gameweek 2 settles afterwards. Its own row is not the only one that
    // changes: every published Gameweek after it has a Season total that was
    // computed without it, and a record whose totals depend on when a Gameweek
    // happened to settle is a record nobody can reproduce.
    await settle(2);
    await score(2);

    expect(await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).toEqual([
      expect.objectContaining({ gw: 1, value: 58, n: 1 }),
      expect.objectContaining({ gw: 2, value: 116, n: 2 }),
      {
        model_id: "entrant/v1",
        gw: 3,
        metric: "fpl_points_season_to_date",
        value: 174,
        n: 3,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 1,
          gameweeks: [
            { gw: 1, points: 58 },
            { gw: 2, points: 58 },
            { gw: 3, points: 58 }
          ]
        }
      }
    ]);
  });

  test("scores nobody's Gameweek when one Entrant never stored a state", async () => {
    for (const entrantId of ["entrant/v1", "entrant/v2"]) {
      await seed({ gameweek: 1, entrantId });
      await seed({ gameweek: 3, entrantId, state: STOOD_PAT });
    }
    // Gameweek 2 belongs to the first Entrant alone: the second's provider
    // never answered, and the Lock has long passed, so it never will.
    await seed({ gameweek: 2, state: STOOD_PAT });
    await settle(1);
    await settle(2);
    await settle(3);

    await score(1);
    await score(2);
    await score(3);

    // Publishing the one Entrant that acted would give it a path one Gameweek
    // longer than its peer's, which is the comparison the whole track is for.
    // ADR-0011's answer to one Entrant's Gap is to remove the Gameweek from
    // every comparison, including between Entrants that were working fine, and
    // the remedy is a fill run before the Lock rather than a shorter record.
    const written = await client.query(
      `select distinct gw from scores where track = 'fpl' order by gw`
    );
    expect(written.rows).toEqual([{ gw: 1 }, { gw: 3 }]);

    // And it is missing from both Entrants' paths, not just the silent one's.
    expect(await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).toEqual([
      expect.objectContaining({ model_id: "entrant/v1", gw: 1, n: 1 }),
      {
        model_id: "entrant/v1",
        gw: 3,
        metric: "fpl_points_season_to_date",
        value: 116,
        n: 2,
        detail: {
          qualification: DEMONSTRATION_QUALIFICATION,
          startingGameweek: 1,
          gameweeks: [{ gw: 1, points: 58 }, { gw: 3, points: 58 }]
        }
      },
      expect.objectContaining({ model_id: "entrant/v2", gw: 1, n: 1 }),
      expect.objectContaining({ model_id: "entrant/v2", gw: 3, n: 2 })
    ]);
  });

  test("refuses to leave a published Gameweek standing once it stops scoring", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT });
    await seed({ gameweek: 3, state: STOOD_PAT });
    await settle(1);
    await settle(2);
    await settle(3);
    await score(1);
    await score(2);
    await score(3);
    const published = await stored([FPL_POINTS_SEASON_TO_DATE_METRIC]);

    // Gameweek 2's settled points are taken away. No code path does this —
    // `fetchFplPlayerPoints` only inserts and updates, and `manager_states`
    // refuses a delete outright — so this is an operator at the database.
    await client.query("delete from fpl_player_points where gw = 2");

    // Returning quietly would leave Gameweek 2's rows on record with nothing
    // behind them and nobody told. Deleting them would let absent data destroy
    // published data, which is worse: a half-restored database would silently
    // unpublish a Gameweek. So the run refuses and names the Gameweek.
    await expect(score(2)).rejects.toThrow(/Gameweek 2/);
    // Scoring a later Gameweek is refused for the same reason rather than
    // recomputing a Season total that skips a Gameweek still on record.
    await expect(score(3)).rejects.toThrow(/Gameweek 2/);

    expect(await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).toEqual(published);
  });

  test("says which Gameweek stopped scoring when only some points are gone", async () => {
    await seed({ gameweek: 1 });
    await seed({ gameweek: 2, state: STOOD_PAT });
    await seed({ gameweek: 3, state: STOOD_PAT });
    await settle(1);
    await settle(2);
    await settle(3);
    await score(1);
    await score(2);
    await score(3);
    const published = await stored([FPL_POINTS_SEASON_TO_DATE_METRIC]);

    // One player's row rather than the whole Gameweek's. Read as it stands he
    // played no minutes, which would bring a substitute on for him and store a
    // total the Gameweek never saw — so it is refused, as a first run of it
    // would be.
    await client.query("delete from fpl_player_points where gw = 2 and fpl_id = 4");

    // The refusal walks several Gameweeks now, so "no settled points for
    // player 4" on its own leaves the operator to work out which of them it
    // came from.
    await expect(score(2)).rejects.toThrow(/Gameweek 2 of 2026-27/);
    await expect(score(3)).rejects.toThrow(/Gameweek 2 of 2026-27/);
    await expect(score(2)).rejects.toThrow(/player 4/);

    expect(await stored([FPL_POINTS_SEASON_TO_DATE_METRIC])).toEqual(published);
  });

  test("stores none of a Gameweek's record when one row cannot persist", async () => {
    await seed({ gameweek: 1 });
    await settle(1);
    await client.query(
      `create function fail_one_metric()
       returns trigger
       language plpgsql
       as $$
       begin
         if new.metric = 'roll_over_rate' then
           raise exception 'simulated score persistence failure';
         end if;
         return new;
       end;
       $$;
       create trigger scores_fail_for_one_metric
       before insert on scores
       for each row execute function fail_one_metric()`
    );

    try {
      // The points rows are written before the Roll Over rate reaches the
      // table. Leaving them there would publish a Gameweek's points with no
      // account of the behaviour that produced them — which is the one thing
      // the record is written together to avoid.
      await expect(score(1)).rejects.toThrow(
        "simulated score persistence failure"
      );
    } finally {
      await client.query(
        `drop trigger scores_fail_for_one_metric on scores;
         drop function fail_one_metric()`
      );
    }

    const rows = await client.query("select metric from scores");
    expect(rows.rows).toEqual([]);
  });

  test("tells two Entrants' Seasons apart on points and on behaviour", async () => {
    // Two paths of the same length that diverge in both things the record
    // holds. The first Entrant was legal first time, then took one Repair and
    // played a Bench Boost. The second owed a Hit in its opening and then
    // never produced a legal action at all, so its Gameweek 2 Rolled Over onto
    // the eleven it already had.
    await seed({ gameweek: 1 });
    await seed({
      gameweek: 2,
      state: legalStateFrom(BENCH_BOOST, OPENED, 2),
      repairs: 1
    });
    await attempt({ gameweek: 2, attemptNo: 0, kind: "formation" });
    await attempt({ gameweek: 2, attemptNo: 1 });

    const paidForIt = { ...OPENED, hits: 4 };
    await seed({ gameweek: 1, entrantId: "entrant/v2", state: paidForIt });
    await seed({
      gameweek: 2,
      entrantId: "entrant/v2",
      state: rolledOverState(paidForIt),
      repairs: 3,
      rolledOver: true
    });
    for (const [attemptNo, kind] of [
      [0, "budget"], [1, "budget"], [2, "club_limit"], [3, "formation"]
    ] as const) {
      await attempt({
        gameweek: 2, entrantId: "entrant/v2", attemptNo, kind
      });
    }

    await settle(1);
    await settle(2);
    await score(1);
    await score(2);

    const through = async (metric: string): Promise<unknown[]> => {
      const rows = await client.query(
        `select model_id, value::float8 as value, n, detail
           from scores
          where track = 'fpl' and gw = 2 and metric = $1
          order by model_id`,
        [metric]
      );
      return rows.rows;
    };

    // The opening eleven score 49 and Palmer's armband adds 9, so 58 — less
    // the second Entrant's four-point Hit, 54. The Bench Boost adds the bench's
    // 10+9+11+12 = 42 for 100, and the Rolled Over Gameweek plays the same
    // eleven with no Hit to pay for 58. So 58+100 = 158 against 54+58 = 112.
    expect(await through(FPL_POINTS_SEASON_TO_DATE_METRIC)).toEqual([
      {
        model_id: "entrant/v1",
        value: 158,
        n: 2,
        detail: expect.objectContaining({
          gameweeks: [{ gw: 1, points: 58 }, { gw: 2, points: 100 }]
        })
      },
      {
        model_id: "entrant/v2",
        value: 112,
        n: 2,
        detail: expect.objectContaining({
          gameweeks: [{ gw: 1, points: 54 }, { gw: 2, points: 58 }]
        })
      }
    ]);

    // 0 and 1 Repairs against 0 and a whole allowance spent for nothing.
    expect(await through(REPAIRS_SEASON_TO_DATE_METRIC)).toEqual([
      {
        model_id: "entrant/v1",
        value: 0.5,
        n: 2,
        detail: {
          startingGameweek: 1,
          distribution: { "0": 1, "1": 1, "2": 0, "3": 0, failed: 0 }
        }
      },
      {
        model_id: "entrant/v2",
        value: 1.5,
        n: 2,
        detail: {
          startingGameweek: 1,
          distribution: { "0": 1, "1": 0, "2": 0, "3": 0, failed: 1 }
        }
      }
    ]);

    expect(await through(ROLL_OVER_RATE_SEASON_TO_DATE_METRIC)).toEqual([
      {
        model_id: "entrant/v1",
        value: 0,
        n: 2,
        detail: { startingGameweek: 1, gameweeks: [] }
      },
      {
        model_id: "entrant/v2",
        value: 0.5,
        n: 2,
        detail: { startingGameweek: 1, gameweeks: [2] }
      }
    ]);

    // One formation breach against two budget breaches, a club limit and a
    // formation — the metric the demonstration ranking cannot separate Base
    // Models on, separating them.
    expect(await through(VIOLATION_PROFILE_SEASON_TO_DATE_METRIC)).toEqual([
      {
        model_id: "entrant/v1",
        value: 1,
        n: 2,
        detail: expect.objectContaining({
          kinds: expect.objectContaining({ formation: 1, budget: 0 })
        })
      },
      {
        model_id: "entrant/v2",
        value: 4,
        n: 2,
        detail: expect.objectContaining({
          kinds: expect.objectContaining({
            budget: 2,
            club_limit: 1,
            formation: 1
          })
        })
      }
    ]);
  });
});

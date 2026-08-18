import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import { loadOwnRecord } from "../src/fpl/fpl-gameweek-context.js";
import {
  buildFplTrackContext,
  type OwnRecord
} from "../src/context/build-fpl-track-context.js";
import { storeManagerState } from "../src/fpl/manager-state-store.js";
import { rolledOverState } from "../src/fpl/apply-gameweek-action.js";
import { FPL_POINTS_SEASON_TO_DATE_METRIC } from "../src/fpl/demonstration-record.js";
import { MAX_REPAIRS } from "../src/repairs.js";
import { FPL_POOL, trackPool } from "./fpl-pool-fixture.js";
import { legalStateFrom } from "./fpl-replay.js";
import { OPENING_ACTION as OPENING } from "./fpl-action-fixture.js";
import { EVERYONE_PLAYED, storeSettledPoints } from "./fpl-points-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const ENTRANT = "entrant/v1";

/**
 * Palmer's armband, the eleven and the four on the bench as `EVERYONE_PLAYED`
 * and the opening Team Sheet come to — hand-checked once here rather than
 * inside every test, the way `score-fpl-gameweek.test.ts` checks its own
 * total: the eleven score 6+2+5+1+2+9+3+7+2+4+8 = 49 and Palmer's armband
 * doubles his 9 for 58.
 */
const EXPECTED_STARTERS = [
  { fplId: 1, points: 6 },
  { fplId: 3, points: 2 },
  { fplId: 4, points: 5 },
  { fplId: 5, points: 1 },
  { fplId: 6, points: 2 },
  { fplId: 8, points: 9 },
  { fplId: 9, points: 3 },
  { fplId: 10, points: 7 },
  { fplId: 11, points: 2 },
  { fplId: 13, points: 4 },
  { fplId: 14, points: 8 }
];
const EXPECTED_BENCH = [
  { fplId: 2, points: 10 },
  { fplId: 7, points: 9 },
  { fplId: 12, points: 11 },
  { fplId: 15, points: 12 }
];
const EXPECTED_ARMBAND = {
  fplId: 8,
  points: 9,
  multiplier: 2,
  contribution: 18
};

/**
 * The record's own account of one Gameweek, over the pure builder: a settled
 * Gameweek's block is the same lines whatever seam produced its `OwnRecord`,
 * which is the whole reason the builder can be trusted here as the seam
 * that turns loaded facts into an expected string.
 */
function ownRecordLines(ownRecord: OwnRecord | null): string[] {
  const body = buildFplTrackContext({
    season: SEASON,
    gameweek: 99,
    state: legalStateFrom(OPENING),
    pool: trackPool(FPL_POOL),
    schedule: [],
    league: null,
    performance: [],
    settledThrough: null,
    ownRecord
  });
  const lines = body.split("\n");
  const blockOpens = lines.indexOf("Your Manager State");
  const blockCloses = lines.indexOf("", blockOpens);
  const start = lines.findIndex(
    (line, index) => index >= blockOpens && line.startsWith("Your own record")
  );
  return lines.slice(start, blockCloses);
}

describe("an Entrant's own record, read from what is stored", () => {
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
         ('2026-27', 4, '2026-09-11T17:30:00Z')`
    );
    await client.query(
      `insert into models (id, name, base_model, provider, prompt_version, role)
       values ($1, 'Tracer Entrant', 'openai/gpt-5.2', 'openai',
               'fpl/2026-27-v2', 'entrant')`,
      [ENTRANT]
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

  /** Gameweek 1, played, settled and scored — the record every test builds on. */
  async function settleGameweekOne(): Promise<void> {
    await storeManagerState(client, {
      entrantId: ENTRANT,
      season: SEASON,
      gameweek: 1,
      state: legalStateFrom(OPENING),
      attemptsUsed: 0,
      rationale: "The opening fifteen.",
      predictedAt: new Date("2026-08-21T17:00:00Z")
    });
    await storeSettledPoints(client, 1, EVERYONE_PLAYED);
    await scoreFplGameweek({ database: client, season: SEASON, gameweek: 1 });
  }

  test("says plainly that nothing has settled yet, before it has", async () => {
    const record = await loadOwnRecord(client, SEASON, ENTRANT, 1);

    expect(record).toBeNull();
    expect(ownRecordLines(record)).toEqual([
      "Your own record: no Gameweek has settled yet."
    ]);
  });

  test("names the Gameweek right behind it, once one has settled", async () => {
    await settleGameweekOne();

    const record = await loadOwnRecord(client, SEASON, ENTRANT, 2);

    expect(record).toEqual({
      gameweek: 1,
      starters: EXPECTED_STARTERS,
      bench: EXPECTED_BENCH,
      armband: EXPECTED_ARMBAND,
      seasonPoints: 58
    });
    expect(ownRecordLines(record)).toEqual([
      "Your own record, from Gameweek 1, the latest Settled Gameweek:",
      "Starters, with what each returned:",
      "- 1 | 6 pts",
      "- 3 | 2 pts",
      "- 4 | 5 pts",
      "- 5 | 1 pts",
      "- 6 | 2 pts",
      "- 8 | 9 pts",
      "- 9 | 3 pts",
      "- 10 | 7 pts",
      "- 11 | 2 pts",
      "- 13 | 4 pts",
      "- 14 | 8 pts",
      "Bench, with what each returned:",
      "- 2 | 10 pts",
      "- 7 | 9 pts",
      "- 12 | 11 pts",
      "- 15 | 12 pts",
      "Armband: 8 | 9 pts x2 = 18 pts",
      "Season points to date: 58"
    ]);
  });

  test("reaches back across a Gap to the Gameweek that actually settled", async () => {
    // Gameweek 2 stores nothing for this Entrant at all — a silent Gameweek,
    // not a Roll Over — so its own record still names Gameweek 1 rather than
    // assuming "last Gameweek" is one behind whatever is asked for.
    await settleGameweekOne();

    const record = await loadOwnRecord(client, SEASON, ENTRANT, 4);

    expect(record?.gameweek).toBe(1);
    expect(ownRecordLines(record)[0]).toBe(
      "Your own record, from Gameweek 1, the latest Settled Gameweek:"
    );
  });

  test("shows the standing Sheet a Roll Over played, not a rebuilt one", async () => {
    await settleGameweekOne();

    // A Roll Over stores what stood, unchanged — the Sheet that played — so
    // its own record must show Gameweek 1's eleven and bench again under
    // Gameweek 2's name, not an empty or rebuilt one.
    const rolled = rolledOverState(legalStateFrom(OPENING));
    await storeManagerState(client, {
      entrantId: ENTRANT,
      season: SEASON,
      gameweek: 2,
      state: rolled,
      attemptsUsed: MAX_REPAIRS,
      rolledOver: true,
      rationale: null,
      predictedAt: new Date("2026-08-28T17:00:00Z")
    });
    await storeSettledPoints(client, 2, EVERYONE_PLAYED);
    await scoreFplGameweek({ database: client, season: SEASON, gameweek: 2 });

    const record = await loadOwnRecord(client, SEASON, ENTRANT, 3);

    expect(record).toEqual({
      gameweek: 2,
      starters: EXPECTED_STARTERS,
      bench: EXPECTED_BENCH,
      armband: EXPECTED_ARMBAND,
      // Gameweek 1's 58 folded with Gameweek 2's own 58.
      seasonPoints: 116
    });
    expect(ownRecordLines(record)).toEqual([
      "Your own record, from Gameweek 2, the latest Settled Gameweek:",
      "Starters, with what each returned:",
      "- 1 | 6 pts",
      "- 3 | 2 pts",
      "- 4 | 5 pts",
      "- 5 | 1 pts",
      "- 6 | 2 pts",
      "- 8 | 9 pts",
      "- 9 | 3 pts",
      "- 10 | 7 pts",
      "- 11 | 2 pts",
      "- 13 | 4 pts",
      "- 14 | 8 pts",
      "Bench, with what each returned:",
      "- 2 | 10 pts",
      "- 7 | 9 pts",
      "- 12 | 11 pts",
      "- 15 | 12 pts",
      "Armband: 8 | 9 pts x2 = 18 pts",
      "Season points to date: 116"
    ]);
  });

  test("refuses a scored Gameweek this Entrant holds no Season-to-date row for", async () => {
    // The two rows are always written in the same transaction (`writeRecord`),
    // so one without the other is a corrupted record, not a Gameweek with
    // nothing to report — a silent zero would misreport the Entrant's Season.
    await settleGameweekOne();
    await client.query(
      "delete from scores where model_id = $1 and metric = $2",
      [ENTRANT, FPL_POINTS_SEASON_TO_DATE_METRIC]
    );

    await expect(loadOwnRecord(client, SEASON, ENTRANT, 2)).rejects.toThrow(
      /holds a scored FPL Gameweek 1 .* but no Season-to-date row/
    );
  });
});

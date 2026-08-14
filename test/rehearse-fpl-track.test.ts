import pg from "pg";
import { DEFAULT_HTTP_TIMEOUT_MS } from "../src/http.js";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import {
  DEMONSTRATION_QUALIFICATION,
  FPL_DEMONSTRATION_METRICS
} from "../src/fpl/demonstration-record.js";
import { runDailyFetch } from "../src/fetch/daily-fetch.js";
import { readFplRehearsalReport } from "../src/fpl-rehearsal/rehearsal-report.js";
import { runFplGameweek } from "../src/fpl/run-fpl-gameweek.js";
import { startFplTrack } from "../src/fpl/start-fpl-track.js";
import { createRehearsalFetcher } from "../src/fpl-rehearsal/rehearsal-fetcher.js";
import { rehearsedBootstrap } from "../src/fpl-rehearsal/rehearsed-bootstrap.js";
import { rehearsedPoints } from "../src/fpl-rehearsal/rehearsed-points.js";
import {
  absent,
  BENCHED_CAPTAIN,
  BENCHED_CAPTAIN_OPENING,
  EVERYONE_PLAYED,
  OPENING,
  OPENING_GAMEWEEK_POINTS,
  SELL_INTO_A_RISE,
  STAND_PAT,
  THREE_AT_THE_BACK,
  WATKINS_RISE,
  withChip
} from "../src/fpl-rehearsal/rehearsal-script.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";
import { BASE_MODELS } from "./fpl-seat-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
/**
 * The rehearsal asks for the Season it is playing, not the Season the CSV was
 * archived from. `fetchFootballDataSeason` stores what it loads under the
 * Season requested, and the daily fetch refuses to run past Gameweek 1's
 * deadline with no matches stored for the current Season — so a rehearsal that
 * asked for 2025-26 could open the track and never play a Gameweek. The bytes
 * are the archived ones either way; only the Season they are filed under moves.
 */
const FOOTBALL_DATA_SEASON = SEASON;

function seatId(baseModel: string): string {
  return `fpl/${baseModel.split("/")[1]}`;
}

describe("rehearsing the FPL track over archived Gameweeks", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let bootstrap: string;
  let snapshots: { source: string; body: string }[];

  beforeAll(async () => {
    await client.connect();
    bootstrap = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    snapshots = [
      {
        source: "fpl_fixtures",
        body: await archivedBody("fpl-fixtures-2026-27.json.gz")
      },
      {
        source: `football_data:${FOOTBALL_DATA_SEASON}:E0`,
        body: await archivedBody("football-data-2526-E0.csv.gz")
      },
      {
        source: `football_data:${FOOTBALL_DATA_SEASON}:E1`,
        body: await archivedBody("football-data-2526-E1.csv.gz")
      }
    ];

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
    for (const baseModel of BASE_MODELS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $2, $3, 'vendor', $4, 'entrant')`,
        [seatId(baseModel), baseModel, baseModel, FPL_PROMPT_VERSION]
      );
    }
  });

  /** One rehearsed day: the daily fetch, through archived and fabricated bytes. */
  async function fetchDay({
    gameweek,
    settled = {},
    prices,
    at
  }: {
    gameweek: number;
    /** What each settled Gameweek came to, by Gameweek. */
    settled?: Record<number, Record<number, {
      minutes: number;
      totalPoints: number;
    }>>;
    prices?: Record<number, number>;
    at: string;
  }) {
    const settledGameweeks = Object.keys(settled).map(Number);
    return runDailyFetch({
      database: client,
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      http: createRehearsalFetcher({
        season: SEASON,
        snapshots: [
          ...snapshots,
          {
            source: "fpl_bootstrap",
            body: rehearsedBootstrap({
              archived: bootstrap,
              gameweek,
              settled: settledGameweeks,
              ...prices === undefined ? {} : { prices }
            })
          },
          ...settledGameweeks.map((settledGameweek) => ({
            source: `fpl_live:${SEASON}:${settledGameweek}`,
            body: rehearsedPoints({
              archived: bootstrap,
              scored: settled[settledGameweek]!
            })
          }))
        ],
        answer: () => "no Entrant is called by the fetch"
      }),
      now: () => new Date(at)
    });
  }

  /** Opens the track for all ten at Gameweek 1, which every later Gameweek
   * needs a Squad standing behind it for. */
  async function openTheTrack(
    answer: (baseModel: string, attempt: number) => string = () => OPENING
  ) {
    await fetchDay({ gameweek: 1, at: "2026-08-20T06:00:00Z" });
    return startFplTrack({
      database: client,
      season: SEASON,
      gameweek: 1,
      concurrency: 3,
      apiKey: "rehearsal",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      http: createRehearsalFetcher({ season: SEASON, snapshots, answer }),
      now: () => new Date("2026-08-21T11:30:00Z")
    });
  }

  /** One rehearsed Gameweek: the day's fetch, then the whole roster's actions. */
  async function playGameweek({
    gameweek,
    at,
    deadline,
    prices,
    answer
  }: {
    gameweek: number;
    at: string;
    deadline: string;
    prices?: Record<number, number>;
    answer: (baseModel: string, attempt: number) => string;
  }) {
    await fetchDay({
      gameweek,
      at,
      ...prices === undefined ? {} : { prices }
    });
    return runFplGameweek({
      database: client,
      season: SEASON,
      gameweek,
      concurrency: 3,
      apiKey: "rehearsal",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      http: createRehearsalFetcher({ season: SEASON, snapshots, answer }),
      now: () => new Date(deadline)
    });
  }

  test("opens all ten Entrants at the Gameweek the operator chose", async () => {
    await fetchDay({ gameweek: 1, at: "2026-08-20T06:00:00Z" });

    const opening = await startFplTrack({
      database: client,
      season: SEASON,
      gameweek: 1,
      concurrency: 3,
      apiKey: "rehearsal",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      http: createRehearsalFetcher({
        season: SEASON,
        snapshots,
        answer: () => OPENING
      }),
      now: () => new Date("2026-08-21T11:30:00Z")
    });

    expect(opening).toEqual({ gameweek: 1, missing: [] });
    const states = await client.query<{ n: number }>(
      "select count(*)::int as n from manager_states where gw = 1"
    );
    expect(states.rows).toEqual([{ n: SEASON_ROSTER_SIZE }]);
  });

  test("starts nobody when one Entrant cannot open, and keeps the attempts", async () => {
    await fetchDay({ gameweek: 1, at: "2026-08-20T06:00:00Z" });
    const stubborn = BASE_MODELS[4]!;

    // The armband on a substitute, four times over: the opening answer and
    // three Repairs. Every Entrant but one opens legally; that one never does.
    const opening = await startFplTrack({
      database: client,
      season: SEASON,
      gameweek: 1,
      concurrency: 3,
      apiKey: "rehearsal",
      entrantCallTimeoutMs: DEFAULT_HTTP_TIMEOUT_MS,
      http: createRehearsalFetcher({
        season: SEASON,
        snapshots,
        answer: (baseModel) => baseModel === stubborn
          ? BENCHED_CAPTAIN_OPENING
          : OPENING
      }),
      now: () => new Date("2026-08-21T11:30:00Z")
    });

    // The Season path begins for the whole roster or for none of it: the
    // states committed while one never arrives would be demonstrations a
    // Gameweek longer than the one they are ranked against, and
    // `manager_states` is insert-only, so there would be no way back.
    expect(opening).toEqual({ gameweek: 1, missing: [seatId(stubborn)] });
    const states = await client.query<{ n: number }>(
      "select count(*)::int as n from manager_states"
    );
    expect(states.rows).toEqual([{ n: 0 }]);

    // What survives a refused start is the attempt record, which is what the
    // operator reads to decide whether to try the next Gameweek.
    const attempts = await client.query<{ n: number }>(
      "select count(*)::int as n from attempts where gw = 1"
    );
    expect(attempts.rows[0]!.n).toBeGreaterThan(SEASON_ROSTER_SIZE);
  });

  test("pays for the second Transfer and receives Selling Price for the first", async () => {
    await openTheTrack();
    const trader = BASE_MODELS[1]!;

    // Watkins rose from £8.0m to £8.3m. Selling Price is the purchase price
    // plus half the rise rounded down, so £8.1m comes back rather than £8.0m
    // or £8.3m — and the odd tenth is the point, because a rule that rounded
    // the other way would hand back £8.2m.
    const played = await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      prices: WATKINS_RISE,
      answer: (baseModel) => baseModel === trader ? SELL_INTO_A_RISE : STAND_PAT
    });

    expect(played).toMatchObject({ kind: "played", missing: [] });
    const state = await client.query<{
      bank: number;
      free_transfers: number;
      hits: number;
    }>(
      `select bank, free_transfers, hits
         from manager_states where gw = 2 and model_id = $1`,
      [seatId(trader)]
    );
    // £1.5m banked, plus £8.1m for Watkins and £4.5m for Furo, less £9.0m for
    // Isak and £4.5m for Mheuka: £0.6m left.
    //
    // One Free Transfer was banked and two were spent, so the second is a Hit
    // — four points, which is what `hits` counts rather than the number of
    // them. The count reopens at one: nothing survives being overspent, and
    // the Gameweek grants its own regardless.
    expect(state.rows).toEqual([
      { bank: 6, free_transfers: 1, hits: 4 }
    ]);

    // The Entrant standing pat beside it spent nothing and took no Hit, so the
    // Hit above is the Transfer's doing rather than the Gameweek's.
    const idle = await client.query<{ bank: number; hits: number }>(
      `select bank, hits
         from manager_states where gw = 2 and model_id = $1`,
      [seatId(BASE_MODELS[0]!)]
    );
    expect(idle.rows).toEqual([{ bank: 15, hits: 0 }]);
  });

  test("spends all four Chips, and neither transfer Chip pays for its Transfers", async () => {
    await openTheTrack();
    const [, , wildcard, freeHit, benchBoost, tripleCaptain] = BASE_MODELS;
    const chipOf = new Map([
      [wildcard!, withChip(SELL_INTO_A_RISE, "wildcard")],
      [freeHit!, withChip(SELL_INTO_A_RISE, "free_hit")],
      [benchBoost!, withChip(STAND_PAT, "bench_boost")],
      [tripleCaptain!, withChip(STAND_PAT, "triple_captain")]
    ]);

    const played = await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      prices: WATKINS_RISE,
      answer: (baseModel) => chipOf.get(baseModel) ?? STAND_PAT
    });

    expect(played).toMatchObject({ kind: "played", missing: [] });
    const spent = await client.query<{
      model_id: string;
      chips_used: { firstHalf: string[]; secondHalf: string[] };
      hits: number;
      free_transfers: number;
    }>(
      `select model_id, chips_used, hits, free_transfers
         from manager_states
        where gw = 2 and model_id = any($1)
        order by model_id`,
      [[wildcard, freeHit, benchBoost, tripleCaptain].map((m) => seatId(m!))]
    );

    // Every Chip is recorded against the half of the Season it was played in,
    // which is what makes the first set expire unspent at Gameweek 19 without
    // anything having to expire it.
    expect(spent.rows.map(({ model_id, chips_used }) =>
      [model_id, chips_used] as const)).toEqual([
      [seatId(wildcard!), { firstHalf: ["wildcard"], secondHalf: [] }],
      [seatId(freeHit!), { firstHalf: ["free_hit"], secondHalf: [] }],
      [seatId(benchBoost!), { firstHalf: ["bench_boost"], secondHalf: [] }],
      [seatId(tripleCaptain!), { firstHalf: ["triple_captain"], secondHalf: [] }]
    ]);

    // The same two Transfers cost the plain Entrant four points above. Under
    // either transfer Chip they cost nothing, and the banked Free Transfer is
    // left exactly as the Chip found it rather than spent or topped up.
    const transferChips = spent.rows.filter(({ model_id }) =>
      model_id === seatId(wildcard!) || model_id === seatId(freeHit!));
    expect(transferChips.map(({ hits, free_transfers }) =>
      ({ hits, free_transfers }))).toEqual([
      { hits: 0, free_transfers: 1 },
      { hits: 0, free_transfers: 1 }
    ]);
  });

  test("repairs one Entrant back to a legal action and Rolls another over", async () => {
    await openTheTrack();
    const repaired = BASE_MODELS[6]!;
    const stubborn = BASE_MODELS[7]!;

    const played = await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      answer: (baseModel, attempt) => {
        // One Entrant breaks a rule, is told which, and comes back with a
        // legal action. The other never does, through all three Repairs.
        if (baseModel === repaired) {
          return attempt === 0 ? BENCHED_CAPTAIN : STAND_PAT;
        }
        return baseModel === stubborn ? BENCHED_CAPTAIN : STAND_PAT;
      }
    });

    // Both are Gameweeks played. A Roll Over is a Manager State stored on the
    // Team Sheet already standing — never a Gap and never a score of zero.
    expect(played).toMatchObject({ kind: "played", missing: [] });
    const outcomes = await client.query<{
      model_id: string;
      attempts_used: number;
      rolled_over: boolean;
    }>(
      `select model_id, attempts_used, rolled_over
         from manager_states
        where gw = 2 and model_id = any($1)
        order by model_id`,
      [[seatId(repaired), seatId(stubborn)]]
    );
    expect(outcomes.rows).toEqual([
      { model_id: seatId(repaired), attempts_used: 1, rolled_over: false },
      { model_id: seatId(stubborn), attempts_used: 3, rolled_over: true }
    ]);

    // The Repair loop is one conversation: the Entrant that was told what it
    // broke was handed that sentence and answered it, rather than being asked
    // the opening question twice.
    const refused = await client.query<{ n: number }>(
      `select count(*)::int as n from attempts
        where gw = 2 and model_id = $1 and error_kind is not null`,
      [seatId(repaired)]
    );
    expect(refused.rows).toEqual([{ n: 1 }]);
  });

  test("scores a Gameweek the rehearsal marked checked against a hand-computed total", async () => {
    await openTheTrack();

    // Gameweek 2 is the day the rehearsal learns Gameweek 1 has checked. The
    // daily fetch stores the points and scores what it settles, which is where
    // the record is written in production.
    await fetchDay({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      settled: { 1: EVERYONE_PLAYED }
    });

    const scored = await client.query<{
      model_id: string;
      metric: string;
      value: number;
    }>(
      `select model_id, metric, value::int as value
         from scores
        where gw = 1 and metric in ('fpl_points', 'fpl_points_season_to_date')
        order by model_id, metric`,
      []
    );

    // Every Entrant opened with the same Squad, so every Entrant scores the
    // same 69: the eleven who started are worth 57 and the captain's 12 counts
    // twice. The 42 on the bench is left where it is.
    expect(scored.rows).toHaveLength(SEASON_ROSTER_SIZE * 2);
    expect(new Set(scored.rows.map(({ value }) => value)))
      .toEqual(new Set([OPENING_GAMEWEEK_POINTS]));

    // The first settled Gameweek is also the whole Season so far, so the
    // cumulative metric agrees with the Gameweek rather than doubling it.
    const cumulative = scored.rows.filter(
      ({ metric }) => metric === "fpl_points_season_to_date"
    );
    expect(cumulative).toHaveLength(SEASON_ROSTER_SIZE);
  });

  test("folds two settled Gameweeks into a cumulative total, and a Hit out of one", async () => {
    await openTheTrack();
    const trader = BASE_MODELS[1]!;
    await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      prices: WATKINS_RISE,
      answer: (baseModel) => baseModel === trader ? SELL_INTO_A_RISE : STAND_PAT
    });

    // Both Gameweeks have checked by the time the rehearsal reaches Gameweek 3.
    await fetchDay({
      gameweek: 3,
      at: "2026-09-03T06:00:00Z",
      settled: { 1: EVERYONE_PLAYED, 2: EVERYONE_PLAYED }
    });

    const cumulative = await client.query<{ value: number }>(
      `select value::int as value
         from scores
        where gw = 2 and metric = 'fpl_points_season_to_date'
          and model_id = $1`,
      [seatId(BASE_MODELS[0]!)]
    );
    // Two stand-pat Gameweeks at 69 apiece.
    expect(cumulative.rows).toEqual([
      { value: OPENING_GAMEWEEK_POINTS * 2 }
    ]);

    // The Entrant that paid for a second Transfer carries the four points it
    // cost. Isak and Mheuka are not in the matchday squads the rehearsal
    // fabricated, so its Gameweek is its remaining nine starters — the Hit is
    // what this assertion is about, and it is the only difference the run can
    // account for between the two totals.
    const paid = await client.query<{ metric: string; value: number }>(
      `select metric, value::int as value
         from scores
        where gw = 2 and model_id = $1
          and metric in ('fpl_points', 'fpl_points_season_to_date')
        order by metric`,
      [seatId(trader)]
    );
    //
    // Its ten remaining starters are worth 49, Isak is absent so Soler is
    // substituted in for 9, Haaland's armband adds 12 again, and the Hit takes
    // 4 back: 70 - 4 = 66, and 69 + 66 = 135 across the Season.
    expect(paid.rows).toEqual([
      { metric: "fpl_points", value: 66 },
      { metric: "fpl_points_season_to_date", value: 135 }
    ]);
  });

  test("passes over a substitute the formation forbids and takes the next one", async () => {
    await openTheTrack();
    const short = BASE_MODELS[3]!;
    await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      answer: (baseModel) =>
        baseModel === short ? THREE_AT_THE_BACK : STAND_PAT
    });

    // Saliba is left out, so a Squad that started three Defenders is down to
    // two. Furo is first off the bench and is a Forward: bringing him on would
    // leave the formation illegal, so he is passed over for Thomas behind him.
    await fetchDay({
      gameweek: 3,
      at: "2026-09-03T06:00:00Z",
      settled: { 2: absent([6]) }
    });

    const scored = await client.query<{ value: number }>(
      `select value::int as value
         from scores
        where gw = 2 and metric = 'fpl_points' and model_id = $1`,
      [seatId(short)]
    );
    // Ten starters are worth 64 with Saliba blank, Thomas comes on for 2, and
    // Haaland's armband adds 12 again: 78. Had Furo come on instead it would
    // be 88, which is the number this assertion exists to rule out.
    expect(scored.rows).toEqual([{ value: 78 }]);
  });

  test("doubles the vice-captain when the captain does not play", async () => {
    await openTheTrack();
    await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      answer: () => STAND_PAT
    });

    // Haaland wears the armband and is left out of the matchday squad.
    await fetchDay({
      gameweek: 3,
      at: "2026-09-03T06:00:00Z",
      settled: { 2: absent([411]) }
    });

    const scored = await client.query<{ value: number }>(
      `select value::int as value
         from scores
        where gw = 2 and metric = 'fpl_points' and model_id = $1`,
      [seatId(BASE_MODELS[0]!)]
    );
    // Ten starters are worth 45 without Haaland, Soler comes on for 9, and
    // Palmer's 9 counts twice in the absent captain's place: 63. An armband
    // that stayed on a player who never appeared would leave it at 54.
    expect(scored.rows).toEqual([{ value: 63 }]);
  });

  test("reports every Entrant's whole path, with the qualification on it", async () => {
    await openTheTrack();
    const stubborn = BASE_MODELS[7]!;
    await playGameweek({
      gameweek: 2,
      at: "2026-08-27T06:00:00Z",
      deadline: "2026-08-28T11:30:00Z",
      answer: (baseModel) =>
        baseModel === stubborn ? BENCHED_CAPTAIN : STAND_PAT
    });
    await fetchDay({
      gameweek: 3,
      at: "2026-09-03T06:00:00Z",
      settled: { 1: EVERYONE_PLAYED, 2: EVERYONE_PLAYED }
    });

    const report = await readFplRehearsalReport({
      database: client,
      season: SEASON
    });

    // A ranking cannot reach a reader without the sentence that says what it
    // is worth, so the report carries it rather than leaving it to whoever
    // prints the numbers.
    expect(report.qualification).toBe(DEMONSTRATION_QUALIFICATION);
    expect(report.entrants).toHaveLength(SEASON_ROSTER_SIZE);
    expect(report.incomplete).toEqual([]);

    // Ten paths of equal length: the Entrant that Rolled Over holds Gameweek 2
    // as surely as the seats that answered it, which is the whole difference
    // between a Roll Over and a Gap.
    expect(new Set(report.entrants.map(({ path }) => path.length)))
      .toEqual(new Set([2]));
    const rolled = report.entrants.find(
      ({ entrantId }) => entrantId === seatId(stubborn)
    );
    expect(rolled?.path.map(({ gameweek, rolledOver }) =>
      ({ gameweek, rolledOver }))).toEqual([
      { gameweek: 1, rolledOver: false },
      { gameweek: 2, rolledOver: true }
    ]);

    // Every measure the record is made of reaches the report, for both
    // Gameweeks, rather than the points alone.
    expect(new Set(rolled?.metrics.map(({ metric }) => metric)))
      .toEqual(new Set(FPL_DEMONSTRATION_METRICS));

    // The Roll Over is visible as a rule broken, not merely as a flag: the
    // Entrant put the armband on a substitute four times over.
    const profile = rolled?.metrics.find(({ metric, gameweek }) =>
      metric === "violation_profile" && gameweek === 2);
    expect(profile?.value).toBe(4);
  });
});

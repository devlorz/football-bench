import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Probs } from "../src/fixture-result.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import {
  BET_HIT_PCT_METRIC,
  BET_HIT_PCT_SEASON_TO_DATE_METRIC,
  BET_POINTS_METRIC,
  BET_POINTS_QUALIFICATION,
  BET_POINTS_SEASON_TO_DATE_METRIC,
  GAP_RATE_METRIC,
  MATCH_POINTS_METRIC,
  REFERENCE_ELO,
  REFERENCE_HOME,
  REFERENCE_UNIFORM,
  RPS_METRIC,
  RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
} from "../src/predictions/score-match-gameweek.js";
import type { DryRunArchive } from "../src/dry-run/load-archive.js";
import { rehearseScoring } from "../src/dry-run/rehearse-scoring.js";
import { archivedBase64Body, archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const FOOTBALL_DATA_SEASON = "2025-26";
const GAMEWEEK = 1;
const SCORED_AT = new Date("2026-08-25T10:00:00Z");

/**
 * A second and third Entrant, built by rewriting the archived response's
 * answer and leaving every other byte of it alone. Preflight calls each Base
 * Model about one Fixture, so every archived answer names the same one — which
 * is what gives the rehearsal a complete case to compare over.
 */
function answering(
  archived: string,
  probs: Probs,
  score: [number, number]
): string {
  const response = JSON.parse(archived) as {
    choices: { message: { content: string } }[];
  };
  const answer = JSON.parse(response.choices[0]!.message.content) as
    Record<string, unknown>;
  response.choices[0]!.message.content = JSON.stringify({
    ...answer,
    probs,
    score: { home: score[0], away: score[1] }
  });
  return JSON.stringify(response);
}

function entrant(id: string, baseModel: string): DryRunArchive["entrants"][0] {
  return {
    id,
    name: id,
    role: "entrant",
    base_model: baseModel,
    provider: "openai",
    quantization: null,
    prompt_version: MATCH_PROMPT_VERSION,
    config: {},
    created_at: new Date("2026-07-01T00:00:00Z"),
    withdrawn_at: null
  };
}

describe("rehearsing the complete scorer on the archived Gameweek", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let archive: DryRunArchive;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    const sol = await archivedBase64Body(
      "openrouter-gpt-5.6-sol-pro-2026-07-29.base64"
    );
    archive = {
      observedAt: new Date("2026-07-29T00:00:00Z"),
      snapshots: [
        {
          source: "fpl_bootstrap",
          body: await archivedBody("fpl-bootstrap-2026-27.json.gz")
        },
        {
          source: "fpl_fixtures",
          body: await archivedBody("fpl-fixtures-2026-27.json.gz")
        },
        {
          source: "football_data:2025-26:E0",
          body: await archivedBody("football-data-2526-E0.csv.gz")
        },
        {
          source: "football_data:2025-26:E1",
          body: await archivedBody("football-data-2526-E1.csv.gz")
        },
        { source: "openrouter-preflight:openai/gpt-5.6-sol-pro", body: sol },
        {
          source: "openrouter-preflight:vendor/steady",
          body: answering(sol, { H: 0.5, D: 0.3, A: 0.2 }, [1, 0])
        },
        {
          source: "openrouter-preflight:vendor/drawish",
          body: answering(sol, { H: 0.3, D: 0.4, A: 0.3 }, [1, 1])
        }
      ],
      entrants: [
        entrant("sol", "openai/gpt-5.6-sol-pro"),
        entrant("steady", "vendor/steady"),
        entrant("drawish", "vendor/drawish")
      ]
    };

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
  });

  const rehearse = () =>
    rehearseScoring({
      target: client,
      archive,
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

  test("settles the scripted results and scores the archived Gameweek", async () => {
    const { report } = await rehearse();

    // sol's archived 3-0 is replayed on all ten Fixtures. Against the script
    // it calls the Home win at the wrong goal difference four times — 2-0,
    // 3-1, 4-0 and 2-1 — which spec 0002 pays 2 each, and nothing else.
    expect(report.metrics).toContainEqual({
      entrantId: "sol",
      gw: GAMEWEEK,
      metric: MATCH_POINTS_METRIC,
      value: 8,
      n: 10,
      detail: expect.anything()
    });
  });

  test("settles sol's Gameweek into the Bet Points a person computed", async () => {
    const { report } = await rehearse();
    const rows = report.metrics.filter(({ entrantId }) => entrantId === "sol");

    // sol's 3-0 slip on Fixture 1, which the script settles 2-0. Read by
    // hand, leg by leg —
    //   result           3-0 is a Home win, 2-0 is a Home win       won
    //   over/under 1.5   3 goals named is over, 2 settled is over   won
    //   over/under 2.5   3 goals named is over, 2 settled under     lost
    //   over/under 3.5   3 is under, 2 is under                     won
    //   over/under 4.5   3 is under, 2 is under                     won
    //   btts             3-0 says no, 2-0 says no                   won
    //   handicap 1.5     3-0 backs Home, 2-0 backs Home             won
    const slip = [
      { market: "result", position: "H", settled: "H", won: true },
      {
        market: "over_under_1.5", position: "over", settled: "over",
        won: true
      },
      {
        market: "over_under_2.5", position: "over", settled: "under",
        won: false
      },
      {
        market: "over_under_3.5", position: "under", settled: "under",
        won: true
      },
      {
        market: "over_under_4.5", position: "under", settled: "under",
        won: true
      },
      { market: "btts", position: "no", settled: "no", won: true },
      { market: "handicap_1.5", position: "H", settled: "H", won: true }
    ];
    const betPoints = rows.find(({ metric }) => metric === BET_POINTS_METRIC);
    expect(betPoints).toMatchObject({ value: 41, n: 10 });
    expect((betPoints?.detail as { fixtures: unknown[] }).fixtures[0])
      .toEqual({ fixtureId: 1, predicted: [3, 0], result: [2, 0], slip });

    // The same 3-0 slip against all ten scripted results, market by market:
    //   result  Home wins at 2-0, 3-1, 4-0, 2-1                      4
    //   o/u 1.5 over but at 0-1 and 0-0                              8
    //   o/u 2.5 over at 1-3, 2-2, 3-1, 4-0, 1-2, 2-1                 6
    //   o/u 3.5 under but at 1-3, 2-2, 3-1, 4-0                      6
    //   o/u 4.5 under everywhere                                    10
    //   btts    no at 2-0, 0-1, 0-0, 4-0                             4
    //   hcp 1.5 Home by two at 2-0, 3-1, 4-0                         3
    // — 41 of 70, Fixture by Fixture 6+3+3+3+3+5+3+6+4+5, each market's
    // count stored as its rate over the ten.
    const rate = {
      won: 41,
      bet: 70,
      markets: {
        result: 0.4,
        "over_under_1.5": 0.8,
        "over_under_2.5": 0.6,
        "over_under_3.5": 0.6,
        "over_under_4.5": 1,
        btts: 0.4,
        "handicap_1.5": 0.3
      }
    };
    expect(rows).toContainEqual({
      entrantId: "sol",
      gw: GAMEWEEK,
      metric: BET_HIT_PCT_METRIC,
      value: 41 / 70,
      n: 10,
      detail: rate
    });

    // One Gameweek in, the Season through it is that Gameweek.
    expect(rows.find(({ metric }) => metric === BET_POINTS_SEASON_TO_DATE_METRIC))
      .toMatchObject({ value: 41, n: 10 });
    expect(rows).toContainEqual({
      entrantId: "sol",
      gw: GAMEWEEK,
      metric: BET_HIT_PCT_SEASON_TO_DATE_METRIC,
      value: 41 / 70,
      n: 10,
      detail: { ...rate, gameweeks: [{ gw: GAMEWEEK, n: 10, ...rate }] }
    });
  });

  test("ranks the Entrants on stored Bet Points alone", async () => {
    const { report } = await rehearse();

    // The ranking a reader takes off the season-to-date rows, with nothing
    // recomputed from the Predictions. Each Entrant's one archived answer is
    // replayed on all ten Fixtures, and each slip was read by hand against the
    // script, Fixture by Fixture:
    //   sol     3-0  6+3+3+3+3+5+3+6+4+5  41
    //   drawish 1-1  4+6+3+3+4+3+4+2+4+4  37
    //   steady  1-0  5+3+5+1+1+2+5+3+2+3  30
    // Only sol names a two-goal win, so only sol's Handicap can pay: the other
    // two leave it unbacked on every Fixture, a leg stated and never won.
    const ranked = report.metrics
      .filter(({ metric }) => metric === BET_POINTS_SEASON_TO_DATE_METRIC)
      .sort((one, other) => other.value - one.value)
      .map(({ entrantId, value, n }) => [entrantId, value, n]);

    expect(ranked).toEqual([
      ["sol", 41, 10],
      ["drawish", 37, 10],
      ["steady", 30, 10]
    ]);
  });

  test("publishes one comparison per non-anchor Entrant on the complete case", async () => {
    const { report } = await rehearse();

    // Every Entrant answered all ten Fixtures, so the complete case is the
    // whole Gameweek: four Home wins, three Draws, three Away wins. RPS over
    // the ordered cumulative outcomes, per outcome and then the mean:
    //   sol     0.82/0.12/0.06  H 0.018  D 0.338  A 0.778  → 0.342
    //   steady  0.50/0.30/0.20  H 0.145  D 0.145  A 0.445  → 0.235
    //   drawish 0.30/0.40/0.30  H 0.29   D 0.09   A 0.29   → 0.23
    // Match Points pick the Comparison Anchor: drawish's 1-1 is exact once and
    // the right goal difference at 2-2 and 0-0 for 11, against steady's 9 and
    // sol's 8.
    const compared = report.metrics.filter(
      ({ metric }) => metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    expect(compared).toEqual([
      {
        entrantId: "sol",
        gw: GAMEWEEK,
        metric: RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
        value: expect.closeTo(0.112, 12),
        n: 10,
        detail: expect.anything()
      },
      {
        entrantId: "steady",
        gw: GAMEWEEK,
        metric: RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
        value: expect.closeTo(0.005, 12),
        n: 10,
        detail: expect.anything()
      }
    ]);
  });

  test("produces the whole record in one run, and says so", async () => {
    const { report, shortfalls } = await rehearse();

    expect(shortfalls).toEqual([]);

    // Every Reference Line forecasts all ten Fixtures the Lock owns, and the
    // script settles all ten, so each is scored over the whole Gameweek.
    for (const line of [REFERENCE_HOME, REFERENCE_UNIFORM, REFERENCE_ELO]) {
      expect(report.metrics).toContainEqual({
        entrantId: line,
        gw: GAMEWEEK,
        metric: RPS_METRIC,
        value: expect.any(Number),
        n: 10,
        detail: expect.anything()
      });
    }

    // Each Entrant's one archived answer is replayed on every Fixture asked,
    // so none Gaps — a behavioural measure, and it needs no result.
    for (const entrantId of report.entrants) {
      expect(report.metrics).toContainEqual({
        entrantId,
        gw: GAMEWEEK,
        metric: GAP_RATE_METRIC,
        value: 0,
        n: 10,
        detail: expect.anything()
      });
    }
  });

  test("rehearses a Gameweek from bytes observed long after its Lock", async () => {
    // The operator's archive on 2026-09-26: five Gameweeks past Gameweek 1's
    // deadline. Loaded at that instant, every played Fixture is seen for the
    // first time after its deadline and Locks into the next open Gameweek, so
    // Gameweek 1's Lock owned nothing and the run scored nothing.
    const { report, dryRun, shortfalls } = await rehearseScoring({
      target: client,
      archive: { ...archive, observedAt: new Date("2026-09-26T06:33:08Z") },
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

    expect(dryRun.contexts).toHaveLength(10);
    expect(report.settled).toHaveLength(10);
    expect(shortfalls).toEqual([]);
  });

  test("settles the rehearsed Gameweek's own Fixtures, not Gameweek 1's", async () => {
    // Observed after Gameweek 2's deadline too: loaded just before it, every
    // Gameweek 1 Fixture would Lock into Gameweek 2 beside its own ten.
    const { report, shortfalls } = await rehearseScoring({
      target: client,
      archive: { ...archive, observedAt: new Date("2026-09-26T06:33:08Z") },
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: 2,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

    // FPL numbers the Season's Fixtures in order, so Gameweek 2's are 11-20,
    // settled in that order with the scorelines a person chose.
    expect(report.locked).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(report.settled.slice(0, 2)).toEqual([
      { fixtureId: 11, home: 2, away: 0 },
      { fixtureId: 12, home: 1, away: 1 }
    ]);
    expect(shortfalls).toEqual([]);
  });

  test("answers the Fixture asked, whichever one the archived answer names", async () => {
    // The newest preflight a Base Model holds is usually about another
    // league's Fixture: on 2026-09-27 eight of the ten Match seats' answers
    // named 565776. Replayed as recorded, every Entrant Gapped every Fixture.
    const sol = archive.snapshots.find(({ source }) =>
      source === "openrouter-preflight:openai/gpt-5.6-sol-pro")!;
    const response = JSON.parse(sol.body) as {
      choices: { message: { content: string } }[];
    };
    const answer = JSON.parse(response.choices[0]!.message.content) as
      Record<string, unknown>;
    response.choices[0]!.message.content =
      JSON.stringify({ ...answer, fixture_id: 565776 });
    const { report } = await rehearseScoring({
      target: client,
      archive: {
        ...archive,
        snapshots: archive.snapshots.map((snapshot) => snapshot === sol
          ? { ...snapshot, body: JSON.stringify(response) }
          : snapshot)
      },
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

    expect(report.metrics).toContainEqual({
      entrantId: "sol",
      gw: GAMEWEEK,
      metric: GAP_RATE_METRIC,
      value: 0,
      n: 10,
      detail: expect.anything()
    });
  });

  test("replays an answer that was never JSON as the Gap it was recorded as", async () => {
    const steady = archive.snapshots.find(({ source }) =>
      source === "openrouter-preflight:vendor/steady")!;
    const response = JSON.parse(steady.body) as {
      choices: { message: { content: string } }[];
    };
    response.choices[0]!.message.content = "I would rather not say.";
    const { report } = await rehearseScoring({
      target: client,
      archive: {
        ...archive,
        snapshots: archive.snapshots.map((snapshot) =>
          snapshot.source === "openrouter-preflight:vendor/steady"
            ? { ...snapshot, body: JSON.stringify(response) }
            : snapshot)
      },
      competition: "PL",
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

    // A schema Gap, as the recorded answer gives replayed untouched — not the
    // provider Gap a rewrite that threw on it would turn it into.
    expect(report.metrics).toContainEqual({
      entrantId: "steady",
      gw: GAMEWEEK,
      metric: GAP_RATE_METRIC,
      value: 1,
      n: 10,
      detail: expect.objectContaining({
        causes: expect.objectContaining({ schema: 10, provider: 0 })
      })
    });
  });

  test("leaves every value, sample size and detail alone on a second run", async () => {
    const first = await rehearse();
    // Each invocation of the command builds its own throwaway cluster, so a
    // second run is a second empty database and not a second pass over the
    // first one. Re-scoring rows that are already there is a different
    // question, and one `scoreMatchGameweek` answers in its own suite; this is
    // whether the whole path lands in the same place twice — which is where a
    // drifting Elo replay or an unseeded interval would show.
    await resetSchema(client);
    const second = await rehearse();

    // Carried rather than counted: a comparison whose interval moved while its
    // mean held still is exactly the drift a row count cannot see.
    expect(second.report).toEqual(first.report);
    expect(
      first.report.metrics.find(
        ({ metric }) => metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
      )?.detail
    ).toMatchObject({ interval: expect.anything() });
  });
});

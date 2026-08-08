import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Probs } from "../src/fixture-result.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import {
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
    config: {}
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
      season: SEASON,
      footballDataSeason: FOOTBALL_DATA_SEASON,
      gameweek: GAMEWEEK,
      at: "deadline-6h",
      concurrency: 4,
      now: () => SCORED_AT
    });

  test("settles the scripted results and scores the archived Gameweek", async () => {
    const { report } = await rehearse();

    // The script settles Arsenal 2-0 Coventry. The archived response is the
    // only Prediction the Gameweek holds, and it forecast 3-0: the outcome
    // right at the wrong goal difference, which spec 0002 pays 2.
    expect(report.metrics).toContainEqual({
      entrantId: "sol",
      gw: GAMEWEEK,
      metric: MATCH_POINTS_METRIC,
      value: 2,
      n: 1,
      detail: expect.anything()
    });
  });

  test("publishes one comparison per non-anchor Entrant on the complete case", async () => {
    const { report } = await rehearse();

    // Fixture 1 settles 2-0, a Home win, and is the one Fixture every Entrant
    // answered, so it is the whole complete case. RPS over the ordered
    // cumulative outcomes:
    //   sol     0.82/0.12/0.06 → ((0.82-1)² + (0.94-1)²) / 2 = 0.018
    //   steady  0.50/0.30/0.20 → ((0.50-1)² + (0.80-1)²) / 2 = 0.145
    //   drawish 0.30/0.40/0.30 → ((0.30-1)² + (0.70-1)²) / 2 = 0.29
    // sol and steady both call the outcome at the wrong goal difference and
    // tie on 2 Match Points; sol's lower RPS makes it the Comparison Anchor.
    const compared = report.metrics.filter(
      ({ metric }) => metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC
    );
    expect(compared).toEqual([
      {
        entrantId: "drawish",
        gw: GAMEWEEK,
        metric: RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
        value: expect.closeTo(0.272, 12),
        n: 1,
        detail: expect.anything()
      },
      {
        entrantId: "steady",
        gw: GAMEWEEK,
        metric: RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
        value: expect.closeTo(0.127, 12),
        n: 1,
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

    // Each Entrant answered one of the ten Fixtures and Gapped the other nine,
    // which is a behavioural measure and needs no result.
    for (const entrantId of report.entrants) {
      expect(report.metrics).toContainEqual({
        entrantId,
        gw: GAMEWEEK,
        metric: GAP_RATE_METRIC,
        value: 0.9,
        n: 10,
        detail: expect.anything()
      });
    }
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

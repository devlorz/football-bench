import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { runFplRehearsal } from "../src/fpl-rehearsal/run-fpl-rehearsal.js";
import type { FplRehearsalArchive } from "../src/fpl-rehearsal/run-fpl-rehearsal.js";
import { SEASON_ROSTER_SIZE } from "../src/season-roster.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";

describe("a whole rehearsal of the FPL track", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let archive: FplRehearsalArchive;

  beforeAll(async () => {
    await client.connect();
    archive = {
      bootstrap: await archivedBody("fpl-bootstrap-2026-27.json.gz"),
      snapshots: [
        {
          source: "fpl_fixtures",
          body: await archivedBody("fpl-fixtures-2026-27.json.gz")
        },
        {
          source: `football_data:${SEASON}:E0`,
          body: await archivedBody("football-data-2526-E0.csv.gz")
        },
        {
          source: `football_data:${SEASON}:E1`,
          body: await archivedBody("football-data-2526-E1.csv.gz")
        }
      ]
    };

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
  });

  async function rehearse() {
    return runFplRehearsal({
      target: client,
      archive,
      season: SEASON,
      concurrency: 3
    });
  }

  test("states the rows it means to write, and writes them", async () => {
    const result = await rehearse();

    // The run says what it should produce before it is asked whether it did,
    // so a rehearsal that merely finished cannot be read as one that worked.
    expect(result.expected).toEqual({
      entrants: SEASON_ROSTER_SIZE,
      gameweeks: 3,
      metricRows: SEASON_ROSTER_SIZE * 3 * 8
    });
    expect(result.observed).toEqual(result.expected);
    expect(result.shortfalls).toEqual([]);
  });

  test("carries every seat's whole path, and the Roll Over among them", async () => {
    const { report } = await rehearse();

    expect(report.startedAt).toBe(1);
    expect(report.entrants.map(({ entrantId }) => entrantId).sort())
      .toEqual([
        "fpl/bench-boost",
        "fpl/free-hit",
        "fpl/idle",
        "fpl/repaired",
        "fpl/rolled-over",
        "fpl/three-at-the-back",
        "fpl/trader",
        "fpl/triple-captain",
        "fpl/wildcard"
      ]);

    // The seat that never produced a legal action still holds every Gameweek:
    // a Roll Over is a Manager State stored on the Team Sheet already
    // standing, which is the whole difference between it and a Gap.
    const rolled = report.entrants.find(
      ({ entrantId }) => entrantId === "fpl/rolled-over"
    );
    expect(rolled?.path.map(({ gameweek, rolledOver, attemptsUsed }) =>
      ({ gameweek, rolledOver, attemptsUsed }))).toEqual([
      { gameweek: 1, rolledOver: false, attemptsUsed: 0 },
      { gameweek: 2, rolledOver: true, attemptsUsed: 3 },
      { gameweek: 3, rolledOver: false, attemptsUsed: 0 }
    ]);

    // And the Roll Over stood on the Team Sheet already there rather than on
    // one the refused action would have set: the Squad it holds at Gameweek 2
    // is the Squad it opened with.
    expect(rolled?.path[1]?.state.teamSheet)
      .toEqual(rolled?.path[0]?.state.teamSheet);

    // And the seat that broke one rule and was told which came back inside its
    // allowance rather than spending it.
    const repaired = report.entrants.find(
      ({ entrantId }) => entrantId === "fpl/repaired"
    );
    expect(repaired?.path[1]).toMatchObject({
      gameweek: 2,
      rolledOver: false,
      attemptsUsed: 1
    });
  });

  test("scores the idle seat's Gameweeks against hand-computed totals", async () => {
    const { report } = await rehearse();
    const idle = report.entrants.find(
      ({ entrantId }) => entrantId === "fpl/idle"
    );
    const points = idle?.metrics
      .filter(({ metric }) => metric === "fpl_points")
      .map(({ gameweek, value }) => ({ gameweek, value }));

    // Gameweeks 1 and 2 are worth 69 apiece: the eleven who start score 57 and
    // Haaland's armband counts his 12 twice.
    //
    // Gameweek 3 leaves out Saliba and Haaland, so two substitutions are made
    // rather than one. The nine starters who played are worth 43, Soler comes
    // on for 9 and Essugo for 11 — both fit, because four Defenders and
    // Watkins keep the formation legal either way — and Palmer's 9 counts
    // twice in the absent captain's place: 43 + 20 + 9 = 72.
    expect(points).toEqual([
      { gameweek: 1, value: 69 },
      { gameweek: 2, value: 69 },
      { gameweek: 3, value: 72 }
    ]);

    const cumulative = idle?.metrics.find(({ metric, gameweek }) =>
      metric === "fpl_points_season_to_date" && gameweek === 3);
    expect(cumulative?.value).toBe(69 + 69 + 72);
  });

  test("produces identical states, values and details when repeated", async () => {
    const first = await rehearse();
    await resetSchema(client);
    const second = await rehearse();

    // Same archived bytes, same script, same clock: the record a second
    // rehearsal writes is the record the first one wrote, down to the detail
    // every value is traced through.
    expect(second.report.entrants).toEqual(first.report.entrants);
    expect(second.observed).toEqual(first.observed);
  });
});

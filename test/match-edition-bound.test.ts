import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { outcomeOf, type FixtureResult } from "../src/fixture-result.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import {
  MATCH_POINTS_METRIC,
  MATCH_POINTS_SEASON_TO_DATE_METRIC,
  RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC,
  editionScopeQualification,
  scoreMatchGameweek,
  scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const SCORED_AT = new Date("2026-10-08T10:00:00Z");

/**
 * Ticket 0097: a cumulative row is over the Edition its Gameweek is in. Seven
 * Gameweeks of one Fixture each, every one a 1-0 Home win; Edition 2 opens at
 * Gameweek 6. Entrant a calls Gameweeks 1-5 exactly and 6-7 wrong, b the
 * reverse, so a leads the Season and b leads Edition 2. Edition 1 is the row
 * migration 0048 seeds for every Competition; each test inserts Edition 2.
 */
describe("a cumulative row over an Edition", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query("set timezone = 'UTC'");
    await resetSchema(client);

    return async () => {
      await client.query("delete from editions where edition > 1");
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate scores, attempts, contexts, predictions, fixtures, models,
       gameweeks, historical_matches
       restart identity cascade`
    );
    await client.query("delete from editions where edition > 1");
    for (const id of ["entrant/a", "entrant/b"]) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $1, 'provider/base-model', 'provider', $2, 'entrant')`,
        [id, MATCH_PROMPT_VERSION]
      );
    }
    const result: FixtureResult = {
      home_goals: 1, away_goals: 0, outcome: outcomeOf(1, 0)
    };
    for (let gw = 1; gw <= 7; gw++) {
      const lock = new Date(Date.UTC(2026, 7, 21 + 7 * (gw - 1), 17, 30));
      await client.query(
        "insert into gameweeks (season, gw, deadline_at) values ($1, $2, $3)",
        [SEASON, gw, lock]
      );
      await client.query(
        `insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team,
           kickoff_at, result
         ) values ($1, $2, $2, $2, $3, $4, $5, $6)`,
        [SEASON, gw, `Home ${gw}`, `Away ${gw}`,
          new Date(lock.getTime() + 90 * 60_000), JSON.stringify(result)]
      );
      await client.query(
        `insert into contexts (season, gw, track, fixture_id, hash, body)
         values ($1, $2, 'match', $2, $3, 'context')`,
        [SEASON, gw, `hash-${gw}`]
      );
      for (const [entrantId, right] of [
        ["entrant/a", gw <= 5], ["entrant/b", gw > 5]
      ] as const) {
        await client.query(
          `insert into predictions (
             model_id, season, fixture_id, probs, pred_home, pred_away,
             context_id, attempts_used
           )
           select $1, $2, $3, $4, $5, $6, c.id, 0
             from contexts c
            where c.season = $2 and c.track = 'match' and c.fixture_id = $3`,
          [entrantId, SEASON, gw,
            JSON.stringify(right
              ? { H: 0.7, D: 0.2, A: 0.1 }
              : { H: 0.1, D: 0.2, A: 0.7 }),
            right ? 1 : 0, right ? 0 : 2]
        );
      }
    }
  });

  const openEditionTwo = () => client.query(
    `insert into editions (competition, season, edition, first_gw)
     values ('PL', $1, 2, 6)`,
    [SEASON]
  );

  const rowsAt = async (gw: number) => (await client.query<{
    model_id: string; metric: string; value: number; detail: any
  }>(
    `select model_id, metric, value::float8 as value, detail from scores
      where competition = 'PL' and season = $1 and gw = $2
      order by model_id, metric`,
    [SEASON, gw]
  )).rows;

  /**
   * A cumulative row told by its shape, not by its metric's name, which is
   * what the scorer tells it by: a `{ gameweeks }` detail, or a Paired
   * Difference, which is cumulative only.
   */
  const cumulativeOf = (rows: Awaited<ReturnType<typeof rowsAt>>) =>
    rows.filter(({ metric, detail }) =>
      Array.isArray(detail?.gameweeks)
      || metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC);

  test("Gameweek 7's cumulative rows hold Gameweeks 6-7 alone", async () => {
    await openEditionTwo();
    await scoreMatchSeason({
      database: client, competition: "PL", season: SEASON,
      now: () => SCORED_AT
    });

    const cumulative = cumulativeOf(await rowsAt(7));
    expect(cumulative.length).toBeGreaterThan(0);
    for (const { metric, detail } of cumulative) {
      const gameweeks = (detail.gameweeks ?? detail.fixtures)
        .map(({ gw }: { gw: number }) => gw);
      expect({ metric, gameweeks: [...new Set(gameweeks)].sort() })
        .toEqual({ metric, gameweeks: [6, 7] });
      // The convention the scorer's qualification sweep relies on.
      expect(metric).toMatch(/_season_to_date$/);
    }

    const comparison = cumulative.find(({ metric }) =>
      metric === RPS_PAIRED_DIFFERENCE_SEASON_TO_DATE_METRIC);
    expect(comparison?.detail.anchor).toBe("entrant/b");

    for (const entrantId of ["entrant/a", "entrant/b"]) {
      const total = async (gw: number) => (await rowsAt(gw)).find((row) =>
        row.model_id === entrantId
        && row.metric === MATCH_POINTS_SEASON_TO_DATE_METRIC)!;
      const editionOne = await total(5);
      const editionTwo = await total(7);
      const season = (await client.query<{ sum: number }>(
        `select sum(value)::float8 as sum from scores
          where model_id = $1 and metric = $2`,
        [entrantId, MATCH_POINTS_METRIC]
      )).rows[0]!.sum;

      expect(editionOne.value + editionTwo.value).toBe(season);
      expect(editionOne.detail.gameweeks.map(({ gw }: { gw: number }) => gw))
        .toEqual([1, 2, 3, 4, 5]);
    }
  });

  test("re-scoring Gameweek 3 after Edition 2 opens leaves Edition 1's rows",
    async () => {
      await scoreMatchSeason({
        database: client, competition: "PL", season: SEASON,
        now: () => SCORED_AT
      });
      const editionOne = async () => (await client.query(
        `select to_jsonb(s)::text as row from scores s
          where gw <= 5 order by 1`
      )).rows;
      const before = await editionOne();

      await openEditionTwo();
      await scoreMatchGameweek({
        database: client, competition: "PL", season: SEASON, gameweek: 3,
        now: () => SCORED_AT
      });

      expect(await editionOne()).toEqual(before);
    });

  test("a cumulative row outside Edition 1 says where it starts counting",
    async () => {
      expect(editionScopeQualification(6)).toBe(
        "Season-to-date here is cumulative over this Edition's Gameweeks, "
        + "from Gameweek 6."
      );
      // Gameweek 5 rather than the 6 the sentence is pinned at above, so the
      // number written can only have come from the editions row.
      await client.query(
        `insert into editions (competition, season, edition, first_gw)
         values ('PL', $1, 2, 5)`,
        [SEASON]
      );
      await scoreMatchSeason({
        database: client, competition: "PL", season: SEASON,
        now: () => SCORED_AT
      });

      const qualified = (rows: Awaited<ReturnType<typeof rowsAt>>) =>
        cumulativeOf(rows).map(({ metric, detail }) =>
            [metric, detail.editionQualification]);
      const atSeven = qualified(await rowsAt(7));
      expect(atSeven.length).toBeGreaterThan(0);
      expect(atSeven).toEqual(atSeven.map(([metric]) => [
        metric,
        "Season-to-date here is cumulative over this Edition's Gameweeks, "
        + "from Gameweek 5."
      ]));
      // Edition 1 keeps the bytes it always had: no key at all.
      expect(qualified(await rowsAt(4)).filter(([, text]) => text !== undefined))
        .toEqual([]);
    });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { outcomeOf, type FixtureResult } from "../src/fixture-result.js";
import { matchPromptOf } from "../src/predictions/openrouter-entrant.js";
import { scoreMatchSeason } from "../src/predictions/score-match-gameweek.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const SCORED_AT = new Date("2026-09-01T10:00:00Z");

/** Written out, as `dashboard-retired-gameweek` does, not read from the module. */
const RETIRED = "match-pd/2026-27-v1";
const RESTARTED = matchPromptOf("PD").version;

/**
 * Captured from the scorer at `07a2d62`, before ticket 0097 bounded every
 * cumulative pass by its Edition, and committed so the equivalence is against
 * those bytes and not against a reading of the new code.
 */
async function expectedRecord() {
  return JSON.parse(
    await archivedBody("match-pd-scores-stored-rows-before-0097.json.gz")
  );
}

/**
 * Ticket 0097: La Liga's rows are what they were. Three Gameweeks; two v1
 * seats answered the retired Gameweek 1 and nothing after it, two v2 seats
 * answered Gameweeks 2 and 3 (ADR-0042). La Liga is in its first Edition, so
 * the Edition bound is Gameweek 1 and must change no byte.
 */
describe("La Liga's Match track writes", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await client.query("set timezone = 'UTC'");
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate scores, attempts, contexts, predictions, fixtures, models,
       gameweeks, historical_matches
       restart identity cascade`
    );
    await client.query(
      `insert into competitions (competition, season) values ('PD', $1)
       on conflict do nothing`,
      [SEASON]
    );
    for (const [version, seats] of [
      [RETIRED, ["match-pd/a", "match-pd/b"]],
      [RESTARTED, [`${RESTARTED}/a`, `${RESTARTED}/b`]]
    ] as const) {
      for (const id of seats) {
        await client.query(
          `insert into models (
             id, name, base_model, provider, prompt_version, role
           ) values ($1, $1, 'provider/base-model', 'provider', $2, 'entrant')`,
          [id, version]
        );
      }
    }
    const results = [[2, 0], [1, 1], [0, 2], [3, 1], [1, 0], [0, 0]] as const;
    for (const [index, [home, away]] of results.entries()) {
      const fixtureId = index + 1;
      const gw = Math.ceil(fixtureId / 2);
      if (fixtureId % 2 === 1) {
        await client.query(
          `insert into gameweeks (competition, season, gw, deadline_at)
           values ('PD', $1, $2, $3)`,
          [SEASON, gw, new Date(Date.UTC(2026, 7, 14 + 7 * gw, 17, 30))]
        );
      }
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at, result
         ) values ('PD', $1, $2, $3, $3, $4, $5, '2026-08-21T19:00:00Z', $6)`,
        [SEASON, fixtureId, gw, `Home ${fixtureId}`, `Away ${fixtureId}`,
          JSON.stringify({
            home_goals: home, away_goals: away, outcome: outcomeOf(home, away)
          } satisfies FixtureResult)]
      );
      await client.query(
        `insert into contexts (
           competition, season, gw, track, fixture_id, hash, body
         ) values ('PD', $1, $2, 'match', $3, $4, 'context')`,
        [SEASON, gw, fixtureId, `hash-${fixtureId}`]
      );
      const seats = gw === 1
        ? ["match-pd/a", "match-pd/b"]
        : [`${RESTARTED}/a`, `${RESTARTED}/b`];
      for (const [seat, entrantId] of seats.entries()) {
        await client.query(
          `insert into predictions (
             competition, model_id, season, fixture_id, probs, pred_home,
             pred_away, context_id, attempts_used
           )
           select 'PD', $1, $2, $3, $4, $5, $6, c.id, 0
             from contexts c
            where c.competition = 'PD' and c.season = $2
              and c.track = 'match' and c.fixture_id = $3`,
          [entrantId, SEASON, fixtureId,
            JSON.stringify(seat === 0
              ? { H: 0.5, D: 0.3, A: 0.2 }
              : { H: 0.2, D: 0.3, A: 0.5 }),
            seat === 0 ? home : away, seat === 0 ? away : home]
        );
      }
    }
  });

  test("a first pass stores the rows it always did", async () => {
    await scoreMatchSeason({
      database: client, competition: "PD", season: SEASON,
      now: () => SCORED_AT
    });
    const stored = (await client.query(
      "select to_jsonb(s)::text as row from scores s order by 1"
    )).rows.map(({ row }) => row as string);

    expect(stored.length).toBeGreaterThan(0);
    expect(stored).toEqual(await expectedRecord());
  });
});

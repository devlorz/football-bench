import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  outcomeOf,
  type FixtureResult,
  type Probs
} from "../src/fixture-result.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import { scoreMatchSeason } from "../src/predictions/score-match-gameweek.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const SCORED_AT = new Date("2026-09-01T10:00:00Z");
const RESCORED_AT = new Date("2026-09-02T10:00:00Z");
const CORRECTED_AT = new Date("2026-09-03T10:00:00Z");

/**
 * Captured from the per-row statements before ticket 0090 replaced them, and
 * committed so the equivalence is against those bytes and not against a
 * reading of the new code.
 */
async function expectedRecord() {
  return JSON.parse(
    await archivedBody("match-scores-stored-rows-before-0090.json.gz")
  );
}

describe("the Match track's writes", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const statements: string[] = [];
  const database = {
    query: ((text: string, values?: unknown[]) => {
      statements.push(text);
      return client.query(text, values);
    }) as pg.Client["query"]
  };

  beforeAll(async () => {
    await client.connect();
    await client.query("set timezone = 'UTC'");
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  /**
   * Three Gameweeks and three Entrants. Entrant a anchors the Gameweek 1 and 2
   * snapshots and b the Gameweek 3 one, until Fixture 1 is corrected and c
   * takes all three. Entrant b's
   * Fixture 3 took two Repairs; c Gapped Fixture 3 on a failed attempt and was
   * never asked about Fixture 5; Fixture 6 is unplayed.
   */
  beforeEach(async () => {
    await client.query(
      `truncate scores, attempts, contexts, predictions, fixtures, models,
       gameweeks, historical_matches
       restart identity cascade`
    );
    statements.length = 0;
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z'),
         ('2026-27', 3, '2026-09-04T17:30:00Z')`
    );
    for (const id of ["entrant/a", "entrant/b", "entrant/c"]) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, $1, 'provider/base-model', 'provider', $2, 'entrant')`,
        [id, MATCH_PROMPT_VERSION]
      );
    }
    for (const [fixtureId, gw] of [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]]) {
      await client.query(
        `insert into fixtures (
           season, fixture_id, gw, locked_in_gw, home_team, away_team,
           kickoff_at
         ) values ($1, $2, $3, $3, $4, $5, '2026-08-21T19:00:00Z')`,
        [SEASON, fixtureId, gw, `Home ${fixtureId}`, `Away ${fixtureId}`]
      );
      await client.query(
        `insert into contexts (season, gw, track, fixture_id, hash, body)
         values ($1, $2, 'match', $3, $4, 'context')`,
        [SEASON, gw, fixtureId, `hash-${fixtureId}`]
      );
    }
    for (const [fixtureId, home, away] of [[1, 2, 0], [2, 1, 1], [3, 0, 2], [4, 3, 1], [5, 1, 0]] as const) {
      await settle(fixtureId, home, away);
    }

    const predictions: [string, number, number, number, Probs, number][] = [
      ["entrant/a", 1, 2, 0, { H: 0.6, D: 0.25, A: 0.15 }, 0],
      ["entrant/a", 2, 1, 1, { H: 0.4, D: 0.35, A: 0.25 }, 0],
      ["entrant/a", 3, 1, 0, { H: 0.5, D: 0.3, A: 0.2 }, 1],
      ["entrant/a", 4, 2, 1, { H: 0.55, D: 0.25, A: 0.2 }, 0],
      ["entrant/a", 5, 0, 0, { H: 0.3, D: 0.4, A: 0.3 }, 0],
      ["entrant/a", 6, 1, 2, { H: 0.3, D: 0.25, A: 0.45 }, 0],
      ["entrant/b", 1, 1, 0, { H: 0.5, D: 0.3, A: 0.2 }, 0],
      ["entrant/b", 2, 0, 0, { H: 0.35, D: 0.4, A: 0.25 }, 0],
      ["entrant/b", 3, 0, 2, { H: 0.2, D: 0.25, A: 0.55 }, 2],
      ["entrant/b", 4, 1, 1, { H: 0.4, D: 0.35, A: 0.25 }, 0],
      ["entrant/b", 5, 2, 0, { H: 0.65, D: 0.2, A: 0.15 }, 0],
      ["entrant/b", 6, 0, 0, { H: 0.35, D: 0.4, A: 0.25 }, 0],
      ["entrant/c", 1, 0, 1, { H: 0.2, D: 0.3, A: 0.5 }, 0],
      ["entrant/c", 2, 1, 1, { H: 0.3, D: 0.45, A: 0.25 }, 0],
      ["entrant/c", 4, 3, 1, { H: 0.7, D: 0.2, A: 0.1 }, 0],
      ["entrant/c", 6, 2, 2, { H: 0.3, D: 0.4, A: 0.3 }, 0]
    ];
    for (const [entrantId, fixtureId, home, away, probs, repairs] of predictions) {
      await client.query(
        `insert into predictions (
           model_id, season, fixture_id, probs, pred_home, pred_away,
           context_id, attempts_used
         )
         select $1, $2, $3, $6, $4, $5, c.id, $7
           from contexts c
          where c.season = $2 and c.track = 'match' and c.fixture_id = $3`,
        [entrantId, SEASON, fixtureId, home, away, JSON.stringify(probs), repairs]
      );
    }
    await client.query(
      `insert into attempts (
         model_id, season, gw, track, fixture_id, attempt_no, ok, error_kind,
         trigger
       ) values ('entrant/c', $1, 2, 'match', 3, 0, false, 'schema', 'main')`,
      [SEASON]
    );
  });

  async function settle(fixtureId: number, home: number, away: number) {
    await client.query(
      "update fixtures set result = $3 where season = $1 and fixture_id = $2",
      [
        SEASON,
        fixtureId,
        JSON.stringify({
          home_goals: home,
          away_goals: away,
          outcome: outcomeOf(home, away)
        } satisfies FixtureResult)
      ]
    );
  }

  const scoreSeason = (at: Date) =>
    scoreMatchSeason({
      database, competition: "PL", season: SEASON, now: () => at
    });

  /** Every stored row, `scored_at` included, as Postgres prints it. */
  async function storedRows(): Promise<string[]> {
    const result = await client.query(
      "select to_jsonb(s)::text as row from scores s order by 1"
    );
    return result.rows.map(({ row }) => row as string);
  }

  test("a first pass, a repeat pass and a pass after a correction store the rows they always did", async () => {
    await scoreSeason(SCORED_AT);
    const scored = await storedRows();

    // Nothing moved, so nothing is rewritten and every stamp is the first
    // pass's.
    await scoreSeason(RESCORED_AT);
    const rescored = await storedRows();

    // Fixture 1 becomes an Away win, which hands every snapshot's anchor to c.
    await settle(1, 0, 1);
    await scoreSeason(CORRECTED_AT);
    const corrected = await storedRows();

    expect({ scored, rescored, corrected }).toEqual(await expectedRecord());
  });

  test("each target Gameweek's rows are written by one statement", async () => {
    await scoreSeason(SCORED_AT);
    statements.length = 0;

    // With all three published, the pass is one call on the earliest Lock
    // that sweeps three target Gameweeks.
    await scoreSeason(RESCORED_AT);
    expect(statements.filter((text) =>
      text.trimStart().startsWith("insert into scores")
    )).toHaveLength(3);
  });
});

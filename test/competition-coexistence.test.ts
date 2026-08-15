import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { runScheduledPredictions } from "../src/predictions/run-scheduled-predictions.js";
import {
  MATCH_POINTS_METRIC,
  REFERENCE_ELO,
  scoreMatchCompetitions
} from "../src/predictions/score-match-gameweek.js";
import {
  handleDashboardRequest, type LeaderboardBody
} from "../src/dashboard/read-api.js";
import { matchPromptOf } from "../src/predictions/openrouter-entrant.js";
import { outcomeOf, type FixtureResult } from "../src/fixture-result.js";
import { archivedBase64Body } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const DEADLINE = "2026-08-21T17:30:00Z";
/**
 * One tracer seat per Competition. Two rows and not one, because a seat is a
 * `models` row carrying a Prompt Version and each Competition freezes its own
 * (ADR-0038) — so the ten Entrants of the roster are ten rows per Competition,
 * and a single row would be a seat in whichever league its version names.
 */
const SEATS = { PL: "entrant/a", PD: "entrant-pd/a" } as const;
const ENTRANT = SEATS.PL;

/**
 * The Fixture id both Competitions use. Deliberately the same number in both:
 * a Fixture id is a source's own, so two sources will collide on one sooner
 * than they will agree, and every disjointness claim below is empty unless the
 * rows it separates would otherwise have been the same row.
 */
const FIXTURE = 1;

/**
 * Two Competitions sharing a Season, Gameweek number and Fixture id, driven
 * through the entry points the crons call.
 *
 * The migration left every keyed table `default 'PL'`, so a write path that
 * forgets its Competition does not fail -- it silently files a La Liga row
 * under the Premier League. That is the failure this suite exists to catch,
 * and it can only catch it by driving the real schedulers rather than the
 * queries beneath them.
 */
describe("two Competitions through one scheduler and scorer", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let predictionBody = "";

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    predictionBody = await archivedBase64Body(
      "openrouter-gpt-5.6-sol-pro-2026-07-29.base64"
    );

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         competitions, prediction_runs, predictions, contexts, fixtures,
         attempts, models, gameweeks, scores, historical_matches
       restart identity cascade`
    );
    for (const competition of ["PL", "PD"]) {
      await client.query(
        "insert into competitions (competition, season) values ($1, $2)",
        [competition, SEASON]
      );
      await client.query(
        `insert into gameweeks (competition, season, gw, deadline_at)
         values ($1, $2, 1, $3)`,
        [competition, SEASON, DEADLINE]
      );
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, home_team, away_team,
           kickoff_at
         ) values ($1, $2, $3, 1, 'Home', 'Away', '2026-08-21T19:00:00Z')`,
        [competition, SEASON, FIXTURE]
      );
    }
    for (const [competition, seat] of Object.entries(SEATS)) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values ($1, 'Tracer Entrant', 'openai/gpt-5.2', 'openai', $2,
                   'entrant')`,
        [seat, matchPromptOf(competition).version]
      );
    }
  });

  test("both Competitions due in one run land disjoint rows", async () => {
    const runs = await runScheduledPredictions({
      database: client,
      season: SEASON,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async () => ({ status: 200, body: predictionBody })
    });

    expect(runs).toEqual([
      { competition: "PD", gameweek: 1, trigger: "main" },
      { competition: "PL", gameweek: 1, trigger: "main" }
    ]);

    // One row per Competition in every table the run writes, and each carrying
    // its own Competition: a scheduler that dropped the dimension would write
    // one row of each and report both Competitions as run.
    const written = await client.query(
      `select
         (select array_agg(competition order by competition)::text[]
            from prediction_runs) as runs,
         (select array_agg(competition order by competition)::text[]
            from predictions) as predictions,
         (select array_agg(competition order by competition)::text[]
            from contexts) as contexts,
         (select array_agg(distinct competition)::text[]
            from attempts) as attempts`
    );
    expect(written.rows).toEqual([{
      runs: ["PD", "PL"],
      predictions: ["PD", "PL"],
      contexts: ["PD", "PL"],
      attempts: ["PD", "PL"]
    }]);

    // The Prediction each Competition holds cites the context stored under the
    // same Competition -- the join that would otherwise have shown one league
    // the other's prompt.
    const cited = await client.query<{ mismatched: number }>(
      `select count(*)::int as mismatched
         from predictions p
         join contexts c on c.id = p.context_id
        where c.competition <> p.competition`
    );
    expect(cited.rows[0]?.mismatched).toBe(0);
  });

  test("a second run repeats neither Competition", async () => {
    const options = {
      database: client,
      season: SEASON,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async () => ({ status: 200, body: predictionBody })
    };
    await runScheduledPredictions(options);

    let repeatedCalls = 0;
    const repeated = await runScheduledPredictions({
      ...options,
      http: async () => {
        repeatedCalls += 1;
        return { status: 200, body: predictionBody };
      }
    });

    expect(repeated).toEqual([]);
    expect(repeatedCalls).toBe(0);
  });

  test("a Season with no Competition listed has no work at all", async () => {
    // The state a database migrated from empty is in: Gameweeks and Fixtures
    // present, `competitions` empty because migration 0022 relabels the record
    // it finds and finds none. Both jobs must return nothing rather than fall
    // back to a league nobody listed -- and returning nothing is what the two
    // CLIs say out loud, since an empty run is otherwise indistinguishable
    // from a successful one (docs/runbooks/pre-cron-checklist.md).
    await client.query("delete from competitions");

    expect(await runScheduledPredictions({
      database: client,
      season: SEASON,
      concurrency: 1,
      apiKey: "test-key",
      now: () => new Date("2026-08-21T11:30:00Z"),
      http: async () => {
        throw new Error("An unlisted Competition must call nobody");
      }
    })).toEqual([]);

    expect(await scoreMatchCompetitions({
      database: client,
      season: SEASON,
      now: () => new Date("2026-08-28T10:00:00Z")
    })).toEqual([]);
  });

  test("each Competition is scored from its own result alone", async () => {
    await client.query(
      `insert into contexts (
         competition, season, gw, track, fixture_id, hash, body
       ) values
         ('PL', $1, 1, 'match', $2, 'hash-pl', 'context'),
         ('PD', $1, 1, 'match', $2, 'hash-pd', 'context')`,
      [SEASON, FIXTURE]
    );
    await client.query("update fixtures set locked_in_gw = 1");
    // The same Entrant names the same scoreline in both Competitions, and the
    // two Fixtures settle differently: an exact hit in one and a miss in the
    // other, so a scorer reading across Competitions cannot land on either
    // Competition's answer by accident.
    for (const [competition, home, away] of [
      ["PL", 2, 1],
      ["PD", 0, 0]
    ] as const) {
      await client.query(
        `insert into predictions (
           model_id, competition, season, fixture_id, probs, pred_home,
           pred_away, context_id, attempts_used
         )
         select $1, $2::competition_code, $3, $4::int,
                '{"H":0.5,"D":0.3,"A":0.2}', 2, 1, c.id, 0
           from contexts c
          where c.competition = $2 and c.season = $3 and c.fixture_id = $4`,
        [SEATS[competition], competition, SEASON, FIXTURE]
      );
      await client.query(
        `update fixtures
            set result = $4
          where competition = $1 and season = $2 and fixture_id = $3`,
        [
          competition,
          SEASON,
          FIXTURE,
          JSON.stringify({
            home_goals: home,
            away_goals: away,
            outcome: outcomeOf(home, away)
          } satisfies FixtureResult)
        ]
      );
    }

    const scoredAt = new Date("2026-08-28T10:00:00Z");
    expect(await scoreMatchCompetitions({
      database: client,
      season: SEASON,
      now: () => scoredAt
    })).toEqual([
      { competition: "PD", gameweeks: [1] },
      { competition: "PL", gameweeks: [1] }
    ]);

    const points = await client.query<{
      competition: string;
      model_id: string;
      value: string;
    }>(
      `select competition, model_id, value from scores
        where model_id = any($1) and season = $2 and gw = 1
          and track = 'match' and metric = $3
        order by competition`,
      [Object.values(SEATS), SEASON, MATCH_POINTS_METRIC]
    );
    // Five for the exact score, nought for the wrong outcome (CONTEXT.md) —
    // and each figure against the seat of its own Competition, so a scorer
    // reading the Premier League's roster into La Liga would leave the PD row
    // missing rather than merely wrong.
    expect(points.rows).toEqual([
      { competition: "PD", model_id: SEATS.PD, value: "0" },
      { competition: "PL", model_id: SEATS.PL, value: "5" }
    ]);

    // Every score identity the run produced, under each Competition. The two
    // sets must be equal and each row must carry its own Competition: a metric
    // or a Reference Line that wrote under one Competition only would leave the
    // sets unequal, and one that wrote both Competitions' figures into a single
    // row would leave one set short by exactly what it overwrote. Asserting one
    // metric proves neither.
    const identities = await client.query<{
      competition: string;
      keys: string[];
    }>(
      // The seat id is normalised out: each Competition seats its own ten
      // (ADR-0038), so the ids differ by design and what has to match between
      // the two sets is every metric and every Reference Line.
      `select competition,
              array_agg(replace(model_id, seat, 'seat')
                        || ' ' || gw || ' ' || metric
                        order by model_id, gw, metric) as keys
         from scores
         cross join lateral (
           select case when competition = 'PD' then $2::text else $3::text end
         ) as seats(seat)
        where season = $1 and track = 'match'
        group by competition
        order by competition`,
      [SEASON, SEATS.PD, SEATS.PL]
    );
    const [spain, england] = identities.rows;
    expect(spain?.competition).toBe("PD");
    expect(england?.competition).toBe("PL");
    expect(spain?.keys).toEqual(england?.keys);
    // Reference Lines write through the same path as Entrants and are the rows
    // most easily left Competition-blind: they are forecast in memory rather
    // than read from `predictions`.
    expect(spain?.keys?.some((key) => key.startsWith(REFERENCE_ELO)))
      .toBe(true);

    // The reader the ticket names, over the same rows: the published Premier
    // League leaderboard must report the Premier League's figure with La Liga's
    // divergent rows sitting beside it in the same table.
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/leaderboard"),
      async (sql, parameters = []) =>
        (await client.query(sql, [...parameters])).rows,
      SEASON,
      scoredAt
    );
    expect(response.status).toBe(200);
    const body = await response.json() as LeaderboardBody;
    expect(body.entrants).toEqual([expect.objectContaining({
      id: ENTRANT,
      matchPoints: 5
    })]);
  });
});

import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import pg from "pg";
import { resetSchema } from "./schema-fixture.js";
import { outcomeOf } from "../src/fixture-result.js";
import { predictGameweek } from "../src/predictions/predict-gameweek.js";
import {
  handleDashboardRequest,
  type EntrantsBody,
  type FixturesBody,
  type LeaderboardBody
} from "../src/dashboard/read-api.js";
import { COMBINED_RANKING_GUEST_CLAUSE } from "../dashboard/src/overall-caveat.js";
import { overallRanking } from "../dashboard/src/overall-view.js";
import { preflightBaseModels } from "../src/preflight/preflight-base-models.js";
import { readGapAlert } from "../src/predictions/gap-alert.js";
import {
  MATCH_POINTS_METRIC,
  scoreMatchGameweek
} from "../src/predictions/score-match-gameweek.js";
import {
  DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
  MATCH_PROMPT_VERSION
} from "../src/predictions/openrouter-entrant.js";

const { Client } = pg;

/**
 * Ticket 0114 (ADR-0064, spec 0029): a Guest Seat is a `models` row with
 * `role = 'guest'`, asked by the scheduled run at every Lock after it exists
 * and kept out of every roster figure. Every seat states its `created_at`.
 */
const LOCK = "2026-08-21T17:30:00Z";
const LOCK_TWO = "2026-08-28T17:30:00Z";
const ENTRANTS = ["match/entrant-01", "match/entrant-02", "match/entrant-03"];
const GUEST = "guest/argon";
const GUEST_MODEL = "google/gemini-4-argon";

function answer(model: string, fixtureId: number): string {
  return JSON.stringify({
    model,
    openrouter_metadata: {
      endpoints: { available: [{ provider: `Resolved ${model}`, model, selected: true }] }
    },
    choices: [{
      message: {
        content: JSON.stringify({
          fixture_id: fixtureId,
          probs: { H: 0.6, D: 0.24, A: 0.16 },
          score: { home: 2, away: 1 },
          rationale: "An answer."
        })
      }
    }]
  });
}

describe("a Guest Seat beside the roster", () => {
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
      `truncate scores, predictions, contexts, fixtures, attempts, models,
         gameweeks
       restart identity cascade`
    );
    await client.query(
      "insert into competitions (competition, season) values ('PL', '2026-27') on conflict do nothing"
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PL', '2026-27', 1, $1), ('PL', '2026-27', 2, $2)`,
      [LOCK, LOCK_TWO]
    );
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, locked_in_gw, home_team,
         away_team, kickoff_at
       ) values
         ('PL', '2026-27', 1, 1, 1, 'Arsenal', 'Coventry City', '2026-08-21T19:00:00Z'),
         ('PL', '2026-27', 2, 1, 1, 'Everton', 'Fulham', '2026-08-22T14:00:00Z'),
         ('PL', '2026-27', 3, 2, 2, 'Chelsea', 'Brentford', '2026-08-28T19:00:00Z')`
    );
    for (const id of ENTRANTS) {
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role, config,
           created_at
         ) values ($1, $1, $1, 'vendor', $2, 'entrant',
                   '{"baseModelClass":"Open-weight"}', '2026-07-01T00:00:00Z')`,
        [id, MATCH_PROMPT_VERSION]
      );
    }
  });

  const enterGuest = async (
    createdAt: string,
    withdrawnAt: string | null = null
  ): Promise<void> => {
    await client.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role, config,
         created_at, withdrawn_at
       ) values ($1, 'Gemini 4 Argon', $2, 'google-vertex',
                 $3, 'guest', '{"baseModelClass":"First-party"}', $4, $5)`,
      [GUEST, GUEST_MODEL, MATCH_PROMPT_VERSION, createdAt, withdrawnAt]
    );
  };

  /** The scheduled run of one Gameweek, an hour before its Lock. */
  const predict = async (
    gameweek: number,
    {
      fails = () => false,
      at = new Date(new Date(gameweek === 1 ? LOCK : LOCK_TWO).getTime() - 3_600_000)
    }: { fails?: (model: string, fixtureId: number) => boolean; at?: Date } = {}
  ): Promise<void> => {
    await predictGameweek({
      database: client,
      competition: "PL",
      season: "2026-27",
      gameweek,
      concurrency: 4,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      now: () => at,
      http: async (_url, options) => {
        const body = JSON.parse(options?.body ?? "{}") as {
          model: string;
          messages: Array<{ content: string }>;
        };
        const prompt = JSON.stringify(body.messages);
        const fixtureId = ["Arsenal", "Everton", "Chelsea", "Leeds United"]
          .findIndex((home) => prompt.includes(home)) + 1;
        if (fails(body.model, fixtureId)) {
          return { status: 503, body: "{}" };
        }
        return { status: 200, body: answer(body.model, fixtureId) };
      }
    });
  };

  const predicted = async (): Promise<Array<{ fixture_id: number; model_id: string; context_id: number }>> =>
    (await client.query(
      `select fixture_id, model_id, context_id from predictions
        order by fixture_id, model_id`
    )).rows;

  test("a Guest entered before a Lock is asked every Fixture of it over the roster's context row",
    async () => {
      await enterGuest("2026-08-20T00:00:00Z");
      await predict(1);

      const rows = await predicted();
      expect(rows.filter((row) => row.model_id === GUEST).map((row) => row.fixture_id))
        .toEqual([1, 2]);
      for (const fixtureId of [1, 2]) {
        const contexts = new Set(
          rows.filter((row) => row.fixture_id === fixtureId).map((row) => row.context_id)
        );
        expect(contexts.size).toBe(1);
      }
    });

  const settle = async (fixtureId: number, home: number, away: number): Promise<void> => {
    await client.query(
      "update fixtures set result = $2 where fixture_id = $1",
      [fixtureId, JSON.stringify({ home_goals: home, away_goals: away, outcome: outcomeOf(home, away) })]
    );
  };

  const guestFixtures = async (): Promise<number[]> =>
    (await predicted())
      .filter((row) => row.model_id === GUEST)
      .map((row) => row.fixture_id);

  test("a Guest entered after a Lock is not asked that Gameweek, and is asked the next",
    async () => {
      await enterGuest("2026-08-21T17:30:01Z");
      await predict(1);
      expect(await guestFixtures()).toEqual([]);

      await predict(2);
      expect(await guestFixtures()).toEqual([3]);
    });

  test("a withdrawn Guest is not asked from its next Lock", async () => {
    await enterGuest("2026-08-20T00:00:00Z", "2026-08-25T00:00:00Z");
    await predict(1);
    await predict(2);

    expect(await guestFixtures()).toEqual([1, 2]);
  });

  test("a Competition with Guests and no Entrant is refused", async () => {
    await client.query("delete from models");
    await enterGuest("2026-08-20T00:00:00Z");

    await expect(predict(1)).rejects.toThrow("No Entrants are configured for PL");
  });

  test("a Guest's Prediction is scored; its Gap is recorded, never back-filled, and alerts nobody",
    async () => {
      await enterGuest("2026-08-20T00:00:00Z");
      await predict(1, { fails: (model, fixtureId) => model === GUEST_MODEL && fixtureId === 2 });
      // The run again after the Lock, before Fixture 2 kicks off: the Lock
      // refuses the Guest's late answer as it refuses an Entrant's.
      await predict(1, { at: new Date("2026-08-21T18:00:00Z") });

      expect(await guestFixtures()).toEqual([1]);
      const attempts = await client.query<{ ok: boolean; error_kind: string | null }>(
        `select ok, error_kind from attempts
          where model_id = $1 and fixture_id = 2 order by attempted_at, id`,
        [GUEST]
      );
      expect(attempts.rows.length).toBeGreaterThan(0);
      expect(attempts.rows.every((row) => !row.ok)).toBe(true);
      expect(attempts.rows.at(-1)?.error_kind).toBe("deadline");

      expect(await readGapAlert(client, "PL", "2026-27", 1, () => new Date(LOCK)))
        .toBeNull();

      await settle(1, 2, 1);
      await scoreMatchGameweek({
        database: client,
        competition: "PL",
        season: "2026-27",
        gameweek: 1,
        now: () => new Date("2026-08-23T09:00:00Z")
      });
      const points = await client.query<{ value: number }>(
        `select value from scores
          where model_id = $1 and gw = 1 and metric = $2`,
        [GUEST, MATCH_POINTS_METRIC]
      );
      expect(points.rows).toHaveLength(1);
    });

  test("the single-model pre-flight runs against a Guest row", async () => {
    await enterGuest("2026-08-20T00:00:00Z");
    const called: string[] = [];

    const report = await preflightBaseModels({
      database: client,
      competition: "PL",
      season: "2026-27",
      fixtureId: 1,
      exhibitionModelId: GUEST,
      apiKey: "test-key",
      entrantCallTimeoutMs: DEFAULT_ENTRANT_CALL_TIMEOUT_MS,
      http: async (_url, options) => {
        const { model } = JSON.parse(options?.body ?? "{}") as { model: string };
        called.push(model);
        return { status: 200, body: answer(model, 1) };
      }
    });

    expect(called).toEqual([GUEST_MODEL]);
    expect(report.ok).toBe(true);
  });

  const read = async (path: string): Promise<string> => {
    const response = await handleDashboardRequest(
      new Request(`https://benchmark.local${path}`),
      async (sql, params) => (await client.query(sql, params as unknown[])).rows,
      "2026-27",
      new Date("2026-08-30T12:00:00Z")
    );
    expect(response.status).toBe(200);
    return await response.text();
  };

  const score = async (...gameweeks: number[]): Promise<void> => {
    for (const gameweek of gameweeks) {
      await scoreMatchGameweek({
        database: client,
        competition: "PL",
        season: "2026-27",
        gameweek,
        now: () => new Date("2026-08-29T09:00:00Z")
      });
    }
  };

  test("a Guest is ranked with its label, its n and its Gap rate, all from its first Lock",
    async () => {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at
         ) values ('PL', '2026-27', 4, 2, 2, 'Leeds United', 'Burnley',
                   '2026-08-29T14:00:00Z')`
      );
      await enterGuest("2026-08-21T17:30:01Z");
      await predict(1);
      await predict(2, { fails: (model, fixtureId) => model === GUEST_MODEL && fixtureId === 4 });
      await settle(1, 2, 1);
      await settle(3, 2, 1);
      await settle(4, 2, 1);
      await score(1, 2);

      const body = JSON.parse(await read("/api/pl/leaderboard")) as LeaderboardBody;

      expect(body.exhibitionCaveat).toBeNull();
      expect(body.entrants.find((row) => row.id === GUEST)).toEqual({
        id: GUEST,
        name: "Gemini 4 Argon",
        role: "guest",
        baseModel: GUEST_MODEL,
        baseModelClass: "First-party",
        // Fixture 3 alone: Fixture 1 was locked before the row existed.
        matchPoints: 5,
        betPoints: expect.any(Number),
        n: 1,
        exhibition: null,
        guest: { fromGw: 2, gapRate: 0.5 }
      });
      for (const id of ENTRANTS) {
        expect(body.entrants.find((row) => row.id === id)).toMatchObject({
          role: "entrant", baseModel: id, exhibition: null, guest: null
        });
      }
    });

  test("a Guest has a slot on every Fixture it was asked, and its own record with its Gap rate",
    async () => {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at
         ) values ('PL', '2026-27', 4, 2, 2, 'Leeds United', 'Burnley',
                   '2026-08-29T14:00:00Z')`
      );
      await enterGuest("2026-08-21T17:30:01Z");
      await predict(1);
      await predict(2, { fails: (model, fixtureId) => model === GUEST_MODEL && fixtureId === 4 });
      await settle(1, 2, 1);
      await settle(3, 2, 1);
      await settle(4, 2, 1);
      await score(1, 2);

      const guestSlots = async (gw: number) =>
        (JSON.parse(await read(`/api/pl/fixtures?gw=${gw}`)) as FixturesBody)
          .fixtures.map(({ fplId, slots }) => ({
            fplId,
            ids: slots.map(({ entrant }) => entrant.id),
            guest: slots
              .filter(({ entrant }) => entrant.id === GUEST)
              .map(({ prediction, guest }) => ({ answered: prediction !== null, guest }))
          }));

      // Gameweek 1 locked before the row existed: no slot, not an empty one.
      expect(await guestSlots(1)).toEqual([
        { fplId: 1, ids: ENTRANTS, guest: [] },
        { fplId: 2, ids: ENTRANTS, guest: [] }
      ]);
      expect(await guestSlots(2)).toEqual([
        { fplId: 3, ids: [...ENTRANTS, GUEST],
          guest: [{ answered: true, guest: { fromGw: 2 } }] },
        { fplId: 4, ids: [...ENTRANTS, GUEST],
          guest: [{ answered: false, guest: { fromGw: 2 } }] }
      ]);

      const record = JSON.parse(await read("/api/pl/entrants")) as EntrantsBody;
      expect(record.exhibitionCaveat).toBeNull();
      expect(record.entrants.find(({ id }) => id === GUEST)).toMatchObject({
        name: "Gemini 4 Argon",
        role: "guest",
        baseModel: GUEST_MODEL,
        exhibition: null,
        guest: { fromGw: 2, gapRate: 0.5 },
        matchPoints: 5,
        n: 1,
        gaps: 1,
        // Its history opens at its first Lock: no Gameweek 1 row of noughts.
        gameweeks: [{ gw: 2, gaps: 1, settled: 1, matchPoints: 5 }]
      });
      const ranked = JSON.parse(await read("/api/pl/leaderboard")) as LeaderboardBody;
      expect(record.entrants.find(({ id }) => id === GUEST)?.guest)
        .toEqual(ranked.entrants.find(({ id }) => id === GUEST)?.guest);
      for (const id of ENTRANTS) {
        expect(record.entrants.find((row) => row.id === id)).toMatchObject({
          role: "entrant", baseModel: id, exhibition: null, guest: null
        });
      }

      // An Exhibition Run that replayed Fixture 3 after the fact stands after
      // the Guest on it, and nowhere it did not answer.
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role, config,
           created_at
         ) values ('exhibition/other', 'Other', 'vendor/other', 'vendor', $1,
                   'exhibition', '{}', '2026-08-30T00:00:00Z')`,
        [MATCH_PROMPT_VERSION]
      );
      await client.query(
        `insert into predictions
         select (jsonb_populate_record(null::predictions, to_jsonb(p)
                   || '{"model_id": "exhibition/other",
                        "predicted_at": "2026-08-30T00:00:00Z"}')).*
           from predictions p where model_id = $1 and fixture_id = 3`,
        [GUEST]
      );
      expect((await guestSlots(2)).map(({ ids }) => ids)).toEqual([
        [...ENTRANTS, GUEST, "exhibition/other"],
        [...ENTRANTS, GUEST]
      ]);
    });

  // Spec 0029's main acceptance check, rerun by every later Guest ticket: one
  // seeded Season scored with and without the Guest, every Entrant figure and
  // every read API body compared whole.
  test("every Entrant figure and every read API body is identical with the Guest present and absent",
    async () => {
      const season = async () => {
        await predict(1, { fails: (model, fixtureId) => model === ENTRANTS[2] && fixtureId === 2 });
        await predict(2, { fails: (model) => model === GUEST_MODEL });
        await settle(1, 2, 1);
        await settle(2, 0, 0);
        await settle(3, 1, 3);
        await score(1, 2);
        return {
          scores: (await client.query(
            `select model_id, season, gw, track, metric, value, n, detail,
                    scored_at
               from scores where model_id <> $1
              order by gw, model_id, metric`,
            [GUEST]
          )).rows,
          bodies: await Promise.all([
            "/api/pl/leaderboard",
            "/api/pl/entrants",
            "/api/pl/fixtures?gw=1",
            "/api/pl/fixtures?gw=2"
          ].map(read))
        };
      };

      const absent = await season();
      await client.query(
        `truncate scores, predictions, contexts, attempts restart identity cascade`
      );
      await enterGuest("2026-08-20T00:00:00Z");
      const present = await season();

      expect(await guestFixtures()).toEqual([1, 2]);
      expect(absent.scores.length).toBeGreaterThan(0);
      // Each body that shows the Guest (tickets 0115, 0116) is compared
      // without the Guest's own row, slot or record, and then holds no trace
      // of it. The record also carries every row's role, Base Model and Guest
      // label (0116), which the absent side carries too.
      const [leaderboard, entrants, ...fixtures] = present.bodies.map((text) => JSON.parse(text!));
      expect(leaderboard.entrants.map(({ id }: { id: string }) => id)).toContain(GUEST);
      expect(entrants.entrants.map(({ id }: { id: string }) => id)).toContain(GUEST);
      expect(fixtures.flatMap(({ fixtures }: FixturesBody) =>
        fixtures.flatMap(({ slots }) => slots.map(({ entrant }) => entrant.id))))
        .toContain(GUEST);
      const withoutGuest = <T extends { id: string }>(rows: T[]): T[] =>
        rows.filter(({ id }) => id !== GUEST);
      const stripped = [
        { ...leaderboard, entrants: withoutGuest(leaderboard.entrants) },
        { ...entrants, entrants: withoutGuest(entrants.entrants) },
        ...fixtures.map((body: FixturesBody) => ({
          ...body,
          fixtures: body.fixtures.map((fixture) => ({
            ...fixture,
            slots: fixture.slots.filter(({ entrant }) => entrant.id !== GUEST)
          }))
        }))
      ].map((body) => JSON.stringify(body));
      expect({ ...present, bodies: stripped }).toEqual(absent);
      expect(JSON.parse(absent.bodies[0]!).entrants).toHaveLength(ENTRANTS.length);
      for (const body of stripped) {
        expect(body).not.toContain("argon");
      }

      // `/overall` has no body of its own: the page sums the leaderboard
      // bodies in the browser (ticket 0117), so its check runs that sum over
      // the real body. Without its row and its clause, nothing moved.
      const overall = (text: string | undefined) => {
        const ranking = overallRanking([{ competition: "PL", body: JSON.parse(text!) }]);
        if (ranking.kind !== "ranking") throw new Error("expected a ranking");
        return ranking;
      };
      const overallAbsent = overall(absent.bodies[0]);
      const overallPresent = overall(present.bodies[0]);
      expect(overallPresent.matchRanked.filter(({ guest }) => guest !== null))
        .toEqual([expect.objectContaining({ slug: "argon", guest: { competitions: ["PL"] } })]);
      const strippedOverall = {
        ...overallPresent,
        matchRanked: overallPresent.matchRanked.filter(({ guest }) => guest === null),
        betRanked: overallPresent.betRanked.filter(({ guest }) => guest === null),
        qualification: overallAbsent.qualification
      };
      expect(overallPresent.qualification).toBe(overallAbsent.qualification
        .replace("Ranks, does not prove.", `${COMBINED_RANKING_GUEST_CLAUSE} Ranks, does not prove.`));
      expect(strippedOverall).toEqual(overallAbsent);
      expect(JSON.stringify(strippedOverall)).not.toContain("argon");
    });
});

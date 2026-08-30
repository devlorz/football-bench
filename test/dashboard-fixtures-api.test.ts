import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import {
  insertOxAlpha, OX_ALPHA_FIXTURE, resetSchema
} from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason, type SeedStop } from "../src/seed-season.js";
import {
  handleDashboardRequest, type EntrantsBody, type FixturesBody,
  type FixtureView, type LeaderboardBody, type Query
} from "../src/dashboard/read-api.js";
import { argmaxOutcome, outcomeOf } from "../src/fixture-result.js";
import { matchPromptOf } from "../src/predictions/openrouter-entrant.js";
import { EXHIBITION_CAVEAT } from "../src/exhibition/recall-caveat.js";
import {
  matchPoints, scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";

const { Client } = pg;

const SEASON = "2026-27";

/**
 * The instant the design's state sits at: Gameweek 14 settled and scored,
 * Gameweek 15 Locked and unplayed, its deadline still ahead.
 */
const BEFORE_LOCK = new Date("2026-11-15T12:00:00Z");
const AFTER_LOCK = new Date("2026-11-21T12:00:00Z");

/** The Gameweek the design's Fixtures page is drawn on, and its ten Fixtures. */
const GW15_DEADLINE = "2026-11-20T17:30:00.000Z";
const GW15_FIXTURES = Array.from({ length: 10 }, (_, index) => 141 + index);

/** The nine Entrants of the match roster, in the order every Fixture holds. */
const ROSTER = [
  "claude/v1", "deepseek/v1", "gemini/v1", "glm/v1", "gpt/v1",
  "grok/v1", "kimi/v1", "minimax/v1", "qwen/v1"
];

/**
 * La Liga's one seat and its two Fixtures. The first is the earliest unsettled
 * Fixture either league holds and is the one La Liga's own page is on; the
 * second sits on the Gameweek the Premier League's page is on, which is what
 * makes the listing's filter answerable in that league's direction.
 */
const SPANISH_SEAT = "match-pd/claude/v1";
const SPANISH_FIXTURE = 9_998;
const SPANISH_LATE_FIXTURE = 9_999;

/** The seed's Gap in the Locked Gameweek, and its one incoherent Prediction. */
const GAPPED = { entrant: "minimax/v1", fplId: 147 };
const INCOHERENT = { entrant: "qwen/v1", fplId: 143 };

/**
 * One reader and one writer per state, as the leaderboard's tests hold them:
 * every read the seam makes goes through the role the Worker holds in
 * production, so a table granted without a policy fails here rather than
 * returning an empty page to a visitor.
 */
function connections() {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const fixtures = async (now = BEFORE_LOCK): Promise<FixturesBody> => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/pl/fixtures"), query, SEASON, now
    );
    expect(response.status).toBe(200);
    return await response.json() as FixturesBody;
  };

  return { writer, reader, query, fixtures };
}

/** Every state below is the seed's, reached from an empty schema. */
async function seed(
  writer: pg.Client,
  reader: pg.Client,
  stopAt: SeedStop
): Promise<void> {
  await writer.connect();
  await reader.connect();
  await resetSchema(writer);
  await seedSeason({ database: writer, season: SEASON, stopAt });
  await reader.query("set role dashboard_read");
}

/**
 * A La Liga Gameweek, Fixtures and standing seat beside the Premier League's,
 * proving competition isolation at every read (ADR-0035, ADR-0038).
 */
async function seedSpanishFixtures(writer: pg.Client): Promise<void> {
  await writer.query(
    `insert into competitions (competition, season) values ('PD', $1)`,
    [SEASON]
  );
  await writer.query(
    `insert into gameweeks (competition, season, gw, deadline_at)
     values ('PD', $1, 5, $2), ('PD', $1, 15, $3)`,
    [SEASON, "2026-09-12T17:30:00Z", "2026-11-20T17:30:00Z"]
  );
  await writer.query(
    `insert into fixtures (
       competition, season, fixture_id, gw, home_team, away_team, kickoff_at
     ) values ('PD', $1, $2, 5, 'Real Betis', 'Sevilla', $4),
              ('PD', $1, $3, 15, 'Girona', 'Osasuna', $5)`,
    [
      SEASON, SPANISH_FIXTURE, SPANISH_LATE_FIXTURE,
      "2026-09-13T20:00:00Z", "2026-11-21T20:00:00Z"
    ]
  );
  await writer.query(
    `insert into models (
       id, name, base_model, provider, prompt_version, role
     ) values ($2, 'Spanish Claude', 'anthropic/claude-opus-4.5',
               'anthropic', $1, 'entrant')`,
    [matchPromptOf("PD").version, SPANISH_SEAT]
  );
}

describe("the Fixtures endpoint on the design's Season", () => {
  const { writer, reader, query, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "the design's");
    await seedSpanishFixtures(writer);

    // And the seat La Liga's restart retired (ADR-0042), which stands in the
    // record for the sake of the Gameweek it played and belongs to no roster
    // read. Same Competition, same `entrant` role -- the Prompt Version is the
    // only thing telling it from the seat above, which is the whole boundary:
    // the slots below are the roster on every Fixture, so a read that dropped
    // the filter would put a retired seat in front of a reader as a Gap it
    // will never fill.
    await writer.query(
      `insert into models (
         id, name, base_model, provider, prompt_version, role
       ) values ('match-pd/claude/retired', 'Retired Spanish Claude',
                 'anthropic/claude-opus-4.5', 'anthropic',
                 'match-pd/2026-27-v1', 'entrant')`
    );

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("shows the Gameweek in front of the reader, not the last one scored",
    async () => {
      const body = await fixtures();

      // Fourteen Gameweeks are settled, so the earliest owning an unsettled
      // Fixture is the fifteenth. `throughGw` is 14 on the same database, and
      // this page never reads it.
      expect(body.gw).toBe(15);
      expect(body.deadlineAt).toBe(GW15_DEADLINE);
      expect(body.lockPassed).toBe(false);
      expect(body.season).toBe(SEASON);
    });

  test("stays on the Gameweek once its Lock has passed", async () => {
    // The instant separates the pre-lock banner from the committed view and
    // never selects the Gameweek: matches being played must not hide the
    // Predictions the page exists to show.
    const body = await fixtures(AFTER_LOCK);

    expect(body.gw).toBe(15);
    expect(body.lockPassed).toBe(true);
  });

  test("carries every Fixture the Gameweek holds", async () => {
    const body = await fixtures();

    expect(body.fixtures.map(({ fplId }) => fplId)).toEqual(GW15_FIXTURES);
    const [first] = body.fixtures;
    expect(first?.homeTeam).toEqual(expect.any(String));
    expect(first?.awayTeam).toEqual(expect.any(String));
    expect(Date.parse(first?.kickoffAt ?? "")).not.toBeNaN();
  });

  test("carries the same nine Entrants in the same order on every Fixture",
    async () => {
      // The precondition the assertion below would otherwise assume: the seed
      // enters an FPL seat beside every Match one, and this suite enters La
      // Liga's standing seat and the one its restart retired, all carrying the
      // same `entrant` role — so nine is the roster filter's answer and not
      // the whole table's.
      const seats = await writer.query(
        "select 1 from models where role = 'entrant'"
      );
      expect(seats.rowCount).toBe(ROSTER.length * 2 + 2);

      const body = await fixtures();

      for (const fixture of body.fixtures) {
        expect(fixture.slots.map(({ entrant }) => entrant.id)).toEqual(ROSTER);
        expect(fixture.slots.every((slot) => !("exhibition" in slot))).toBe(true);
      }
      expect(body.exhibitionCaveat).toBeUndefined();
      const [slot] = body.fixtures[0]?.slots ?? [];
      expect(slot?.entrant.name).toEqual(expect.any(String));
    });

  test("renders a Gap as a slot with no Prediction", async () => {
    const body = await fixtures();

    const filled = (fixture: FixtureView): number =>
      fixture.slots.filter(({ prediction }) => prediction !== null).length;

    const gapped = body.fixtures.find(({ fplId }) => fplId === GAPPED.fplId);
    const slot = gapped?.slots
      .find(({ entrant }) => entrant.id === GAPPED.entrant);
    // Present and empty, not absent: an Entrant that did not answer must not be
    // indistinguishable from one that answered badly.
    expect(slot).toBeDefined();
    expect(slot?.prediction).toBeNull();
    expect(gapped?.slots).toHaveLength(ROSTER.length);
    expect(filled(gapped as FixtureView)).toBe(8);

    for (const fixture of body.fixtures) {
      expect(fixture.slots).toHaveLength(ROSTER.length);
      if (fixture.fplId !== GAPPED.fplId) {
        expect(filled(fixture)).toBe(ROSTER.length);
      }
    }
  });

  test("flags the Prediction whose scoreline disagrees with its probabilities",
    async () => {
      const body = await fixtures();

      const flagged = body.fixtures.find(
        ({ fplId }) => fplId === INCOHERENT.fplId
      )?.slots.find(({ entrant }) => entrant.id === INCOHERENT.entrant);
      expect(flagged?.prediction?.coherent).toBe(false);

      // Derived from the Prediction alone, by the comparison the scorer uses,
      // so the page and the Coherence metric cannot disagree. Asserted over
      // every slot rather than the one, so a flag hard-coded to one Fixture
      // fails here.
      let incoherent = 0;
      for (const fixture of body.fixtures) {
        for (const { prediction } of fixture.slots) {
          if (prediction === null) continue;
          const coherent = argmaxOutcome(prediction.probs)
            === outcomeOf(prediction.predHome, prediction.predAway);
          expect(prediction.coherent).toBe(coherent);
          if (!coherent) incoherent += 1;
        }
      }
      expect(incoherent).toBe(1);
    });

  test("carries the Repair count, the rationale and the context hash",
    async () => {
      const stored = await writer.query<{
        attempts_used: number; rationale: string; hash: string;
      }>(
        `select p.attempts_used, p.rationale, c.hash
           from predictions p join contexts c on c.id = p.context_id
          where p.season = $1 and p.fixture_id = $2 and p.model_id = $3`,
        [SEASON, 141, "claude/v1"]
      );

      const body = await fixtures();
      const prediction = body.fixtures
        .find(({ fplId }) => fplId === 141)?.slots
        .find(({ entrant }) => entrant.id === "claude/v1")?.prediction;

      // `attempts_used` and nothing else: zero is a Prediction that was valid
      // on the first attempt, and the page labels it Repairs.
      expect(prediction?.repairs).toBe(stored.rows[0]?.attempts_used);
      expect(prediction?.rationale).toBe(stored.rows[0]?.rationale);
      expect(prediction?.contextHash).toBe(stored.rows[0]?.hash);
    });

  test("answers an earlier Gameweek when one is asked for, and offers the list",
    async () => {
      const current = await fixtures();

      // Every Gameweek with something to show, and the one in front of the
      // reader is the last of them on the design's Season.
      expect(current.gws).toEqual(
        Array.from({ length: 15 }, (_, index) => index + 1)
      );
      expect(current.gw).toBe(15);

      const asked = async (gw: string): Promise<FixturesBody> => {
        const response = await handleDashboardRequest(
          new Request(`https://benchmark.example/api/pl/fixtures?gw=${gw}`),
          query, SEASON, BEFORE_LOCK
        );
        expect(response.status).toBe(200);
        return await response.json() as FixturesBody;
      };

      // Gameweek 3's ten Fixtures, its own Lock, and not Gameweek 15's.
      const third = await asked("3");
      expect(third.gw).toBe(3);
      expect(third.fixtures.map(({ fplId }) => fplId))
        .toEqual(Array.from({ length: 10 }, (_, index) => 21 + index));
      expect(third.deadlineAt).not.toBe(current.deadlineAt);
      expect(third.lockPassed).toBe(true);
      expect(third.gws).toEqual(current.gws);

      // A Gameweek that is not one of this Competition's, and something that
      // is not a number at all: both are the same as not asking. The body
      // names the Gameweek it answered with, so nothing is silently wrong.
      expect((await asked("99")).gw).toBe(15);
      expect((await asked("abc")).gw).toBe(15);
    });

  test("carries a settled Fixture's result and what each Prediction earned",
    async () => {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/fixtures?gw=3"),
        query, SEASON, BEFORE_LOCK
      );
      const scored = await response.json() as FixturesBody;
      const fixture = scored.fixtures[0];

      expect(fixture?.result).not.toBeNull();
      const result = fixture!.result!;

      // Every Prediction on the Fixture is worth what the scorer's own
      // function says it is worth, and never a rule spelled a second time here.
      for (const { prediction } of fixture!.slots) {
        if (prediction === null) continue;
        expect(prediction.points).toBe(
          matchPoints(prediction.predHome, prediction.predAway, {
            home_goals: result.homeGoals,
            away_goals: result.awayGoals,
            outcome: result.outcome
          })
        );
      }

      // The four tiers are exclusive, so every figure is one of four values.
      const points = fixture!.slots
        .map(({ prediction }) => prediction?.points)
        .filter((value) => value !== undefined && value !== null);
      expect(points.length).toBeGreaterThan(0);
      for (const value of points) expect([5, 3, 2, 0]).toContain(value);

      // The Gameweek in front of the reader has not been played: no result on
      // it, and no points either, rather than a nought that reads as a miss.
      const current = await fixtures();
      for (const unplayed of current.fixtures) {
        expect(unplayed.result).toBeNull();
        for (const { prediction } of unplayed.slots) {
          if (prediction !== null) expect(prediction.points).toBeNull();
        }
      }
    });

  test("carries the cache lifetime the Fill run moves on", async () => {
    const response = await handleDashboardRequest(
      new Request("https://benchmark.example/api/pl/fixtures"),
      query, SEASON, BEFORE_LOCK
    );

    // Sixty seconds and no stale window: Predictions land at deadline −6h and
    // again at −2h, and an hour of stale would serve Gaps the Fill has closed.
    expect(response.headers.get("cloudflare-cdn-cache-control"))
      .toBe("max-age=60, stale-if-error=0");
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("keeps each Competition's Fixtures out of the other's response",
    async () => {
      const premierLeague = await fixtures();
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pd/fixtures"),
        query, SEASON, BEFORE_LOCK
      );
      expect(response.status).toBe(200);
      const laLiga = await response.json() as FixturesBody;

      // Neither league's Gameweek, Fixtures or seats reach the other. Asserted
      // in both directions, because a filter can be missing from one read and
      // present in the other.
      //
      // The Premier League's Gameweek is 15 and not La Liga's earlier 5, and
      // its list is its own ten and not eleven: La Liga's second Fixture is on
      // Gameweek 15 too, so a listing that had dropped the filter would show it
      // here with everything else about the response unchanged.
      expect(premierLeague.gw).toBe(15);
      expect(premierLeague.fixtures.map(({ fplId }) => fplId))
        .toEqual(GW15_FIXTURES);
      for (const fixture of premierLeague.fixtures) {
        expect(fixture.slots.map(({ entrant }) => entrant.id))
          .not.toContain(SPANISH_SEAT);
      }

      expect(laLiga.gw).toBe(5);
      expect(laLiga.fixtures.map(({ fplId }) => fplId))
        .toEqual([SPANISH_FIXTURE]);
      // The Competition's own frozen Prompt Version seats its own roster: the
      // Premier League's nine are seated under another and are not entered for
      // this league at all.
      expect(laLiga.fixtures[0]?.slots.map(({ entrant }) => entrant.id))
        .toEqual([SPANISH_SEAT]);
    });

  test("answers a Competition it does not serve, and the bare path, with a 404",
    async () => {
      const get = async (path: string): Promise<number> =>
        (await handleDashboardRequest(
          new Request(`https://benchmark.example${path}`),
          query, SEASON, BEFORE_LOCK
        )).status;

      // The same terms as the leaderboard's: no default, and one lower-case
      // spelling, so the edge holds one entry per league rather than four.
      // `xx`, outside the `competition_code` domain, rather than `bl1` --
      // ticket 0056 stopped depending on `bl1` ahead of ticket 0058 opening
      // it (ADR-0054), which is what would have stopped this endpoint's 404
      // from covering an unserved-but-admitted code.
      expect(await get("/api/fixtures")).toBe(404);
      expect(await get("/api/xx/fixtures")).toBe(404);
      expect(await get("/api/PL/fixtures")).toBe(404);
      expect(await get("/api/pl/fixtures/1")).toBe(404);
    });

  test("answers the same body through the Worker's driver", async () => {
    // `probs` is `jsonb` and every timestamp is a `timestamptz`, so this body
    // is full of what the two drivers disagree about.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/fixtures"),
        driver.query, SEASON, BEFORE_LOCK
      );

      expect(await response.json()).toEqual(await fixtures());
    } finally {
      await driver.end();
    }
  });
});
describe("the Fixtures endpoint before any Prediction run", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "pre-season");
    // A second Gameweek on the schedule, which the seed's pre-season state does
    // not carry. Without one the earliest unsettled Gameweek and the last
    // Gameweek by number are both Gameweek 1, and the rule's first branch is
    // indistinguishable from its fallback: a read that never learned to
    // coalesce would pass on one Gameweek and show the wrong one on two.
    await writer.query(
      "insert into gameweeks (season, gw, deadline_at) values ($1, 2, $2)",
      [SEASON, "2026-08-21T17:30:00Z"]
    );
    await writer.query(
      `insert into fixtures (
         season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values ($1, 11, 2, 'Arsenal', 'Chelsea', $2)`,
      [SEASON, "2026-08-21T19:00:00Z"]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("selects the Gameweek with no Fixture Locked anywhere in the Season",
    async () => {
      // Ownership is `coalesce(locked_in_gw, gw)` because `locked_in_gw` is
      // assigned by the main run at deadline −6h. A rule reading it alone would
      // find nothing on exactly the page this state exists for.
      const locked = await writer.query(
        "select 1 from fixtures where season = $1 and locked_in_gw is not null",
        [SEASON]
      );
      expect(locked.rowCount).toBe(0);

      const body = await fixtures(new Date("2026-08-01T12:00:00Z"));

      expect(body.gw).toBe(1);
      expect(body.lockPassed).toBe(false);
      expect(body.fixtures).toHaveLength(10);
      // Nine pending slots per Fixture, which is what the page's −6h / −2h
      // banner is read off: every slot null, and no Fixture missing.
      for (const fixture of body.fixtures) {
        expect(fixture.slots.map(({ entrant }) => entrant.id)).toEqual(ROSTER);
        expect(fixture.slots.every(({ prediction }) => prediction === null))
          .toBe(true);
      }
    });
});

describe("the Fixtures endpoint on a Gameweek Locked and not yet scored", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "pre-season");
    // Gameweek 1 Locked, one Prediction committed and the matches being played:
    // the state every Season is in for four days out of every seven, and the
    // one a page gating on `throughGw` would call pre-season.
    await writer.query(
      "update fixtures set locked_in_gw = gw where season = $1", [SEASON]
    );
    const context = await writer.query<{ id: string }>(
      `insert into contexts (season, gw, track, fixture_id, hash, body, built_at)
       values ($1, 1, 'match', 1, 'seeded-hash', 'seeded body', $2)
       returning id`,
      [SEASON, "2026-08-14T11:30:00Z"]
    );
    await writer.query(
      `insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
         attempts_used, predicted_at
       ) values ('claude/v1', $1, 1, '{"H": 0.5, "D": 0.3, "A": 0.2}', 2, 1,
                 $2, 0, $3)`,
      [SEASON, context.rows[0]?.id, "2026-08-14T11:30:00Z"]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("shows the committed Prediction with nothing scored all Season",
    async () => {
      // Nothing has been scored, so `throughGw` is null on the leaderboard —
      // and this body does not carry it, so no page here can read it.
      const scored = await writer.query(
        "select 1 from scores where season = $1", [SEASON]
      );
      expect(scored.rowCount).toBe(0);

      const body = await fixtures(new Date("2026-08-15T12:00:00Z"));

      expect(body).not.toHaveProperty("throughGw");
      expect(body.gw).toBe(1);
      expect(body.lockPassed).toBe(true);
      const committed = body.fixtures
        .find(({ fplId }) => fplId === 1)?.slots
        .find(({ entrant }) => entrant.id === "claude/v1");
      expect(committed?.prediction).toMatchObject({
        predHome: 2, predAway: 1, coherent: true, repairs: 0
      });
    });
});

describe("the Fixtures endpoint with a deferred Fixture that never settles",
  () => {
    const { writer, reader, fixtures } = connections();

    beforeAll(async () => {
      await seed(writer, reader, "the design's");
      // A Gameweek 1 Fixture unscheduled and taken off the schedule: it will
      // never gain a result, and nothing may pin the page to its Gameweek for
      // the rest of the Season.
      await writer.query(
        `update fixtures set deferred = true, result = null
          where season = $1 and fixture_id = 5`,
        [SEASON]
      );
      // And one in the Gameweek on the page, which the Lock already owns.
      await writer.query(
        "update fixtures set deferred = true where season = $1 and fixture_id = 141",
        [SEASON]
      );
      return async () => {
        await writer.end();
        await reader.end();
      };
    });

    test("passes over it rather than holding on its Gameweek", async () => {
      const body = await fixtures();

      expect(body.gw).toBe(15);
    });

    test("keeps a deferred Fixture the Lock already owns", async () => {
      const body = await fixtures();

      // Its Predictions were committed under this Gameweek's Lock and are what
      // a reader came for. Dropping it would take nine committed Predictions
      // off the page because the Fixture lost its date.
      const kept = body.fixtures.find(({ fplId }) => fplId === 141);
      expect(kept).toBeDefined();
      expect(kept?.slots.filter(({ prediction }) => prediction)).toHaveLength(
        ROSTER.length
      );
    });
  });

describe("the Fixtures endpoint with a deferred Fixture no Lock owns", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "pre-season");
    // Unscheduled before any Prediction run reached it, so nothing was ever
    // committed against it. It is not in the Gameweek in any sense a reader
    // would recognise, and listing it would read as nine Gaps.
    await writer.query(
      "update fixtures set deferred = true where season = $1 and fixture_id = 2",
      [SEASON]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("drops it from the Gameweek it was scheduled in", async () => {
    const body = await fixtures(new Date("2026-08-01T12:00:00Z"));

    expect(body.gw).toBe(1);
    expect(body.fixtures).toHaveLength(9);
    expect(body.fixtures.map(({ fplId }) => fplId)).not.toContain(2);
  });
});

describe("the Fixtures endpoint when the last Gameweek is all deferred", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    // `pending` and not `the design's`: Gameweek 15's Fixtures carry no
    // `locked_in_gw` here, and the schema refuses to take one back off a
    // Fixture that has one.
    await seed(writer, reader, "pending");
    await writer.query(
      "update fixtures set deferred = true where season = $1 and gw = 15",
      [SEASON]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("falls back to the last Gameweek it can actually show", async () => {
    // Nothing is unsettled but the deferred fifteenth, so the fallback runs.
    // Counting Fixtures the listing drops would answer 15 and then render
    // none of them — the empty page this fallback exists to prevent.
    const body = await fixtures(AFTER_LOCK);

    expect(body.gw).toBe(14);
    expect(body.fixtures).toHaveLength(9);
  });
});

describe("the Fixtures endpoint once every Fixture has settled", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "the design's");
    await writer.query(
      `update fixtures
          set result = jsonb_build_object(
                'home_goals', 2, 'away_goals', 1, 'outcome', 'H')
        where season = $1 and result is null`,
      [SEASON]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("holds on the last Gameweek rather than emptying the page", async () => {
    // There is no later Gameweek to advance to, so a finished Season reads as
    // finished rather than as one with nothing in it.
    const body = await fixtures(AFTER_LOCK);

    expect(body.gw).toBe(15);
    expect(body.fixtures).toHaveLength(10);
    expect(body.lockPassed).toBe(true);
  });
});

describe("the Fixtures endpoint on a Gameweek of other than ten Fixtures", () => {
  const { writer, reader, fixtures } = connections();

  beforeAll(async () => {
    await seed(writer, reader, "the design's");
    // Gameweek 14 is the seed's short one, and putting its results back makes
    // it the earliest Gameweek owning an unsettled Fixture.
    await writer.query(
      `update fixtures set result = null
        where season = $1 and coalesce(locked_in_gw, gw) = 14`,
      [SEASON]
    );
    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("carries what the Gameweek holds rather than ten", async () => {
    const body = await fixtures();

    expect(body.gw).toBe(14);
    expect(body.fixtures).toHaveLength(9);
  });
});

describe("the Fixtures endpoint with an Exhibition Run seated", () => {
  const { writer, reader, query, fixtures } = connections();

  const EXHIBITION = OX_ALPHA_FIXTURE.id;
  const EXHIBITION_GAP = 139;
  const REPLAYED_AT = "2026-11-15T12:00:00Z";

  let withoutExhibitionGw14: FixturesBody;
  let withoutExhibitionGw15: FixturesBody;

  const playedFixtures = async (): Promise<FixturesBody> => {
    // Setting result = null on fixture 131 makes GW 14 the earliest unsettled
    // Gameweek, while preserving stored match outcomes on all other fixtures
    // (including the Gapped fixture 139 and answered fixtures 132..138) to prove
    // the conditional slot behaviour on genuinely played matches (ADR-0052, ticket 0053).
    await writer.query(
      "update fixtures set result = null where season = $1 and fixture_id = 131",
      [SEASON]
    );
    const body = await fixtures(BEFORE_LOCK);
    await writer.query(
      `update fixtures
          set result = jsonb_build_object('home_goals', 2, 'away_goals', 1, 'outcome', 'H')
        where season = $1 and fixture_id = 131`,
      [SEASON]
    );
    return body;
  };

  beforeAll(async () => {
    await seed(writer, reader, "the design's");
    await seedSpanishFixtures(writer);

    // Baseline assertions on both settled (GW 14) and unplayed (GW 15) fixtures
    // without an Exhibition Run establish the pre-admission contract.
    withoutExhibitionGw14 = await playedFixtures();
    withoutExhibitionGw15 = await fixtures(BEFORE_LOCK);
    expect(withoutExhibitionGw14.exhibitionCaveat).toBeUndefined();
    expect(withoutExhibitionGw15.exhibitionCaveat).toBeUndefined();
    for (const fixture of withoutExhibitionGw14.fixtures) {
      expect(fixture.slots.every((slot) => !("exhibition" in slot))).toBe(true);
    }
    for (const fixture of withoutExhibitionGw15.fixtures) {
      expect(fixture.slots.every((slot) => !("exhibition" in slot))).toBe(true);
    }

    // The Exhibition model stands in the catalog with role = 'exhibition' so
    // SEATS_CTE can discover it and derive its ran_after_gw label.
    await insertOxAlpha(writer);

    // Stored predictions simulate an operator replay completed after Gameweek 14,
    // deliberately leaving fixture 139 unpredicted to test the Gapped negative case.
    await writer.query(
      `insert into predictions (
         model_id, season, fixture_id, probs, pred_home, pred_away, context_id,
         attempts_used, predicted_at
       )
       select $2, $1, f.fixture_id,
              case f.result ->> 'outcome'
                when 'H' then '{"H":0.8,"D":0.1,"A":0.1}'::jsonb
                when 'D' then '{"H":0.1,"D":0.8,"A":0.1}'::jsonb
                else '{"H":0.1,"D":0.1,"A":0.8}'::jsonb
              end,
              (f.result ->> 'home_goals')::int,
              (f.result ->> 'away_goals')::int,
              c.id, 0, $3
         from fixtures f
         join contexts c
           on c.season = f.season and c.track = 'match' and c.fixture_id = f.fixture_id
        where f.season = $1 and coalesce(f.locked_in_gw, f.gw) = 14
          and f.fixture_id <> $4`,
      [SEASON, EXHIBITION, REPLAYED_AT, EXHIBITION_GAP]
    );

    // The read endpoint does not gate on throughGw, so predictions are published
    // on played fixtures before any scoring run records throughGw.
    const beforeScoringBody = await playedFixtures();
    expect(beforeScoringBody.gw).toBe(14);
    expect(beforeScoringBody.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);
    expect(beforeScoringBody.fixtures.some((f) => f.slots.some((s) => s.entrant.id === EXHIBITION))).toBe(true);

    // Populate season-to-date scores across the competition so the cross-surface
    // reader journey test can inspect the leaderboard and entrant records.
    await scoreMatchSeason({
      database: writer,
      competition: "PL",
      season: SEASON,
      now: () => new Date("2026-11-16T10:00:00Z")
    });

    return async () => {
      await writer.end();
      await reader.end();
    };
  }, 60_000);

  test("appends the Exhibition Run as an eleventh slot on played Fixtures it answered",
    async () => {
      const body = await playedFixtures();

      expect(body.gw).toBe(14);
      expect(body.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

      const answered = body.fixtures.filter(({ fplId }) => fplId !== EXHIBITION_GAP);
      expect(answered).toHaveLength(8);

      for (const fixture of answered) {
        // 9 roster slots + 1 exhibition slot = 10 slots
        expect(fixture.slots).toHaveLength(ROSTER.length + 1);

        // The roster's nine stay first and in id order with no exhibition field
        const rosterSlots = fixture.slots.slice(0, ROSTER.length);
        expect(rosterSlots.map(({ entrant }) => entrant.id)).toEqual(ROSTER);
        expect(rosterSlots.every((slot) => !("exhibition" in slot))).toBe(true);

        // The Exhibition slot is appended at the end
        const exhibitionSlot = fixture.slots.at(-1)!;
        expect(exhibitionSlot.entrant).toEqual({ id: EXHIBITION, name: "Ox Alpha" });
        expect(exhibitionSlot.exhibition).toEqual({ ranAfterGw: 14 });
        expect(exhibitionSlot.prediction).not.toBeNull();
        expect(exhibitionSlot.prediction?.coherent).toBe(true);
      }
    });

  test("leaves the Fixtures it Gapped with exactly the ten roster slots",
    async () => {
      const body = await playedFixtures();

      const gapped = body.fixtures.find(({ fplId }) => fplId === EXHIBITION_GAP);
      expect(gapped).toBeDefined();

      // Exactly the roster slots (9 in this test seed), never an empty 10th slot
      expect(gapped?.slots).toHaveLength(ROSTER.length);
      expect(gapped?.slots.map(({ entrant }) => entrant.id)).toEqual(ROSTER);
      expect(gapped?.slots.map(({ entrant }) => entrant.id)).not.toContain(EXHIBITION);
      expect(gapped?.slots.every((slot) => !("exhibition" in slot))).toBe(true);
    });

  test("leaves unplayed Fixtures with exactly the ten roster slots",
    async () => {
      const body = await fixtures(BEFORE_LOCK);

      expect(body.gw).toBe(15);
      expect(body.exhibitionCaveat).toBeUndefined();

      for (const fixture of body.fixtures) {
        expect(fixture.slots).toHaveLength(ROSTER.length);
        expect(fixture.slots.map(({ entrant }) => entrant.id)).toEqual(ROSTER);
        expect(fixture.slots.every((slot) => !("exhibition" in slot))).toBe(true);
      }

      // Byte-identical to the response before the Exhibition Run was seeded
      expect(JSON.stringify(body)).toBe(JSON.stringify(withoutExhibitionGw15));
    });

  test("moves no figure the roster is read on", async () => {
    const body = await playedFixtures();

    // Stripping the eleventh slot and caveat yields the EXACT baseline body, byte for byte
    const roster = (published: FixturesBody): string => {
      const { exhibitionCaveat: _caveat, ...rest } = published;
      return JSON.stringify({
        ...rest,
        fixtures: published.fixtures.map((fixture) => ({
          ...fixture,
          slots: fixture.slots.filter(({ entrant }) => entrant.id !== EXHIBITION)
        }))
      });
    };

    expect(roster(body)).toBe(JSON.stringify(withoutExhibitionGw14));
  });

  test("keeps La Liga's fixtures out of reach of a Premier League run",
    async () => {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pd/fixtures"),
        query, SEASON, BEFORE_LOCK
      );
      expect(response.status).toBe(200);
      const laLiga = await response.json() as FixturesBody;

      expect(laLiga.exhibitionCaveat).toBeUndefined();
      for (const fixture of laLiga.fixtures) {
        expect(fixture.slots.map(({ entrant }) => entrant.id)).toEqual([SPANISH_SEAT]);
        expect(fixture.slots.every((slot) => !("exhibition" in slot))).toBe(true);
      }
    });

  test("shows Exhibition predictions on played fixtures even before scoring runs",
    async () => {
      // The endpoint passes 0 as $4 to SEATS_CTE rather than gating on throughGw:
      // an Exhibition Run that answered a completed Gameweek is shown on that
      // Gameweek's fixtures even when the scorer has not run (docstring, ADR-0052).
      const body = await playedFixtures();
      expect(body.gw).toBe(14);
      expect(body.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

      const answered = body.fixtures.filter(({ fplId }) => fplId !== EXHIBITION_GAP);
      expect(answered).toHaveLength(8);
      for (const fixture of answered) {
        expect(fixture.slots).toHaveLength(ROSTER.length + 1);
        expect(fixture.slots.at(-1)?.entrant.id).toBe(EXHIBITION);
      }
    });

  test("completes the reader's cross-surface journey consistently across leaderboard, fixtures, and entrant record",
    async () => {
      // 1. Leaderboard
      const lbResponse = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/leaderboard"),
        query, SEASON, BEFORE_LOCK
      );
      expect(lbResponse.status).toBe(200);
      const lbBody = await lbResponse.json() as LeaderboardBody;
      const lbRow = lbBody.entrants.find(({ id }) => id === EXHIBITION);
      expect(lbRow).toBeDefined();
      expect(lbRow?.name).toBe("Ox Alpha");
      expect(lbRow?.exhibition).toEqual({ ranAfterGw: 14 });
      expect(lbBody.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

      // 2. Entrant Record
      const entResponse = await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/entrants"),
        query, SEASON, BEFORE_LOCK
      );
      expect(entResponse.status).toBe(200);
      const entBody = await entResponse.json() as EntrantsBody;
      const entRecord = entBody.entrants.find(({ id }) => id === EXHIBITION);
      expect(entRecord).toBeDefined();
      expect(entRecord?.name).toBe("Ox Alpha");
      expect(entRecord?.exhibition).toEqual({ ranAfterGw: 14 });
      expect(entRecord?.gaps).toBeNull();
      const gw14Record = entRecord?.gameweeks.find(({ gw }) => gw === 14);
      expect(gw14Record?.fixtures).toBe(9);
      expect(gw14Record?.settled).toBe(8);
      expect(gw14Record?.gaps).toBeNull();
      expect(entBody.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

      // 3. Fixtures page (GW 14)
      const fxBody = await playedFixtures();
      expect(fxBody.exhibitionCaveat).toBe(EXHIBITION_CAVEAT);

      const answeredFx = fxBody.fixtures.find(({ fplId }) => fplId !== EXHIBITION_GAP);
      const fxSlot = answeredFx?.slots.find(({ entrant }) => entrant.id === EXHIBITION);
      expect(fxSlot).toBeDefined();
      expect(fxSlot?.entrant).toEqual({ id: "exhibition/ox-alpha", name: "Ox Alpha" });
      expect(fxSlot?.exhibition).toEqual({ ranAfterGw: 14 });

      // Fixture it gapped has no slot for exhibition
      const gappedFx = fxBody.fixtures.find(({ fplId }) => fplId === EXHIBITION_GAP);
      expect(gappedFx?.slots.find(({ entrant }) => entrant.id === EXHIBITION)).toBeUndefined();
      expect(gappedFx?.slots).toHaveLength(ROSTER.length);
    });
});


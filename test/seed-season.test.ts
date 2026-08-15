import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  assertEmptyDatabase, assertLocalDatabase, pinPublicSchema, SEED_ENTERED_AT,
  SEED_SCORED_AT, seedSeason
} from "../src/seed-season.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import {
  GAP_RATE_METRIC, scoreMatchSeason
} from "../src/predictions/score-match-gameweek.js";
import {
  argmaxOutcome, outcomeOf, type Probs
} from "../src/fixture-result.js";

const { Client } = pg;

const SEASON = "2026-27";

describe("the seeded Season and its three stopping points", () => {
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
      `truncate scores, contexts, predictions, fixtures, models, gameweeks,
       historical_matches, competitions
       restart identity cascade`
    );
  });

  const countOf = async (sql: string, values: unknown[] = []):
  Promise<number> => {
    const counted = await client.query<{ count: string }>(sql, values);
    return Number(counted.rows[0]?.count);
  };

  test("pre-season is the roster and Gameweek 1's Fixtures", async () => {
    await seedSeason({ database: client, season: SEASON, stopAt: "pre-season" });

    const roster = await client.query<{ id: string }>(
      `select id from models
        where role = 'entrant' and prompt_version = $1
        order by id`,
      [MATCH_PROMPT_VERSION]
    );
    expect(roster.rows.map(({ id }) => id)).toEqual([
      "claude/v1", "deepseek/v1", "gemini/v1", "glm/v1", "gpt/v1",
      "grok/v1", "kimi/v1", "minimax/v1", "qwen/v1"
    ]);

    const fixtures = await client.query<{
      gw: number;
      locked_in_gw: number | null;
      result: unknown;
    }>("select gw, locked_in_gw, result from fixtures where season = $1",
      [SEASON]);
    expect(fixtures.rows).toHaveLength(10);
    expect(fixtures.rows.every(({ gw }) => gw === 1)).toBe(true);
    expect(fixtures.rows.every(
      ({ locked_in_gw, result }) => locked_in_gw === null && result === null
    )).toBe(true);

    expect(await countOf("select count(*) from predictions")).toBe(0);
    expect(await countOf("select count(*) from scores")).toBe(0);

    // And the Competition those Fixtures belong to is active. The scheduler
    // and the fetch walk this table (ADR-0035): a seeded Season missing from
    // it is one where every job correctly finds nothing to do.
    const competitions = await client.query(
      "select competition, season from competitions"
    );
    expect(competitions.rows).toEqual([
      { competition: "PL", season: SEASON }
    ]);
  });

  test("the roster carries the Base Model Classes of ADR-0014", async () => {
    await seedSeason({ database: client, season: SEASON, stopAt: "pre-season" });

    // The Match roster's nine. Its FPL counterpart carries the same classes,
    // and is asserted where it is seeded — `seed-fpl-season.test.ts`.
    const classes = await client.query<{ class: string; count: string }>(
      `select config ->> 'baseModelClass' as class, count(*) as count
         from models where role = 'entrant' and prompt_version = $1
        group by 1 order by 1`,
      [MATCH_PROMPT_VERSION]
    );
    expect(classes.rows).toEqual([
      { class: "First-party", count: "1" },
      { class: "Frontier", count: "3" },
      { class: "Open-weight", count: "5" }
    ]);

    // Every open-weight seat is pinned to a precision (ADR-0014): a served
    // open-weight Base Model at another quantization is another model, and an
    // unpinned seat is not one Entrant across a Season.
    expect(await countOf(
      `select count(*) from models
        where config ->> 'baseModelClass' = 'Open-weight'
          and quantization is null`
    )).toBe(0);
  });

  test("pending settles fourteen Gameweeks and locks none of the fifteenth",
    async () => {
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });

      const byGameweek = await client.query<{
        gw: number;
        fixtures: string;
        locked: string;
        settled: string;
        predictions: string;
      }>(
        `select f.gw,
                count(*) as fixtures,
                count(f.locked_in_gw) as locked,
                count(f.result) as settled,
                count(distinct p.model_id) as predictions
           from fixtures f
           left join predictions p
             on p.season = f.season and p.fixture_id = f.fixture_id
          where f.season = $1
          group by f.gw order by f.gw`,
        [SEASON]
      );
      expect(byGameweek.rows).toHaveLength(15);
      for (const row of byGameweek.rows.slice(0, 14)) {
        expect(row.locked).toBe(row.fixtures);
        expect(row.settled).toBe(row.fixtures);
        expect(row.predictions).toBe("9");
      }
      const fifteenth = byGameweek.rows[14]!;
      expect(fifteenth).toMatchObject({
        gw: 15, fixtures: "10", locked: "0", settled: "0", predictions: "0"
      });

      const scored = await client.query<{ max: number }>(
        "select max(gw) as max from scores where season = $1", [SEASON]
      );
      expect(scored.rows[0]?.max).toBe(14);
    });

  test("the design's adds Gameweek 15's contexts and Predictions and no more",
    async () => {
      await seedSeason({
        database: client, season: SEASON, stopAt: "the design's"
      });

      const fifteenth = await client.query<{
        contexts: string;
        predictions: string;
        settled: string;
      }>(
        `select (select count(*) from contexts
                  where season = $1 and gw = 15 and track = 'match') as contexts,
                (select count(*) from predictions p join fixtures f
                    on f.season = p.season and f.fixture_id = p.fixture_id
                  where p.season = $1 and f.locked_in_gw = 15) as predictions,
                (select count(f.result) from fixtures f
                  where f.season = $1 and f.gw = 15) as settled`,
        [SEASON]
      );
      // Ten Fixtures, nine Entrants each bar the one Gap the seed leaves.
      expect(fifteenth.rows[0]).toEqual({
        contexts: "10", predictions: "89", settled: "0"
      });

      const scored = await client.query<{ max: number }>(
        "select max(gw) as max from scores where season = $1", [SEASON]
      );
      expect(scored.rows[0]?.max).toBe(14);
    });

  test("every scores row is the real scorer's and none is the seed's",
    async () => {
      // The Match track's rows. The FPL track's are the FPL scorer's and are
      // asserted the same way where that scorer runs — `seed-fpl-season.test.ts`.
      const storedScores = async (): Promise<unknown[]> => {
        const rows = await client.query(
          `select model_id, gw, track, metric, value, n, detail, scored_at
             from scores where season = $1 and track = 'match'
            order by model_id, gw, metric`,
          [SEASON]
        );
        return rows.rows;
      };

      // Pending rather than the design's: the design's state is what the
      // scorer wrote before Gameweek 15 was locked, so a scorer run after the
      // Lock legitimately adds that Gameweek's behavioural rows.
      await seedSeason({ database: client, season: SEASON, stopAt: "pending" });
      const seeded = await storedScores();
      expect(seeded.length).toBeGreaterThan(0);

      // Nothing the seed wrote is left, and running the scorer again over the
      // same Predictions and results puts every row back exactly as it was. A
      // row the seed had written itself would be missing here.
      await client.query("delete from scores where track = 'match'");
      expect(await storedScores()).toEqual([]);
      await scoreMatchSeason({
        database: client, competition: "PL", season: SEASON,
        now: () => SEED_SCORED_AT
      });
      expect(await storedScores()).toEqual(seeded);
    });

  test("a Gap, an incoherent Prediction and a short Gameweek are all present",
    async () => {
      await seedSeason({
        database: client, season: SEASON, stopAt: "the design's"
      });

      // The scoring run sits between Gameweek 14 settling and Gameweek 15's
      // Prediction run, which is the instant the design was drawn at.
      const stamps = await client.query<{ ok: boolean }>(
        `select max(f.updated_at) < $2 and $2 < min(p.predicted_at) as ok
           from fixtures f, predictions p
          where f.season = $1 and f.result is not null
            and p.season = $1 and p.fixture_id > 140`,
        [SEASON, SEED_SCORED_AT]
      );
      expect(stamps.rows[0]?.ok).toBe(true);

      // A Gap the scorer itself reports, so the pages render an absence the
      // write path agrees is one.
      const gaps = await client.query<{ model_id: string; value: string }>(
        `select model_id, value from scores
          where season = $1 and track = 'match' and metric = $2 and value > 0
          order by model_id`,
        [SEASON, GAP_RATE_METRIC]
      );
      expect(gaps.rows.map(({ model_id }) => model_id)).toEqual(["minimax/v1"]);

      const predictions = await client.query<{
        probs: Probs;
        pred_home: number;
        pred_away: number;
      }>(
        "select probs, pred_home, pred_away from predictions where season = $1",
        [SEASON]
      );
      const incoherent = predictions.rows.filter(
        ({ probs, pred_home, pred_away }) =>
          argmaxOutcome(probs) !== outcomeOf(pred_home, pred_away)
      );
      expect(incoherent).toHaveLength(1);

      const sizes = await client.query<{ fixtures: string }>(
        `select count(*) as fixtures from fixtures
          where season = $1 group by gw having count(*) <> 10`,
        [SEASON]
      );
      expect(sizes.rows).toEqual([{ fixtures: "9" }]);
    });

  test("the seed refuses any database that is not a local one", () => {
    expect(() => assertLocalDatabase("postgresql://postgres@localhost:5432/x"))
      .not.toThrow();
    expect(() => assertLocalDatabase("postgresql://postgres@127.0.0.1/x"))
      .not.toThrow();
    // The temporary cluster the suite itself runs on: a socket directory.
    expect(() => assertLocalDatabase(
      "postgresql://postgres@localhost:5432/postgres?host=%2Ftmp%2Fsocket"
    )).not.toThrow();
    expect(() => assertLocalDatabase("postgresql://u:p@db.example.com/x"))
      .toThrow(/local/);
    // Every way the driver's effective host differs from the URL's authority.
    // `?host=` wins when it names something; the last one wins when it is
    // repeated; an empty one hands the decision back to the authority.
    expect(() => assertLocalDatabase(
      "postgresql://u:p@localhost/x?host=db.example.com"
    )).toThrow(/db\.example\.com/);
    expect(() => assertLocalDatabase(
      "postgresql://u:p@localhost/x?host=%2Ftmp%2Fs&host=db.example.com"
    )).toThrow(/db\.example\.com/);
    expect(() => assertLocalDatabase(
      "postgresql://u:p@db.example.com/x?host="
    )).toThrow(/db\.example\.com/);
  });

  test("the guard reads PGHOST the way the driver does", () => {
    const before = process.env.PGHOST;
    process.env.PGHOST = "db.example.com";
    try {
      // A URL with no authority takes its host from the environment, so a
      // guard reading only the string would call this local.
      expect(() => assertLocalDatabase("postgresql:///x"))
        .toThrow(/db\.example\.com/);
    } finally {
      if (before === undefined) {
        delete process.env.PGHOST;
      } else {
        process.env.PGHOST = before;
      }
    }
  });

  test("pre-season holds no Gameweek the state does not have", async () => {
    await seedSeason({ database: client, season: SEASON, stopAt: "pre-season" });

    const gameweeks = await client.query<{ gw: number }>(
      "select gw from gameweeks where season = $1 order by gw", [SEASON]
    );
    expect(gameweeks.rows.map(({ gw }) => gw)).toEqual([1]);
  });

  test("no scores row exists until the scorer has run", async () => {
    let scoresWhenScorerRan: number | undefined;
    await seedSeason({
      database: client,
      season: SEASON,
      stopAt: "pending",
      score: async () => {
        scoresWhenScorerRan = await countOf("select count(*) from scores");
      },
      // Both tracks' scorers, because both are asked to run over the same
      // written Season and neither may find a row of its own already there.
      scoreFpl: async () => {
        scoresWhenScorerRan = Math.max(
          scoresWhenScorerRan ?? 0,
          await countOf("select count(*) from scores")
        );
      }
    });

    // The seed wrote its whole Season and handed a database with no `scores`
    // row in it to the scorer.
    expect(scoresWhenScorerRan).toBe(0);
    expect(await countOf("select count(*) from scores")).toBe(0);
    expect(await countOf("select count(*) from predictions"))
      .toBeGreaterThan(0);
  });

  test("every Prediction is stored before its Gameweek's Lock", async () => {
    await seedSeason({
      database: client, season: SEASON, stopAt: "the design's"
    });

    // Every Prediction and context carries the main run's instant, deadline
    // −6h, rather than whenever the seed happened to be run: the Lock the
    // Fixtures page asserts has to hold in any year, and every row the seed
    // writes has to come out the same on the next run.
    expect(await countOf(
      `select count(*) from predictions p
         join fixtures f on f.season = p.season and f.fixture_id = p.fixture_id
         join gameweeks g on g.season = f.season and g.gw = f.locked_in_gw
        where p.predicted_at <> g.deadline_at - interval '6 hours'`
    )).toBe(0);
    expect(await countOf(
      `select count(*) from contexts c
         join gameweeks g on g.season = c.season and g.gw = c.gw
        where c.built_at <> g.deadline_at - interval '6 hours'`
    )).toBe(0);
    // And no other column is left to the clock either.
    // The Entrants, which are the rows the seed writes. The scorer enters the
    // three Reference Lines itself and lets `created_at` default, so that is
    // the one stamp in a seeded database that moves between runs — nothing
    // reads it, and pinning it would mean changing the scorer.
    expect(await countOf(
      "select count(distinct created_at) from models where role = 'entrant'"
    )).toBe(1);
    expect(await countOf(
      `select count(*) from fixtures
        where result is null and updated_at <> $1`, [SEED_ENTERED_AT]
    )).toBe(0);
  });

  test("a context hash is taken over the context body", async () => {
    await seedSeason({
      database: client, season: SEASON, stopAt: "the design's"
    });

    expect(await countOf(
      `select count(*) from contexts
        where hash <> encode(sha256(convert_to(body, 'utf8')), 'hex')`
    )).toBe(0);
  });

  test("the seed refuses a database that already holds a Season", async () => {
    await expect(assertEmptyDatabase(client)).resolves.toBeUndefined();

    await seedSeason({ database: client, season: SEASON, stopAt: "pre-season" });

    // Names what is in the way and how to clear it, rather than clearing it.
    await expect(assertEmptyDatabase(client))
      .rejects.toThrow(/fixtures, gameweeks, models[\s\S]*--reset/);
  });

  test("the emptiness check covers a table the seed never writes", async () => {
    // `historical_matches` is the case: the seed writes none, and the scorer
    // reads it for the Elo Reference Line, so rows left in it move the numbers
    // the seed is supposed to produce identically every time.
    await client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values ('PL', '2025-26', 'Premier League', '2026-05-01', 'Arsenal',
                 'Chelsea', 1, 0)`
    );

    await expect(assertEmptyDatabase(client))
      .rejects.toThrow(/historical_matches/);
  });

  test("the schema certified empty is the schema written to", async () => {
    // A search path the connection or the role could have set: unqualified
    // writes would land in `decoy`, which the emptiness check never looks at.
    await client.query("create schema decoy");
    try {
      await client.query("set search_path to decoy, public");
      await client.query("create table decoy.models (id text primary key)");
      await client.query("insert into decoy.models values ('stale')");

      await pinPublicSchema(client);

      // The check reads what the seed is about to write, so the decoy's row
      // does not certify anything and the empty `public` is what counts.
      await expect(assertEmptyDatabase(client)).resolves.toBeUndefined();
      await seedSeason({
        database: client, season: SEASON, stopAt: "pre-season"
      });

      // Nine Base Models, each with a seat on either track.
      expect(await countOf("select count(*) from public.models")).toBe(18);
      expect(await countOf("select count(*) from decoy.models")).toBe(1);
    } finally {
      await client.query("drop schema decoy cascade");
      await client.query("reset search_path");
    }
  });

  test("a seed that fails part way through leaves nothing behind", async () => {
    // A Gameweek 1 already present is enough: the roster is written first and
    // the Gameweek insert below it collides.
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ($1, 1, '2026-08-14T17:30:00Z')`,
      [SEASON]
    );

    await expect(seedSeason({
      database: client, season: SEASON, stopAt: "pre-season"
    })).rejects.toThrow();

    expect(await countOf("select count(*) from models")).toBe(0);
  });
});

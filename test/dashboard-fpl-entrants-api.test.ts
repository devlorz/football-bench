import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest,
  type EntrantsBody, type FplEntrantsBody, type FplEntrantRecord, type Query
} from "../src/dashboard/read-api.js";
import { CHIPS, type SquadEnvelope } from "../src/fpl/apply-gameweek-action.js";
import {
  DEMONSTRATION_QUALIFICATION
} from "../src/fpl/demonstration-record.js";
import { FPL_PROMPT_VERSION } from "../src/context/build-fpl-track-context.js";
import { MAX_REPAIRS } from "../src/repairs.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The FPL endpoints read no clock; the Match track's Fixtures page does. */
const NOW = new Date("2026-11-15T12:00:00Z");

/**
 * The Gameweek the seed's Gapping Entrant is silent in, which is therefore the
 * Gameweek no Season path holds (ADR-0011) and the hole the body announces.
 */
const GAPPED_GAMEWEEK = 4;

function entrantsEndpoint(): {
  writer: pg.Client;
  reader: pg.Client;
  query: Query;
  get: (path?: string) => Promise<Response>;
  entrants: () => Promise<FplEntrantsBody>;
  record: (id: string) => Promise<FplEntrantRecord>;
} {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const get = (path = "/api/fpl/entrants"): Promise<Response> =>
    handleDashboardRequest(
      new Request(`https://benchmark.example${path}`), query, SEASON, NOW
    );

  const entrants = async (): Promise<FplEntrantsBody> => {
    const response = await get();
    expect(response.status).toBe(200);
    return await response.json() as FplEntrantsBody;
  };

  const record = async (id: string): Promise<FplEntrantRecord> => {
    const found = (await entrants()).entrants.find((each) => each.id === id);
    expect(found, `the body holds no record for ${id}`).toBeDefined();
    return found!;
  };

  return { writer, reader, query, get, entrants, record };
}

describe("the FPL Entrant-record endpoint", () => {
  const { writer, reader, query, get, entrants, record } = entrantsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("answers with every Entrant's whole history in one body", async () => {
    const body = await entrants();

    expect(body.season).toBe(SEASON);
    expect(body.fromGw).toBe(1);
    expect(body.throughGw).toBe(5);
    expect(body.entrants).toHaveLength(9);
    expect(body.entrants.every(({ id }) => id.startsWith("fpl/"))).toBe(true);

    // One body and not one request per Entrant, which is the whole bargain the
    // picker is a re-render on.
    for (const entrant of body.entrants) {
      expect(entrant.gameweeks.map(({ gw }) => gw)).toEqual([1, 2, 3, 5]);
    }

    // The picker's order is the squads page's, because the two Entrant-scoped
    // pages carry one selection between them.
    const totals = body.entrants.map(({ totalPoints }) => totalPoints ?? 0);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  test("announces the Gameweek the record holds nothing for", async () => {
    const body = await entrants();

    // Announced, not skipped: the series jumps from 3 to 5, and a reader not
    // told why would read the jump as a Gameweek nobody scored in. The
    // Gameweek is absent because one Entrant Gapped it, which removes it from
    // every Season path (ADR-0011) rather than from that Entrant's alone.
    expect(body.missingGws).toEqual([GAPPED_GAMEWEEK]);
    expect(
      body.entrants.every(({ gameweeks }) =>
        !gameweeks.some(({ gw }) => gw === GAPPED_GAMEWEEK))
    ).toBe(true);

    // And the Gameweek really is inside the span rather than beyond its end.
    expect(body.fromGw).toBeLessThan(GAPPED_GAMEWEEK);
    expect(body.throughGw).toBeGreaterThan(GAPPED_GAMEWEEK);
  });

  test("counts a Gap against the Entrant that took it and nobody else",
    async () => {
      const body = await entrants();

      // A Gap is a Gameweek an Entrant stored no Manager State for: it never
      // reached a legal action at all, where an Entrant that reached none it
      // liked Rolled Over and stored what stood. One Entrant of the nine did
      // the first, and its Gap is the reason the Gameweek above is missing.
      const gapped = body.entrants.filter(({ gaps }) => gaps === 1);
      expect(gapped.map(({ id }) => id)).toEqual(["fpl/minimax"]);
      expect(body.entrants.every(({ gaps }) => gaps === 0 || gaps === 1))
        .toBe(true);

      // The Gap is on record with its cause, which is what makes it a reported
      // result rather than an absence (CONTEXT.md).
      const [attempt] = await query(
        `select error_kind from attempts
          where season = $1 and gw = $2 and track = 'fpl' and model_id = $3
          limit 1`,
        [SEASON, GAPPED_GAMEWEEK, "fpl/minimax"]
      );
      expect(attempt?.error_kind).toBe("provider");
    });

  test("reads the Gapped Gameweek's Squad, and says which Gameweek it read",
    async () => {
      const body = await entrants();
      const gw5 = (entrant: FplEntrantRecord) =>
        entrant.gameweeks.find(({ gw }) => gw === 5)!;

      // Gameweek 5's Transfers are the changes since the last Squad that stood,
      // which for eight of the nine is Gameweek 4 — a Gameweek that never
      // settled and is therefore absent from the series above. Reading past it
      // is right and hiding that would not be: a reader told "Transfers into
      // Gameweek 5" without being told what they are measured from cannot see
      // that one Entrant's are measured from two Gameweeks further back.
      for (const entrant of body.entrants) {
        expect(gw5(entrant).transfersSinceGw)
          .toBe(entrant.id === "fpl/minimax" ? 3 : GAPPED_GAMEWEEK);
      }
    });

  test("replays the Hit's Transfers and the cost the scorer deducted",
    async () => {
      // Two Transfers against the one Free Transfer Gameweek 2 grants, so the
      // second is paid for at the game's four points.
      const [gw2] = (await record("fpl/claude")).gameweeks
        .filter(({ gw }) => gw === 2);

      expect(gw2!.transfersOut.map(({ name }) => name).sort())
        .toEqual(["Rogers", "Watkins"]);
      expect(gw2!.transfersIn.map(({ name }) => name).sort())
        .toEqual(["Kudus", "Wissa"]);
      expect(gw2!.transfersSinceGw).toBe(1);
      expect(gw2!.hitPoints).toBe(4);

      // The cost the scorer already deducted, and not a second deduction here.
      const [stored] = await query(
        `select value from scores
          where season = $1 and track = 'fpl' and metric = 'fpl_points'
            and model_id = $2 and gw = 2`,
        [SEASON, "fpl/claude"]
      );
      expect(gw2!.points).toBe(Number(stored?.value));
    });

  test("has nothing to replay at the Gameweek the Entrant opened in",
    async () => {
      const [opening] = (await record("fpl/claude")).gameweeks;

      // Fifteen players arriving is a Squad being bought, not fifteen
      // Transfers, and there is no Gameweek behind it to have bought them from.
      expect(opening).toMatchObject({
        gw: 1, transfersIn: [], transfersOut: [], transfersSinceGw: null
      });
    });

  test("names the captain, the vice, and what the armband returned",
    async () => {
      const record_ = await record("fpl/grok");
      const gw2 = record_.gameweeks.find(({ gw }) => gw === 2)!;

      expect(gw2.captain.name).toBe("Konate");
      expect(gw2.viceCaptain.name).toBe("Branthwaite");
      // Who wore it, which is the captain wherever the captain played.
      expect(gw2.armband?.fplId).toBe(gw2.captain.fplId);

      // Already multiplied: the figure is what the armband returned and not
      // what the player scored, so a Triple Captain reads as three times.
      const [scored] = await query(
        `select total_points from fpl_player_points
          where season = $1 and gw = 2 and fpl_id = $2`,
        [SEASON, gw2.captain.fplId]
      );
      expect(gw2.captainPoints).toBe(Number(scored?.total_points) * 2);
    });

  test("reports the Chip and the Gameweek that spent it", async () => {
    const played = await record("fpl/grok");
    const untouched = await record("fpl/claude");

    // The strip cannot be drawn from `chips_used` alone: the set says which
    // Chips are gone and the Manager States say which Gameweek took them.
    expect(played.chipsPlayed).toEqual([{ chip: "bench_boost", gw: 3 }]);
    expect(untouched.chipsPlayed).toEqual([]);

    // Both halves counted while the first is still playable: two sets of four,
    // less the one this Entrant spent.
    expect(untouched.chipsRemaining).toBe(CHIPS.length * 2);
    expect(played.chipsRemaining).toBe(CHIPS.length * 2 - 1);
  });

  test("adds the operator footer's totals up out of the record", async () => {
    const body = await entrants();
    const of = (id: string) => body.entrants.find((each) => each.id === id)!;

    // The seed plays each of these exactly once, and each lands on a different
    // seat, so a total that read the wrong Entrant's row would not agree.
    expect(of("fpl/gemini").repairs).toBe(1);
    expect(of("fpl/kimi").repairs).toBe(MAX_REPAIRS);
    expect(of("fpl/kimi").rollOvers).toBe(1);
    expect(of("fpl/claude").hitPoints).toBe(4);

    // A Roll Over spends the whole allowance without reaching a legal action,
    // so the Repairs and the Roll Over are the same Gameweek's two facts.
    const rolled = of("fpl/kimi").gameweeks.filter(({ rolledOver }) => rolledOver);
    expect(rolled.map(({ gw, repairs }) => ({ gw, repairs })))
      .toEqual([{ gw: 3, repairs: MAX_REPAIRS }]);

    // Everybody else's totals are noughts rather than nulls: a Season scored
    // through five Gameweeks in which nothing was repaired is a nought.
    expect(of("fpl/gpt")).toMatchObject({
      repairs: 0, rollOvers: 0, hitPoints: 0, gaps: 0
    });

    // The Prompt Version the seats were entered under, one Season fact and not
    // nine copies of it.
    expect(body.promptVersion).toBe(FPL_PROMPT_VERSION);
    const seated = await query(
      "select distinct prompt_version from models where id like 'fpl/%'"
    );
    expect(seated.map((row) => row.prompt_version)).toEqual([FPL_PROMPT_VERSION]);
  });

  test("prices each Gameweek's Squad against the list that stood then",
    async () => {
      const gameweeks = (await record("fpl/gpt")).gameweeks;

      // The value moves because the market moved: the seed raises one player
      // and drops another, and pricing every Gameweek at the latest list would
      // draw a flat line through a Squad that was worth different amounts.
      const values = gameweeks.map(({ squadValueTenths }) => squadValueTenths);
      expect(new Set(values).size).toBeGreaterThan(1);

      // Every Gameweek's value is the Squad's Selling Prices at that Gameweek's
      // list, checked against the rows themselves for the opening one — where
      // nothing has moved yet, so Selling Price is the purchase price and the
      // fifteen and the bank are the whole opening budget.
      const [opening] = gameweeks;
      expect(opening!.squadValueTenths + opening!.bankTenths).toBe(1000);
    });

  test("agrees with the leaderboard about every Season total", async () => {
    const body = await entrants();
    const stored = new Map((await query(
      `select model_id, value from scores
        where season = $1 and track = 'fpl' and competition = 'PL'
          and metric = 'fpl_points_season_to_date' and gw = 5`,
      [SEASON]
    )).map((row) => [String(row.model_id), Number(row.value)]));

    for (const entrant of body.entrants) {
      expect(entrant.totalPoints).toBe(stored.get(entrant.id));
    }
    // And it is the scorer's running total rather than this endpoint adding the
    // Gameweeks up a second time — which it would agree with here and would
    // stop agreeing with the moment a Gameweek was rescored.
    expect(body.entrants.every(({ totalPoints }) => (totalPoints ?? 0) > 0))
      .toBe(true);
  });

  test("carries the qualification byte for byte out of storage", async () => {
    const body = await entrants();

    // Ten totals a reader can order for themselves is a ranking, and spec
    // 0014's story 33 binds every response one can be read off.
    const [stored] = await query(
      `select detail ->> 'qualification' as qualification from scores
        where season = $1 and track = 'fpl'
          and metric = 'fpl_points_season_to_date' limit 1`,
      [SEASON]
    );
    expect(body.qualification).toBe(stored?.qualification);
    expect(body.qualification).toBe(DEMONSTRATION_QUALIFICATION);
  });

  test("fails closed on a record whose rows lost the qualification",
    async () => {
      await writer.query(
        `update scores set detail = detail - 'qualification'
          where season = $1 and track = 'fpl' and gw = 5
            and metric = 'fpl_points_season_to_date'`,
        [SEASON]
      );
      try {
        await expect(get()).rejects.toThrow(/carry no one qualification/);
      } finally {
        await writer.query(
          `update scores
              set detail = jsonb_set(detail, '{qualification}', to_jsonb($2::text))
            where season = $1 and track = 'fpl' and gw = 5
              and metric = 'fpl_points_season_to_date'`,
          [SEASON, DEMONSTRATION_QUALIFICATION]
        );
      }
      expect((await entrants()).qualification).toBe(DEMONSTRATION_QUALIFICATION);
    });

  test("excludes the Match track's rows, as the Match track excludes its",
    async () => {
      const fpl = await entrants();
      const match = await (await get("/api/pl/entrants")).json() as EntrantsBody;

      // One seed, two records, and neither one's Gameweek or roster leaks into
      // the other.
      expect(fpl.throughGw).toBe(5);
      expect(match.throughGw).toBe(14);
      expect(
        match.entrants.map(({ id }) => id).filter((id) => id.startsWith("fpl/"))
      ).toEqual([]);
      expect(fpl.entrants.every(({ id }) => id.startsWith("fpl/"))).toBe(true);
    });

  test("reads no Competition but the Premier League", async () => {
    // The FPL track is the Premier League by nature (spec 0017), and every read
    // says so. A row of another Competition in the tables this endpoint reads
    // must not reach it — the filter is what stops two leagues being ranked
    // against each other (ADR-0035).
    await writer.query(
      "insert into competitions (competition, season) values ('PD', $1)",
      [SEASON]
    );
    await writer.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       select 'PD', season, gw, deadline_at from gameweeks
        where competition = 'PL' and season = $1`,
      [SEASON]
    );
    await writer.query(
      `insert into scores (
         model_id, competition, season, gw, track, metric, value, n, detail
       )
       select model_id, 'PD', season, gw, track, metric, value + 1000, n, detail
         from scores
        where season = $1 and track = 'fpl' and competition = 'PL'`,
      [SEASON]
    );
    try {
      const body = await entrants();
      expect(body.throughGw).toBe(5);
      expect(body.entrants.every(({ totalPoints }) => (totalPoints ?? 0) < 1000))
        .toBe(true);
    } finally {
      await writer.query(
        "delete from scores where season = $1 and competition = 'PD'",
        [SEASON]
      );
      await writer.query(
        "delete from gameweeks where season = $1 and competition = 'PD'",
        [SEASON]
      );
      await writer.query(
        "delete from competitions where season = $1 and competition = 'PD'",
        [SEASON]
      );
    }
  });

  test("carries the scored-data cache lifetime", async () => {
    const response = await get();

    // The lifetime the daily scoring run moves on, and `stale-if-error=0` so a
    // Worker that has lost its database goes dark rather than serving numbers
    // that look current. Deliberately not the sixty-second Fixtures lifetime.
    expect(response.headers.get("cloudflare-cdn-cache-control"))
      .toBe("max-age=300, stale-while-revalidate=3600, stale-if-error=0");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  });

  test("answers the same body through the Worker's driver", async () => {
    // `numeric`, `integer` and `boolean` reach one driver as strings and the
    // other as values, and this body is full of all three.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/fpl/entrants"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await entrants());
    } finally {
      await driver.end();
    }
  });

  test("names only the seats that still hold a place on the track", async () => {
    // A withdrawn seat holds no Season path (ADR-0047). Listed, it would read
    // as a Base Model that played the Season and finished last rather than one
    // that never started it. Both of this endpoint's reads have to agree — the
    // Manager State replay and the name list — or an Entrant is named with no
    // path or walks a path with no name.
    const withdrawnEntrantIds =
      (await entrants()).entrants.slice(0, 3).map(({ id }) => id);
    await writer.query(
      "update models set withdrawn_at = now() where id = any($1)", [withdrawnEntrantIds]
    );
    try {
      const body = await entrants();

      expect(body.entrants.map(({ id }) => id))
        .toEqual(expect.not.arrayContaining(withdrawnEntrantIds));
      expect(body.entrants).toHaveLength(9 - 3);
      // Every seat that remains still carries its whole record: the filter
      // removed Entrants, not Gameweeks.
      for (const entrant of body.entrants) {
        expect(entrant.gameweeks.length).toBeGreaterThan(0);
      }
    } finally {
      await writer.query(
        "update models set withdrawn_at = null where id = any($1)", [withdrawnEntrantIds]
      );
    }
  });

});

/**
 * The Gameweek after a Free Hit, which the seed does not play: its one Chip is a
 * Bench Boost, and a Season with no Free Hit in it never asks the replay the
 * question the Chip exists to make hard.
 *
 * The rule itself is `transfersBetween`'s and the squads endpoint already walks
 * it. What has no walk anywhere is the wiring this endpoint puts around it —
 * `own[index - 1]`, which steps back to the last *stored* Manager State rather
 * than the last Settled one. The two meet here: the Chip is played in the
 * Gameweek the record holds a hole at, so Gameweek 5's Transfers are read
 * against a state that is absent from the series and carries a stash. Reading
 * the borrowed fifteen instead of the stashed Squad reports fifteen Transfers
 * for a restoration nobody made, and reading a Settled Gameweek instead of the
 * stored one skips the stash entirely.
 *
 * The state is inserted and nothing is rewritten: `manager_states` rows are
 * immutable against update *and* delete (migration 0001), which is load-bearing
 * and is not weakened for a test. That leaves exactly one place a Manager State
 * can still be written into this seed — the Gameweek the Gapping Entrant stored
 * none for — and it happens to be the Gameweek the record holds its hole at,
 * which is the pairing this probe wants. The Gameweek still settles nothing,
 * because settling is `scores` rows and this writes none, so the hole stays a
 * hole and the seat's Gap is filled.
 *
 * What is therefore *not* asserted here is the Chip accounting. A reducer
 * playing a Free Hit records it in `chips_used` and carries it forward, and the
 * Gameweek 5 row that would carry it is one the seed already wrote and nothing
 * may now change. So this record disagrees with itself about how many Chips the
 * seat has spent, and the two figures read off `chips_used` — `chipsPlayed`'s
 * count and `chipsRemaining` — are meaningless in this describe and are left
 * alone. The Transfers are read from the Squad envelope alone and are not.
 */
describe("the FPL Entrant-record endpoint after a Free Hit", () => {
  const { writer, reader, record } = entrantsEndpoint();

  /**
   * The one seat with a writable Gameweek: it Gapped Gameweek 4, so it has no
   * row there to be immutable.
   */
  const BORROWER = "fpl/minimax";

  /** How many of the fifteen the borrowed Squad replaces; any number above nought. */
  const BORROWED = 4;

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });

    // The permanent Squad, which is the one standing when the Chip is played and
    // the one it gives back. The seat banks its Free Transfers throughout, so
    // the Squad it holds at Gameweek 3 is the Squad it fields at Gameweek 5 —
    // which is what makes a correct restoration read as no Transfers at all.
    const [held] = (await writer.query(
      `select squad from manager_states
        where competition = 'PL' and season = $1 and gw = 3 and model_id = $2`,
      [SEASON, BORROWER]
    )).rows as Array<{ squad: SquadEnvelope }>;

    // Players the Entrant does not own, priced at what the Gameweek lists them
    // at — a Free Hit buys against the same market as any other Transfer.
    const owned = new Set(held!.squad.active.map(({ fplId }) => fplId));
    const listed = (await writer.query(
      `select distinct on (fpl_id) fpl_id, price_tenths from fpl_players
        where competition = 'PL' and season = $1 and gw <= $2
        order by fpl_id, gw desc`,
      [SEASON, GAPPED_GAMEWEEK]
    )).rows.filter((row) => !owned.has(Number(row.fpl_id)));
    expect(listed.length).toBeGreaterThanOrEqual(BORROWED);

    const borrowed = [
      ...held!.squad.active.slice(BORROWED),
      ...listed.slice(0, BORROWED).map((row) => ({
        fplId: Number(row.fpl_id),
        purchasePriceTenths: Number(row.price_tenths)
      }))
    ];

    // The Chip lends a Squad for one Gameweek and stashes the permanent one,
    // spelled as `SquadEnvelope` says it is stored.
    await writer.query(
      `insert into manager_states (
         model_id, competition, season, gw, squad, team_sheet, bank,
         free_transfers, chips_used, chip_active, rolled_over, attempts_used,
         hits, predicted_at
       )
       select $2, 'PL', $1, $3, $4, team_sheet, bank, free_transfers,
              '{"firstHalf": ["free_hit"], "secondHalf": []}', 'free_hit',
              false, 0, 0, predicted_at
         from manager_states
        where competition = 'PL' and season = $1 and gw = 3 and model_id = $2`,
      [
        SEASON, BORROWER, GAPPED_GAMEWEEK,
        JSON.stringify({
          active: borrowed,
          free_hit_stash: {
            squad: held!.squad.active,
            team_sheet: null,
            bank: 0
          }
        })
      ]
    );

    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("restores the stashed Squad rather than reporting fifteen Transfers",
    async () => {
      const borrower = await record(BORROWER);
      const gw5 = borrower.gameweeks.find(({ gw }) => gw === 5)!;

      // Nothing moved: the Chip gave the Squad back, and a restoration is not a
      // Transfer. Reading the borrowed fifteen instead would report four out
      // and four in for a move nobody made.
      expect(gw5.transfersOut).toEqual([]);
      expect(gw5.transfersIn).toEqual([]);
      // Read against the last *stored* Gameweek and not the last Settled one,
      // which is what put the stash in the replay's way at all: Gameweek 4 has
      // no row in the series above and its Squad is still what Gameweek 5's is
      // measured from.
      expect(gw5.transfersSinceGw).toBe(GAPPED_GAMEWEEK);
      expect(borrower.gameweeks.map(({ gw }) => gw)).not.toContain(GAPPED_GAMEWEEK);

      // And the borrowed fifteen really did differ from the stashed one, so the
      // two empty lists above are not one Squad agreeing with itself.
      const [borrowedRow] = (await reader.query(
        `select squad from manager_states
          where competition = 'PL' and season = $1 and gw = $2 and model_id = $3`,
        [SEASON, GAPPED_GAMEWEEK, BORROWER]
      )).rows as Array<{ squad: SquadEnvelope }>;
      const fielded = new Set(
        borrowedRow!.squad.active.map(({ fplId }) => fplId)
      );
      expect(
        borrowedRow!.squad.free_hit_stash!.squad
          .map(({ fplId }) => fplId)
          .filter((fplId) => !fielded.has(fplId))
      ).toHaveLength(BORROWED);
    });
});

describe("the FPL Entrant-record endpoint before the Season starts", () => {
  const { writer, reader, entrants } = entrantsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({ database: writer, season: SEASON, stopAt: "pre-season" });
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("returns the entered seats with nothing to show", async () => {
    const body = await entrants();

    // The field the empty state switches on, and the seats behind it: the
    // picker is the page's chrome and renders before there is a record to pick.
    expect(body.throughGw).toBeNull();
    expect(body.fromGw).toBeNull();
    expect(body.missingGws).toEqual([]);
    expect(body.qualification).toBeNull();
    expect(body.promptVersion).toBe(FPL_PROMPT_VERSION);
    expect(body.entrants).toHaveLength(9);

    for (const entrant of body.entrants) {
      // Null and not nought throughout: a Season with nothing scored has no
      // Repairs to report, and nought would read as an Entrant that repaired
      // nothing.
      expect(entrant).toMatchObject({
        totalPoints: null, chipsPlayed: [], chipsRemaining: null,
        repairs: null, rollOvers: null, hitPoints: null, gaps: null,
        gameweeks: []
      });
      // The chrome the picker and the h1 are drawn from, which is all this
      // page names a seat by: the provider belongs to the sub-line under a Team
      // Sheet and Screen 3 has no sub-line.
      expect(entrant.name).not.toBe("");
      expect(entrant.baseModel).not.toBe("");
    }
  });
});

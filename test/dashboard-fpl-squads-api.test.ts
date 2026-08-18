import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { workerDriver } from "./worker-driver.js";
import { seedSeason } from "../src/seed-season.js";
import {
  handleDashboardRequest,
  type FplSquadsBody, type LeaderboardBody, type Query
} from "../src/dashboard/read-api.js";
import {
  applyGameweekAction, type PoolPlayer
} from "../src/fpl/apply-gameweek-action.js";
import {
  loadManagerState, storeManagerState
} from "../src/fpl/manager-state-store.js";
import { scoreFplGameweek } from "../src/fpl/score-fpl-gameweek.js";
import { MAX_REPAIRS } from "../src/repairs.js";

const { Client } = pg;

const SEASON = "2026-27";

/** The FPL endpoints read no clock; the Match track's Fixtures page does. */
const NOW = new Date("2026-11-15T12:00:00Z");

/** The opening fifteen, which every Entrant buys and none of them sells whole. */
const SQUAD = 15;

/**
 * One request against a reader holding the role the Worker holds in production.
 * The record is what each `describe` seeds and then trims to the Gameweek it is
 * about, because the endpoint answers with the latest Settled Gameweek and
 * nothing else — the Hit, the Repair and the Roll Over the seed plays are each
 * the latest Gameweek exactly once.
 */
function squadsEndpoint(): {
  writer: pg.Client;
  reader: pg.Client;
  query: Query;
  get: () => Promise<Response>;
  squads: () => Promise<FplSquadsBody>;
} {
  const writer = new Client({ connectionString: process.env.DATABASE_URL });
  const reader = new Client({ connectionString: process.env.DATABASE_URL });

  const query: Query = async (sql, parameters = []) =>
    (await reader.query(sql, [...parameters])).rows;

  const get = (): Promise<Response> =>
    handleDashboardRequest(
      new Request("https://benchmark.example/api/fpl/squads"), query, SEASON,
      NOW
    );

  const squads = async (): Promise<FplSquadsBody> => {
    const response = await get();
    expect(response.status).toBe(200);
    return await response.json() as FplSquadsBody;
  };

  return { writer, reader, query, get, squads };
}

/**
 * Rewinds the record to when `gameweek` was the last one scored, by deleting
 * what was published after it and never by writing a figure of its own. The Manager
 * States behind it stay where they are: the endpoint reads the Gameweek it is
 * answering with and the one the Entrant last stood on, and both are behind
 * this line.
 */
async function rewindTo(
  writer: pg.Client,
  gameweek: number
): Promise<void> {
  await writer.query(
    "delete from scores where season = $1 and track = 'fpl' and gw > $2",
    [SEASON, gameweek]
  );
}

describe("the FPL squads endpoint", () => {
  const { writer, reader, query, get, squads } = squadsEndpoint();

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

  test("reads the per-player points the section added to the role", async () => {
    // Granted by migration 0021 with its policy, which migration 0020
    // deliberately withheld until an endpoint read it. Without the policy the
    // table selects zero rows and reports no error, which would reach a reader
    // as fifteen players who scored nothing.
    expect((await query("select 1 from fpl_player_points limit 1")).length)
      .toBe(1);
    expect((await query("select error_kind from attempts limit 1")).length)
      .toBe(1);

    // And the columns of `attempts` beyond them are still refused: the row
    // carries a provider's answer verbatim, and the grant is column-level so
    // that an internet-facing role cannot read it.
    await expect(query("select raw_response from attempts limit 1"))
      .rejects.toThrow(/permission denied/);
  });

  test("answers with all nine Entrants at the latest Settled Gameweek",
    async () => {
      const body = await squads();

      expect(body.season).toBe(SEASON);
      expect(body.gw).toBe(5);
      expect(body.entrants).toHaveLength(9);
      expect(body.entrants.every(({ id }) => id.startsWith("fpl/"))).toBe(true);

      // The picker lists them in the ranking's order, so switching Entrant is a
      // re-render and the list agrees with the page a reader arrived from.
      const totals = body.entrants.map(({ totalPoints }) => totalPoints ?? 0);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));

      for (const entrant of body.entrants) {
        expect(entrant.players).toHaveLength(SQUAD);
        expect(entrant.teamSheet?.starters).toHaveLength(11);
        expect(entrant.teamSheet?.bench).toHaveLength(4);
        // The Sheet names players the Entrant owns, which is what makes it a
        // Sheet and not a list of ids.
        const owned = new Set(entrant.players.map(({ fplId }) => fplId));
        expect([
          ...entrant.teamSheet!.starters, ...entrant.teamSheet!.bench,
          entrant.teamSheet!.captain, entrant.teamSheet!.viceCaptain
        ].every((fplId) => owned.has(fplId))).toBe(true);
      }
    });

  test("prices every player at his Selling Price, both directions", async () => {
    const [entrant] = (await squads()).entrants
      .filter(({ id }) => id === "fpl/gpt");
    const player = (fplId: number) =>
      entrant!.players.find((each) => each.fplId === fplId)!;

    // Salah cost £11.0m and is listed at £12.0m: the rise is halved, so he
    // sells for £11.5m. Jackson cost £7.0m and is listed at £6.5m: a fall
    // passes through in full, so he sells for what he is now worth.
    expect(player(8)).toMatchObject({
      name: "Salah", club: "Liverpool", position: "MID",
      priceTenths: 120, sellingPriceTenths: 115
    });
    expect(player(14)).toMatchObject({
      name: "Jackson", club: "Chelsea", position: "FWD",
      priceTenths: 65, sellingPriceTenths: 65
    });

    // The two cancel, which is why the Squad value is the purchase price again
    // rather than the £99.0m the listed prices would read.
    expect(entrant!.squadValueTenths).toBe(985);
    expect(entrant!.squadValueTenths).toBe(
      entrant!.players.reduce((total, each) => total + each.sellingPriceTenths, 0)
    );
  });

  test("carries each player's Gameweek points from the settled record",
    async () => {
      const [entrant] = (await squads()).entrants;
      const stored = new Map((await query(
        "select fpl_id, total_points from fpl_player_points "
        + "where season = $1 and gw = 5",
        [SEASON]
      )).map((row) => [Number(row.fpl_id), Number(row.total_points)]));

      for (const player of entrant!.players) {
        expect(player.points).toBe(stored.get(player.fplId));
      }
      // And the Gameweek scored, so the equality above is not fifteen nulls
      // agreeing with fifteen nulls.
      expect(entrant!.players.some(({ points }) => (points ?? 0) > 0)).toBe(true);
    });

  test("names each player's club by the code the club itself carries",
    async () => {
      // Read from the Lock's own record and never derived from the name: the
      // seed spells the club "Nottingham Forest" and FPL's code for it is
      // `NFO`, which no slice of that name produces.
      const [entrant] = (await squads()).entrants;
      const stored = new Map((await query(
        `select distinct on (fpl_id) fpl_id, team_name, short_name
           from fpl_players where season = $1 and gw <= 5
          order by fpl_id, gw desc`,
        [SEASON]
      )).map((row) => [Number(row.fpl_id), row]));

      for (const player of entrant!.players) {
        const listed = stored.get(player.fplId)!;
        expect(player.club).toBe(listed.team_name);
        expect(player.clubCode).toBe(listed.short_name);
      }
      expect(entrant!.players.every(({ clubCode }) => clubCode?.length === 3))
        .toBe(true);
    });

  test("names who each player's club played, and at which ground", async () => {
    const body = await squads();
    // The Fixtures this Gameweek's Lock owns, which is the set the endpoint
    // reads and the set the Team Sheet was chosen against.
    const played = await query(
      `select home_team, away_team from fixtures
        where season = $1 and coalesce(locked_in_gw, gw) = 5
          and (not deferred or locked_in_gw is not null)`,
      [SEASON]
    );
    expect(played.length).toBeGreaterThan(0);

    // A club's code is read off the players the Lock listed for it, so a club
    // the seed's pool holds nobody from has none — Brentford plays in the round
    // and fields nobody ownable. Null there and never three letters of the
    // name; the plate prints the name instead.
    const codes = new Map((await query(
      `select distinct on (team_name) team_name, short_name
         from fpl_players where season = $1 and gw <= 5
        order by team_name, gw desc`,
      [SEASON]
    )).map((row) => [String(row.team_name), row.short_name]));

    const [entrant] = body.entrants;
    for (const player of entrant!.players) {
      const fixture = played.find(({ home_team: home, away_team: away }) =>
        home === player.club || away === player.club);
      // A guard and not an assumption. The Blank has no test at this seam (see
      // the Double describe below for why the record will not let one be made),
      // so this is the half of that gap that can be covered: every club in the
      // pool is fielded in this round, so a player the record holds no Fixture
      // for is a read that lost one. Without it, an endpoint that answered
      // every player with an empty list would satisfy the loop below by
      // comparing nothing against nothing, and a Season in which nobody played
      // would read as a Season rendered correctly.
      expect(fixture).toBeDefined();
      const home = fixture!.home_team === player.club;
      const opponent = String(home ? fixture!.away_team : fixture!.home_team);
      expect(player.opponents).toEqual([{
        club: opponent,
        clubCode: codes.get(opponent) ?? null,
        home
      }]);
    }
    // And at least one opponent arrived with its own code, so the equality
    // above is not fifteen nulls agreeing with fifteen nulls.
    expect(entrant!.players.some(({ opponents }) =>
      opponents.some(({ clubCode }) => clubCode !== null))).toBe(true);
    // Both sides of a Fixture are on somebody's Team Sheet, and they must not
    // agree about which of them was at home.
    const grounds = new Set(
      entrant!.players.flatMap(({ opponents }) =>
        opponents.map(({ home }) => home))
    );
    expect(grounds).toEqual(new Set([true, false]));
  });

  test("names the provider the seat is pinned to", async () => {
    // A column of `models`, which is the table the seat itself is read from —
    // ADR-0009 pins it, and the design names it under a Team Sheet beside the
    // Base Model.
    const body = await squads();
    const stored = new Map((await query(
      "select id, provider from models where role = 'entrant'"
    )).map((row) => [String(row.id), String(row.provider)]));

    for (const entrant of body.entrants) {
      expect(entrant.provider).toBe(stored.get(entrant.id));
    }
    expect(body.entrants.every(({ provider }) => provider.length > 0))
      .toBe(true);
  });

  test("names the deadline the Gameweek's Sheets answer", async () => {
    // Spec 0014, story 21: a Sheet has to say which of 38 deadlines it is a
    // Sheet for. Read from `gameweeks`, which is the same row the Match track's
    // Fixtures endpoint publishes its deadline from.
    const body = await squads();
    const [stored] = await query(
      "select deadline_at from gameweeks where season = $1 and gw = 5",
      [SEASON]
    );
    expect(body.deadlineAt)
      .toBe(new Date(stored!.deadline_at as string).toISOString());
  });

  test("serves the Repair allowance the Repairs used are read against",
    async () => {
      // The page prints "1 of 3" and holds neither number: the allowance is a
      // fact about the run (ADR-0010), and a page spelling it would be wrong in
      // the half a reader cannot check.
      expect((await squads()).maxRepairs).toBe(MAX_REPAIRS);
    });

  test("carries the stat strip's figures off the Manager State", async () => {
    const body = await squads();
    const stored = new Map((await query(
      `select model_id, bank, free_transfers, chip_active
         from manager_states where season = $1 and gw = 5`,
      [SEASON]
    )).map((row) => [String(row.model_id), row]));

    for (const entrant of body.entrants) {
      const state = stored.get(entrant.id)!;
      expect(entrant.bankTenths).toBe(Number(state.bank));
      expect(entrant.freeTransfers).toBe(Number(state.free_transfers));
      expect(entrant.chipActive).toBe(state.chip_active);
      expect(entrant.gwPoints).toBeGreaterThan(0);
      expect(entrant.totalPoints).toBeGreaterThan(entrant.gwPoints!);
    }
  });

  test("reports a quiet Gameweek as no Transfers and no violation", async () => {
    // Nobody Transfers into Gameweek 5, and the honest answer to "what changed"
    // is nothing — not the fifteen a diff against an empty Squad would read.
    for (const entrant of (await squads()).entrants) {
      expect(entrant.transfersIn).toEqual([]);
      expect(entrant.transfersOut).toEqual([]);
      expect(entrant.hitPoints).toBe(0);
      expect(entrant.repairs).toBe(0);
      expect(entrant.rolledOver).toBe(false);
      expect(entrant.lastViolation).toBeNull();
    }
  });

  test("names the Gameweek the Transfers were read against", async () => {
    const since = new Map((await squads()).entrants
      .map(({ id, transfersSinceGw }) => [id, transfersSinceGw]));

    // The Gameweek before, for the eight that stored one. The ninth Gapped
    // Gameweek 4 and stored nothing in it, so its Squad is compared with
    // Gameweek 3's — a hole said out loud rather than smoothed into a quiet
    // week, which is what a reader would otherwise take it for.
    expect(since.get("fpl/gpt")).toBe(4);
    expect(since.get("fpl/minimax")).toBe(3);
  });

  test("excludes the Match track's rows, as the Match track excludes its",
    async () => {
      const body = await squads();
      const match = await (await handleDashboardRequest(
        new Request("https://benchmark.example/api/pl/leaderboard"), query, SEASON,
        NOW
      )).json() as LeaderboardBody;

      // One seed holds both tracks, and this endpoint filters `track = 'fpl'`
      // in three fresh places — the Gameweek's points, the Season's total and
      // the attempt the last violation is read off. The Match track is scored
      // through 14 over nine `/v1` seats and this answers at 5 over nine `fpl/`
      // ones, so a lost filter cannot come back as the same number.
      expect(body.gw).toBe(5);
      expect(match.throughGw).toBe(14);
      expect(body.entrants.every(({ id }) => id.startsWith("fpl/"))).toBe(true);
      expect(
        match.entrants.map(({ id }) => id).filter((id) => id.startsWith("fpl/"))
      ).toEqual([]);
    });

  test("carries the scored-data cache lifetime", async () => {
    const response = await get();

    // The scored lifetime and deliberately not the Fixtures page's sixty
    // seconds: a Team Sheet appears once at the Lock and then holds still
    // (ADR-0033).
    expect(response.headers.get("cloudflare-cdn-cache-control"))
      .toBe("max-age=300, stale-while-revalidate=3600, stale-if-error=0");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  });

  test("answers the same body through the Worker's driver", async () => {
    // `numeric` and `max(gw)` reach one driver as a string and the other as a
    // number, and this body is full of both.
    const driver = await workerDriver();
    try {
      const response = await handleDashboardRequest(
        new Request("https://benchmark.example/api/fpl/squads"),
        driver.query, SEASON, NOW
      );

      expect(await response.json()).toEqual(await squads());
    } finally {
      await driver.end();
    }
  });
});

/**
 * A Gameweek in which one club plays twice, which the seed's own round does not
 * have: its rotation gives every club exactly one Fixture at every Gameweek but
 * `SHORT_GAMEWEEK`, and that one is the fourteenth — past the fifth, which is
 * the last the FPL Season settles. A Double is ordinary Fantasy Premier League
 * and is a shape the endpoint's `opponents` list has to answer with rather than
 * the single Fixture the design happened to draw.
 *
 * Inserted here rather than into the seed, because reshaping the round would
 * move every Fixture count the rest of the suite reads off it — and what is
 * under test is one endpoint's reading of `fixtures`, not the rotation.
 *
 * The Blank has no test at this seam, and the record is the reason. A Blank
 * inside the FPL window cannot be made after the fact: migration 0025 makes a
 * locked Gameweek immutable, so a Fixture a Lock committed played and cannot be
 * deferred back out; `predictions` rows are immutable, so the Fixture cannot be
 * deleted out from under them either. Both refusals are the record defending
 * itself and neither is worth weakening for a test. Making one honestly means
 * moving `SHORT_GAMEWEEK` into the first five Gameweeks, which relocates the
 * Match track's Gap and the Fixture ids it is written against — the seed's own
 * decision, not this endpoint's. `opponentLabel([])` is tested where it is
 * decided; the endpoint's `?? []` beside it is one default and is not.
 */
describe("the FPL squads endpoint at a Double Gameweek", () => {
  const { writer, reader, query, squads } = squadsEndpoint();

  /** A club with players in the pool, so a Team Sheet can hold one of them. */
  const DOUBLED = "Liverpool";

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });

    // A second Fixture for a club that already has one, taking a `fixture_id`
    // no round of the seed reaches and kicking off after the first.
    await writer.query(
      `insert into fixtures (
         season, fixture_id, gw, home_team, away_team, kickoff_at, updated_at
       ) values ($1, 9001, 5, $2, 'Burnley', '2026-09-14T19:00:00Z', now())`,
      [SEASON, DOUBLED]
    );
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("gives a club with two Fixtures both of them, in kick-off order",
    async () => {
      const body = await squads();
      expect(body.gw).toBe(5);

      const [doubled] = body.entrants
        .flatMap(({ players }) => players)
        .filter(({ club }) => club === DOUBLED);
      expect(doubled).toBeDefined();

      const kickoffs = await query(
        `select home_team, away_team from fixtures
          where season = $1 and gw = 5 and (home_team = $2 or away_team = $2)
          order by kickoff_at, fixture_id`,
        [SEASON, DOUBLED]
      );
      expect(kickoffs).toHaveLength(2);
      expect(doubled!.opponents).toHaveLength(2);
      // The order the Fixtures kick off in, which is the order the endpoint
      // reads them and the order a plate prints them.
      expect(doubled!.opponents.map(({ club }) => club)).toEqual(
        kickoffs.map(({ home_team: home, away_team: away }) =>
          home === DOUBLED ? away : home)
      );
      // Both sides of the second Fixture, so the added row is read as a real
      // Fixture and not as a repeat of the first.
      expect(new Set(doubled!.opponents.map(({ club }) => club)).size).toBe(2);
    });

  test("leaves every other club on its own single Fixture", async () => {
    // One club gained a Fixture; a read that answered that by giving the round
    // to everybody would pass the test above.
    const others = (await squads()).entrants
      .flatMap(({ players }) => players)
      .filter(({ club }) => club !== DOUBLED);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every(({ opponents }) => opponents.length === 1)).toBe(true);
  });
});

describe("the FPL squads endpoint at the Gameweek a Hit was taken", () => {
  const { writer, reader, squads } = squadsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await rewindTo(writer, 2);
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reports what moved, and the Hit the second Transfer cost", async () => {
    const body = await squads();
    expect(body.gw).toBe(2);

    const entrant = body.entrants.find(({ id }) => id === "fpl/claude")!;
    // Two Transfers against the one Free Transfer a Gameweek grants: Watkins
    // and Rogers out, Wissa and Kudus in, and the second move costs four
    // points the scorer has already taken off the Gameweek.
    expect(entrant.transfersOut.map(({ name }) => name).sort())
      .toEqual(["Rogers", "Watkins"]);
    expect(entrant.transfersIn.map(({ name }) => name).sort())
      .toEqual(["Kudus", "Wissa"]);
    expect(entrant.transfersIn.map(({ fplId }) => fplId).sort())
      .toEqual([17, 19]);
    expect(entrant.hitPoints).toBe(4);

    // The Squad it holds is the one the moves left it with, so the Transfers
    // above are a reading of the Squad and not a second story about it.
    const owned = entrant.players.map(({ fplId }) => fplId);
    expect(owned).toContain(17);
    expect(owned).not.toContain(15);
    expect(entrant.players).toHaveLength(SQUAD);
  });

  test("reports the Repairs an action cost and the rule it broke", async () => {
    const body = await squads();

    // One refused response and one Repair spent reaching a legal action. The
    // rule is the one the Season's own message refuses it under, read from the
    // attempt rows because a Manager State is written once and says nothing
    // about what preceded it.
    const repaired = body.entrants.find(({ id }) => id === "fpl/gemini")!;
    expect(repaired.repairs).toBe(1);
    expect(repaired.lastViolation).toBe("formation");
    expect(repaired.rolledOver).toBe(false);

    // And an Entrant that broke nothing says so, rather than carrying the
    // Gameweek's other violations.
    const clean = body.entrants.find(({ id }) => id === "fpl/gpt")!;
    expect(clean.repairs).toBe(0);
    expect(clean.lastViolation).toBeNull();

    // Nothing moved for it either: an opening Squad held is not fifteen
    // Transfers made.
    expect(clean.transfersIn).toEqual([]);
    expect(clean.hitPoints).toBe(0);
  });
});

describe("the FPL squads endpoint at a Gameweek that Rolled Over", () => {
  const { writer, reader, query, squads } = squadsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await rewindTo(writer, 3);
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("says the Gameweek Rolled Over and shows the standing Team Sheet",
    async () => {
      const body = await squads();
      expect(body.gw).toBe(3);

      const rolled = body.entrants.find(({ id }) => id === "fpl/kimi")!;
      // Every one of the four responses refused, which is the whole allowance
      // spent and no legal action reached.
      expect(rolled.rolledOver).toBe(true);
      expect(rolled.repairs).toBe(3);
      expect(rolled.lastViolation).toBe("formation");

      // The Sheet it played is the one that was standing before the Gameweek,
      // carried over rather than blank: a Roll Over changes nothing, and a page
      // handed nothing would have nothing to say the Gameweek was played with.
      const [before] = await query(
        `select team_sheet from manager_states
          where season = $1 and gw = 2 and model_id = 'fpl/kimi'`,
        [SEASON]
      );
      expect(rolled.teamSheet).toEqual(before?.team_sheet);
      expect(rolled.players).toHaveLength(SQUAD);
      expect(rolled.transfersIn).toEqual([]);
      expect(rolled.transfersOut).toEqual([]);
    });

  test("carries the Chip an Entrant played that Gameweek", async () => {
    const boosted = (await squads()).entrants
      .find(({ id }) => id === "fpl/grok")!;

    // The strip's Chip cell reads the Manager State's active Chip, and this is
    // the Gameweek the seed plays one in.
    expect(boosted.chipActive).toBe("bench_boost");
    expect(boosted.rolledOver).toBe(false);
  });
});

/** The Entrant that is silent at Gameweek 4, and so has no row standing there. */
const FREE_HITTER = "fpl/minimax";

/** The pair the Free Hit borrows, and the pair it stands down for the week. */
const BORROWED_IN = [20, 21];
const BORROWED_OUT = [2, 15];

/**
 * A Free Hit at Gameweek 4, played through the real reducer and then scored by
 * the real scorer, because a hand-written state proves only that the endpoint
 * agrees with whoever typed it (spec 0014, 46).
 *
 * Gameweek 4 is the one Gameweek this Entrant stored nothing in, which is what
 * leaves room for a row — `manager_states` refuses an update and a delete
 * alike. Filling it also makes the Gameweek scoreable for the first time: it
 * was removed from every Season path because a seat stored nothing in it
 * (ADR-0011), and with all nine standing there the scorer writes it.
 *
 * The two the Chip borrows are a goalkeeper and a forward for a goalkeeper and
 * a forward, off the bench the Squad never starts, so the Sheet the Entrant was
 * already playing stays legal — a Free Hit does not suspend the rules of the
 * game, and the reducer would refuse an action that broke them.
 */
async function playFreeHitAtGameweekFour(writer: pg.Client): Promise<void> {
  const standing = await loadManagerState(writer, {
    entrantId: FREE_HITTER, season: SEASON, gameweek: 3
  });
  const pool: PoolPlayer[] = (await writer.query(
    `select fpl_id, position, team_name, price_tenths from fpl_players
      where season = $1 and gw = 4`,
    [SEASON]
  )).rows.map((row) => ({
    fplId: Number(row.fpl_id),
    position: row.position,
    club: row.team_name,
    priceTenths: Number(row.price_tenths)
  }));
  const teamSheet = standing!.teamSheet!;
  const outcome = applyGameweekAction(
    standing!,
    {
      transfersIn: BORROWED_IN,
      transfersOut: BORROWED_OUT,
      chip: "free_hit",
      teamSheet: {
        ...teamSheet,
        bench: teamSheet.bench.map((fplId) => {
          const swapped = BORROWED_OUT.indexOf(fplId);
          return swapped === -1 ? fplId : BORROWED_IN[swapped]!;
        })
      }
    },
    pool,
    4
  );
  if ("violation" in outcome) {
    throw new Error(`the Free Hit is illegal: ${outcome.violation.kind}`);
  }

  // The instant the seed's own Gameweek 4 ran at, taken from a seat that stored
  // one, so the row lands where production would have put it.
  const [ran] = (await writer.query(
    `select predicted_at from manager_states
      where season = $1 and gw = 4 limit 1`,
    [SEASON]
  )).rows;
  await storeManagerState(writer, {
    entrantId: FREE_HITTER,
    season: SEASON,
    gameweek: 4,
    state: outcome.state,
    attemptsUsed: 0,
    rationale: "Free Hit.",
    predictedAt: ran.predicted_at
  });

  // Scored by the scorer itself, at the Gameweek that has just become
  // scoreable. Gameweek 5 is rewritten with it — a Gameweek that settles late
  // rewrites every published Gameweek after it — so the cumulative figures are
  // a Season that includes Gameweek 4 rather than the seed's reading of one
  // without it.
  await scoreFplGameweek({ database: writer, season: SEASON, gameweek: 4 });
}

describe("the FPL squads endpoint at a Free Hit Gameweek", () => {
  const { writer, reader, squads } = squadsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await playFreeHitAtGameweekFour(writer);
    // The record as it stood when the Free Hit's own Gameweek was the last one
    // scored, which is the Gameweek this describe is about.
    await rewindTo(writer, 4);
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("reports what the Chip changed as that Gameweek's Transfers",
    async () => {
      const body = await squads();
      expect(body.gw).toBe(4);

      const entrant = body.entrants.find(({ id }) => id === FREE_HITTER)!;
      // A Free Hit changes a Gameweek's Transfers and the reducer carries them
      // out (spec 0003), so the borrowed players are what this Gameweek did —
      // the Chip gives them back afterwards, which is the Gameweek after's
      // answer and not this one's.
      expect(entrant.chipActive).toBe("free_hit");
      const ids = (transfers: Array<{ fplId: number }>): number[] =>
        transfers.map(({ fplId }) => fplId).sort((a, b) => a - b);
      expect(ids(entrant.transfersIn)).toEqual(BORROWED_IN);
      expect(ids(entrant.transfersOut)).toEqual(BORROWED_OUT);
      expect(entrant.players.map(({ fplId }) => fplId))
        .toContain(BORROWED_IN[0]);

      // Read against Gameweek 3 and said so: this Entrant Gapped Gameweek 4's
      // neighbour, and a reader told nothing would take the comparison for the
      // Gameweek before.
      expect(entrant.transfersSinceGw).toBe(3);
    });
});

/**
 * The Gameweek after the Chip, where the borrowed fifteen is given back.
 *
 * Gameweek 5's own row is the seed's and not a successor folded from the Free
 * Hit: `manager_states` refuses an update and a delete, and the seed writes
 * every Gameweek through the fifth, so there is no room to fold one. What the
 * two paths leave in `active` is the same fifteen either way — the seed's
 * Gameweek 5 carries the permanent Squad because nothing was Transferred, and
 * `restoreFromFreeHit` puts the same fifteen back — and `active` and the
 * Gameweek behind it are all this reads. The fields where a real successor
 * would differ, the Chip inventory and the Free Transfers, are read by no
 * assertion here.
 *
 * Folding them for real means the seeded Season playing a Free Hit, which is
 * the seed's own slice and would move every figure four other suites assert.
 */
describe("the FPL squads endpoint after a Free Hit", () => {
  const { writer, reader, squads } = squadsEndpoint();

  beforeAll(async () => {
    await writer.connect();
    await reader.connect();
    await resetSchema(writer);
    await seedSeason({
      database: writer, season: SEASON, stopAt: "the design's"
    });
    await playFreeHitAtGameweekFour(writer);
    await reader.query("set role dashboard_read");

    return async () => {
      await writer.end();
      await reader.end();
    };
  });

  test("gives the borrowed Squad back without calling it a Transfer",
    async () => {
      const body = await squads();
      expect(body.gw).toBe(5);

      const entrant = body.entrants.find(({ id }) => id === FREE_HITTER)!;
      // The Squad it owns never moved: a Free Hit lends a fifteen for one
      // Gameweek and takes it back, and the borrowed players leaving the page
      // are the Chip ending rather than Transfers made.
      expect(entrant.transfersIn).toEqual([]);
      expect(entrant.transfersOut).toEqual([]);
      expect(entrant.hitPoints).toBe(0);
      expect(entrant.transfersSinceGw).toBe(4);

      // And the fifteen it is fielding are the permanent Squad again, which is
      // the row Gameweek 5 stored and not the borrowed one behind it.
      expect(entrant.players.map(({ fplId }) => fplId))
        .not.toContain(BORROWED_IN[0]);
      expect(entrant.players).toHaveLength(SQUAD);
    });
});

describe("the FPL squads endpoint before the Season starts", () => {
  const { writer, reader, squads } = squadsEndpoint();

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
    const body = await squads();

    // The field the empty state switches on, and nine seats behind it: the
    // picker is the page's chrome and renders before there is a Squad to pick.
    expect(body.gw).toBeNull();
    // And no deadline with it: the Season's Gameweeks have deadlines before it
    // opens, and publishing Gameweek 1's here would stamp a Sheet nobody has
    // locked with a Lock nobody has reached.
    expect(body.deadlineAt).toBeNull();
    expect(body.entrants).toHaveLength(9);
    expect(body.entrants.every((entrant) =>
      entrant.players.length === 0 && entrant.teamSheet === null
      && entrant.squadValueTenths === null && entrant.bankTenths === null
      && entrant.gwPoints === null && entrant.rolledOver === null
      && entrant.lastViolation === null && entrant.transfersIn.length === 0
    )).toBe(true);
  });
});

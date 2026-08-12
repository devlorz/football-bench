import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { archivedBody } from "./archived-fixture.js";
import { fetchSquadChanges } from "../src/squad-changes/fetch-squad-changes.js";
import {
  parseSquadChanges,
  SquadChangeSourceValidationError,
  type PinnedClubs,
  type SquadChange
} from "../src/squad-changes/parse-squad-changes.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "../src/squad-changes/club-identity.js";

const { Client } = pg;

const SUMMER_PAGE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=List_of_English_football_transfers_summer_2026&action=raw";

/**
 * The 2026-27 Premier League as the FPL feed spells it, which is the identity
 * `fixtures` stores and the one a Squad Change row is keyed by.
 */
const CLUBS = [
  "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea",
  "Coventry City", "Crystal Palace", "Everton", "Fulham", "Hull City",
  "Ipswich Town", "Leeds", "Liverpool", "Man City", "Man Utd", "Newcastle",
  "Nott'm Forest", "Spurs", "Sunderland"
];

/**
 * The real page, fetched on 2026-08-12 and pinned: the parser is proved
 * against the format Wikipedia publishes rather than the one we remember it
 * publishing. Re-pinning this digest means re-reading the assertions below.
 */
const SUMMER_PAGE_SHA256 =
  "6eba252a5c89f5ff4f6db4b3b6863d44bd07a40643149164104dbd4513b2d803";

async function summerPage(): Promise<string> {
  const body = await archivedBody("wikipedia-transfers-summer-2026.txt.gz");
  expect(createHash("sha256").update(body, "utf8").digest("hex"))
    .toBe(SUMMER_PAGE_SHA256);
  return body;
}

function pinnedClubs(clubs: string[] = CLUBS): PinnedClubs {
  return new Map(clubs.map((club) =>
    [club, resolveWikipediaClub(club) as WikipediaClub]));
}

function movement(changes: SquadChange[], club: string, direction: "in" | "out") {
  return changes
    .filter((change) => change.club === club && change.direction === direction)
    .map(({ player, counterpartClub, fee, loan, datedOn }) =>
      [datedOn, player, counterpartClub, fee, loan] as const);
}

describe("parsing a window's Wikipedia transfer list", () => {
  test("reads a club's Signings with the fees the page states", async () => {
    const changes = parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      await summerPage(),
      pinnedClubs()
    );

    expect(movement(changes, "Spurs", "in")).toEqual([
      ["2026-06-18", "Jan Paul van Hecke", "Brighton & Hove Albion", "£52m", false],
      ["2026-07-01", "Martin Dúbravka", "Burnley", "Free", false],
      ["2026-07-01", "Andy Robertson", "Liverpool", "Free", false],
      ["2026-07-01", "Marcos Senesi", "Bournemouth", "Free", false],
      ["2026-07-02", "Mateus Fernandes", "West Ham United", "£85m", false],
      ["2026-07-06", "Sandro Tonali", "Newcastle United", "£92.5m", false]
    ]);
  });

  test("reads Departures, and labels a loan as one", async () => {
    const changes = parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      await summerPage(),
      pinnedClubs()
    );

    expect(movement(changes, "Spurs", "out")).toEqual([
      ["2026-07-01", "Pele Arganese-McDermott", "Crawley Town", "Free", false],
      ["2026-07-01", "Matthew Craig", "Port Vale", "Free", false],
      ["2026-07-01", "Alejo Véliz", "Bahia", "Undisclosed", false],
      ["2026-07-07", "Alfie Devine", "Preston North End", "Undisclosed", false],
      ["2026-07-14", "Luka Vušković", "Brighton & Hove Albion", "£46m", false],
      ["2026-07-20", "Tynan Thompson", "Manchester United", "£8m", false],
      ["2026-07-22", "Will Lankshear", "Middlesbrough", "£10m", false],
      ["2026-08-10", "Manor Solomon", "West Ham United", "£5m", false],
      ["2026-07-08", "Radu Drăgușin", "Fiorentina", null, true],
      ["2026-07-11", "Yusuf Akhamrich", "Leyton Orient", null, true],
      ["2026-08-07", "Reiss-Alexander Russell-Denny", "Bristol Rovers", null, true]
    ]);
  });

  test("records both sides of a move between two Premier League clubs", async () => {
    const changes = parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      await summerPage(),
      pinnedClubs()
    );

    expect(movement(changes, "Newcastle", "out")).toContainEqual(
      ["2026-07-06", "Sandro Tonali", "Tottenham Hotspur", "£92.5m", false]
    );
  });

  test("reads a club through its article, however the row displays it", async () => {
    // Display text is free-form and an editor may write anything in it. None
    // of these is a rename, and none of them may cost Spurs a move.
    const page = await summerPage();
    for (const displayed of ["Spurs", "THFC", "Tottenham London"]) {
      const changes = parseSquadChanges(
        "wikipedia:squad-changes:summer-2026",
        page.replaceAll(
          "[[Tottenham Hotspur F.C.|Tottenham Hotspur]]",
          `[[Tottenham Hotspur F.C.|${displayed}]]`
        ),
        pinnedClubs()
      );

      expect(movement(changes, "Spurs", "in")).toHaveLength(6);
      expect(movement(changes, "Spurs", "out")).toHaveLength(11);
    }
  });

  test("fails naming a club whose article the page has moved", async () => {
    // The wholesale case: every row links somewhere else, so the club has no
    // move on the page at all.
    const renamed = (await summerPage())
      .replaceAll("[[Tottenham Hotspur F.C.|", "[[Tottenham Hotspur FC (2026)|");

    expect(() => parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      renamed,
      pinnedClubs()
    )).toThrow(
      /no move on the page links Spurs's article Tottenham Hotspur F\.C\./
    );
  });

  test("fails on a single row that displays a club but links away from it", async () => {
    // The thinning the page-wide check cannot see: every other row still
    // links Spurs, so the club plainly has moves, and only this one has
    // quietly stopped being theirs.
    const page = await summerPage();
    const relinked = page.replace(
      "[[Tottenham Hotspur F.C.|Tottenham Hotspur]]",
      "[[Tottenham Hotspur F.C. (disambiguation)|Tottenham Hotspur]]"
    );
    expect(relinked).not.toBe(page);
    expect(relinked).toContain("[[Tottenham Hotspur F.C.|Tottenham Hotspur]]");

    expect(() => parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      relinked,
      pinnedClubs()
    )).toThrow(
      /displays Tottenham Hotspur but links to /
    );
  });

  test("skips a move touching none of the twenty clubs", async () => {
    const changes = parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      await summerPage(),
      pinnedClubs()
    );

    expect(changes.some(({ player }) => player === "Tomas Kalinauskas"))
      .toBe(false);
  });
});

describe("fetching a window's Squad Changes", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let page: string;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    page = await summerPage();

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      "truncate squad_changes, fixtures, gameweeks, raw_snapshots "
      + "restart identity cascade"
    );
  });

  /**
   * Gameweek 1 and 2 sit inside the render gate; Gameweek 6, thirty-nine days
   * after the window closes, sits outside it.
   */
  async function storeSeason(clubs: string[] = CLUBS): Promise<void> {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at) values
         ('2026-27', 1, '2026-08-21T17:30:00Z'),
         ('2026-27', 2, '2026-08-28T17:30:00Z'),
         ('2026-27', 6, '2026-10-10T17:30:00Z')`
    );
    for (const [index, club] of clubs.entries()) {
      await client.query(
        `insert into fixtures (
           season, fpl_id, gw, home_team, away_team, kickoff_at
         ) values ($1, $2, 1, $3, $4, '2026-08-21T19:00:00Z')`,
        ["2026-27", index + 1, club, clubs[(index + 1) % clubs.length]]
      );
    }
  }

  function pageFetcher(body = page) {
    const requested: string[] = [];
    const http = async (url: string) => {
      requested.push(url);
      return { status: 200, body };
    };
    return { http, requested };
  }

  test("stores the upcoming Gameweek's partition and archives the bytes", async () => {
    await storeSeason();
    const { http, requested } = pageFetcher();

    const result = await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-08-12T09:00:00Z")
    });

    expect(requested).toEqual([SUMMER_PAGE_URL]);
    expect(result).toMatchObject({ stored: true, gameweek: 1 });
    const stored = await client.query(
      `select gw, direction, counterpart_club, fee, dated_on::text, observed_at
         from squad_changes
        where club = 'Spurs' and player = 'Sandro Tonali'`
    );
    expect(stored.rows).toEqual([{
      gw: 1,
      direction: "in",
      counterpart_club: "Newcastle United",
      fee: "£92.5m",
      dated_on: "2026-07-06",
      observed_at: new Date("2026-08-12T09:00:00Z")
    }]);
    const archived = await client.query<{ source: string; sha256: string }>(
      "select source, sha256 from raw_snapshots"
    );
    expect(archived.rows).toEqual([{
      source: "wikipedia:squad-changes:summer-2026",
      sha256: SUMMER_PAGE_SHA256
    }]);
  });

  test("re-fetching replaces only its own Gameweek's partition", async () => {
    await storeSeason();
    await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http: pageFetcher().http,
      now: () => new Date("2026-08-12T09:00:00Z")
    });
    const gameweekOne = await client.query(
      "select count(*)::int as rows from squad_changes where gw = 1"
    );

    // A day after Gameweek 1's deadline, with Gameweek 2 upcoming and the
    // page since edited to name somebody else in the same deal.
    const edited = page.replace(
      "{{Sortname|Manor|Solomon}}",
      "{{Sortname|Nobody|Atall}}"
    );
    await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http: pageFetcher(edited).http,
      now: () => new Date("2026-08-22T09:00:00Z")
    });

    const partitions = await client.query(
      `select gw, count(*)::int as rows
         from squad_changes group by gw order by gw`
    );
    expect(partitions.rows).toEqual([
      { gw: 1, rows: gameweekOne.rows[0]?.rows },
      { gw: 2, rows: gameweekOne.rows[0]?.rows }
    ]);
    const solomon = await client.query(
      "select gw from squad_changes where player = 'Manor Solomon' order by gw"
    );
    expect(solomon.rows).toEqual([{ gw: 1 }]);
  });

  test("fails naming an unknown club spelling before anything is stored", async () => {
    await storeSeason([...CLUBS.slice(1), "Wrexham"]);
    const { http, requested } = pageFetcher();

    await expect(fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-08-12T09:00:00Z")
    })).rejects.toThrow(SquadChangeSourceValidationError);
    await expect(fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-08-12T09:00:00Z")
    })).rejects.toThrow(/unknown Premier League club spelling Wrexham/);

    expect(requested).toEqual([]);
    const stored = await client.query(
      "select count(*)::int as rows from squad_changes"
    );
    expect(stored.rows).toEqual([{ rows: 0 }]);
    const archived = await client.query(
      "select count(*)::int as rows from raw_snapshots"
    );
    expect(archived.rows).toEqual([{ rows: 0 }]);
  });

  test("a day outside the render gate fetches nothing and stores nothing", async () => {
    await storeSeason();
    await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http: pageFetcher().http,
      now: () => new Date("2026-08-12T09:00:00Z")
    });
    const before = await client.query(
      "select count(*)::int as rows from squad_changes"
    );
    const { http, requested } = pageFetcher();

    // Gameweek 6's deadline is thirty-nine days after the window closed.
    const result = await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-09-30T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
    const after = await client.query(
      "select count(*)::int as rows from squad_changes"
    );
    expect(after.rows).toEqual(before.rows);
  });

  test("a mid-season day pulls nothing for a winter deadline still to come", async () => {
    await storeSeason();
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 19, '2027-01-02T12:00:00Z')`
    );
    const { http, requested } = pageFetcher();

    // Gameweek 19's deadline is inside the winter gate, but the day is inside
    // no window at all -- the section renders nowhere in September for it.
    const result = await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-09-30T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
  });

  test("skips an upcoming Gameweek the day's own window does not gate", async () => {
    await client.query(
      `insert into gameweeks (season, gw, deadline_at)
       values ('2026-27', 19, '2027-01-02T12:00:00Z')`
    );
    for (const [index, club] of CLUBS.entries()) {
      await client.query(
        `insert into fixtures (
           season, fpl_id, gw, home_team, away_team, kickoff_at
         ) values ($1, $2, 19, $3, $4, '2027-01-03T15:00:00Z')`,
        ["2026-27", index + 1, club, CLUBS[(index + 1) % CLUBS.length]]
      );
    }
    const { http, requested } = pageFetcher();

    // Inside the summer gate, with only a winter Gameweek upcoming: the
    // nearest deadline is not this window's business.
    const result = await fetchSquadChanges({
      database: client,
      season: "2026-27",
      http,
      now: () => new Date("2026-09-20T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
  });
});

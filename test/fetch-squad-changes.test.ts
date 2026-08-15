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
  buildSquadChangesContext,
  type SquadChangeRow
} from "../src/context/build-squad-changes-context.js";
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

function pinnedClubs(
  competition = "PL",
  clubs: string[] = CLUBS
): PinnedClubs {
  return new Map(clubs.map((club) =>
    [club, resolveWikipediaClub(competition, club) as WikipediaClub]));
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
      pinnedClubs(),
      "tables"
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
      pinnedClubs(),
      "tables"
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
      pinnedClubs(),
      "tables"
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
        pinnedClubs(),
        "tables"
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
      pinnedClubs(),
      "tables"
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
      pinnedClubs(),
      "tables"
    )).toThrow(
      /displays Tottenham Hotspur but links to /
    );
  });

  test("skips a move touching none of the twenty clubs", async () => {
    const changes = parseSquadChanges(
      "wikipedia:squad-changes:summer-2026",
      await summerPage(),
      pinnedClubs(),
      "tables"
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
           season, fixture_id, gw, home_team, away_team, kickoff_at
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
      competition: "PL",
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
      competition: "PL",
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
      competition: "PL",
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
      competition: "PL",
      season: "2026-27",
      http,
      now: () => new Date("2026-08-12T09:00:00Z")
    })).rejects.toThrow(SquadChangeSourceValidationError);
    await expect(fetchSquadChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http,
      now: () => new Date("2026-08-12T09:00:00Z")
    })).rejects.toThrow(/unknown PL club spelling Wrexham/);

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
      competition: "PL",
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
      competition: "PL",
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
      competition: "PL",
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
           season, fixture_id, gw, home_team, away_team, kickoff_at
         ) values ($1, $2, 19, $3, $4, '2027-01-03T15:00:00Z')`,
        ["2026-27", index + 1, club, CLUBS[(index + 1) % CLUBS.length]]
      );
    }
    const { http, requested } = pageFetcher();

    // Inside the summer gate, with only a winter Gameweek upcoming: the
    // nearest deadline is not this window's business.
    const result = await fetchSquadChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http,
      now: () => new Date("2026-09-20T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
  });
});

/**
 * La Liga's twenty as football-data.org spells them, which is the identity
 * `fixtures` stores for a Competition that reads its schedule from there
 * (ADR-0036) and so the identity a Spanish Squad Change row is keyed by.
 */
const SPANISH_CLUBS = [
  "Athletic Club", "CA Osasuna", "Club Atlético de Madrid", "Deportivo Alavés",
  "Elche CF", "FC Barcelona", "Getafe CF", "Levante UD", "Málaga CF",
  "RC Celta de Vigo", "RC Deportivo La Coruña", "RCD Espanyol de Barcelona",
  "Rayo Vallecano de Madrid", "Real Betis Balompié", "Real Madrid CF",
  "Real Racing Club de Santander", "Real Sociedad de Fútbol", "Sevilla FC",
  "Valencia CF", "Villarreal CF"
];

const SPANISH_PAGE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=List_of_Spanish_football_transfers_summer_2026&action=raw";

/**
 * The real page, fetched on 2026-08-15 and pinned on the same terms as the
 * English one above. Re-pinning this digest means re-reading the assertions
 * below.
 */
const SPANISH_PAGE_SHA256 =
  "60466f3b743ec854d3c72760aa9684fde41df991c6975f3c821ba07be06ab52a";

async function spanishPage(): Promise<string> {
  const body = await archivedBody(
    "wikipedia-transfers-spain-summer-2026.txt.gz"
  );
  expect(createHash("sha256").update(body, "utf8").digest("hex"))
    .toBe(SPANISH_PAGE_SHA256);
  return body;
}

describe("parsing a window published as one section per club", () => {
  const parse = (wikitext: string, clubs = SPANISH_CLUBS) =>
    parseSquadChanges(
      "wikipedia:squad-changes:spain-summer-2026",
      wikitext,
      pinnedClubs("PD", clubs),
      "clubSections"
    );

  test("reads both directions, with the null date and null fee the page states",
    async () => {
      const changes = parse(await spanishPage());

      // The layout is the direction: the arrivals list comes first under the
      // club's heading and the departures list second, and neither is labelled
      // anywhere a parser can read.
      expect(movement(changes, "FC Barcelona", "in")).toEqual([
        [null, "Karim Adeyemi", "Borussia Dortmund", null, false],
        [null, "Anthony Gordon", "Newcastle United", null, false]
      ]);
      expect(movement(changes, "FC Barcelona", "out")).toEqual([
        [null, "Robert Lewandowski", "Chicago Fire", null, false],
        // "loan return to Manchester United, later TBD" -- the counterpart is
        // the first club the sentence links, and the loan is the word in it.
        [null, "Marcus Rashford", "Manchester United", null, true]
      ]);
    });

  test("records both sides of a move between two La Liga clubs", async () => {
    const changes = parse(await spanishPage());

    expect(movement(changes, "Real Betis Balompié", "in")).toContainEqual(
      [null, "Fran García", "Real Madrid", null, false]
    );
    expect(movement(changes, "Real Madrid CF", "out")).toContainEqual(
      [null, "Fran García", "Betis", null, false]
    );
  });

  // The `other=` cell is prose, and its later clauses are a career summary
  // rather than this move. Reading the whole sentence called thirty of the two
  // real pages' rows loans that are not — twenty-one here and nine on the
  // winter edition — all of them "previously on loan at". **Found by review.**
  test("reads the loan marker from the move, not from the career behind it",
    async () => {
      const changes = parse(await spanishPage());

      // "from Fiorentina, previously on loan at Las Palmas" — a permanent
      // signing whose sentence says loan. Five of the twenty clubs' rows read
      // this way; the page even misspells it "previouly" once, which the
      // clause rule does not care about.
      expect(movement(changes, "RC Deportivo La Coruña", "in")).toContainEqual(
        [null, "Lorenzo Amatucci", "Fiorentina", null, false]
      );
      expect(movement(changes, "Getafe CF", "in")).toContainEqual(
        [null, "Ramón Terrats", "Villarreal", null, false]
      );
      // "on loan from Paris Saint-Germain, previously on loan at Braga" — a
      // loan whose sentence says loan twice, and the first clause is enough.
      expect(movement(changes, "RCD Espanyol de Barcelona", "in"))
        .toContainEqual(
          [null, "Gabriel Moscardo", "Paris Saint-Germain", null, true]
        );
      // "loan return to [[Fortaleza EC|Fortaleza]], later loaned to
      // [[SC Internacional|Internacional]]" — a loan ending, counted against
      // the club it returns to and not the club it goes on to.
      expect(movement(changes, "Deportivo Alavés", "out")).toContainEqual(
        [null, "Calebe", "Fortaleza", null, true]
      );
    });

  test("keeps a counterpart the page links to nothing as the page says it",
    async () => {
      const changes = parse(await spanishPage());

      // `other=to TBD` and `other=retired` are the whole sentence, and the two
      // are the only unlinked counterparts on the page. Stored as displayed,
      // on the same terms as every other counterpart: the alternative is this
      // pipeline inventing a club for a move that has not found one.
      expect(new Set(changes.map(({ counterpartClub }) => counterpartClub)))
        .toContain("TBD");
      expect(changes.filter(({ counterpartClub }) => counterpartClub === "TBD"))
        .not.toHaveLength(0);
    });

  test("reads a club from a heading the page does not link", async () => {
    // Every winter edition of this page heads its sections with bare text --
    // `===Real Madrid===` -- where the 2026 summer edition links them. The
    // displayed name is the only identity a bare heading offers.
    const changes = parse(
      (await spanishPage()).replace("=== [[Real Madrid]] ===", "===Real Madrid===")
    );

    expect(movement(changes, "Real Madrid CF", "out")).toContainEqual(
      [null, "Fran García", "Betis", null, false]
    );
  });

  test("fails naming a club the page carries no section for", async () => {
    // The article moved: the heading still displays Real Madrid, and a linked
    // heading is read by its article alone, exactly as a row is on the English
    // page.
    const moved = (await spanishPage()).replace(
      "=== [[Real Madrid]] ===",
      "=== [[Real Madrid CF (2026)|Real Madrid]] ==="
    );

    expect(() => parse(moved))
      .toThrow(/the page carries no section for Real Madrid CF/);
  });

  test("fails on a club section that is not two squad lists", async () => {
    const halved = (await spanishPage()).replace(
      "=== [[Real Madrid]] ===",
      "=== [[Real Madrid]] ===\n{{fs start}}\n{{Fs end}}\n"
    );

    expect(() => parse(halved))
      .toThrow(/Real Madrid CF's section holds 3 squad lists, expected 2/);
  });

  test("skips the Segunda sections the page lists beside La Liga's", async () => {
    const changes = parse(await spanishPage());

    // The page carries forty-two club sections and only twenty are ours; a
    // Segunda club is a counterpart, never a `club`.
    expect(new Set(changes.map(({ club }) => club)))
      .toEqual(new Set(SPANISH_CLUBS));
  });
});

describe("fetching a second Competition's Squad Changes", () => {
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
      "truncate squad_changes, fixtures, gameweeks, raw_snapshots "
      + "restart identity cascade"
    );
    // Both Competitions carry a Gameweek 1, which is the whole hazard: the
    // number is shared and the partition is not.
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at) values
         ('PL', '2026-27', 1, '2026-08-21T17:30:00Z'),
         ('PD', '2026-27', 1, '2026-08-15T16:00:00Z')`
    );
    for (const [index, club] of SPANISH_CLUBS.entries()) {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, home_team, away_team, kickoff_at
         ) values ('PD', $1, $2, 1, $3, $4, '2026-08-15T17:30:00Z')`,
        [
          "2026-27",
          index + 1,
          club,
          SPANISH_CLUBS[(index + 1) % SPANISH_CLUBS.length]
        ]
      );
    }
  });

  const spanishFetcher = async () => {
    const body = await spanishPage();
    const requested: string[] = [];
    return {
      requested,
      http: async (url: string) => {
        requested.push(url);
        return { status: 200, body };
      }
    };
  };

  test("stores La Liga's window under its own Competition", async () => {
    const { http, requested } = await spanishFetcher();

    const result = await fetchSquadChanges({
      database: client,
      competition: "PD",
      season: "2026-27",
      http,
      now: () => new Date("2026-08-15T09:00:00Z")
    });

    expect(requested).toEqual([SPANISH_PAGE_URL]);
    expect(result).toMatchObject({ stored: true, gameweek: 1 });
    const stored = await client.query(
      `select competition, gw, direction, counterpart_club, fee, dated_on, loan
         from squad_changes
        where club = 'FC Barcelona' and player = 'Marcus Rashford'`
    );
    expect(stored.rows).toEqual([{
      competition: "PD",
      gw: 1,
      direction: "out",
      counterpart_club: "Manchester United",
      fee: null,
      dated_on: null,
      loan: true
    }]);
    const archived = await client.query<{ source: string }>(
      "select source from raw_snapshots"
    );
    expect(archived.rows).toEqual([{
      source: "wikipedia:squad-changes:spain-summer-2026"
    }]);
  });

  test("leaves the Premier League's Gameweek 1 partition untouched", async () => {
    // The write path's own delete-then-insert is keyed by Gameweek, and both
    // leagues number theirs from 1. Unscoped, this fetch empties the Premier
    // League's window on its way past and the section it feeds goes on reading
    // as an absence rather than as a loss.
    await client.query(
      `insert into squad_changes (
         competition, season, gw, club, direction, player, counterpart_club,
         fee, loan, dated_on, observed_at
       ) values (
         'PL', '2026-27', 1, 'Spurs', 'in', 'Sandro Tonali',
         'Newcastle United', '£92.5m', false, '2026-07-06',
         '2026-08-15T09:00:00Z'
       )`
    );

    await fetchSquadChanges({
      database: client,
      competition: "PD",
      season: "2026-27",
      http: (await spanishFetcher()).http,
      now: () => new Date("2026-08-15T09:00:00Z")
    });

    const partitions = await client.query(
      `select competition, count(*)::int as rows
         from squad_changes group by competition order by competition`
    );
    expect(partitions.rows).toEqual([
      { competition: "PD", rows: 137 },
      { competition: "PL", rows: 1 }
    ]);
  });

  // The one path the seams above only meet at: the recorded page, through the
  // fetch, into the database, and back out through the query
  // `loadMatchContextData` runs into the section an Entrant reads. It is what
  // proves the null date survives the round trip rather than throwing in the
  // comparator, which is where it would have, inside the Lock window.
  test("renders a stored La Liga window as the section a packet carries",
    async () => {
      await fetchSquadChanges({
        database: client,
        competition: "PD",
        season: "2026-27",
        http: (await spanishFetcher()).http,
        now: () => new Date("2026-08-15T09:00:00Z")
      });

      const stored = await client.query<SquadChangeRow>(
        `select club, direction, player, counterpart_club, fee, loan, dated_on
           from squad_changes
          where competition = 'PD' and season = '2026-27' and gw = 1`
      );
      const section = buildSquadChangesContext({
        competition: "PD",
        deadline: new Date("2026-08-15T16:00:00Z"),
        homeTeam: "FC Barcelona",
        awayTeam: "Deportivo Alavés",
        changes: stored.rows
      });

      expect(section).toBe([
        "Squad changes since 2 Feb 2026:",
        "",
        "FC Barcelona",
        "In: Anthony Gordon (from Newcastle United, fee not stated), "
        + "Karim Adeyemi (from Borussia Dortmund, fee not stated)",
        // Every Spanish row ties on fee and on date, both being null the whole
        // way down, so the whole section orders by player and the loan sits
        // wherever its name puts it rather than last.
        "Out: Marcus Rashford (to Manchester United) (loan), "
        + "Robert Lewandowski (to Chicago Fire, fee not stated)",
        "",
        "Deportivo Alavés",
        "In: Miguel Rodríguez (from Utrecht, fee not stated), "
        + "Mikel Rodríguez (from Real Sociedad B, fee not stated)",
        "Out: Calebe (to Fortaleza) (loan), "
        + "Jon Guridi (to Sevilla, fee not stated), "
        + "Raúl Fernández (to Leganés, fee not stated), "
        + "Víctor Parada (to Spartak Moscow, fee not stated)"
      ].join("\n"));
    });

  test("refuses a Competition whose club spellings it does not hold", async () => {
    await client.query(
      "update fixtures set home_team = 'Girona FC' where fixture_id = 1"
    );
    const { http, requested } = await spanishFetcher();

    await expect(fetchSquadChanges({
      database: client,
      competition: "PD",
      season: "2026-27",
      http,
      now: () => new Date("2026-08-15T09:00:00Z")
    })).rejects.toThrow(/unknown PD club spelling Girona FC/);

    expect(requested).toEqual([]);
  });
});

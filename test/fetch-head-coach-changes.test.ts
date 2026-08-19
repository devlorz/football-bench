import { createHash } from "node:crypto";
import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { archivedBody } from "./archived-fixture.js";
import {
  fetchHeadCoachChanges
} from "../src/head-coach/fetch-head-coach-changes.js";
import {
  parseHeadCoachChanges,
  HeadCoachSourceValidationError,
  type HeadCoachChange,
  type PinnedClubs
} from "../src/head-coach/parse-head-coach-changes.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "../src/squad-changes/club-identity.js";

const { Client } = pg;

const ENGLISH_ARTICLE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=2026%E2%80%9327_Premier_League&action=raw";

const SPANISH_ARTICLE_URL =
  "https://en.wikipedia.org/w/index.php"
  + "?title=2026%E2%80%9327_La_Liga&action=raw";

const CLUBS = [
  "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea",
  "Coventry City", "Crystal Palace", "Everton", "Fulham", "Hull City",
  "Ipswich Town", "Leeds", "Liverpool", "Man City", "Man Utd", "Newcastle",
  "Nott'm Forest", "Spurs", "Sunderland"
];

const SPANISH_CLUBS = [
  "Athletic Club", "CA Osasuna", "Club Atlético de Madrid", "Deportivo Alavés",
  "Elche CF", "FC Barcelona", "Getafe CF", "Levante UD", "Málaga CF",
  "RC Celta de Vigo", "RC Deportivo La Coruña", "RCD Espanyol de Barcelona",
  "Rayo Vallecano de Madrid", "Real Betis Balompié", "Real Madrid CF",
  "Real Racing Club de Santander", "Real Sociedad de Fútbol", "Sevilla FC",
  "Valencia CF", "Villarreal CF"
];

/**
 * Both season articles as they read on 2026-08-19, pinned: this is the read
 * ADR-0044's race turned on -- a source that fails its first read loses on the
 * spot -- and the parser is proved against the format Wikipedia publishes
 * rather than the one we remember it publishing. Re-pinning either digest
 * means re-reading the assertions below.
 */
const ENGLISH_ARTICLE_SHA256 =
  "169b2e9f131b4935850851ad61d5b0d26e92e697ffcc692cb1c24629bac2790f";

const SPANISH_ARTICLE_SHA256 =
  "7f95a762856cf8ae8359dbe0c920441575a174c460965f37ca5df6b762f78b13";

async function pinnedPage(name: string, sha256: string): Promise<string> {
  const body = await archivedBody(name);
  expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(sha256);
  return body;
}

const englishArticle = () => pinnedPage(
  "wikipedia-2026-27-premier-league.txt.gz", ENGLISH_ARTICLE_SHA256
);

const spanishArticle = () => pinnedPage(
  "wikipedia-2026-27-la-liga.txt.gz", SPANISH_ARTICLE_SHA256
);

function pinnedClubs(
  competition = "PL",
  clubs: string[] = CLUBS
): PinnedClubs {
  return new Map(clubs.map((club) =>
    [club, resolveWikipediaClub(competition, club) as WikipediaClub]));
}

function changesFor(changes: HeadCoachChange[], club: string) {
  return changes
    .filter((change) => change.club === club)
    .map(({ direction, headCoach, manner, datedOn }) =>
      [direction, headCoach, manner, datedOn] as const);
}

describe("parsing a season article's Head Coach changes", () => {
  test("reads a club's Departure and the Arrival that answered it", async () => {
    const changes = parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      await englishArticle(),
      pinnedClubs()
    );

    expect(changesFor(changes, "Liverpool")).toEqual([
      ["out", "Arne Slot", "Sacked", "2026-05-30"],
      ["in", "Andoni Iraola", null, "2026-06-04"]
    ]);
  });

  /**
   * The table files consecutive rows under one date cell carrying a
   * `rowspan`, and spans three different columns at once: Bournemouth,
   * Chelsea and Manchester City share a date of vacancy, and all nine rows
   * share a position. A row under those spans arrives three cells short, and
   * reading its columns positionally would put a manner where a date belongs.
   */
  test("carries a spanned cell down the rows it covers", async () => {
    const changes = parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      await englishArticle(),
      pinnedClubs()
    );

    expect(changesFor(changes, "Chelsea")).toEqual([
      ["out", "Calum McFarlane", "End of interim spell", "2026-05-24"],
      ["in", "Xabi Alonso", null, "2026-07-01"]
    ]);
    expect(changesFor(changes, "Man City")).toEqual([
      ["out", "Pep Guardiola", "Resigned", "2026-05-24"],
      ["in", "Enzo Maresca", null, "2026-06-29"]
    ]);
  });

  test("keeps the flags and the sort keys out of a Head Coach's name",
    async () => {
      const changes = parseHeadCoachChanges(
        "wikipedia:head-coach-changes:2026-27-premier-league",
        await englishArticle(),
        pinnedClubs()
      );

      // Three decorations in two cells: a `data-sort-value` attribute, a
      // `{{#invoke:flag|icon}}` module call, and a link whose display text is
      // shorter than its article.
      expect(changesFor(changes, "Bournemouth")).toEqual([
        ["out", "Andoni Iraola", "End of contract", "2026-05-24"],
        ["in", "Marco Rose", null, "2026-06-01"]
      ]);
      expect(changesFor(changes, "Nott'm Forest")).toEqual([
        ["out", "Vítor Pereira", "Sacked", "2026-07-02"],
        ["in", "Oliver Glasner", null, "2026-07-06"]
      ]);
    });

  test("reads the Spanish article, which spans and links differently",
    async () => {
      const changes = parseHeadCoachChanges(
        "wikipedia:head-coach-changes:2026-27-la-liga",
        await spanishArticle(),
        pinnedClubs("PD", SPANISH_CLUBS)
      );

      // Villarreal's row states neither a manner nor a date of its own: both
      // are Athletic's, spanned with the unquoted `rowspan=2` this article
      // prefers.
      expect(changesFor(changes, "Villarreal CF")).toEqual([
        ["out", "Marcelino", "End of contract", "2026-05-24"],
        ["in", "Iñigo Pérez", null, "2026-06-01"]
      ]);
      // Linked as `[[Real Madrid CF|Real Madrid]]` here and as
      // `[[Real Madrid]]` on the transfer list the identity map was built
      // from. Both are the club, and the displayed name is what says so.
      expect(changesFor(changes, "Real Madrid CF")).toEqual([
        ["out", "Álvaro Arbeloa", "Mutual consent", "2026-06-09"],
        ["in", "José Mourinho", null, "2026-06-13"]
      ]);
      // The clubs that kept their Head Coach are absent, not empty.
      expect(changesFor(changes, "FC Barcelona")).toEqual([]);
    });

  test("leaves a vacancy nobody has filled as a Departure alone", async () => {
    // Newcastle's Arrival cell and its date emptied, which is how the table
    // states a seat still open.
    const stillLooking = (await englishArticle()).replace(
      /\|\{\{flagicon\|GER\}\} \[\[Matthias Jaissle\]\]<ref>[\s\S]*?<\/ref>\n\|5 August 2026/,
      "|\n|"
    );

    const changes = parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      stillLooking,
      pinnedClubs()
    );

    expect(changesFor(changes, "Newcastle")).toEqual([
      ["out", "Eddie Howe", "Resigned", "2026-07-30"]
    ]);
  });

  test("refuses a table whose columns moved, naming the source", async () => {
    const reordered = (await englishArticle()).replace(
      "!Manner of departure\n!Date of vacancy",
      "!Date of vacancy\n!Manner of departure"
    );

    expect(() => parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      reordered,
      pinnedClubs()
    )).toThrow(HeadCoachSourceValidationError);
  });

  test("refuses a row that no longer fills its columns", async () => {
    // One cell taken out of a row nothing spans into: the row is short, and
    // there is no honest way to say which column it lost.
    const short = (await englishArticle()).replace(
      /(\[\[Marco Silva\]\]<ref>[\s\S]*?<\/ref>\n)\|End of contract\n/,
      "$1"
    );

    expect(() => parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      short,
      pinnedClubs()
    )).toThrow(/reads as 7 of 7 columns from 3 cells|columns/);
  });

  test("refuses a club the Competition's roster does not carry", async () => {
    // The Team cell of the table's own Fulham row, which the article names in
    // half a dozen other places this must not touch.
    const promoted = (await englishArticle()).replace(
      "|[[Fulham F.C.|Fulham]]\n|{{flagicon|POR}} [[Marco Silva]]",
      "|[[Wrexham A.F.C.|Wrexham]]\n|{{flagicon|POR}} [[Marco Silva]]"
    );

    expect(() => parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      promoted,
      pinnedClubs()
    )).toThrow(/unknown club spelling Wrexham/);
  });

  test("refuses an article with no such table at all", async () => {
    expect(() => parseHeadCoachChanges(
      "wikipedia:head-coach-changes:2026-27-premier-league",
      "==League table==\nnothing here",
      pinnedClubs()
    )).toThrow(/expected a wikitable under this heading/);
  });
});

describe("fetching a Season's Head Coach changes", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let page: string;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    page = await englishArticle();

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      "truncate head_coach_changes, fixtures, gameweeks, raw_snapshots "
      + "restart identity cascade"
    );
  });

  async function storeSeason(
    competition = "PL",
    clubs: string[] = CLUBS
  ): Promise<void> {
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at) values
         ($1, '2026-27', 1, '2026-08-21T17:30:00Z'),
         ($1, '2026-27', 2, '2026-08-28T17:30:00Z')`,
      [competition]
    );
    for (const [index, club] of clubs.entries()) {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, home_team, away_team,
           kickoff_at
         ) values ($1, '2026-27', $2, 1, $3, $4, '2026-08-21T19:00:00Z')`,
        [competition, index + 1, club, clubs[(index + 1) % clubs.length]]
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

  test("stores the upcoming Gameweek's partition and archives the bytes",
    async () => {
      await storeSeason();
      const { http, requested } = pageFetcher();

      const result = await fetchHeadCoachChanges({
        database: client,
        competition: "PL",
        season: "2026-27",
        http,
        now: () => new Date("2026-08-19T09:00:00Z")
      });

      expect(requested).toEqual([ENGLISH_ARTICLE_URL]);
      expect(result).toEqual({ stored: true, gameweek: 1, changes: 18 });
      const stored = await client.query(
        `select gw, direction, head_coach, manner, dated_on::text, observed_at
           from head_coach_changes
          where club = 'Liverpool'
          order by dated_on`
      );
      expect(stored.rows).toEqual([
        {
          gw: 1,
          direction: "out",
          head_coach: "Arne Slot",
          manner: "Sacked",
          dated_on: "2026-05-30",
          observed_at: new Date("2026-08-19T09:00:00Z")
        },
        {
          gw: 1,
          direction: "in",
          head_coach: "Andoni Iraola",
          manner: null,
          dated_on: "2026-06-04",
          observed_at: new Date("2026-08-19T09:00:00Z")
        }
      ]);
      const archived = await client.query<{ source: string; sha256: string }>(
        "select source, sha256 from raw_snapshots"
      );
      expect(archived.rows).toEqual([{
        source: "wikipedia:head-coach-changes:2026-27-premier-league",
        sha256: ENGLISH_ARTICLE_SHA256
      }]);
    });

  test("re-fetching replaces only its own Gameweek's partition", async () => {
    await storeSeason();
    await fetchHeadCoachChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: pageFetcher().http,
      now: () => new Date("2026-08-19T09:00:00Z")
    });

    // A day after Gameweek 1's deadline, with Gameweek 2 upcoming and the
    // article since edited to name somebody else in the same seat.
    const edited = page.replace(
      "[[Matthias Jaissle]]<ref>", "[[Nobody Atall]]<ref>"
    );
    const result = await fetchHeadCoachChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: pageFetcher(edited).http,
      now: () => new Date("2026-08-22T09:00:00Z")
    });

    expect(result).toMatchObject({ stored: true, gameweek: 2 });
    const byGameweek = await client.query(
      `select gw, head_coach
         from head_coach_changes
        where club = 'Newcastle' and direction = 'in'
        order by gw`
    );
    expect(byGameweek.rows).toEqual([
      { gw: 1, head_coach: "Matthias Jaissle" },
      { gw: 2, head_coach: "Nobody Atall" }
    ]);
  });

  test("archives an unusable response before refusing it", async () => {
    await storeSeason();
    const http = async () => ({ status: 404, body: "not found" });

    await expect(fetchHeadCoachChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http,
      now: () => new Date("2026-08-19T09:00:00Z")
    })).rejects.toThrow(/HTTP 404/);

    const archived = await client.query<{ source: string }>(
      "select source from raw_snapshots"
    );
    expect(archived.rows).toEqual([{
      source: "wikipedia:head-coach-changes:2026-27-premier-league"
    }]);
    const stored = await client.query(
      "select count(*)::int as rows from head_coach_changes"
    );
    expect(stored.rows).toEqual([{ rows: 0 }]);
  });

  test("stores a second Competition's changes under its own article",
    async () => {
      await storeSeason("PD", SPANISH_CLUBS);
      const { http, requested } = pageFetcher(await spanishArticle());

      const result = await fetchHeadCoachChanges({
        database: client,
        competition: "PD",
        season: "2026-27",
        http,
        now: () => new Date("2026-08-19T09:00:00Z")
      });

      expect(requested).toEqual([SPANISH_ARTICLE_URL]);
      expect(result).toEqual({ stored: true, gameweek: 1, changes: 12 });
      const stored = await client.query(
        `select competition, head_coach
           from head_coach_changes
          where club = 'Real Madrid CF' and direction = 'in'`
      );
      expect(stored.rows).toEqual([
        { competition: "PD", head_coach: "José Mourinho" }
      ]);
    });

  test("a Season with no article listed reaches no source at all", async () => {
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PL', '2030-31', 1, '2030-08-21T17:30:00Z')`
    );
    const { http, requested } = pageFetcher();

    const result = await fetchHeadCoachChanges({
      database: client,
      competition: "PL",
      season: "2030-31",
      http,
      now: () => new Date("2030-08-19T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
  });

  test("a Season past its last deadline stores nothing", async () => {
    await storeSeason();
    const { http, requested } = pageFetcher();

    const result = await fetchHeadCoachChanges({
      database: client,
      competition: "PL",
      season: "2026-27",
      http,
      now: () => new Date("2027-06-01T09:00:00Z")
    });

    expect(result).toEqual({ stored: false });
    expect(requested).toEqual([]);
  });

});

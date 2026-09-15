import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  fetchInternationalResults,
  InternationalResultsHttpError,
  InternationalResultsValidationError,
  parseInternationalResults,
  RESULTS_SNAPSHOT,
  RESULTS_URL,
  storedSideName,
  STORED_FROM,
  UnknownInternationalCompetitionError,
  UnmappedInternationalSideError,
  type ParsedInternationalResults
} from "../src/international-results/fetch-results.js";
import { fetchUefaCompetition } from "../src/uefa/fetch-competition.js";
import type { HttpFetcher } from "../src/http.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const COMPETITION = "UNL";
const SEASON = "2026-27";

/**
 * The dataset as it really was, recorded on 2026-09-14 (ADR-0057): every men's
 * international since 1872, last committed 2026-08-26.
 */
const RECORDED = "martj42-international-results-2026-08-26-recorded.csv.gz";

/** The Season UEFA's recorded pages hold, and where the fifty-four come from. */
const UEFA_PAGES = [
  "uefa-2026-27-UNL-recorded-offset-0.json.gz",
  "uefa-2026-27-UNL-recorded-offset-100.json.gz"
] as const;

describe("the shape the international results dataset is read into", () => {
  let file: ParsedInternationalResults;
  let body: string;

  beforeAll(async () => {
    body = await archivedBody(RECORDED);
    file = parseInternationalResults("test", body);
  });

  test("keeps the window and reads the file's own last row for its date", () => {
    // Two different questions over one file. What is stored is the window --
    // 2,360 of the 49,547 rows -- and what the packet prints is the date of
    // the file's last line, which is a match between two sides no Competition
    // here holds. Reading the second off the first would report a monthly
    // source as five weeks staler than it is.
    expect(file.results.length).toBe(2360);
    expect(file.latestRowOn).toBe("2026-08-26");
    expect(file.results.every(({ playedOn }) => playedOn >= STORED_FROM))
      .toBe(true);
    expect(file.results.every(({ playedOn }) => playedOn <= file.latestRowOn))
      .toBe(true);
  });

  test("reads the 2026 World Cup, which is what a side did last", () => {
    // Story 29 of spec 0027 names this file's whole reason: a national side's
    // last five matches are mostly not Nations League ones, and in this
    // recording the latest match any of the fifty-four played is the World Cup
    // final.
    expect(file.results.at(-1)).toEqual({
      playedOn: "2026-08-26",
      homeTeam: "Vietnam",
      awayTeam: "Thailand",
      homeGoals: 2,
      awayGoals: 2,
      tournament: "ASEAN Championship",
      country: "Vietnam",
      neutral: false
    });
    expect(file.results.find(({ playedOn, homeTeam }) =>
      playedOn === "2026-07-19" && homeTeam === "Spain")).toEqual({
      playedOn: "2026-07-19",
      homeTeam: "Spain",
      awayTeam: "Argentina",
      homeGoals: 1,
      awayGoals: 0,
      tournament: "FIFA World Cup",
      country: "United States",
      neutral: true
    });
  });

  test("a comma inside a field does not shift the columns", () => {
    // Six rows in the window carry one, and every one of them is in the
    // column a `split(",")` would break first: a tournament called "Morocco,
    // Capital of African Football" would file the match in Morocco under a
    // tournament called "Morocco" and read the city as the country. None of
    // the six names one of the fifty-four today, which is exactly the reason
    // to hold it here rather than trust that it stays that way.
    const quoted = file.results
      .filter(({ tournament }) => tournament.includes(","));

    expect(quoted).toHaveLength(6);
    expect(quoted[0]).toEqual({
      playedOn: "2026-03-27",
      homeTeam: "Guinea",
      awayTeam: "Togo",
      homeGoals: 2,
      awayGoals: 2,
      tournament: "Morocco, Capital of African Football",
      country: "Morocco",
      neutral: true
    });
  });

  test("a row that stopped being a row refuses rather than being dropped", () => {
    // A score that is not a number is the source changing shape, and skipping
    // the row would be a side quietly losing a match off its form while the
    // packet read as if it had played four.
    const broken = body.replace(
      "2026-07-19,Spain,Argentina,1,0,", "2026-07-19,Spain,Argentina,-,0,"
    );

    expect(() => parseInternationalResults("test", broken))
      .toThrow(InternationalResultsValidationError);
    expect(() => parseInternationalResults("test", broken))
      .toThrow(/home_score/);
  });

  test("a file missing a column refuses by naming the column", () => {
    const renamed = body.replace("date,home_team", "played_on,home_team");

    expect(() => parseInternationalResults("test", renamed))
      .toThrow(/header\.date/);
  });
});

describe("the two spellings the dataset does not share", () => {
  test("maps exactly the two, and leaves every other name alone", () => {
    expect(storedSideName("Czech Republic")).toBe("Czechia");
    expect(storedSideName("Turkey")).toBe("Türkiye");
    expect(storedSideName("Portugal")).toBe("Portugal");
  });

  test("every one of the fifty-four is reachable, with nothing left over",
    async () => {
      // The derivation a reviewer checks instead of a transcription, and the
      // one direction that can be checked at all: a row naming "Turkey" under
      // no map cannot be told from a row about a side outside the fifty-four,
      // so the question is asked the other way round -- every side the record
      // stores has played since `STORED_FROM`, so every one of them must be
      // reachable in the file.
      const stored = new Set((await Promise.all(UEFA_PAGES.map(archivedBody)))
        .flatMap((page) => JSON.parse(page) as {
          homeTeam: { internationalName: string };
          awayTeam: { internationalName: string };
        }[])
        .flatMap((match) => [
          match.homeTeam.internationalName,
          match.awayTeam.internationalName
        ])
        // UEFA's own stray combining mark, removed by the fetch that stores
        // the name (ticket 0071); this set is what that fetch writes.
        .map((name) => name.replace(/i̇/g, "i")));
      expect(stored.size).toBe(54);

      const { results } = parseInternationalResults(
        "test", await archivedBody(RECORDED)
      );
      const reached = new Set(results
        .flatMap(({ homeTeam, awayTeam }) => [homeTeam, awayTeam]));

      expect([...stored].filter((name) => !reached.has(name))).toEqual([]);
      // The map earns its two entries: each key is a name the record does not
      // hold, each value is one it does, and each key is really in the file.
      for (const spelling of ["Czech Republic", "Turkey"]) {
        expect(stored.has(spelling)).toBe(false);
        expect(stored.has(storedSideName(spelling))).toBe(true);
        expect(reached.has(spelling)).toBe(false);
      }
    });
});

describe("the Nations League's recent internationals read from the dataset",
  () => {
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
        "truncate fixtures, gameweeks, raw_snapshots, international_results, "
        + "international_results_source restart identity cascade"
      );
    });

    function respondingWith(
      body: string,
      status = 200
    ): { http: HttpFetcher; requests: string[] } {
      const requests: string[] = [];
      const http: HttpFetcher = async (url) => {
        requests.push(url);
        return { status, body };
      };
      return { http, requests };
    }

    /** This Season's 156 Fixtures, from the feed that really published them. */
    async function storeTheSchedule(): Promise<void> {
      const pages = await Promise.all(UEFA_PAGES.map(archivedBody));
      await fetchUefaCompetition({
        database: client,
        competition: COMPETITION,
        season: SEASON,
        http: async (url) => ({
          status: 200,
          body: (url.includes("offset=0") ? pages[0] : pages[1])!
        }),
        now: () => new Date("2026-09-14T09:00:00Z")
      });
    }

    /** The instant every read below is recorded as having happened at. */
    const READ_AT = "2026-09-25T06:00:00.000Z";

    const read = async (body: string, status = 200): Promise<string[]> => {
      const { http, requests } = respondingWith(body, status);
      await fetchInternationalResults({
        database: client,
        competition: COMPETITION,
        season: SEASON,
        http,
        now: () => new Date(READ_AT)
      });
      return requests;
    };

    test("asks for nothing before its schedule has been read", async () => {
      // The sides the file is filtered by are the record's own, so before the
      // schedule lands there are none to filter by and the read would store
      // whatever it liked.
      const { http, requests } = respondingWith(await archivedBody(RECORDED));
      await fetchInternationalResults({
        database: client,
        competition: COMPETITION,
        season: SEASON,
        http,
        now: () => new Date(READ_AT)
      });

      expect(requests).toEqual([]);
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from raw_snapshots"
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    test("stores the window for the fifty-four and nobody else", async () => {
      await storeTheSchedule();

      const requests = await read(await archivedBody(RECORDED));

      expect(requests).toEqual([RESULTS_URL]);
      const { rows } = await client.query<{
        results: number;
        earliest: string;
        latest: string;
      }>(
        `select
           count(*)::int as results,
           min(played_on)::text as earliest,
           max(played_on)::text as latest
           from international_results`
      );
      // 758 of the window's 2,360, ending five weeks before the file does.
      expect(rows[0]).toMatchObject({ results: 758, latest: "2026-07-19" });
      expect(rows[0]!.earliest >= STORED_FROM).toBe(true);

      // A row is stored when *either* side is one of the fifty-four, which is
      // what puts England's World Cup quarter-final against a side no UEFA
      // Competition holds on England's form line (spec 0027, story 29).
      const { rows: opponents } = await client.query<{ count: string }>(
        `select count(*) from international_results
          where played_on = '2026-07-15' and home_team = 'England'
            and away_team = 'Argentina'`
      );
      expect(Number(opponents[0]!.count)).toBe(1);

      // Nothing outside it: the file's own last row is two sides no
      // Competition here holds, and it is the row whose date the packet still
      // prints.
      const { rows: strangers } = await client.query<{ count: string }>(
        `select count(*) from international_results
          where home_team = 'Vietnam' or away_team = 'Vietnam'`
      );
      expect(Number(strangers[0]!.count)).toBe(0);
      const { rows: freshness } = await client.query<{
        latest_row_on: string;
        read_at: Date;
      }>(
        `select latest_row_on::text as latest_row_on, read_at
           from international_results_source where source = $1`,
        [RESULTS_SNAPSHOT]
      );
      // Two facts, deliberately apart: how fresh the file is, which the packet
      // prints, and when this record last read it, which the
      // after-first-deadline guard asks (migration 0043).
      expect(freshness[0]?.latest_row_on).toBe("2026-08-26");
      expect(freshness[0]?.read_at.toISOString()).toBe(READ_AT);
    });

    test("maps the two spellings onto the sides the record stores", async () => {
      await storeTheSchedule();

      await read(await archivedBody(RECORDED));

      const { rows } = await client.query<{
        home_team: string;
        away_team: string;
        tournament: string;
        neutral: boolean;
      }>(
        `select home_team, away_team, tournament, neutral
           from international_results
          where played_on in ('2024-06-04', '2024-06-07')
            and (home_team in ('Czechia', 'Italy'))
          order by played_on`
      );

      expect(rows).toEqual([
        {
          home_team: "Italy",
          away_team: "Türkiye",
          tournament: "Friendly",
          neutral: false
        },
        {
          home_team: "Czechia",
          away_team: "Malta",
          tournament: "Friendly",
          neutral: true
        }
      ]);
    });

    test("a spelling that moved refuses by naming the side", async () => {
      await storeTheSchedule();
      // What a rename looks like from here: the file stops saying "Turkey"
      // and says something the map has never seen, so no row resolves onto
      // Türkiye and its recent form would be silently empty.
      const renamed = (await archivedBody(RECORDED))
        .replace(/,Turkey,/g, ",Turkiye,");

      await expect(read(renamed)).rejects
        .toThrow(UnmappedInternationalSideError);
      // Refused before anything was written, so the table is not left half
      // rewritten under a side that has gone missing.
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from international_results"
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

    test("re-reading the same file stores neither a row nor a snapshot twice",
      async () => {
        await storeTheSchedule();
        const body = await archivedBody(RECORDED);

        await read(body);
        await read(body);

        const { rows } = await client.query<{
          results: number;
          snapshots: number;
          reads: number;
        }>(
          `select
             (select count(*)::int from international_results) as results,
             (select count(*)::int from raw_snapshots
               where source = $1) as snapshots,
             (select count(*)::int from international_results_source) as reads`,
          [RESULTS_SNAPSHOT]
        );
        expect(rows[0]).toEqual({ results: 758, snapshots: 1, reads: 1 });
      });

    test("an unreachable file is archived before it is refused", async () => {
      await storeTheSchedule();

      await expect(read("<html>502 Bad Gateway</html>", 502)).rejects
        .toThrow(InternationalResultsHttpError);

      // Archived before validation, so a changed or unusable response is
      // still evidence a human can read.
      const { rows } = await client.query<{ body: string }>(
        "select body from raw_snapshots where source = $1", [RESULTS_SNAPSHOT]
      );
      expect(rows[0]?.body).toBe("<html>502 Bad Gateway</html>");
      const { rows: stored } = await client.query<{ count: string }>(
        "select count(*) from international_results"
      );
      expect(Number(stored[0]!.count)).toBe(0);
    });

    test("a Competition the dataset has no name for is refused", async () => {
      // The rule ADR-0054 states for every map a registry entry points at: a
      // missing map fails loudly, and the alternative here is a merged line
      // labelled with a Competition this source does not name.
      await expect(fetchInternationalResults({
        database: client,
        competition: "PL",
        season: SEASON,
        http: async () => ({ status: 200, body: "" }),
        now: () => new Date(READ_AT)
      })).rejects.toThrow(UnknownInternationalCompetitionError);
    });
  });

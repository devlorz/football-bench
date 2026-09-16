import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  fetchNationalTeamHeadCoaches,
  nationalTeamSectionOf,
  parseNationalTeamHeadCoaches,
  HEAD_COACHES_SNAPSHOT,
  PAGE_URL,
  UnknownNationalTeamCompetitionError,
  UnmappedNationalSideError,
  type HeadCoachOnThePage
} from "../src/head-coach/fetch-national-team-head-coaches.js";
import { HeadCoachSourceHttpError } from "../src/head-coach/fetch-head-coach-changes.js";
import { HeadCoachSourceValidationError }
  from "../src/head-coach/parse-head-coach-changes.js";
import { fetchUefaCompetition } from "../src/uefa/fetch-competition.js";
import type { HttpFetcher } from "../src/http.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const COMPETITION = "UNL";
const SEASON = "2026-27";
const HEADING = "UEFA";

/**
 * The page as it really was, recorded on 2026-09-14 (ADR-0057): every national
 * side there is, under one section per confederation.
 */
const RECORDED =
  "wikipedia-current-national-team-head-coaches-2026-09-14-recorded.wikitext.gz";

/** The Season UEFA's recorded pages hold, and where the fifty-four come from. */
const UEFA_PAGES = [
  "uefa-2026-27-UNL-recorded-offset-0.json.gz",
  "uefa-2026-27-UNL-recorded-offset-100.json.gz"
] as const;

/** The Competition's own slice of the page, which every test below reads. */
const section = nationalTeamSectionOf(COMPETITION)!;

/** England's whole row, which several of the edits below stand in place of. */
const ENGLAND = [
  "| {{fb|ENG}}",
  "|data-sort-value=\"Tuchel\"| {{flagicon|GER}} [[Thomas Tuchel]]",
  "| {{dts|format=dmy|1 January 2025}}"
].join("\n");

/** Denmark's whole row, which the page writes with no citation cell at all. */
const DENMARK = [
  "| {{fb|DEN}}",
  "|data-sort-value=\"Riemer\"| {{flagicon|DEN}} [[Brian Riemer]]",
  "| {{dts|format=dmy|24 October 2024}}"
].join("\n");

const replacingEngland = (page: string, rows: string): string => {
  expect(page).toContain(ENGLAND);
  return page.replace(ENGLAND, rows);
};

/**
 * One edit inside the UEFA section and nowhere else. The page carries a table
 * per confederation and they share their column labels, so an edit made across
 * the whole page would land in AFC's table -- the first one -- and leave the
 * one under test exactly as it was.
 */
const inTheSection = (page: string, from: string, to: string): string => {
  const at = page.indexOf("==UEFA==");
  expect(page.slice(at)).toContain(from);
  return page.slice(0, at) + page.slice(at).replace(from, to);
};

describe("the shape the current national team head coaches list is read into",
  () => {
    let page: string;
    let rows: HeadCoachOnThePage[];

    beforeAll(async () => {
      page = await archivedBody(RECORDED);
      rows = parseNationalTeamHeadCoaches(HEADING, page);
    });

    test("reads one holder and one date for every row of the section", () => {
      // UEFA's fifty-five members, which is one more than the Competition
      // holds. Every row is read and none is filtered here: which of them are
      // this Competition's is the fetch's question, and a parser that dropped
      // a row would have no way to tell one it dropped on purpose from a
      // trigram that has drifted.
      expect(rows.length).toBe(55);
      expect(new Set(rows.map(({ trigram }) => trigram)).size).toBe(55);
      expect(rows.every(({ headCoach }) => headCoach !== null)).toBe(true);
      expect(rows.every(({ assumedOn }) => /^\d{4}-\d{2}-\d{2}$/
        .test(assumedOn ?? ""))).toBe(true);
    });

    test("reads all three ways this page writes a date", () => {
      // One page, one column, three templates, because a wikitable is written
      // by whoever edits a row. `{{dts|format=dmy|...}}` is the common one,
      // `{{DTS|...}}` the same template shouted and without the display
      // parameter, and `{{Date table sorting|...}}` its spelled-out name.
      expect(rows.find(({ trigram }) => trigram === "ALB"))
        .toEqual({
          trigram: "ALB", headCoach: "Rolando Maran", assumedOn: "2026-05-19"
        });
      expect(rows.find(({ trigram }) => trigram === "FRO"))
        .toEqual({
          trigram: "FRO", headCoach: "Eyðun Klakstein", assumedOn: "2025-02-17"
        });
      expect(rows.find(({ trigram }) => trigram === "ARM"))
        .toEqual({
          trigram: "ARM", headCoach: "Yegishe Melikyan", assumedOn: "2025-08-06"
        });
    });

    test("reads a name through whatever decorates it", () => {
      // A piped link renders its display text and never the article title, a
      // flag template is not part of a name however it is spelled, and a cell
      // written hard against its pipe is the same cell as one written with a
      // space after it.
      expect(rows.find(({ trigram }) => trigram === "GRE")?.headCoach)
        .toBe("Ivan Jovanović");
      expect(rows.find(({ trigram }) => trigram === "IRL")?.headCoach)
        .toBe("Heimir Hallgrímsson");
      expect(rows.find(({ trigram }) => trigram === "MKD"))
        .toEqual({
          trigram: "MKD", headCoach: "Goce Sedloski", assumedOn: "2025-12-22"
        });
    });

    test("reads a vacant post as vacant and never as the previous holder",
      () => {
        // Story 37 of spec 0027, and the one row shape the recording does not
        // carry: on 2026-09-14 every UEFA side had somebody in post. The edit
        // is what the page writes when one does not.
        const vacant = parseNationalTeamHeadCoaches(HEADING,
          replacingEngland(page, [
            "| {{fb|ENG}}",
            "| ''Vacant''",
            "|"
          ].join("\n")));

        expect(vacant.find(({ trigram }) => trigram === "ENG"))
          .toEqual({ trigram: "ENG", headCoach: null, assumedOn: null });
        // Nothing else moved: a vacancy is one row's fact.
        expect(vacant.length).toBe(55);
        expect(vacant.filter(({ headCoach }) => headCoach === null).length)
          .toBe(1);
      });

    test("refuses a column that has moved", () => {
      // The pin's whole job. Read by position against a header that no longer
      // says what it used to, this parser would file a date as a Head Coach
      // for all fifty-five sides and nothing downstream could tell.
      expect(() => parseNationalTeamHeadCoaches(HEADING, inTheSection(
        page, "! Manager\n! Assumed role", "! Assumed role\n! Manager")))
        .toThrow(/expected the columns Team, Manager, Assumed role/);
    });

    test("refuses a row whose team cell is not a trigram", () => {
      expect(() => parseNationalTeamHeadCoaches(HEADING,
        replacingEngland(page, [
          "| [[England national football team|England]]",
          "|data-sort-value=\"Tuchel\"| {{flagicon|GER}} [[Thomas Tuchel]]",
          "| {{dts|format=dmy|1 January 2025}}"
        ].join("\n"))))
        .toThrow(/expected \{\{fb\|XXX\}\}, received England/);
    });

    test("refuses a named Head Coach whose date cannot be read", () => {
      // The other half of migration 0045's pair: null goes in both columns or
      // neither, so a name with no date is a page that changed shape rather
      // than a Head Coach nobody can place in time.
      expect(() => parseNationalTeamHeadCoaches(HEADING,
        replacingEngland(page, [
          "| {{fb|ENG}}",
          "|data-sort-value=\"Tuchel\"| {{flagicon|GER}} [[Thomas Tuchel]]",
          "| early 2025"
        ].join("\n"))))
        .toThrow(/ENG names Thomas Tuchel and no readable date/);
    });

    test("refuses a row that is not as wide as the columns it reads", () => {
      // The bound, from both sides. A row short of the date column would read
      // the cell after the last one it has; a row wider than the header has
      // gained a column and there is no honest way to say which. The trailing
      // `Refs` cell is the one absence this page really writes -- Denmark's
      // row is three cells wide in the recording -- and it is the reason the
      // bound is the pinned columns rather than the header's width exactly.
      // Denmark's, because it is the row that already has no citation cell:
      // dropping its date leaves two, where the same edit to a cited row would
      // leave three and be caught one line further on instead.
      expect(() => parseNationalTeamHeadCoaches(HEADING,
        inTheSection(page, DENMARK, "| {{fb|DEN}}\n| [[Brian Riemer]]")))
        .toThrow(/UEFA\.12: a row reads as 2 cells of 4 columns/);

      expect(() => parseNationalTeamHeadCoaches(HEADING,
        replacingEngland(page, `${ENGLAND}\n|one column more`)))
        .toThrow(/UEFA\.13: a row reads as 5 cells of 4 columns/);
    });

    test("reads a row the page left its citation cell off", () => {
      // Denmark's, in the recording. MediaWiki renders the missing `Refs`
      // cell as an empty column, so a parser pinned to the header's width
      // exactly would refuse the page as it is really written.
      expect(rows.find(({ trigram }) => trigram === "DEN"))
        .toEqual({
          trigram: "DEN", headCoach: "Brian Riemer", assumedOn: "2024-10-24"
        });
    });

    test("refuses a section the page does not carry", () => {
      // Every confederation on the page has one, so the heading that is not
      // there has to be one nobody plays in: a Competition entry naming a
      // section this article does not publish is the refusal, not a table read
      // from whichever heading came first.
      expect(() => parseNationalTeamHeadCoaches("UEFA B", page))
        .toThrow(/expected a wikitable under this heading/);
    });
  });

describe("the fifty-four sides the trigram map holds", () => {
  test("is the recorded feed's own, with nothing left over on either side",
    async () => {
      // The derivation a reviewer checks instead of a transcription. Both
      // directions, because either one alone passes a map that is half right:
      // a trigram missing from the map is a side with no Head Coach, and one
      // spelled wrong is a side given somebody else's.
      const feed = new Map((await Promise.all(UEFA_PAGES.map(archivedBody)))
        .flatMap((body) => JSON.parse(body) as {
          homeTeam: { countryCode: string; internationalName: string };
          awayTeam: { countryCode: string; internationalName: string };
        }[])
        .flatMap((match) => [match.homeTeam, match.awayTeam])
        // UEFA's own stray combining mark, removed by the fetch that stores
        // the name (ticket 0071); these are the names `fixtures` holds.
        .map(({ countryCode, internationalName }) =>
          [countryCode, internationalName.replace(/i̇/g, "i")] as const));

      expect(feed.size).toBe(54);
      expect(section.storedNameByTrigram)
        .toEqual(Object.fromEntries([...feed].sort()));
    });

  test("names the one row of the section that is not this Competition's",
    async () => {
      // UEFA has fifty-five members and this Season's Nations League
      // fifty-four. Named rather than skipped, so that a fifty-sixth trigram
      // -- far more likely to be a spelling that drifted than a new member --
      // is a refusal instead of a row quietly dropped.
      const rows = parseNationalTeamHeadCoaches(HEADING, await archivedBody(RECORDED));
      const outside = rows
        .filter(({ trigram }) =>
          section.storedNameByTrigram[trigram] === undefined)
        .map(({ trigram }) => trigram);

      expect(outside).toEqual(["RUS"]);
      expect(section.outsideTheCompetition).toEqual(outside);
    });
});

describe("the Nations League's head coaches read from the list", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let page: string;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    page = await archivedBody(RECORDED);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      "truncate fixtures, gameweeks, raw_snapshots, "
      + "national_team_head_coaches restart identity cascade"
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

  const read = async (
    body: string,
    readAt: string,
    status = 200
  ): Promise<string[]> => {
    const { http, requests } = respondingWith(body, status);
    await fetchNationalTeamHeadCoaches({
      database: client,
      competition: COMPETITION,
      season: SEASON,
      http,
      now: () => new Date(readAt)
    });
    return requests;
  };

  test("stores one snapshot per side and nobody outside the fifty-four",
    async () => {
      await storeTheSchedule();

      const requests = await read(page, "2026-09-24T06:00:00Z");

      expect(requests).toEqual([PAGE_URL]);
      const { rows } = await client.query<{ sides: number; days: number }>(
        `select
           count(*)::int as sides,
           count(distinct observed_on)::int as days
           from national_team_head_coaches`
      );
      expect(rows[0]).toEqual({ sides: 54, days: 1 });

      const { rows: germany } = await client.query<{
        head_coach: string; assumed_on: string; observed_on: string;
      }>(
        `select
           head_coach, assumed_on::text as assumed_on,
           observed_on::text as observed_on
           from national_team_head_coaches where team = 'Germany'`
      );
      expect(germany).toEqual([{
        head_coach: "Jürgen Klopp",
        assumed_on: "2026-07-24",
        // The morning the page was read, in UTC and not in the reader's
        // zone: a run at 06:00Z is the same day's snapshot everywhere.
        observed_on: "2026-09-24"
      }]);

      // The fifty-fifth member is read off the page and stored for nobody:
      // this record holds no Fixture of Russia's and would have nowhere to
      // render its Head Coach.
      const { rows: outside } = await client.query<{ count: string }>(
        "select count(*) from national_team_head_coaches where team = 'Russia'"
      );
      expect(Number(outside[0]!.count)).toBe(0);
      // Archived under the one name, beside the schedule's own snapshots and
      // under no Season of its own: there is one page and it states none.
      const { rows: archived } = await client.query<{ source: string }>(
        "select source from raw_snapshots order by source"
      );
      expect(archived.map(({ source }) => source))
        .toEqual([
          "uefa:2026-27:UNL:0",
          "uefa:2026-27:UNL:100",
          HEAD_COACHES_SNAPSHOT
        ]);
    });

  test("rereading the same morning rewrites that morning's snapshot",
    async () => {
      // The key is the side and the day, so a run repeated inside a morning
      // cannot invent a Change out of having read the same page twice.
      await storeTheSchedule();
      await read(page, "2026-09-24T06:00:00Z");
      await read(page, "2026-09-24T11:00:00Z");

      const { rows } = await client.query<{
        rows: number; observed: Date;
      }>(
        `select count(*)::int as rows, max(observed_at) as observed
           from national_team_head_coaches where team = 'Germany'`
      );
      // One row, carrying the later instant: the second read rewrote the
      // first rather than sitting beside it.
      expect(rows[0]!.rows).toBe(1);
      expect(rows[0]!.observed).toEqual(new Date("2026-09-24T11:00:00Z"));
    });

  test("two mornings that disagree are two snapshots", async () => {
    // The whole mechanism a Head Coach Change is found by (ADR-0045): this
    // source publishes no event, so a change is the difference between two
    // days of it, and it is visible only because yesterday was kept.
    await storeTheSchedule();
    await read(page, "2026-09-24T06:00:00Z");
    await read(
      page.replace("[[Jürgen Klopp]]", "[[Julian Nagelsmann]]"),
      "2026-09-25T06:00:00Z"
    );

    const { rows } = await client.query<{
      observed_on: string; head_coach: string;
    }>(
      `select observed_on::text as observed_on, head_coach
         from national_team_head_coaches
        where team = 'Germany' order by observed_on`
    );
    expect(rows).toEqual([
      { observed_on: "2026-09-24", head_coach: "Jürgen Klopp" },
      { observed_on: "2026-09-25", head_coach: "Julian Nagelsmann" }
    ]);
  });

  test("stores a vacant post as vacant", async () => {
    await storeTheSchedule();

    await read(replacingEngland(page, [
      "| {{fb|ENG}}",
      "| ''Vacant''",
      "|"
    ].join("\n")), "2026-09-24T06:00:00Z");

    const { rows } = await client.query<{
      head_coach: string | null; assumed_on: string | null;
    }>(
      `select head_coach, assumed_on::text as assumed_on
         from national_team_head_coaches where team = 'England'`
    );
    expect(rows).toEqual([{ head_coach: null, assumed_on: null }]);
  });

  test("archives an unusable response before it refuses it", async () => {
    await storeTheSchedule();

    await expect(read("<html>no</html>", "2026-09-24T06:00:00Z", 503))
      .rejects.toThrow(HeadCoachSourceHttpError);

    const { rows } = await client.query<{ count: string }>(
      "select count(*) from raw_snapshots where source = $1",
      [HEAD_COACHES_SNAPSHOT]
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  test("refuses a page that has dropped one of the fifty-four, by name",
    async () => {
      await storeTheSchedule();

      // One refusal naming both halves of what moved, and not the first of
      // them: a trigram nobody knows and a side nobody carries are usually
      // one edit seen from two sides, and reporting half of it sends an
      // operator back to the page twice.
      const refusal = read(
        replacingEngland(page, "| {{fb|XXX}}\n| ''Vacant''\n|"),
        "2026-09-24T06:00:00Z"
      );
      await expect(refusal).rejects.toThrow(HeadCoachSourceValidationError);
      await expect(refusal).rejects.toThrow(
        /UEFA\.XXX: is a row this Competition's trigram map has never seen/
      );
      await expect(refusal).rejects.toThrow(
        /UEFA\.ENG: England is stored by this Competition/
      );

      // Refused before anything was written: a page that moved costs this
      // Competition its morning rather than leaving the table holding
      // yesterday's answer under half of today's.
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from national_team_head_coaches"
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

  test("refuses a stored side the map cannot reach, by name", async () => {
    // The map's names and the record's names come from the same feed, so this
    // is what a rename in that feed looks like from here -- and the
    // alternative to refusing is that side's Head Coach line reading as a Gap
    // for as long as nobody looks.
    await storeTheSchedule();
    await client.query(
      "update fixtures set home_team = 'Turkey' where home_team = 'Türkiye'"
    );

    await expect(read(page, "2026-09-24T06:00:00Z"))
      .rejects.toThrow(UnmappedNationalSideError);
  });

  test("refuses a Competition the page has no section for", async () => {
    await expect(fetchNationalTeamHeadCoaches({
      database: client,
      competition: "PL",
      season: SEASON,
      http: respondingWith(page).http,
      now: () => new Date("2026-09-24T06:00:00Z")
    })).rejects.toThrow(UnknownNationalTeamCompetitionError);
  });

  test("dates a snapshot by the UTC day, not the reader's", async () => {
    // A run at 22:00Z is the 24th here and the 25th anywhere east of UTC, and
    // the day is this store's key -- so a date taken from the process's own
    // zone would file one morning's reading under two different days
    // depending on where the fetch happened to run.
    await storeTheSchedule();
    await read(page, "2026-09-24T22:00:00Z");

    const { rows } = await client.query<{ observed_on: string }>(
      `select observed_on::text as observed_on
         from national_team_head_coaches where team = 'Germany'`
    );
    expect(rows).toEqual([{ observed_on: "2026-09-24" }]);
  });

  test("stores what it can before a schedule has been read", async () => {
    // Unlike the internationals dataset, which filters its file by the
    // record's own sides and so asks for nothing before there are any: this
    // page is keyed by trigram and the map is the Competition's own list, so
    // the read stands on its own and the Fixtures only widen what it checks.
    const requests = await read(page, "2026-09-24T06:00:00Z");

    expect(requests).toEqual([PAGE_URL]);
    const { rows } = await client.query<{ count: string }>(
      "select count(*) from national_team_head_coaches"
    );
    expect(Number(rows[0]!.count)).toBe(54);
  });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  clubResultsSource,
  clubResultsUrl,
  storedTeamName
} from "../src/365scores/fetch-match-stats.js";
import {
  clubCompetitorIdsOf,
  ClubResultsFetchError,
  fetchClubResults,
  UnknownClubCompetitorError
} from "../src/365scores/fetch-club-results.js";
import { fetchUefaCompetition } from "../src/uefa/fetch-competition.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

interface Side { id: number; name: string }

const CHAMPIONS_LEAGUE = "UCL";
const SEASON = "2026-27";

/**
 * 365Scores' answers recorded 2026-10-12, keyed by request URL: the
 * Champions League standings (`competitions=572`, all 36 sides with their
 * competitor ids) and one results page for each of those 36.
 */
const CLUB_RESULTS = "365scores-UCL-club-results-recorded-2026-10-12.json.gz";
const CHAMPIONS_LEAGUE_PAGES = [0, 100, 200].map((offset) =>
  `uefa-2026-27-UCL-recorded-offset-${offset}.json.gz`);

const recorded = async (): Promise<Record<string, string>> =>
  JSON.parse(await archivedBody(CLUB_RESULTS)) as Record<string, string>;

/** Every side of UEFA's recorded league phase, in UEFA's spelling. */
async function uefaSides(): Promise<Set<string>> {
  const pages = await Promise.all(CHAMPIONS_LEAGUE_PAGES.map(archivedBody));
  return new Set(pages.flatMap((page) => (JSON.parse(page) as {
    round: { metaData: { name: string } };
    homeTeam: { internationalName: string };
    awayTeam: { internationalName: string };
  }[]).filter((match) => match.round.metaData.name === "League Phase")
    .flatMap((match) => [
    match.homeTeam.internationalName, match.awayTeam.internationalName
  ])));
}

describe("the Champions League's 365Scores competitor ids", () => {
  test("derive 36 pairs from the archived standings, nothing left over",
    async () => {
      // The derivation a reviewer checks instead of a transcription: the
      // standings list every side with its id, and ticket 0101's reviewed
      // name map turns each into UEFA's spelling.
      const [standingsUrl, body] = Object.entries(await recorded())
        .find(([url]) => url.includes("/web/standings/"))!;
      expect(standingsUrl).toContain("competitions=572");
      const rows = (JSON.parse(body) as {
        standings: { rows: { competitor: { id: number; name: string } }[] }[];
      }).standings[0]!.rows;
      const derived = Object.fromEntries(rows.map(({ competitor }) => [
        storedTeamName(CHAMPIONS_LEAGUE, competitor.name), competitor.id
      ]));

      expect(clubCompetitorIdsOf(CHAMPIONS_LEAGUE)).toEqual(derived);
      expect(Object.keys(derived).sort()).toEqual([...await uefaSides()].sort());
      expect(Object.keys(derived)).toHaveLength(36);
    });
});

const EUROPA_LEAGUE_RESULTS =
  "365scores-UEL-club-results-recorded-2026-10-13.json.gz";
const EUROPA_LEAGUE_PAGES = [0, 100, 200].map((offset) =>
  `uefa-2026-27-UEL-recorded-offset-${offset}.json.gz`);

describe("the Europa League's 365Scores competitor ids", () => {
  test("derive 36 pairs from the archived standings, nothing left over",
    async () => {
      const [standingsUrl, body] = Object.entries(JSON.parse(
        await archivedBody(EUROPA_LEAGUE_RESULTS)
      ) as Record<string, string>).find(([url]) => url.includes("/web/standings/"))!;
      expect(standingsUrl).toContain("competitions=573");
      const rows = (JSON.parse(body) as {
        standings: { rows: { competitor: { id: number; name: string } }[] }[];
      }).standings[0]!.rows;
      const derived = Object.fromEntries(rows.map(({ competitor }) => [
        storedTeamName("UEL", competitor.name), competitor.id
      ]));
      const pages = await Promise.all(EUROPA_LEAGUE_PAGES.map(archivedBody));
      const sides = new Set(pages.flatMap((page) => (JSON.parse(page) as {
        round: { metaData: { name: string } };
        homeTeam: { internationalName: string };
        awayTeam: { internationalName: string };
      }[]).filter((match) => match.round.metaData.name === "League Phase")
        .flatMap((match) => [
          match.homeTeam.internationalName, match.awayTeam.internationalName
        ])));

      expect(clubCompetitorIdsOf("UEL")).toEqual(derived);
      expect(Object.keys(derived).sort()).toEqual([...sides].sort());
      expect(Object.keys(derived)).toHaveLength(36);
    });
});

const CONFERENCE_LEAGUE_RESULTS =
  "365scores-UECL-club-results-recorded-2026-10-14.json.gz";

describe("the Conference League's 365Scores competitor ids", () => {
  test("derive 36 pairs from MD1's listing, not the standings", async () => {
    // Recorded 2026-10-14, the standings and all 36 sides' results pages. The
    // standings seat CSKA 1948 Sofia (53248) where UEFA's draw has CSKA Sofia,
    // which MD1's listing names with 2276, so the listing is what is read.
    const listing = Object.values(JSON.parse(await archivedBody(
      "365scores-UECL-MD1-listing-recorded-2026-10-14.json.gz"
    )) as Record<string, string>)[0]!;
    const derived = Object.fromEntries((JSON.parse(listing) as {
      games: { homeCompetitor: Side; awayCompetitor: Side }[];
    }).games.flatMap((game) => [game.homeCompetitor, game.awayCompetitor])
      .map((side) => [storedTeamName("UECL", side.name), side.id]));
    const pages = await Promise.all([0, 100, 200, 300].map((offset) =>
      archivedBody(`uefa-2026-27-UECL-recorded-offset-${offset}.json.gz`)));
    const sides = new Set(pages.flatMap((page) => (JSON.parse(page) as {
      round: { metaData: { name: string } };
      homeTeam: { internationalName: string };
      awayTeam: { internationalName: string };
    }[]).filter((match) => match.round.metaData.name === "League Phase")
      .flatMap((match) => [
        match.homeTeam.internationalName, match.awayTeam.internationalName
      ])));
    const bundle = JSON.parse(await archivedBody(CONFERENCE_LEAGUE_RESULTS)) as
      Record<string, string>;
    const standings = Object.entries(bundle)
      .find(([url]) => url.includes("/web/standings/"))!;

    expect(clubCompetitorIdsOf("UECL")).toEqual(derived);
    expect(Object.keys(derived).sort()).toEqual([...sides].sort());
    expect(Object.keys(derived)).toHaveLength(36);
    expect(derived["CSKA Sofia"]).toBe(2276);
    expect(standings[0]).toContain("competitions=7685");
    expect(standings[1]).toContain("CSKA 1948 Sofia");
    // Every side's results page was recorded under the id the map gives it.
    for (const id of Object.values(derived)) {
      expect(bundle[clubResultsUrl(id)], String(id)).toBeDefined();
    }
  });
});

describe("the cups' competitor ids", () => {
  test("name no club in two cups", () => {
    // `clubNameOf` finds a side by its id across every cup's map; a club plays
    // one league phase, and an id in two maps would be a broken entry.
    const ids = ["UCL", "UEL", "UECL"]
      .flatMap((cup) => Object.values(clubCompetitorIdsOf(cup) ?? {}));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a club result two cups both list", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    for (const [competition, names] of [
      ["UCL", CHAMPIONS_LEAGUE_PAGES], ["UEL", EUROPA_LEAGUE_PAGES]
    ] as const) {
      const pages = await Promise.all(names.map(archivedBody));
      await fetchUefaCompetition({
        database: client,
        competition,
        season: SEASON,
        http: async (url) => ({
          status: 200,
          body: pages[Number(/offset=(\d+)/.exec(url)![1]) / 100] ?? "[]"
        }),
        now: () => new Date("2026-10-13T09:00:00Z")
      });
    }

    return async () => {
      await client.end();
    };
  });

  const fetchFor = async (competition: string): Promise<void> => {
    const bodies = {
      ...JSON.parse(await archivedBody(CLUB_RESULTS)) as Record<string, string>,
      ...JSON.parse(await archivedBody(EUROPA_LEAGUE_RESULTS)) as
        Record<string, string>
    };
    await fetchClubResults({
      database: client,
      competition,
      season: SEASON,
      http: async (url) => ({ status: 200, body: bodies[url] ?? "" }),
      pause: async () => {}
    });
  };

  test("names each side by its own cup's spelling, whichever cup wrote last",
    async () => {
      // Crystal Palace (`UEL`) at home to Man City (`UCL`): 365Scores calls
      // the visitors "Manchester City", which only `UCL`'s map renames.
      const palace = async () => (await client.query(
        `select home_team, away_team from club_results
          where source_match_id = '4742087'`
      )).rows;
      const shared = { home_team: "Crystal Palace", away_team: "Man City" };

      await fetchFor("UCL");
      await fetchFor("UEL");
      expect(await palace()).toEqual([shared]);
      await fetchFor("UCL");
      expect(await palace()).toEqual([shared]);
    });
});

describe("each Champions League side's recent results read from 365Scores", () => {
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
      "truncate fixtures, gameweeks, raw_snapshots, club_results "
      + "restart identity cascade"
    );
    // The cup's sides are read off its stored Fixtures (ticket 0100), so the
    // league phase is stored first, as UEFA published it on 2026-10-12.
    const pages = await Promise.all(CHAMPIONS_LEAGUE_PAGES.map(archivedBody));
    await fetchUefaCompetition({
      database: client,
      competition: CHAMPIONS_LEAGUE,
      season: SEASON,
      http: async (url) => ({
        status: 200,
        body: pages[Number(/offset=(\d+)/.exec(url)![1]) / 100] ?? "[]"
      }),
      now: () => new Date("2026-10-12T09:00:00Z")
    });
  });

  const fetchOver = async (
    bodyByUrl: Record<string, string>
  ): Promise<string[]> => {
    const requests: string[] = [];
    await fetchClubResults({
      database: client,
      competition: CHAMPIONS_LEAGUE,
      season: SEASON,
      http: async (url) => {
        requests.push(url);
        const body = bodyByUrl[url];
        return body === undefined
          ? { status: 404, body: "" }
          : { status: 200, body };
      },
      pause: async () => {}
    });
    return requests;
  };

  test("stores every side's settled matches, friendlies left out, once each",
    async () => {
      const requests = await fetchOver(await recorded());

      // One page a side, and nothing else asked.
      expect(requests).toHaveLength(36);
      // Bayern's latest as 365Scores listed it, the side in the record's
      // spelling and its opponent in 365Scores' own.
      const bayern = await client.query(
        `select source, source_match_id, kicked_off_at, home_team, away_team,
                home_goals, away_goals, competition_name
           from club_results
          where 'Bayern München' in (home_team, away_team)
          order by kicked_off_at desc limit 1`
      );
      expect(bayern.rows).toEqual([{
        source: "365scores",
        source_match_id: "4755385",
        kicked_off_at: new Date("2026-10-10T13:30:00Z"),
        home_team: "FC Augsburg",
        away_team: "Bayern München",
        home_goals: 2,
        away_goals: 2,
        competition_name: "Bundesliga"
      }]);
      // A Champions League match between two of the cup's sides, listed by
      // both, is one row under both record spellings.
      const md1 = await client.query(
        `select home_team, away_team, competition_name from club_results
          where source_match_id = '4828488'`
      );
      expect(md1.rows).toEqual([{
        home_team: "Bayern München",
        away_team: "Bodø/Glimt",
        competition_name: "UEFA Champions League"
      }]);
      // No friendly, under 365Scores' friendlies listing or under an
      // invitational's own name (Emirates Cup, Joan Gamper Trophy), and no
      // match the listing carries without a score.
      const left = await client.query(
        `select source_match_id from club_results
          where competition_name = 'Club Friendlies'
             or source_match_id in ('4865446', '4748068', '4788296')`
      );
      expect(left.rows).toEqual([]);
      // Nothing before 2026-07-01 (spec 0028), such as PSG–Arsenal on 05-30.
      const early = await client.query(
        `select source_match_id from club_results
          where kicked_off_at < '2026-07-01T00:00:00Z'
             or source_match_id = '4711770'`
      );
      expect(early.rows).toEqual([]);

      const before = await client.query("select count(*)::int as n from club_results");
      await fetchOver(await recorded());
      const after = await client.query("select count(*)::int as n from club_results");
      expect(after.rows[0].n).toBe(before.rows[0].n);
      // Every listing archived, before anything was validated.
      const archived = await client.query(
        `select count(*)::int as n from raw_snapshots
          where source like '365scores:2026-27:UCL:results:%'`
      );
      expect(archived.rows[0].n).toBeGreaterThanOrEqual(36);
    });

  test("a side the competitor-id map lacks is refused by name, before any request",
    async () => {
      await client.query(
        `update fixtures set home_team = 'Bodo/Glimt'
          where competition = $1 and home_team = 'Bodø/Glimt'`,
        [CHAMPIONS_LEAGUE]
      );

      const thrown = await fetchOver(await recorded())
        .catch((error: unknown) => error);

      expect(thrown).toMatchObject({
        name: UnknownClubCompetitorError.name,
        competition: CHAMPIONS_LEAGUE,
        team: "Bodo/Glimt"
      });
      const stored = await client.query("select 1 from club_results");
      expect(stored.rows).toEqual([]);
    });

  test("one side's failed listing is named, and every other side is still stored",
    async () => {
      const responses = await recorded();
      delete responses[clubResultsUrl(331)];

      const thrown = await fetchOver(responses)
        .catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(ClubResultsFetchError);
      expect(thrown).toMatchObject({
        competition: CHAMPIONS_LEAGUE,
        teams: ["Bayern München"]
      });
      // Augsburg is no cup side, so its draw with Bayern was on Bayern's
      // page alone.
      const bayern = await client.query(
        "select 1 from club_results where source_match_id = '4755385'"
      );
      expect(bayern.rows).toEqual([]);
      const liverpool = await client.query(
        `select 1 from club_results
          where 'Liverpool' in (home_team, away_team)`
      );
      expect(liverpool.rows.length).toBeGreaterThan(0);
      // The failed response is archived as evidence all the same.
      const archived = await client.query(
        "select 1 from raw_snapshots where source = $1",
        [clubResultsSource(CHAMPIONS_LEAGUE, SEASON, 331)]
      );
      expect(archived.rows).toHaveLength(1);
    });

  test("a match under a competition the page does not name is refused, not skipped",
    async () => {
      const responses = await recorded();
      const liverpool = clubResultsUrl(108);
      const page = JSON.parse(responses[liverpool]!) as {
        competitions: { name: string }[];
      };
      page.competitions = page.competitions
        .filter((entry) => entry.name !== "EFL Cup");
      responses[liverpool] = JSON.stringify(page);

      const thrown = await fetchOver(responses)
        .catch((error: unknown) => error);

      expect(thrown).toMatchObject({
        competition: CHAMPIONS_LEAGUE,
        teams: ["Liverpool"]
      });
      // The whole page is refused, not the half ahead of the bad game: the
      // page is newest first, and Bournemouth is no Champions League side, so this match
      // was on Liverpool's page alone, two games before the EFL Cup tie.
      const bournemouth = await client.query(
        "select 1 from club_results where source_match_id = '4742061'"
      );
      expect(bournemouth.rows).toEqual([]);
    });
});

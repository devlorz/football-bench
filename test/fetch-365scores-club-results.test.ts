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
      // page is newest first, and Bournemouth is no cup side, so this match
      // was on Liverpool's page alone, two games before the EFL Cup tie.
      const bournemouth = await client.query(
        "select 1 from club_results where source_match_id = '4742061'"
      );
      expect(bournemouth.rows).toEqual([]);
    });
});

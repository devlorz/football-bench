import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  fetchScores365Stats,
  listingUrl,
  parseScores365Games,
  parseScores365Sheet,
  sheetUrl,
  storedTeamName,
  Scores365HttpError,
  Scores365ValidationError,
  UnknownScores365TeamError,
  type Scores365Sheet
} from "../src/365scores/fetch-match-stats.js";
import { fetchUefaCompetition } from "../src/uefa/fetch-competition.js";
import type { HttpFetcher } from "../src/http.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const COMPETITION = "UNL";

/**
 * 365Scores' own recordings, made on 2026-09-14 (ADR-0058): the listing for
 * this Season's first matchday, the listing for the day the 2025 Finals were
 * played, one full match sheet and one of the four-per-cent that carry no xG.
 */
const MATCHDAY_ONE_LISTING = "365scores-UNL-games-2026-09-24-recorded.json.gz";
const FINALS_LISTING = "365scores-UNL-games-2025-06-08-recorded.json.gz";
const FULL_SHEET =
  "365scores-UNL-stats-4444714-portugal-spain-recorded.json.gz";
const HOLE_SHEET =
  "365scores-UNL-stats-4051269-spain-switzerland-no-xg-recorded.json.gz";

/** The Season UEFA's recorded pages hold, and the one those Fixtures are in. */
const SEASON = "2026-27";
const UEFA_PAGES = [
  "uefa-2026-27-UNL-recorded-offset-0.json.gz",
  "uefa-2026-27-UNL-recorded-offset-100.json.gz"
] as const;

/**
 * The 2025 Finals are the only played Nations League matches any archived
 * listing covers, and they are a knockout round the UEFA fetch refuses
 * outright (ticket 0071) — so the record cannot be seeded from a feed for
 * them. What this fetch reads off a stored Fixture is its kickoff, its two
 * sides and its result, and all three are taken here from the same recorded
 * bytes the listing is.
 */
const FINALS_SEASON = "2024-25";

describe("the shape a 365Scores match sheet is read into", () => {
  let full: Scores365Sheet;
  let hole: Scores365Sheet;

  beforeAll(async () => {
    full = parseScores365Sheet("test", await archivedBody(FULL_SHEET));
    hole = parseScores365Sheet("test", await archivedBody(HOLE_SHEET));
  });

  test("reads both sides' xG, shots and shots on target off a full sheet", () => {
    // The sheet names its own game, which is what makes a sheet answered for
    // another match visible rather than filed under the one that was asked
    // for.
    expect(full.game.id).toBe("4444714");
    expect(full.game.home.name).toBe("Portugal");
    expect(full.game.away.name).toBe("Spain");
    expect(full.game.kickedOffAt.toISOString())
      .toBe("2025-06-08T19:00:00.000Z");
    expect({
      homeXg: full.homeXg,
      awayXg: full.awayXg,
      homeShots: full.homeShots,
      awayShots: full.awayShots,
      homeShotsOnTarget: full.homeShotsOnTarget,
      awayShotsOnTarget: full.awayShotsOnTarget
    }).toEqual({
      homeXg: 1.02,
      awayXg: 2.06,
      homeShots: 7,
      awayShots: 16,
      homeShotsOnTarget: 2,
      awayShotsOnTarget: 6
    });
  });

  test("a hole is a sheet with no xG on it, not a sheet that is missing", () => {
    // ADR-0058's four per cent, in the bytes: thirty-eight rows, every shot
    // count present, and no "Expected Goals" row for either side. Read as an
    // absent sheet it would be retried for ever against a source that answers;
    // read as a zero it would be the lie the Entrant weighs.
    expect(hole.game.id).toBe("4051269");
    expect({ home: hole.homeXg, away: hole.awayXg })
      .toEqual({ home: null, away: null });
    expect({
      homeShots: hole.homeShots,
      awayShots: hole.awayShots,
      homeShotsOnTarget: hole.homeShotsOnTarget,
      awayShotsOnTarget: hole.awayShotsOnTarget
    }).toEqual({
      homeShots: 21,
      awayShots: 11,
      homeShotsOnTarget: 10,
      awayShotsOnTarget: 4
    });
  });

  test("a figure for a side that is not in the match is refused", async () => {
    // The sheet is real and a third competitor is put into it: what that
    // shape means is that this body is not the match it was asked for, and
    // storing the rows it does carry would file one match's numbers under
    // another's.
    const sheet = JSON.parse(await archivedBody(FULL_SHEET)) as {
      statistics: { name: string; competitorId: number; value: string }[];
    };
    sheet.statistics.push({
      name: "Expected Goals", competitorId: 9999, value: "1.50"
    });

    expect(() => parseScores365Sheet("test", JSON.stringify(sheet)))
      .toThrow(/9999/);
    expect(() => parseScores365Sheet("test", JSON.stringify(sheet)))
      .toThrow(Scores365ValidationError);
  });

  test("an xG that is not a number is refused rather than dropped", async () => {
    // A hole is an absent row; a row whose value stopped being a decimal is a
    // source that changed shape, and quietly reading it as a hole would retry
    // it every morning for ever while the packet said the xG was missing.
    const sheet = JSON.parse(await archivedBody(FULL_SHEET)) as {
      statistics: { name: string; value: string }[];
    };
    sheet.statistics.find((row) => row.name === "Expected Goals")!.value = "-";

    expect(() => parseScores365Sheet("test", JSON.stringify(sheet)))
      .toThrow(Scores365ValidationError);
  });
});

describe("the three spellings 365Scores does not share", () => {
  test("maps exactly the three, and leaves every other name alone", () => {
    expect(storedTeamName("Ireland")).toBe("Republic of Ireland");
    expect(storedTeamName("Turkiye")).toBe("Türkiye");
    expect(storedTeamName("Bosnia & Herzegovina")).toBe("Bosnia and Herzegovina");
    expect(storedTeamName("Portugal")).toBe("Portugal");
  });

  test("every name the recorded listings carry resolves onto a stored side",
    async () => {
      // The derivation a reviewer checks instead of a transcription: the
      // fifty-four names UEFA's own pages store, and every side either
      // recorded listing names, mapped and held against them. "Ireland" is
      // the one of the three these two days reach, and the record holds a
      // "Northern Ireland" as well — which is why it is mapped rather than
      // matched on a prefix.
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

      const listed = new Set((await Promise.all(
        [MATCHDAY_ONE_LISTING, FINALS_LISTING].map(archivedBody)
      )).flatMap((body) => parseScores365Games("test", body))
        .flatMap((game) => [game.home.name, game.away.name]));

      expect([...listed].filter((name) => !stored.has(storedTeamName(name))))
        .toEqual([]);
      // The map earns its three entries: each key is a name the record does
      // not hold, and each value is one it does.
      for (const spelling of ["Ireland", "Turkiye", "Bosnia & Herzegovina"]) {
        expect(stored.has(spelling)).toBe(false);
        expect(stored.has(storedTeamName(spelling))).toBe(true);
      }
    });
});

describe("the Nations League's shots and xG read from 365Scores", () => {
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
      "truncate fixtures, gameweeks, raw_snapshots, team_match_stats "
      + "restart identity cascade"
    );
  });

  function respondingWith(
    bodyByUrl: Record<string, string>
  ): { http: HttpFetcher; requests: string[] } {
    const requests: string[] = [];
    const http: HttpFetcher = async (url) => {
      requests.push(url);
      const body = bodyByUrl[url];
      return body === undefined ? { status: 404, body: "" } : { status: 200, body };
    };
    return { http, requests };
  }

  const fetchAt = async (
    season: string,
    at: string,
    bodyByUrl: Record<string, string>
  ): Promise<{
    requests: string[];
    disagreements: unknown[];
    unlistedFixtures: unknown[];
  }> => {
    const { http, requests } = respondingWith(bodyByUrl);
    const { disagreements, unlistedFixtures } = await fetchScores365Stats({
      database: client,
      competition: COMPETITION,
      season,
      http,
      now: () => new Date(at)
    });
    return { requests, disagreements, unlistedFixtures };
  };

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

  /** One of matchday 1's Fixtures, settled the way its schedule source would. */
  async function settle(fixtureId: number, result: string): Promise<void> {
    await client.query(
      "update fixtures set result = $1 where fixture_id = $2",
      [result, fixtureId]
    );
  }

  /**
   * The two Fixtures the recorded listing's day holds, as the record would
   * hold them, seeded rather than fetched for the reason `FINALS_SEASON`
   * records. The third-place match is stored without a result on purpose: the
   * record decides what has settled, and the listing calling it `Ended` is
   * not that decision.
   */
  async function storeTheFinals(result: string | null): Promise<void> {
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ($1, $2, 6, '2025-06-08T12:45:00Z')`,
      [COMPETITION, FINALS_SEASON]
    );
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, home_team, away_team,
         kickoff_at, result
       ) values
         ($1, $2, 4444714, 6, 'Portugal', 'Spain',
          '2025-06-08T19:00:00Z', $3),
         ($1, $2, 4444715, 6, 'Germany', 'France',
          '2025-06-08T13:00:00Z', null)`,
      [COMPETITION, FINALS_SEASON, result]
    );
  }

  const listingOf = async (
    date: string,
    fixture: string
  ): Promise<Record<string, string>> => ({
    [listingUrl(COMPETITION, date)]: await archivedBody(fixture)
  });

  test("asks for nothing at all while nothing is outstanding", async () => {
    await storeTheSchedule();

    // Matchday 1 has kicked off and the record has not settled it yet, so
    // there is no sheet to want and nothing to compare a score against. The
    // day after the Season's last match, with every figure stored, this is
    // also what every morning until the Season closes costs: ADR-0058 budgets
    // one listing a day and one sheet per settled Fixture, and a read keyed
    // on past dates rather than on outstanding Fixtures would have been
    // asking for a dozen listings every morning by `MD6`.
    const { requests } = await fetchAt(
      SEASON,
      "2026-09-24T23:00:00Z",
      await listingOf("2026-09-24", MATCHDAY_ONE_LISTING)
    );

    expect(requests).toEqual([]);
    const { rows } = await client.query<{ count: string }>(
      "select count(*) from raw_snapshots where source like '365scores:%'"
    );
    expect(Number(rows[0]!.count)).toBe(0);
  });

  test("asks for the day a settled Fixture was played on, and for no other",
    async () => {
      await storeTheSchedule();
      // Kosovo v Republic of Ireland, matchday 1. The other seven of its day
      // are left unsettled here, so what is left unasked for is the rest of
      // the Season *and* the rest of that evening.
      await settle(2048007, '{"home_goals":1,"away_goals":0,"outcome":"H"}');
      const { http, requests } = respondingWith(
        await listingOf("2026-09-24", MATCHDAY_ONE_LISTING)
      );

      // No sheet is archived for this game, so the read fails once it asks
      // for one. What this pins is the two requests the day costs and which
      // game the second one is for: `4672062` is the listing's Kosovo v
      // Ireland, so the three-name map is what joined it to the Fixture.
      await fetchScores365Stats({
        database: client,
        competition: COMPETITION,
        season: SEASON,
        http,
        now: () => new Date("2026-09-25T06:00:00Z")
      }).catch(() => undefined);

      expect(requests).toEqual([
        "https://webws.365scores.com/web/games/?appTypeId=5&langId=1"
        + "&timezoneName=UTC&userCountryId=1&competitions=7016"
        + "&startDate=24/09/2026&endDate=24/09/2026",
        sheetUrl("4672062")
      ]);
      const { rows } = await client.query<{ source: string }>(
        `select source from raw_snapshots
          where source like '365scores:%' order by source`
      );
      // Both responses archived, the failed one included, and both named the
      // way every other source in this archive is: source, Season,
      // Competition, then what the URL asked for.
      expect(rows.map(({ source }) => source)).toEqual([
        "365scores:2026-27:UNL:games:2026-09-24",
        "365scores:2026-27:UNL:stats:4672062"
      ]);
    });

  test("a listed side outside the three-name map is refused by name", async () => {
    await storeTheSchedule();
    await settle(2048007, '{"home_goals":1,"away_goals":0,"outcome":"H"}');
    const listing = JSON.parse(await archivedBody(MATCHDAY_ONE_LISTING)) as {
      games: { awayCompetitor: { name: string } }[];
    };
    const ireland = listing.games
      .find((game) => game.awayCompetitor.name === "Ireland")!;
    ireland.awayCompetitor.name = "Eire";

    const thrown = await fetchAt(SEASON, "2026-09-25T06:00:00Z", {
      [listingUrl(COMPETITION, "2026-09-24")]: JSON.stringify(listing)
    }).catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      name: UnknownScores365TeamError.name,
      team: "Eire"
    });
    // Archived before it was read, refused before anything was written, and
    // refused before the sheet of the game that name is in was asked for.
    const { rows } = await client.query<{ snapshots: string; stats: string }>(
      `select
         (select count(*) from raw_snapshots
           where source like '365scores:%') as snapshots,
         (select count(*) from team_match_stats) as stats`
    );
    expect(rows[0]).toEqual({ snapshots: "1", stats: "0" });
  });

  test("a response that failed is archived before it is refused", async () => {
    // The evidence rule ADR-0058 rests on: what the host answered is in the
    // record whether or not it could be read, because the note's baseline is
    // only repeatable from bodies the archive kept.
    await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');

    const thrown = await fetchAt(FINALS_SEASON, "2025-06-09T06:00:00Z", {})
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Scores365HttpError);
    const { rows } = await client.query<{ source: string; body: string }>(
      "select source, body from raw_snapshots"
    );
    expect(rows).toEqual([
      { source: "365scores:2024-25:UNL:games:2025-06-08", body: "" }
    ]);
  });

  test("a settled Fixture gets one row of both sides' shots and xG", async () => {
    await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');

    const { requests, disagreements, unlistedFixtures } = await fetchAt(
      FINALS_SEASON,
      "2025-06-09T06:00:00Z",
      {
        ...await listingOf("2025-06-08", FINALS_LISTING),
        [sheetUrl("4444714")]: await archivedBody(FULL_SHEET)
      }
    );

    // The listing carries the third-place match too, which the record holds
    // unsettled: no sheet is read for it. What has settled is the record's
    // word, not the source's.
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(sheetUrl("4444714"));
    expect(disagreements).toEqual([]);
    expect(unlistedFixtures).toEqual([]);

    const { rows } = await client.query(
      `select source, source_match_id, kicked_off_at, home_team, away_team,
              home_shots, away_shots, home_shots_on_target,
              away_shots_on_target, home_xg, away_xg
         from team_match_stats`
    );
    expect(rows).toEqual([{
      source: "365scores",
      source_match_id: "4444714",
      kicked_off_at: new Date("2025-06-08T19:00:00Z"),
      home_team: "Portugal",
      away_team: "Spain",
      home_shots: 7,
      away_shots: 16,
      home_shots_on_target: 2,
      away_shots_on_target: 6,
      home_xg: "1.02",
      away_xg: "2.06"
    }]);
  });

  test("a settled Fixture the listing did not carry is reported, not skipped",
    async () => {
      // What a date the two sources disagree about looks like from here, and
      // the failure this project has already had once: Understat's dates
      // drift on some matchdays, the join rate falls, and nothing says so.
      // Refusing instead would take the Competition's whole morning out for
      // one match 365Scores has not published.
      await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, home_team, away_team,
           kickoff_at, result
         ) values ($1, $2, 4444716, 6, 'Norway', 'Denmark',
                   '2025-06-08T16:00:00Z',
                   '{"home_goals":1,"away_goals":1,"outcome":"D"}')`,
        [COMPETITION, FINALS_SEASON]
      );

      const { unlistedFixtures } = await fetchAt(
        FINALS_SEASON,
        "2025-06-09T06:00:00Z",
        {
          ...await listingOf("2025-06-08", FINALS_LISTING),
          [sheetUrl("4444714")]: await archivedBody(FULL_SHEET)
        }
      );

      expect(unlistedFixtures).toEqual([{
        competition: COMPETITION,
        fixtureId: 4444716,
        kickoffAt: new Date("2025-06-08T16:00:00Z"),
        homeTeam: "Norway",
        awayTeam: "Denmark"
      }]);
      // And the Fixture the listing did carry still landed: one unpublished
      // match costs the day nothing but a line.
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from team_match_stats"
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

  test("a game 365Scores dates differently does not join, and is reported",
    async () => {
      // The join is made on the day 365Scores says its own game kicked off
      // and not on the day that was asked for, so a source that moves a match
      // across midnight cannot write a row under a day nothing will look for
      // it on. What it does instead is fail to join, which is reported.
      await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');
      const listing = JSON.parse(await archivedBody(FINALS_LISTING)) as {
        games: { id: number; startTime: string }[];
      };
      listing.games.find((game) => game.id === 4444714)!.startTime =
        "2025-06-09T19:00:00+00:00";

      const { requests, unlistedFixtures } = await fetchAt(
        FINALS_SEASON,
        "2025-06-10T06:00:00Z",
        {
          [listingUrl(COMPETITION, "2025-06-08")]: JSON.stringify(listing),
          [sheetUrl("4444714")]: await archivedBody(FULL_SHEET)
        }
      );

      expect(requests).toEqual([listingUrl(COMPETITION, "2025-06-08")]);
      expect(unlistedFixtures).toMatchObject([{ fixtureId: 4444714 }]);
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from team_match_stats"
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });

  test("the row carries the names the refusal checked, not the sheet's copy",
    async () => {
      // The listing's two names are held against the record before anything
      // is joined; the sheet carries its own copy of them and nothing checks
      // those. One guarded spelling reaches the row, or none does.
      await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');
      const sheet = JSON.parse(await archivedBody(FULL_SHEET)) as {
        games: { homeCompetitor: { name: string } }[];
      };
      sheet.games[0]!.homeCompetitor.name = "Portugal FC";

      await fetchAt(FINALS_SEASON, "2025-06-09T06:00:00Z", {
        ...await listingOf("2025-06-08", FINALS_LISTING),
        [sheetUrl("4444714")]: JSON.stringify(sheet)
      });

      const { rows } = await client.query<{ home_team: string }>(
        "select home_team from team_match_stats"
      );
      expect(rows.map(({ home_team: home }) => home)).toEqual(["Portugal"]);
    });

  test("a sheet answered for another match is refused, not stored", async () => {
    // Both bodies are real recordings: the sheet asked for is the Final's and
    // the one that comes back is Spain-Switzerland's. Keyed by the id the row
    // carries, it would land as the Final's shots and xG with nothing to
    // point at it; keyed by the id that was asked for, it would be worse.
    await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');

    const thrown = await fetchAt(
      FINALS_SEASON,
      "2025-06-09T06:00:00Z",
      {
        ...await listingOf("2025-06-08", FINALS_LISTING),
        [sheetUrl("4444714")]: await archivedBody(HOLE_SHEET)
      }
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Scores365ValidationError);
    expect((thrown as Error).message).toMatch(/4444714.*4051269/);
    const { rows } = await client.query<{ count: string }>(
      "select count(*) from team_match_stats"
    );
    expect(Number(rows[0]!.count)).toBe(0);
  });

  test("a hole is stored, asked again the next morning, and filled", async () => {
    await storeTheFinals('{"home_goals":2,"away_goals":2,"outcome":"D"}');
    const listing = await listingOf("2025-06-08", FINALS_LISTING);
    const full = await archivedBody(FULL_SHEET);
    // The recorded hole, in the sheet of a match the recorded listing holds:
    // the two "Expected Goals" rows are taken out of a real sheet, which is
    // the shape the Spain-Switzerland recording proves 365Scores really
    // publishes.
    const sheet = JSON.parse(full) as {
      statistics: { name: string }[];
    };
    sheet.statistics = sheet.statistics
      .filter((row) => row.name !== "Expected Goals");

    await fetchAt(FINALS_SEASON, "2025-06-09T06:00:00Z", {
      ...listing,
      [sheetUrl("4444714")]: JSON.stringify(sheet)
    });

    const holed = await client.query(
      `select home_shots, home_xg, away_xg from team_match_stats`
    );
    expect(holed.rows).toEqual([{
      home_shots: 7, home_xg: null, away_xg: null
    }]);

    const { requests } = await fetchAt(
      FINALS_SEASON,
      "2025-06-10T06:00:00Z",
      { ...listing, [sheetUrl("4444714")]: full }
    );

    expect(requests).toContain(sheetUrl("4444714"));
    const filled = await client.query(
      "select home_xg, away_xg from team_match_stats"
    );
    expect(filled.rows).toEqual([{ home_xg: "1.02", away_xg: "2.06" }]);

    // And once it is filled the day is not asked about again -- not the
    // sheet, and not the listing either. The retry is what a hole costs, not
    // what every settled Fixture costs for the rest of the Season.
    const third = await fetchAt(
      FINALS_SEASON,
      "2025-06-11T06:00:00Z",
      { ...listing, [sheetUrl("4444714")]: full }
    );
    expect(third.requests).toEqual([]);
  });

  test("a score 365Scores does not agree with is reported, and changes nothing",
    async () => {
      // The second source ADR-0056 asks for, doing the one thing it is for.
      // Neither result moves: a disagreement is a thing for a human to read,
      // and a fetch that picked a winner would decide a Gameweek's scoring on
      // the source that happened to be read second.
      await storeTheFinals('{"home_goals":2,"away_goals":1,"outcome":"H"}');

      const { disagreements } = await fetchAt(
        FINALS_SEASON,
        "2025-06-09T06:00:00Z",
        {
          ...await listingOf("2025-06-08", FINALS_LISTING),
          [sheetUrl("4444714")]: await archivedBody(FULL_SHEET)
        }
      );

      expect(disagreements).toEqual([{
        competition: COMPETITION,
        fixtureId: 4444714,
        kickoffAt: new Date("2025-06-08T19:00:00Z"),
        homeTeam: "Portugal",
        awayTeam: "Spain",
        stored: "2-1",
        reported: "2-2"
      }]);
      const { rows } = await client.query(
        "select result from fixtures where fixture_id = 4444714"
      );
      expect(rows[0]).toEqual({
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });
      // The shots and xG still landed: the sheet is not in dispute.
      const stats = await client.query<{ count: string }>(
        "select count(*) from team_match_stats"
      );
      expect(Number(stats.rows[0]!.count)).toBe(1);
    });
});

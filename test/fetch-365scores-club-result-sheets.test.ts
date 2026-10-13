import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  ClubResultSheetsFetchError,
  fetchClubResultSheets
} from "../src/365scores/fetch-club-results.js";
import { sheetUrl } from "../src/365scores/fetch-match-stats.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";

/**
 * Recorded sheets keyed by URL: `UCL` `MD1`'s 18, every one with xG, and a
 * Czech league match's, read 2026-10-13 with shots and no xG.
 */
const SHEETS = [
  "365scores-UCL-MD1-recorded-2026-10-12.json.gz",
  "365scores-UCL-club-sheet-4743886-zlin-slavia-no-xg-recorded-2026-10-13.json.gz"
];

const recorded = async (): Promise<Record<string, string>> => Object.assign(
  {},
  ...await Promise.all(SHEETS.map(async (name) =>
    JSON.parse(await archivedBody(name)) as Record<string, string>))
);

// ADR-0063 as amended 2026-10-13, ticket 0111. Called with `UCL` because its
// maps are the reviewed ones that exist; which cups the daily fetch calls it
// for is the renderer's constant, not this function's business.
describe("a club cup's history rows read their 365Scores sheets", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    await client.query(
      "insert into competitions (competition, season) values ('UCL', $1)",
      [SEASON]
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('UCL', $1, 1, '2026-09-08T14:45:00Z')`,
      [SEASON]
    );
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, home_team, away_team,
         kickoff_at, group_name, result
       ) values ('UCL', $1, 1, 1, 'Slavia Praha', 'Lens',
                 '2026-09-10T19:00:00Z', 'League',
                 '{"home_goals":2,"away_goals":3,"outcome":"A"}')`,
      [SEASON]
    );

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query("truncate raw_snapshots, club_results");
    await client.query(
      `insert into club_results (
         source, source_match_id, kicked_off_at, home_team, away_team,
         home_goals, away_goals, competition_name
       ) values
         ('365scores', '4828485', '2026-09-10T19:00:00Z', 'Slavia Praha',
          'Lens', 2, 3, 'UEFA Champions League'),
         ('365scores', '4743886', '2026-10-09T16:00:00Z', 'Zlin',
          'Slavia Praha', 0, 1, 'Chance Liga'),
         -- Under a day old on the first morning below.
         ('365scores', '4743877', '2026-10-10T13:00:00Z', 'Slavia Praha',
          'Bohemians', 3, 0, 'Chance Liga'),
         -- Touches no side of the cup.
         ('365scores', '4743001', '2026-09-20T13:00:00Z', 'Zlin',
          'Teplice', 1, 1, 'Chance Liga')`
    );
  });

  const readOn = async (
    now: string,
    bodyByUrl: Record<string, string>,
    status = 200
  ): Promise<{ requests: string[]; failure: unknown }> => {
    const requests: string[] = [];
    const failure = await fetchClubResultSheets({
      database: client,
      competition: "UCL",
      season: SEASON,
      http: async (url) => {
        requests.push(url);
        const body = bodyByUrl[url];
        return body === undefined
          ? { status: 404, body: "" }
          : { status, body };
      },
      now: () => new Date(now),
      pause: async () => {}
    }).then(() => null, (error: unknown) => error);
    return { requests, failure };
  };

  const stored = async () => (await client.query(
    `select source_match_id, home_shots, away_shots, home_shots_on_target,
            away_shots_on_target, home_xg::float8 as home_xg,
            away_xg::float8 as away_xg, sheet_read_at
       from club_results order by kicked_off_at`
  )).rows;

  test("stores a day-old row's figures, and a sheet without xG as read",
    async () => {
      const { requests, failure } =
        await readOn("2026-10-10T17:00:00Z", await recorded());

      expect(failure).toBeNull();
      expect(requests).toEqual([sheetUrl("4828485"), sheetUrl("4743886")]);
      const read = new Date("2026-10-10T17:00:00Z");
      expect(await stored()).toEqual([
        {
          source_match_id: "4828485",
          home_shots: expect.any(Number),
          away_shots: expect.any(Number),
          home_shots_on_target: expect.any(Number),
          away_shots_on_target: expect.any(Number),
          home_xg: 1.58,
          away_xg: 1.78,
          sheet_read_at: read
        },
        {
          source_match_id: "4743001",
          home_shots: null, away_shots: null, home_shots_on_target: null,
          away_shots_on_target: null, home_xg: null, away_xg: null,
          sheet_read_at: null
        },
        {
          source_match_id: "4743886",
          home_shots: 4, away_shots: 19, home_shots_on_target: 1,
          away_shots_on_target: 3, home_xg: null, away_xg: null,
          sheet_read_at: read
        },
        {
          source_match_id: "4743877",
          home_shots: null, away_shots: null, home_shots_on_target: null,
          away_shots_on_target: null, home_xg: null, away_xg: null,
          sheet_read_at: null
        }
      ]);
      // Both read sheets are archived under the cup they were read for.
      const archived = await client.query(
        "select source from raw_snapshots order by source"
      );
      expect(archived.rows.map(({ source }) => source)).toEqual([
        "365scores:2026-27:UCL:stats:4743886",
        "365scores:2026-27:UCL:stats:4828485"
      ]);

      // A sheet without xG is final: the next morning asks only for the row
      // that has come of age.
      expect((await readOn("2026-10-11T17:00:00Z", await recorded())).requests)
        .toEqual([sheetUrl("4743877")]);
    });

  test("leaves a row whose request failed unread, and reads it next day",
    async () => {
      const bodies = await recorded();

      const { failure } = await readOn("2026-10-10T17:00:00Z", bodies, 503);
      expect(failure).toBeInstanceOf(ClubResultSheetsFetchError);
      expect(String(failure)).toContain(
        "Competition UCL: no 365Scores sheet read for games 4828485, 4743886"
      );
      expect((await stored()).every((row) => row.sheet_read_at === null))
        .toBe(true);

      expect((await readOn("2026-10-11T06:00:00Z", bodies)).requests)
        .toEqual([sheetUrl("4828485"), sheetUrl("4743886")]);
    });

  test("refuses by name a sheet whose sides are not its row's", async () => {
    await client.query(
      `update club_results set home_team = 'Lens', away_team = 'Slavia Praha'
        where source_match_id = '4828485'`
    );

    const { failure } = await readOn("2026-10-10T17:00:00Z", await recorded());

    expect(failure).toBeInstanceOf(ClubResultSheetsFetchError);
    expect(String((failure as AggregateError).errors[0]))
      .toContain("365scores:2026-27:UCL:stats:4828485");
    // The other row still lands.
    expect((await stored()).map((row) => row.sheet_read_at !== null))
      .toEqual([false, false, true, false]);
  });
});

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
 * Recorded sheets keyed by URL: `UEL` `MD1`'s 18, every one with xG, and two
 * of Sparta Praha's league matches, read 2026-10-13 with shots and no xG.
 */
const SHEETS = [
  "365scores-UEL-MD1-recorded-2026-10-13.json.gz",
  "365scores-UEL-club-sheets-sparta-no-xg-recorded-2026-10-13.json.gz"
];

const recorded = async (): Promise<Record<string, string>> => Object.assign(
  {},
  ...await Promise.all(SHEETS.map(async (name) =>
    JSON.parse(await archivedBody(name)) as Record<string, string>))
);

// ADR-0063 as amended 2026-10-13, tickets 0111 and 0107.
describe("a club cup's history rows read their 365Scores sheets", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    await client.query(
      "insert into competitions (competition, season) values ('UEL', $1)",
      [SEASON]
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('UEL', $1, 1, '2026-09-16T14:45:00Z')`,
      [SEASON]
    );
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, home_team, away_team,
         kickoff_at, group_name, result
       ) values ('UEL', $1, 1, 1, 'Ararat-Armenia', 'Sparta Praha',
                 '2026-09-16T16:45:00Z', 'League',
                 '{"home_goals":1,"away_goals":4,"outcome":"A"}')`,
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
         ('365scores', '4828764', '2026-09-16T16:45:00Z', 'Ararat-Armenia',
          'Sparta Praha', 1, 4, 'UEFA Europa League'),
         ('365scores', '4743899', '2026-10-09T16:00:00Z', 'Sigma Olomouc',
          'Sparta Praha', 0, 3, 'Chance Liga'),
         -- Under a day old on the first morning below.
         ('365scores', '4743888', '2026-10-10T13:00:00Z', 'Sparta Praha',
          'Pardubice', 2, 0, 'Chance Liga'),
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
      competition: "UEL",
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
      expect(requests).toEqual([sheetUrl("4828764"), sheetUrl("4743899")]);
      const read = new Date("2026-10-10T17:00:00Z");
      expect(await stored()).toEqual([
        {
          source_match_id: "4828764",
          home_shots: 13, away_shots: 23, home_shots_on_target: 2,
          away_shots_on_target: 8, home_xg: 1.92, away_xg: 2.62,
          sheet_read_at: read
        },
        {
          source_match_id: "4743001",
          home_shots: null, away_shots: null, home_shots_on_target: null,
          away_shots_on_target: null, home_xg: null, away_xg: null,
          sheet_read_at: null
        },
        {
          source_match_id: "4743899",
          home_shots: 12, away_shots: 21, home_shots_on_target: 4,
          away_shots_on_target: 5, home_xg: null, away_xg: null,
          sheet_read_at: read
        },
        {
          source_match_id: "4743888",
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
        "365scores:2026-27:UEL:stats:4743899",
        "365scores:2026-27:UEL:stats:4828764"
      ]);

      // A sheet without xG is final: the next morning asks only for the row
      // that has come of age.
      expect((await readOn("2026-10-11T17:00:00Z", await recorded())).requests)
        .toEqual([sheetUrl("4743888")]);
    });

  test("leaves a row whose request failed unread, and reads it next day",
    async () => {
      const bodies = await recorded();

      const { failure } = await readOn("2026-10-10T17:00:00Z", bodies, 503);
      expect(failure).toBeInstanceOf(ClubResultSheetsFetchError);
      expect(String(failure)).toContain(
        "Competition UEL: no 365Scores sheet read for games 4828764, 4743899"
      );
      expect((await stored()).every((row) => row.sheet_read_at === null))
        .toBe(true);

      expect((await readOn("2026-10-11T06:00:00Z", bodies)).requests)
        .toEqual([sheetUrl("4828764"), sheetUrl("4743899")]);
    });

  test("refuses by name a sheet whose sides are not its row's", async () => {
    await client.query(
      `update club_results set home_team = 'Sparta Praha',
              away_team = 'Ararat-Armenia'
        where source_match_id = '4828764'`
    );

    const { failure } = await readOn("2026-10-10T17:00:00Z", await recorded());

    expect(failure).toBeInstanceOf(ClubResultSheetsFetchError);
    expect(String((failure as AggregateError).errors[0]))
      .toContain("365scores:2026-27:UEL:stats:4828764");
    // The other row still lands.
    expect((await stored()).map((row) => row.sheet_read_at !== null))
      .toEqual([false, false, true, false]);
  });

  test("refuses by name a cup whose history lines carry no figures",
    async () => {
      // `UCL`'s are frozen scores-only (ADR-0026), so its sheets are never
      // asked for, whoever calls.
      const requests: string[] = [];
      await expect(fetchClubResultSheets({
        database: client,
        competition: "UCL",
        season: SEASON,
        http: async (url) => {
          requests.push(url);
          return { status: 404, body: "" };
        },
        now: () => new Date("2026-10-10T17:00:00Z"),
        pause: async () => {}
      })).rejects.toThrow(/Competition UCL/);
      expect(requests).toEqual([]);
    });
});

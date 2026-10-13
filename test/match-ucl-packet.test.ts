import pg from "pg";
import { beforeAll, describe, expect, test } from "vitest";
import {
  buildMatchContext,
  loadMatchContextData
} from "../src/predictions/build-match-context.js";
import { SCORES_365_SOURCE } from "../src/365scores/fetch-match-stats.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const DEADLINE = "2026-09-30T17:30:00Z";
const AFTER_THE_LOCK = "2026-09-30T19:00:00Z";

/** The league phase's one group of 36, as ticket 0100 stores it. */
const CLUBS = [
  "Arsenal",
  "Bayern München",
  ...Array.from({ length: 34 }, (_, index) =>
    `Club ${String(index + 3).padStart(2, "0")}`)
];

/** `MD1`: each of the first 18 at home to the side 18 places on. */
const MD1 = Array.from({ length: 18 }, (_, index) => ({
  fixtureId: 2050001 + index,
  home: CLUBS[index]!,
  away: CLUBS[index + 18]!,
  kickoff: index < 9 ? "2026-09-16T19:00:00Z" : "2026-09-17T19:00:00Z",
  homeGoals: index % 3,
  awayGoals: (index + 1) % 3
}));

// ADR-0063 *The packet* and ticket 0105: a `UCL` Gameweek 2 packet over the
// rows a real one is built from, read through the loader and rendered whole.
describe("a UCL Gameweek 2 packet", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let packet: string;
  let data: Awaited<ReturnType<typeof loadMatchContextData>>;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    await client.query(
      "insert into competitions (competition, season) values ('UCL', $1)",
      [SEASON]
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at) values
         ('UCL', $1, 1, '2026-09-16T10:45:00Z'), ('UCL', $1, 2, $2)`,
      [SEASON, DEADLINE]
    );
    for (const match of MD1) {
      await client.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, home_team, away_team,
           kickoff_at, group_name, result
         ) values ('UCL', $1, $2, 1, $3, $4, $5, 'League', $6)`,
        [SEASON, match.fixtureId, match.home, match.away, match.kickoff,
          JSON.stringify({
            home_goals: match.homeGoals,
            away_goals: match.awayGoals,
            outcome: match.homeGoals > match.awayGoals
              ? "H"
              : match.homeGoals === match.awayGoals ? "D" : "A"
          })]
      );
      await client.query(
        `insert into team_match_stats (
           season, competition, source, source_match_id, kicked_off_at,
           home_team, away_team, home_shots, away_shots,
           home_shots_on_target, away_shots_on_target, home_xg, away_xg
         ) values ($1, 'UCL', $2, $3, $4, $5, $6, 12, 8, 5, 3, 1.25, 0.75)`,
        [SEASON, SCORES_365_SOURCE, String(match.fixtureId), match.kickoff,
          match.home, match.away]
      );
    }
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, home_team, away_team,
         kickoff_at, group_name, result
       ) values
         ('UCL', $1, 2050101, 2, 'Arsenal', 'Bayern München', $2, 'League',
          null),
         -- Settled after the Lock, with its sheet: nothing of it may render.
         ('UCL', $1, 2050102, 2, 'Club 05', 'Club 06', $2, 'League',
          '{"home_goals":9,"away_goals":9,"outcome":"D"}')`,
      [SEASON, AFTER_THE_LOCK]
    );
    await client.query(
      `insert into team_match_stats (
         season, competition, source, source_match_id, kicked_off_at,
         home_team, away_team, home_shots, away_shots,
         home_shots_on_target, away_shots_on_target, home_xg, away_xg
       ) values ($1, 'UCL', $2, '2050102', $3, 'Club 05', 'Club 06',
                 99, 99, 99, 99, 9.99, 9.99)`,
      [SEASON, SCORES_365_SOURCE, AFTER_THE_LOCK]
    );
    await client.query(
      `insert into club_results (
         source, source_match_id, kicked_off_at, home_team, away_team,
         home_goals, away_goals, competition_name
       ) values
         ('365scores', '1', '2026-09-16T19:00:00Z', 'Arsenal', 'Club 19', 0, 1,
          'Champions League'),
         ('365scores', '2', '2026-09-20T14:00:00Z', 'Arsenal', 'Fulham', 2, 0,
          'Premier League'),
         ('365scores', '3', '2026-09-27T13:30:00Z', 'Bayern München',
          'FC Augsburg', 3, 1, 'Bundesliga'),
         ('365scores', '5', '2026-09-23T19:00:00Z', 'Arsenal', 'Brentford', 1, 0,
          'EFL Cup'),
         ('365scores', '6', '2026-09-26T14:00:00Z', 'Chelsea', 'Arsenal', 1, 1,
          'Premier League'),
         ('365scores', '7', '2026-09-13T14:00:00Z', 'Arsenal', 'Everton', 3, 0,
          'Premier League'),
         ('365scores', '8', '2026-09-06T14:00:00Z', 'Arsenal', 'Wolves', 2, 2,
          'Premier League'),
         ('365scores', '9', '2026-09-16T19:00:00Z', 'Bayern München', 'Club 20',
          1, 2, 'Champions League'),
         ('365scores', '10', '2026-09-20T13:30:00Z', 'Bayern München',
          'Stuttgart', 2, 0, 'Bundesliga'),
         ('365scores', '11', '2026-09-23T18:45:00Z', 'Bayern München',
          'Mainz', 4, 0, 'DFB-Pokal'),
         ('365scores', '12', '2026-09-13T13:30:00Z', 'Köln', 'Bayern München',
          0, 3, 'Bundesliga'),
         ('365scores', '4', $1, 'Arsenal', 'Spurs', 9, 9, 'Premier League')`,
      [AFTER_THE_LOCK]
    );
    // Read for `UEL` (ADR-0063 as amended 2026-10-13): a `UCL` line prints
    // its score alone all the same.
    await client.query(
      `update club_results
          set home_shots = 15, away_shots = 4, home_shots_on_target = 6,
              away_shots_on_target = 1, home_xg = 2.10, away_xg = 0.30,
              sheet_read_at = '2026-09-21T06:00:00Z'
        where source_match_id = '2'`
    );
    await client.query(
      `insert into club_head_coaches (
         team, observed_on, observed_at, head_coach
       ) values
         -- Snapshots A, B, B: one Change, dated the morning B was first read.
         ('Arsenal', '2026-09-27', '2026-09-27T06:00:00Z', 'Interim Coach'),
         ('Arsenal', '2026-09-28', '2026-09-28T06:00:00Z', 'Mikel Arteta'),
         ('Arsenal', '2026-09-29', '2026-09-29T06:00:00Z', 'Mikel Arteta'),
         ('Bayern München', '2026-09-29', '2026-09-29T06:00:00Z',
          'Vincent Kompany'),
         ('Bayern München', '2026-09-30', $1, 'After The Lock')`,
      [AFTER_THE_LOCK]
    );

    data = await loadMatchContextData(client, "UCL", SEASON, 2);
    packet = buildMatchContext(
      {
        fixture_id: 2050101,
        home_team: "Arsenal",
        away_team: "Bayern München",
        kickoff_at: new Date(AFTER_THE_LOCK)
      },
      data
    );

    return async () => {
      await client.end();
    };
  });

  test("shows its sections in the template's order", () => {
    const order = [
      "Predict this UEFA Champions League Fixture.",
      "League phase and recent matches as of 2026-09-30T17:30:00.000Z",
      "League table (results through 2026-09-17):",
      "Places 1-8 go to the round of 16",
      "This cup's played Fixtures",
      "Arsenal\nLast 5 competitive matches:",
      "Squad changes: not read for this Competition",
      "Arsenal\nHead Coach: Mikel Arteta"
    ].map((heading) => [heading, packet.indexOf(heading)] as const);
    expect(order.filter(([, at]) => at === -1)).toEqual([]);
    expect(order.map(([, at]) => at))
      .toEqual(order.map(([, at]) => at).toSorted((a, b) => a - b));
    // Availability is silent for every Competition but the Premier League.
    expect(packet).not.toContain("FPL-derived player context");
  });

  test("tables all 36 sides on MD1's 18 results", () => {
    const rows = packet.split("\n").filter((line) => /^\d+\. .* \| P /.test(line));
    expect(rows).toHaveLength(36);
    expect(rows.every((row) => row.includes("| P 1 "))).toBe(true);
  });

  test("lists MD1's 18 played Fixtures, each with its shots and xG", () => {
    const played = packet.split("\n").filter((line) =>
      line.includes("shots 12-8, on target 5-3, xG 1.25-0.75"));
    expect(played).toHaveLength(18);
  });

  test("shows five recent matches a side, newest first, scores only", () => {
    expect(packet).toContain([
      "Arsenal",
      "Last 5 competitive matches:",
      "- Premier League | 2026-09-26 | Chelsea 1-1 Arsenal",
      "- EFL Cup | 2026-09-23 | Arsenal 1-0 Brentford",
      "- Premier League | 2026-09-20 | Arsenal 2-0 Fulham",
      "- Champions League | 2026-09-16 | Arsenal 0-1 Club 19",
      "- Premier League | 2026-09-13 | Arsenal 3-0 Everton",
      "",
      "Bayern München",
      "Last 5 competitive matches:",
      "- Bundesliga | 2026-09-27 | Bayern München 3-1 FC Augsburg",
      "- DFB-Pokal | 2026-09-23 | Bayern München 4-0 Mainz",
      "- Bundesliga | 2026-09-20 | Bayern München 2-0 Stuttgart",
      "- Champions League | 2026-09-16 | Bayern München 1-2 Club 20",
      "- Bundesliga | 2026-09-13 | Köln 0-3 Bayern München"
    ].join("\n"));
  });

  test("reads a club result's sheet figures, and prints none of them", () => {
    expect(data.clubResults.find((row) => row.source_match_id === "2"))
      .toMatchObject({
        home_shots: 15, away_shots: 4, home_shots_on_target: 6,
        away_shots_on_target: 1, home_xg: 2.1, away_xg: 0.3,
        sheet_read_at: new Date("2026-09-21T06:00:00Z")
      });
    expect(packet).toContain(
      "- Premier League | 2026-09-20 | Arsenal 2-0 Fulham\n"
    );
    expect(packet).not.toContain("2.10");
  });

  test("shows a Head Coach line a side and a dated Change", () => {
    expect(packet).toContain("no appointment date");
    expect(packet).toContain([
      "Arsenal",
      "Head Coach: Mikel Arteta",
      "Change: Interim Coach to Mikel Arteta, first read 28 Sep 2026",
      "",
      "Bayern München",
      "Head Coach: Vincent Kompany"
    ].join("\n"));
  });

  test("reaches nothing stored after the Lock", () => {
    for (const unseen of ["9-9", "9.99", "Spurs", "After The Lock"]) {
      expect([unseen, packet.includes(unseen)]).toEqual([unseen, false]);
    }
  });
});

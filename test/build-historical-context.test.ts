import { describe, expect, test } from "vitest";
import {
  buildHistoricalContext,
  type HistoricalMatch
} from "../src/context/build-historical-context.js";
import { archivedBody } from "./archived-fixture.js";

/**
 * The archived 2025-26 football-data division, as the rows the prediction path
 * stores: only the columns a record line is built from.
 */
async function archivedSeason(
  name: string,
  division: HistoricalMatch["division"]
): Promise<HistoricalMatch[]> {
  const [header = "", ...rows] = (await archivedBody(name)).trim().split(/\r?\n/);
  const columns = header.split(",");
  const field = (fields: string[], column: string): string =>
    fields[columns.indexOf(column)] ?? "";
  return rows
    .map((row) => row.split(","))
    .filter((fields) => field(fields, "HomeTeam") !== "")
    .map((fields) => {
      const [day, month, year] = field(fields, "Date").split("/");
      return {
        season: "2025-26",
        division,
        played_on: new Date(`${year}-${month}-${day}T00:00:00.000Z`),
        home_team: field(fields, "HomeTeam"),
        away_team: field(fields, "AwayTeam"),
        home_goals: Number(field(fields, "FTHG")),
        away_goals: Number(field(fields, "FTAG"))
      };
    });
}

function match(
  season: string,
  division: HistoricalMatch["division"],
  playedOn: string,
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,
  awayGoals: number,
  signals: Partial<HistoricalMatch> = {}
): HistoricalMatch {
  return {
    season,
    division,
    played_on: new Date(`${playedOn}T00:00:00.000Z`),
    home_team: homeTeam,
    away_team: awayTeam,
    home_goals: homeGoals,
    away_goals: awayGoals,
    ...signals
  };
}

describe("building historical Match context", () => {
  test("uses one cross-Season form path for a promoted side in Gameweek 1", () => {
    const matches = [
      match("2024-25", "Premier League", "2025-05-01", "Arsenal", "Chelsea", 1, 0),
      match("2025-26", "Premier League", "2025-08-10", "Arsenal", "Chelsea", 2, 0),
      match("2025-26", "Premier League", "2025-08-17", "Liverpool", "Arsenal", 1, 1),
      match("2025-26", "Premier League", "2026-04-01", "Arsenal", "Everton", 3, 1),
      match("2025-26", "Premier League", "2026-05-01", "Tottenham", "Arsenal", 0, 1),
      match("2024-25", "Championship", "2025-05-02", "Coventry", "Stoke", 1, 1),
      match("2025-26", "Championship", "2025-08-01", "Coventry", "Hull", 1, 0),
      match("2025-26", "Championship", "2025-08-08", "Ipswich", "Coventry", 2, 2),
      match("2025-26", "Championship", "2026-04-01", "Coventry", "Wrexham", 2, 1),
      match("2025-26", "Championship", "2026-05-01", "Watford", "Coventry", 0, 3),
      match("2026-27", "Premier League", "2026-08-10", "Fulham", "Arsenal", 0, 2)
    ];

    expect(buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      matches
    })).toBe([
      "Historical context as of 2026-08-21T17:30:00.000Z",
      "",
      "Premier League table (results through 2026-08-10):",
      "1. Arsenal — Pld 1, W 1, D 0, L 0, GF 2, GA 0, Pts 3",
      "2. Fulham — Pld 1, W 0, D 0, L 1, GF 0, GA 2, Pts 0",
      "",
      "Arsenal",
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.",
      "Prior-Season points per game: 2.50 overall, 3.00 home, 2.00 away.",
      "Current-Season overall: 1 played, 1W 0D 0L, GF 2, GA 0, "
        + "shots unavailable, on target unavailable, xG unavailable.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: 1 played, 1W 0D 0L, GF 2, GA 0, "
        + "shots unavailable, on target unavailable, xG unavailable.",
      "Last five matches played:",
      "- 2026-27 Premier League | 2026-08-10 | Fulham 0-2 Arsenal | W"
        + " | xG unavailable",
      "- 2025-26 Premier League | 2026-05-01 | Tottenham 0-1 Arsenal | W"
        + " | xG unavailable",
      "- 2025-26 Premier League | 2026-04-01 | Arsenal 3-1 Everton | W"
        + " | xG unavailable",
      "- 2025-26 Premier League | 2025-08-17 | Liverpool 1-1 Arsenal | D"
        + " | xG unavailable",
      "- 2025-26 Premier League | 2025-08-10 | Arsenal 2-0 Chelsea | W"
        + " | xG unavailable",
      "",
      "Coventry City",
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Prior-Season points per game: 2.50 overall, 3.00 home, 2.00 away.",
      "Premier League history: none in stored data; promoted from the Championship.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played:",
      "- 2025-26 Championship | 2026-05-01 | Watford 0-3 Coventry | W"
        + " | xG unavailable",
      "- 2025-26 Championship | 2026-04-01 | Coventry 2-1 Wrexham | W"
        + " | xG unavailable",
      "- 2025-26 Championship | 2025-08-08 | Ipswich 2-2 Coventry | D"
        + " | xG unavailable",
      "- 2025-26 Championship | 2025-08-01 | Coventry 1-0 Hull | W"
        + " | xG unavailable",
      "- 2024-25 Championship | 2025-05-02 | Coventry 1-1 Stoke | D"
        + " | xG unavailable",
      "",
      "Head-to-head history:",
      "No prior meeting in stored data."
    ].join("\n"));
  });

  test("rates both clubs' prior Season, each in its own division", () => {
    // Hand-computed from the rows below. Arsenal: home W D L = 4 pts over 3,
    // away W W L = 6 over 3, overall 10 over 6. Coventry, in the Championship:
    // home W L = 3 over 2, away D W L = 4 over 3, overall 7 over 5.
    const matches = [
      match("2025-26", "Premier League", "2025-08-10", "Arsenal", "Chelsea", 2, 0),
      match("2025-26", "Premier League", "2025-09-10", "Arsenal", "Everton", 1, 1),
      match("2025-26", "Premier League", "2025-10-10", "Arsenal", "Fulham", 0, 1),
      match("2025-26", "Premier League", "2025-11-10", "Liverpool", "Arsenal", 1, 2),
      match("2025-26", "Premier League", "2025-12-10", "Tottenham", "Arsenal", 0, 1),
      match("2025-26", "Premier League", "2026-01-10", "Everton", "Arsenal", 2, 0),
      // Stray second-division rows for a Premier League club: the rate must
      // stay inside the division the position line names.
      match("2025-26", "Championship", "2026-02-01", "Hull", "Arsenal", 2, 0),
      match("2025-26", "Championship", "2026-03-01", "Arsenal", "Stoke", 1, 1),
      match("2025-26", "Championship", "2025-08-01", "Coventry", "Hull", 1, 0),
      match("2025-26", "Championship", "2025-09-01", "Coventry", "Stoke", 1, 2),
      match("2025-26", "Championship", "2025-10-01", "Ipswich", "Coventry", 2, 2),
      match("2025-26", "Championship", "2025-11-01", "Watford", "Coventry", 0, 3),
      match("2025-26", "Championship", "2025-12-01", "Wrexham", "Coventry", 1, 0)
    ];

    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      matches
    });

    expect(context).toContain([
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.",
      "Prior-Season points per game: 1.67 overall, 1.33 home, 2.00 away."
    ].join("\n"));
    // The promoted club's own Championship rates, unnormalised, with the
    // division named only by the line above.
    expect(context).toContain([
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Prior-Season points per game: 1.40 overall, 1.50 home, 1.33 away."
    ].join("\n"));
  });

  test("rates the real stored 2025-26 record, each club in its own division", async () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Tottenham",
      awayTeam: "Coventry City",
      matches: [
        ...await archivedSeason("football-data-2526-E0.csv.gz", "Premier League"),
        ...await archivedSeason("football-data-2526-E1.csv.gz", "Championship")
      ]
    });

    // ADR-0030's motivating figures: 41 points over 38, 15 at home over 19,
    // 26 away over 19 — the away-better-than-home inversion.
    expect(context).toContain([
      "Prior-Season final position: 17th in 2025-26 Premier League; promoted: no.",
      "Prior-Season points per game: 1.08 overall, 0.79 home, 1.37 away."
    ].join("\n"));
    // The promoted club's real Championship season — 95 points over 46 — beside
    // it, unnormalised, with the division named only by the line above.
    expect(context).toContain([
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Prior-Season points per game: 2.07 overall, 2.39 home, 1.74 away."
    ].join("\n"));
  });

  test("states a venue with no stored prior-Season match rather than dividing by zero", () => {
    expect(buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match("2025-26", "Premier League", "2025-08-10", "Arsenal", "Everton", 2, 0)
      ]
    })).toContain(
      "Prior-Season points per game: 3.00 overall, 3.00 home, unavailable away."
    );
  });

  test("carries both sides' shots and xG on a form line", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match(
          "2025-26",
          "Premier League",
          "2026-05-01",
          "Arsenal",
          "Chelsea",
          2,
          1,
          {
            home_shots: 15,
            away_shots: 8,
            home_shots_on_target: 7,
            away_shots_on_target: 3,
            home_xg: 2.1,
            away_xg: 0.85
          }
        )
      ]
    });

    expect(context).toContain(
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 2-1 Chelsea | W"
        + " | shots 15-8, on target 7-3, xG 2.10-0.85"
    );
  });

  test("renders every kind of xG gap identically", () => {
    const shots = {
      home_shots: 19,
      away_shots: 6,
      home_shots_on_target: 8,
      away_shots_on_target: 2
    };
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Coventry City",
      matches: [
        // No xG row at all: an Understat outage, or a Premier League match
        // outside the two Seasons the benchmark fetches.
        match(
          "2025-26",
          "Premier League",
          "2026-05-01",
          "Brentford",
          "Arsenal",
          1,
          0,
          shots
        ),
        // A promoted side's Championship history, which Understat is never
        // asked for.
        match(
          "2025-26",
          "Championship",
          "2026-05-02",
          "Coventry",
          "Hull",
          2,
          0,
          { ...shots, home_xg: null, away_xg: null }
        )
      ]
    });

    expect(context).toContain(
      "- 2025-26 Premier League | 2026-05-01 | Brentford 1-0 Arsenal | L"
        + " | shots 19-6, on target 8-2, xG unavailable"
    );
    expect(context).toContain(
      "- 2025-26 Championship | 2026-05-02 | Coventry 2-0 Hull | W"
        + " | shots 19-6, on target 8-2, xG unavailable"
    );
  });

  test("omits the shot segment rather than printing zeros", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match(
          "2025-26",
          "Premier League",
          "2026-05-01",
          "Arsenal",
          "Chelsea",
          2,
          1,
          { home_xg: 2.1, away_xg: 0.85 }
        )
      ]
    });

    expect(context).toContain(
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 2-1 Chelsea | W"
        + " | xG 2.10-0.85"
    );
    expect(context).not.toContain("shots");
    expect(context).not.toContain("on target");
  });

  test("keeps the head-to-head section score-only and adds no aggregates", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match(
          "2025-26",
          "Premier League",
          "2026-05-01",
          "Arsenal",
          "Everton",
          3,
          1,
          {
            home_shots: 15,
            away_shots: 8,
            home_shots_on_target: 7,
            away_shots_on_target: 3,
            home_xg: 2.1,
            away_xg: 0.85
          }
        )
      ]
    });
    const headToHead = context.slice(context.indexOf("Head-to-head history:"));

    expect(headToHead).toContain(
      "- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Everton"
    );
    expect(headToHead).not.toContain("shots");
    expect(headToHead).not.toContain("xG");
    // Five data points are the Entrant's to read. The Current-Season summary
    // lines stay goals-only: no shot or xG totals anywhere.
    expect(context).toContain(
      "Current-Season overall: no matches played."
    );
    expect(context).not.toContain("shots for");
    expect(context).not.toContain("total xG");
  });

  test("sums shots, on target and xG this-team-first on all three record lines", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        // Home: won and drew.
        match("2026-27", "Premier League", "2026-08-10", "Arsenal", "Chelsea", 3, 1, {
          home_shots: 15, away_shots: 8,
          home_shots_on_target: 7, away_shots_on_target: 3,
          home_xg: 2.1, away_xg: 0.85
        }),
        match("2026-27", "Premier League", "2026-08-12", "Arsenal", "Everton", 2, 2, {
          home_shots: 12, away_shots: 10,
          home_shots_on_target: 5, away_shots_on_target: 4,
          home_xg: 1.5, away_xg: 1.2
        }),
        // Away: won, then a draw whose xG row is missing.
        match("2026-27", "Premier League", "2026-08-14", "Liverpool", "Arsenal", 0, 2, {
          home_shots: 9, away_shots: 14,
          home_shots_on_target: 3, away_shots_on_target: 6,
          home_xg: 1.0, away_xg: 1.8
        }),
        match("2026-27", "Premier League", "2026-08-16", "Tottenham", "Arsenal", 1, 1, {
          home_shots: 11, away_shots: 7,
          home_shots_on_target: 4, away_shots_on_target: 2
        }),
        // Distractors: neither may enter the sums. A current-Season Championship
        // match (wrong division) and a prior-Season Premier League match (wrong
        // Season), both carrying shot data loud enough to shift the totals.
        match("2026-27", "Championship", "2026-08-11", "Arsenal", "Hull", 5, 0, {
          home_shots: 99, away_shots: 99,
          home_shots_on_target: 99, away_shots_on_target: 99,
          home_xg: 9.9, away_xg: 9.9
        }),
        match("2025-26", "Premier League", "2026-05-01", "Arsenal", "Chelsea", 5, 0, {
          home_shots: 99, away_shots: 99,
          home_shots_on_target: 99, away_shots_on_target: 99,
          home_xg: 9.9, away_xg: 9.9
        })
      ]
    });

    // Overall: xG covers 3 of 4 (the Tottenham match has no xG row).
    expect(context).toContain(
      "Current-Season overall: 4 played, 2W 2D 0L, GF 8, GA 4, "
        + "shots 48-38, on target 20-14, xG 5.40-3.05 (over 3 of 4 matches)."
    );
    // Home split: full xG coverage, so no announcement.
    expect(context).toContain(
      "Current-Season home split: 2 played, 1W 1D 0L, GF 5, GA 3, "
        + "shots 27-18, on target 12-7, xG 3.60-2.05."
    );
    // Away split: xG covers 1 of 2.
    expect(context).toContain(
      "Current-Season away split: 2 played, 1W 1D 0L, GF 3, GA 1, "
        + "shots 21-20, on target 8-7, xG 1.80-1.00 (over 1 of 2 matches)."
    );
  });

  test("renders a stat with no covered matches as unavailable", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match("2026-27", "Premier League", "2026-08-10", "Arsenal", "Chelsea", 2, 0, {
          home_shots: 10, away_shots: 5,
          home_shots_on_target: 4, away_shots_on_target: 2
        })
      ]
    });

    expect(context).toContain(
      "Current-Season overall: 1 played, 1W 0D 0L, GF 2, GA 0, "
        + "shots 10-5, on target 4-2, xG unavailable."
    );
  });

  test("renders the table in rule order, dated by its latest result", () => {
    const round = (playedOn: string, ...results: [string, number, number, string][]) =>
      results.map(([home, homeGoals, awayGoals, away]) =>
        match("2026-27", "Premier League", playedOn, home, away, homeGoals, awayGoals)
      );

    expect(buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-31T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        ...round("2026-08-10",
          ["Arsenal", 3, 1, "Chelsea"],
          ["Everton", 2, 0, "Fulham"],
          ["Liverpool", 1, 2, "Tottenham"]),
        ...round("2026-08-17",
          ["Chelsea", 2, 0, "Everton"],
          ["Fulham", 1, 1, "Liverpool"],
          ["Tottenham", 0, 3, "Arsenal"]),
        ...round("2026-08-24",
          ["Arsenal", 1, 1, "Everton"],
          ["Chelsea", 2, 2, "Liverpool"],
          ["Fulham", 1, 1, "Tottenham"]),
        // Distractors: the wrong division and the wrong Season. Neither may
        // enter a row, and the later-dated one may not move the coverage date.
        match("2026-27", "Championship", "2026-08-26", "Hull", "Stoke", 9, 0),
        match("2025-26", "Premier League", "2026-05-01", "Arsenal", "Hull", 9, 0)
      ]
    })).toContain([
      "Historical context as of 2026-08-31T17:30:00.000Z",
      "",
      "Premier League table (results through 2026-08-24):",
      "1. Arsenal — Pld 3, W 2, D 1, L 0, GF 7, GA 2, Pts 7",
      // Chelsea and Everton are level on points and goal difference; Chelsea's
      // goals scored break it. Tottenham trails both on goal difference.
      "2. Chelsea — Pld 3, W 1, D 1, L 1, GF 5, GA 5, Pts 4",
      "3. Everton — Pld 3, W 1, D 1, L 1, GF 3, GA 3, Pts 4",
      "4. Tottenham — Pld 3, W 1, D 1, L 1, GF 3, GA 5, Pts 4",
      // Level on points; goal difference separates them.
      "5. Liverpool — Pld 3, W 0, D 2, L 1, GF 4, GA 5, Pts 2",
      "6. Fulham — Pld 3, W 0, D 2, L 1, GF 2, GA 4, Pts 2",
      "",
      "Arsenal"
    ].join("\n"));
  });

  test("announces an empty table rather than leaving it out", () => {
    // Gameweek 1's normal case, with the prior-Season line still the only
    // position an Entrant is given.
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: [
        match("2025-26", "Premier League", "2026-05-01", "Arsenal", "Everton", 1, 0)
      ]
    });

    expect(context).toContain([
      "Historical context as of 2026-08-21T17:30:00.000Z",
      "",
      "Premier League table: no result has been played yet this Season.",
      "",
      "Arsenal",
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no."
    ].join("\n"));
    expect(context).not.toContain("Current-Season league position");
  });

  test("makes an unresolved Fixture team name visible", () => {
    expect(buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "New Club",
      awayTeam: "Another Club",
      matches: []
    })).toContain([
      "New Club",
      "Historical data status: team name did not resolve against stored results.",
      "Prior-Season final position: no 2025-26 league data.",
      "Premier League history: none in stored data.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played: no stored matches.",
      "",
      "Another Club"
    ].join("\n"));
  });

  test("states genuine absence for known teams without calling it unresolved", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Arsenal",
      awayTeam: "Everton",
      matches: []
    });

    expect(context).toContain("Last five matches played: no stored matches.");
    expect(context).not.toContain(
      "Historical data status: team name did not resolve against stored results."
    );
  });

  test("accepts an unreviewed team name that exactly matches stored results", () => {
    const context = buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "Future Town",
      awayTeam: "Arsenal",
      matches: [
        match(
          "2025-26",
          "Championship",
          "2026-05-02",
          "Future Town",
          "Hull",
          2,
          0
        )
      ]
    });

    expect(context).toContain(
      "- 2025-26 Championship | 2026-05-02 | Future Town 2-0 Hull | W"
    );
    expect(context).not.toContain(
      "Historical data status: team name did not resolve against stored results."
    );
  });
});

import { describe, expect, test } from "vitest";
import {
  buildHistoricalContext,
  type HistoricalMatch
} from "../src/context/build-historical-context.js";

function match(
  season: string,
  division: HistoricalMatch["division"],
  playedOn: string,
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,
  awayGoals: number
): HistoricalMatch {
  return {
    season,
    division,
    played_on: new Date(`${playedOn}T00:00:00.000Z`),
    home_team: homeTeam,
    away_team: awayTeam,
    home_goals: homeGoals,
    away_goals: awayGoals
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
      "Arsenal",
      "Current-Season league position: 1st in Premier League.",
      "Prior-Season final position: 1st in 2025-26 Premier League; promoted: no.",
      "Current-Season overall: 1 played, 1W 0D 0L, GF 2, GA 0.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: 1 played, 1W 0D 0L, GF 2, GA 0.",
      "Last five matches played:",
      "- 2026-27 Premier League | 2026-08-10 | Fulham 0-2 Arsenal | W",
      "- 2025-26 Premier League | 2026-05-01 | Tottenham 0-1 Arsenal | W",
      "- 2025-26 Premier League | 2026-04-01 | Arsenal 3-1 Everton | W",
      "- 2025-26 Premier League | 2025-08-17 | Liverpool 1-1 Arsenal | D",
      "- 2025-26 Premier League | 2025-08-10 | Arsenal 2-0 Chelsea | W",
      "",
      "Coventry City",
      "Current-Season league position: no current-Season table yet.",
      "Prior-Season final position: 1st in 2025-26 Championship; promoted: yes.",
      "Premier League history: none in stored data; promoted from the Championship.",
      "Current-Season overall: no matches played.",
      "Current-Season home split: no home matches played.",
      "Current-Season away split: no away matches played.",
      "Last five matches played:",
      "- 2025-26 Championship | 2026-05-01 | Watford 0-3 Coventry | W",
      "- 2025-26 Championship | 2026-04-01 | Coventry 2-1 Wrexham | W",
      "- 2025-26 Championship | 2025-08-08 | Ipswich 2-2 Coventry | D",
      "- 2025-26 Championship | 2025-08-01 | Coventry 1-0 Hull | W",
      "- 2024-25 Championship | 2025-05-02 | Coventry 1-1 Stoke | D",
      "",
      "Head-to-head history:",
      "No prior meeting in stored data."
    ].join("\n"));
  });

  test("states every historical absence instead of rendering an empty field", () => {
    expect(buildHistoricalContext({
      season: "2026-27",
      asOf: new Date("2026-08-21T17:30:00.000Z"),
      homeTeam: "New Club",
      awayTeam: "Another Club",
      matches: []
    })).toContain([
      "New Club",
      "Current-Season league position: no current-Season table yet.",
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
});

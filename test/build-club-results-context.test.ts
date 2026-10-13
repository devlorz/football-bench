import { describe, expect, test } from "vitest";
import {
  buildClubResultsContext,
  type ClubResult,
  historyCarriesFigures
} from "../src/context/build-club-results-context.js";

const AS_OF = new Date("2026-10-15T15:15:00Z");

const UNREAD = {
  home_shots: null,
  away_shots: null,
  home_shots_on_target: null,
  away_shots_on_target: null,
  home_xg: null,
  away_xg: null,
  sheet_read_at: null
};

const result = (
  id: string,
  kickedOffAt: string,
  home: string,
  away: string,
  sheet: Partial<ClubResult> = {}
): ClubResult => ({
  source_match_id: id,
  kicked_off_at: new Date(kickedOffAt),
  home_team: home,
  away_team: away,
  home_goals: 2,
  away_goals: 1,
  competition_name: "Super League",
  ...UNREAD,
  ...sheet
});

/** Lyon's five, each the case a line can be in (ADR-0063 as amended). */
const RESULTS: ClubResult[] = [
  // A full sheet.
  result("1", "2026-10-11T18:00:00Z", "Lyon", "Nantes", {
    home_shots: 12, away_shots: 8, home_shots_on_target: 5,
    away_shots_on_target: 3, home_xg: 1.25, away_xg: 0.75,
    sheet_read_at: new Date("2026-10-12T06:00:00Z")
  }),
  // A sheet with shots and no xG: read, and final.
  result("2", "2026-10-08T18:00:00Z", "Slavia Praha", "Lyon", {
    home_shots: 14, away_shots: 9, home_shots_on_target: 5,
    away_shots_on_target: 3, sheet_read_at: new Date("2026-10-09T06:00:00Z")
  }),
  // No sheet stored.
  result("3", "2026-10-04T18:00:00Z", "Lyon", "Brest"),
  // A sheet read after the Lock: nothing of it reaches the packet.
  result("4", "2026-10-01T18:00:00Z", "Lyon", "Lens", {
    home_shots: 99, away_shots: 99, home_xg: 9.99, away_xg: 9.99,
    sheet_read_at: new Date("2026-10-15T16:00:00Z")
  }),
  result("5", "2026-09-27T18:00:00Z", "Metz", "Lyon")
];

const render = (competition: string): string => buildClubResultsContext({
  competition,
  asOf: AS_OF,
  homeTeam: "Lyon",
  awayTeam: "Lille",
  results: RESULTS,
  groupFixtures: [],
  playedFixtures: []
});

describe("a club cup's history lines", () => {
  test("carry a UEL line's sheet figures in the played-Fixtures wording", () => {
    expect(render("UEL")).toContain([
      "Lyon",
      "Last 5 competitive matches:",
      "- Super League | 2026-10-11 | Lyon 2-1 Nantes | "
        + "shots 12-8, on target 5-3, xG 1.25-0.75",
      "- Super League | 2026-10-08 | Slavia Praha 2-1 Lyon | "
        + "shots 14-9, on target 5-3, xG unavailable",
      "- Super League | 2026-10-04 | Lyon 2-1 Brest",
      "- Super League | 2026-10-01 | Lyon 2-1 Lens",
      "- Super League | 2026-09-27 | Metz 2-1 Lyon"
    ].join("\n"));
  });

  test("carry UECL's on the same terms", () => {
    expect(render("UECL")).toContain(
      "- Super League | 2026-10-11 | Lyon 2-1 Nantes | "
        + "shots 12-8, on target 5-3, xG 1.25-0.75"
    );
  });

  test("print a UCL line's score alone over the same enriched rows", () => {
    expect(render("UCL")).toContain([
      "Lyon",
      "Last 5 competitive matches:",
      "- Super League | 2026-10-11 | Lyon 2-1 Nantes",
      "- Super League | 2026-10-08 | Slavia Praha 2-1 Lyon",
      "- Super League | 2026-10-04 | Lyon 2-1 Brest",
      "- Super League | 2026-10-01 | Lyon 2-1 Lens",
      "- Super League | 2026-09-27 | Metz 2-1 Lyon",
      ""
    ].join("\n"));
  });

  test("refuse by name a cup that does not say whether it shows figures", () => {
    expect(() => historyCarriesFigures("UXL"))
      .toThrow("Competition UXL does not say whether its history lines "
        + "carry figures");
  });
});

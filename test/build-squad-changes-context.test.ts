import { describe, expect, test } from "vitest";
import {
  buildSquadChangesContext,
  type SquadChangeRow
} from "../src/context/build-squad-changes-context.js";

/** Gameweek 1's deadline: inside the summer gate, as ADR-0031 has it. */
const GAMEWEEK_1 = new Date("2026-08-21T17:30:00Z");

function change(row: Partial<SquadChangeRow>): SquadChangeRow {
  return {
    club: "Spurs",
    direction: "in",
    player: "Player",
    counterpart_club: "Newcastle United",
    fee: null,
    loan: false,
    dated_on: new Date("2026-07-01T00:00:00Z"),
    ...row
  };
}

describe("building the Squad Changes section", () => {
  test("orders by fee, states words after amounts and labels a loan", () => {
    const changes: SquadChangeRow[] = [
      change({
        player: "Senesi",
        counterpart_club: "Bournemouth",
        fee: "Free",
        dated_on: new Date("2026-06-20T00:00:00Z")
      }),
      change({
        player: "Dúbravka",
        counterpart_club: "Burnley",
        fee: "Free",
        dated_on: new Date("2026-07-01T00:00:00Z")
      }),
      change({
        player: "Tonali",
        counterpart_club: "Newcastle United",
        fee: "£92.5m",
        dated_on: new Date("2026-07-06T00:00:00Z")
      }),
      change({
        player: "Mateus Fernandes",
        counterpart_club: "West Ham United",
        fee: "£85m",
        dated_on: new Date("2026-06-05T00:00:00Z")
      }),
      change({
        player: "Robertson",
        counterpart_club: "Liverpool",
        fee: "Undisclosed",
        dated_on: new Date("2026-06-20T00:00:00Z")
      }),
      change({
        club: "Spurs",
        direction: "out",
        player: "Solomon",
        counterpart_club: "West Ham United",
        fee: "£5m",
        dated_on: new Date("2026-07-11T00:00:00Z")
      }),
      change({
        club: "Spurs",
        direction: "out",
        player: "Odobert",
        counterpart_club: "Hull City",
        fee: null,
        loan: true,
        dated_on: new Date("2026-08-02T00:00:00Z")
      }),
      change({
        club: "Brentford",
        direction: "in",
        player: "Somebody Else",
        counterpart_club: "Sunderland",
        fee: "£4m",
        dated_on: new Date("2026-07-02T00:00:00Z")
      })
    ];

    expect(buildSquadChangesContext({
      deadline: GAMEWEEK_1,
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes
    })).toBe([
      "Squad changes since 2 Feb 2026:",
      "",
      "Spurs",
      "In: Tonali (from Newcastle United, £92.5m), "
      + "Mateus Fernandes (from West Ham United, £85m), "
      // Both dated 20 June, so the tie falls to the name and neither word form
      // outranks the other.
      + "Robertson (from Liverpool, undisclosed), "
      + "Senesi (from Bournemouth, free), "
      + "Dúbravka (from Burnley, free)",
      "Out: Solomon (to West Ham United, £5m), "
      + "Odobert (to Hull City) (loan)",
      "",
      "Brentford",
      "In: Somebody Else (from Sunderland, £4m)",
      "Out: none recorded"
    ].join("\n"));
  });

  test("states an empty partition as an absence rather than as no movement", () => {
    expect(buildSquadChangesContext({
      deadline: GAMEWEEK_1,
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: []
    })).toBe([
      "Squad changes since 2 Feb 2026:",
      "",
      "Squad change data status: no Squad Change data stored for this Gameweek."
    ].join("\n"));
  });

  test("carries a Signing dated at the window's open at the gate's last Gameweek", () => {
    // Gameweek 5, the summer gate's last: membership has no recency test, so a
    // 5 June Signing reads exactly as it did at Gameweek 1.
    expect(buildSquadChangesContext({
      deadline: new Date("2026-09-18T17:30:00Z"),
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: [change({
        player: "Mateus Fernandes",
        counterpart_club: "West Ham United",
        fee: "£85m",
        dated_on: new Date("2026-06-05T00:00:00Z")
      })]
    })).toContain(
      "In: Mateus Fernandes (from West Ham United, £85m)"
    );
  });

  test("states the winter window's own membership date", () => {
    // Gameweek 26, the winter gate's last.
    expect(buildSquadChangesContext({
      deadline: new Date("2027-02-20T17:30:00Z"),
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: []
    })).toContain("Squad changes since 1 Sep 2026:");
  });

  describe("the render gate, by arithmetic against the stored deadlines", () => {
    const renders = (deadline: string): boolean =>
      buildSquadChangesContext({
        deadline: new Date(deadline),
        homeTeam: "Spurs",
        awayTeam: "Brentford",
        changes: []
      }) !== undefined;

    test("summer runs through Gameweek 5 and stops at Gameweek 6", () => {
      // Close 2026-09-01: GW5 is +17, GW6 is +39 (ADR-0031).
      expect(renders("2026-09-18T17:30:00Z")).toBe(true);
      expect(renders("2026-10-10T17:30:00Z")).toBe(false);
    });

    test("winter runs through Gameweek 26 and stops at Gameweek 27", () => {
      // Close 2027-02-02: GW26 is +18, GW27 is +25.
      expect(renders("2027-02-20T17:30:00Z")).toBe(true);
      expect(renders("2027-02-27T17:30:00Z")).toBe(false);
    });

    test("Gameweek 19 falls one day inside the winter window and renders", () => {
      // The rule working, not a bug: a near-empty winter section on 2 January
      // is what a window one day old has to say (ADR-0031).
      expect(renders("2027-01-02T17:30:00Z")).toBe(true);
      expect(renders("2026-12-28T17:30:00Z")).toBe(false);
    });
  });
});

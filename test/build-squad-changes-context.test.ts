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
      competition: "PL",
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

  // Migration 0027: a source may file its moves under no date at all, which is
  // every row of the Spanish page. The column has never reached an Entrant, so
  // what a null has to do here is sort without throwing and without moving a
  // dated row.
  test("sorts a move the source dated after every move it did not", () => {
    expect(buildSquadChangesContext({
      competition: "PL",
      deadline: GAMEWEEK_1,
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: [
        change({ player: "Undated", fee: "Free", dated_on: null }),
        change({
          player: "Dated",
          fee: "Free",
          dated_on: new Date("2026-08-02T00:00:00Z")
        })
      ]
    })).toContain(
      "In: Dated (from Newcastle United, free), "
      + "Undated (from Newcastle United, free)"
    );
  });

  // The order a whole undated partition falls back to. A context is hashed and
  // stored as the evidence of what an Entrant was handed, so this has to be
  // the same order every render and not the order the rows arrived in.
  test("orders a partition the source dated none of by player", () => {
    const undated = (player: string): SquadChangeRow =>
      change({ player, fee: null, loan: true, dated_on: null });

    expect(buildSquadChangesContext({
      competition: "PL",
      deadline: GAMEWEEK_1,
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: [undated("Vinícius"), undated("Ancelotti"), undated("Modrić")]
    })).toContain(
      "In: Ancelotti (from Newcastle United) (loan), "
      + "Modrić (from Newcastle United) (loan), "
      + "Vinícius (from Newcastle United) (loan)"
    );
  });

  test("states an empty partition as an absence rather than as no movement", () => {
    expect(buildSquadChangesContext({
      competition: "PL",
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
      competition: "PL",
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
      competition: "PL",
      deadline: new Date("2027-02-20T17:30:00Z"),
      homeTeam: "Spurs",
      awayTeam: "Brentford",
      changes: []
    })).toContain("Squad changes since 1 Sep 2026:");
  });

  // A window is a country's, not the world's. Spain opened its 2026 summer on
  // 1 July where England opened on 15 June, so the same June deadline states
  // one league's movement and not the other's — which is the whole reason the
  // windows are keyed by Competition rather than shared.
  test("gates a June deadline for the Premier League and not for La Liga", () => {
    const renders = (competition: string): boolean =>
      buildSquadChangesContext({
        competition,
        deadline: new Date("2026-06-20T17:30:00Z"),
        homeTeam: "Real Madrid CF",
        awayTeam: "FC Barcelona",
        changes: []
      }) !== undefined;

    expect(renders("PL")).toBe(true);
    expect(renders("PD")).toBe(false);
  });

  test("renders La Liga's movement with the dates its page never stated", () => {
    const undated = (row: Partial<SquadChangeRow>): SquadChangeRow =>
      change({ fee: null, dated_on: null, ...row });

    expect(buildSquadChangesContext({
      competition: "PD",
      deadline: new Date("2026-08-15T16:00:00Z"),
      homeTeam: "Real Madrid CF",
      awayTeam: "FC Barcelona",
      changes: [
        undated({
          club: "FC Barcelona",
          direction: "in",
          player: "Anthony Gordon",
          counterpart_club: "Newcastle United"
        }),
        undated({
          club: "FC Barcelona",
          direction: "out",
          player: "Marcus Rashford",
          counterpart_club: "Manchester United",
          loan: true
        })
      ]
    })).toBe([
      "Squad changes since 2 Feb 2026:",
      "",
      "Real Madrid CF",
      "In: none recorded",
      "Out: none recorded",
      "",
      "FC Barcelona",
      // Every Spanish fee is null because the page carries no fee column at
      // all, so the line states that rather than inventing a word for it.
      "In: Anthony Gordon (from Newcastle United, fee not stated)",
      "Out: Marcus Rashford (to Manchester United) (loan)"
    ].join("\n"));
  });

  describe("the render gate, by arithmetic against the stored deadlines", () => {
    const renders = (deadline: string): boolean =>
      buildSquadChangesContext({
        competition: "PL",
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

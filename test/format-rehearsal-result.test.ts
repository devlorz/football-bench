import { describe, expect, test } from "vitest";
import { formatFplRehearsalResult } from "../src/fpl-rehearsal/format-rehearsal-result.js";
import type { FplRehearsalResult } from "../src/fpl-rehearsal/run-fpl-rehearsal.js";

function result(over: Partial<FplRehearsalResult> = {}): FplRehearsalResult {
  return {
    report: {
      season: "2026-27",
      startedAt: 1,
      qualification: "This ranking demonstrates that the track ran.",
      entrants: [
        {
          entrantId: "fpl/rolled-over",
          path: [
            {
              gameweek: 1,
              rolledOver: false,
              attemptsUsed: 0,
              state: {
                squad: { active: [{ fplId: 1, purchasePriceTenths: 60 }], free_hit_stash: null },
                teamSheet: {
                  starters: [1], bench: [58], captain: 1, viceCaptain: 58
                },
                bankTenths: 15,
                freeTransfers: 1,
                hits: 0,
                chipsUsed: { firstHalf: [], secondHalf: [] },
                chipActive: null
              }
            },
            {
              gameweek: 2,
              rolledOver: true,
              attemptsUsed: 3,
              state: {
                squad: {
                  active: [{ fplId: 2, purchasePriceTenths: 45 }],
                  free_hit_stash: {
                    squad: [{ fplId: 1, purchasePriceTenths: 60 }],
                    team_sheet: {
                      starters: [1], bench: [58], captain: 1, viceCaptain: 58
                    },
                    bank: 15
                  }
                },
                teamSheet: {
                  starters: [2], bench: [58], captain: 2, viceCaptain: 58
                },
                bankTenths: 6,
                freeTransfers: 2,
                hits: 0,
                chipsUsed: { firstHalf: ["wildcard"], secondHalf: [] },
                chipActive: null
              }
            }
          ],
          metrics: [
            { gameweek: 1, metric: "fpl_points", value: 69, detail: null },
            { gameweek: 2, metric: "fpl_points", value: 69, detail: null },
            {
              gameweek: 2,
              metric: "violation_profile",
              value: 4,
              detail: { kinds: { captain: 4, club_limit: 0 } }
            }
          ]
        }
      ],
      incomplete: []
    },
    expected: { entrants: 9, gameweeks: 3, metricRows: 216 },
    observed: { entrants: 9, gameweeks: 3, metricRows: 216 },
    shortfalls: [],
    ...over
  };
}

describe("the rehearsal's printed result", () => {
  test("shows each seat's points, Repairs, Roll Overs and Chips", () => {
    const printed = formatFplRehearsalResult(result());

    expect(printed).toContain("fpl/rolled-over");
    expect(printed).toContain("GW1 69");
    expect(printed).toContain("Roll Overs: 1");
    expect(printed).toContain("Repairs:    3");
    expect(printed).toContain("wildcard");
  });

  test("shows the whole Manager State path, not just which Gameweeks it holds", () => {
    // Two seats can hold the same Gameweeks, take the same Repairs and score
    // the same points while owning entirely different Squads. The Gameweek
    // numbers alone would not say so, and the path is what criterion 7 asks for.
    const printed = formatFplRehearsalResult(result());

    expect(printed).toContain("Manager State path");
    expect(printed).toContain("1@£6.0m");
    expect(printed).toContain("Starters:   1");
    expect(printed).toContain("Bench:      58");
    expect(printed).toContain("captain 1, vice 58");
    expect(printed).toContain("£1.5m");
    expect(printed).toContain("Free Transfers: 2");
    expect(printed).toContain("Hits: 0");
    expect(printed).toContain("(Rolled Over)");
  });

  test("shows the Squad a Free Hit stashed, so the revert can be audited", () => {
    // The Gameweek after a Free Hit gives the permanent Squad back, and the
    // only way to check that from the output is against the Squad that was put
    // away. Without the stash the one thing the Chip does is invisible.
    const printed = formatFplRehearsalResult(result());

    expect(printed).toContain("Free Hit stash");
    // The whole stashed Manager State, not a summary of it: the Team Sheet
    // that comes back is as much a part of the revert as the Squad is.
    expect(printed).toContain("Starters: 1");
    expect(printed).toContain("Bench:    58");
    expect(printed).toContain("captain 1, vice 58");
    expect(printed).toContain("Bank:     £1.5m");
    // And the Squad actually being played that Gameweek is the borrowed one.
    expect(printed).toContain("2@£4.5m");
  });

  test("shows the Chips spent by each Gameweek, not only at the end", () => {
    // A Chip is spent in a Gameweek. Printing only the final inventory says
    // which Chips are gone but never which Gameweek spent them.
    // Named by half, because a Chip's half is what makes the first set expire
    // unspent at Gameweek 19 — one merged list could not tell them apart. An
    // empty half is printed as empty rather than left out, so a reader can
    // tell "nothing spent" from "this was never written".
    expect(formatFplRehearsalResult(result()))
      .toContain("Spent so far: first half wildcard; second half none");
  });

  test("shows the cumulative points beside each Gameweek's own", () => {
    const printed = formatFplRehearsalResult(result());

    expect(printed).toContain("Cumulative:");
  });

  test("shows the violation profile, which is what a Roll Over is made of", () => {
    // A Roll Over flag says a Gameweek gave up; only the profile says what the
    // Entrant kept getting wrong, and criterion 7 asks for both.
    const printed = formatFplRehearsalResult(result());

    expect(printed).toContain("captain=4");
    expect(printed).toContain("GW2 4");
  });

  test("carries the qualification, so a ranking cannot be read without it", () => {
    expect(formatFplRehearsalResult(result()))
      .toContain("This ranking demonstrates that the track ran.");
  });

  test("names every shortfall when the rehearsal did not complete", () => {
    const printed = formatFplRehearsalResult(result({
      shortfalls: ["fpl/idle GW2 points: expected 69, found 70"]
    }));

    expect(printed).toContain("The rehearsal did not complete");
    expect(printed).toContain("fpl/idle GW2 points: expected 69, found 70");
  });

  test("says nothing about shortfalls when there were none", () => {
    expect(formatFplRehearsalResult(result()))
      .not.toContain("did not complete");
  });
});

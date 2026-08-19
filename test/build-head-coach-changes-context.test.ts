import { describe, expect, test } from "vitest";
import {
  buildHeadCoachChangesContext,
  type HeadCoachChangeRow
} from "../src/context/build-head-coach-changes-context.js";

const DEADLINE = new Date("2026-08-21T17:30:00Z");

const change = (
  row: Partial<HeadCoachChangeRow> & Pick<HeadCoachChangeRow, "club">
): HeadCoachChangeRow => ({
  direction: "out",
  head_coach: "A Coach",
  manner: "Sacked",
  dated_on: "2026-05-30",
  ...row
});

const build = (
  changes: HeadCoachChangeRow[],
  overrides: { competition?: string; season?: string; deadline?: Date } = {}
) => buildHeadCoachChangesContext({
  competition: "PL",
  season: "2026-27",
  deadline: DEADLINE,
  homeTeam: "Liverpool",
  awayTeam: "Everton",
  changes,
  ...overrides
});

describe("the Head Coach changes section", () => {
  test("states each club's Departure and Arrival, dated", () => {
    expect(build([
      change({
        club: "Liverpool", direction: "out", head_coach: "Arne Slot",
        manner: "Sacked", dated_on: "2026-05-30"
      }),
      change({
        club: "Liverpool", direction: "in", head_coach: "Andoni Iraola",
        manner: null, dated_on: "2026-06-04"
      }),
      change({
        club: "Everton", direction: "out", head_coach: "A Departed Coach",
        manner: "End of contract", dated_on: "2026-06-02"
      }),
      change({
        club: "Everton", direction: "in", head_coach: "An Arrived Coach",
        manner: null, dated_on: "2026-07-07"
      })
    ])).toBe([
      "Head Coach changes this Season:",
      "",
      "Liverpool",
      "Out: Arne Slot (sacked, 30 May 2026)",
      "In: Andoni Iraola (4 Jun 2026)",
      "",
      "Everton",
      "Out: A Departed Coach (end of contract, 2 Jun 2026)",
      "In: An Arrived Coach (7 Jul 2026)"
    ].join("\n"));
  });

  test("costs no line for a club that kept its Head Coach", () => {
    expect(build([
      change({ club: "Liverpool", head_coach: "Arne Slot" })
    ])).toBe([
      "Head Coach changes this Season:",
      "",
      "Liverpool",
      "Out: Arne Slot (sacked, 30 May 2026)"
    ].join("\n"));
  });

  /**
   * The vacancy is the fact the packet is for, and a club that has not filled
   * one yet is a club whose next team sheet nobody has picked. It states the
   * Departure and no Arrival line at all rather than an Arrival that says
   * nothing.
   */
  test("states a vacancy nobody has filled as a Departure alone", () => {
    expect(build([
      change({
        club: "Everton", direction: "out", head_coach: "A Departed Coach",
        manner: "Mutual consent", dated_on: "2026-08-10"
      })
    ])).toContain("Out: A Departed Coach (mutual consent, 10 Aug 2026)");
  });

  /**
   * The table publishes the future: a Head Coach announced in April to arrive
   * on 1 July is on the page for three months before the seat is his.
   */
  test("never reaches a fact dated after the deadline", () => {
    const rendered = build([
      change({
        club: "Liverpool", direction: "out", head_coach: "Arne Slot",
        manner: "Sacked", dated_on: "2026-05-30"
      }),
      change({
        club: "Liverpool", direction: "in", head_coach: "A Later Coach",
        manner: null, dated_on: "2026-09-01"
      })
    ]);

    expect(rendered).toContain("Out: Arne Slot (sacked, 30 May 2026)");
    expect(rendered).not.toContain("A Later Coach");
  });

  test("keeps a fact dated the deadline's own day, which was observed before it",
    () => {
      expect(build([
        change({
          club: "Liverpool", direction: "in", head_coach: "A Lock Day Coach",
          manner: null, dated_on: "2026-08-21"
        })
      ])).toContain("In: A Lock Day Coach (21 Aug 2026)");
    });

  test("orders a club's changes by date, then by name", () => {
    expect(build([
      change({
        club: "Liverpool", head_coach: "Second Coach", dated_on: "2026-07-01"
      }),
      change({
        club: "Liverpool", head_coach: "Zeroth Coach", dated_on: "2026-05-30"
      }),
      change({
        club: "Liverpool", head_coach: "First Coach", dated_on: "2026-07-01"
      })
    ])).toContain(
      "Out: Zeroth Coach (sacked, 30 May 2026), "
      + "First Coach (sacked, 1 Jul 2026), Second Coach (sacked, 1 Jul 2026)"
    );
  });

  /**
   * An empty partition is a fetch that did not land, not a league where
   * nobody moved -- and the two must not read alike.
   */
  test("states the absence of a stored partition", () => {
    expect(build([])).toBe([
      "Head Coach changes this Season:",
      "",
      "Head Coach change data status: no Head Coach change data stored for "
      + "this Gameweek."
    ].join("\n"));
  });

  test("states that neither club changed, over a partition that did land", () => {
    expect(build([
      change({ club: "Arsenal", head_coach: "Somebody Else" })
    ])).toBe([
      "Head Coach changes this Season:",
      "",
      "Neither club has changed Head Coach this Season."
    ].join("\n"));
  });

  test("is absent for a Season whose article is not listed", () => {
    expect(build([change({ club: "Liverpool" })], { season: "2030-31" }))
      .toBeUndefined();
    expect(build([change({ club: "Liverpool" })], { competition: "BL1" }))
      .toBeUndefined();
  });
});

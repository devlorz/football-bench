import { describe, expect, test } from "vitest";
import {
  buildHeadCoachContext,
  type HeadCoachChangeRow,
  type HeadCoachRow
} from "../src/context/build-head-coach-context.js";

const DEADLINE = new Date("2026-08-21T17:30:00Z");
const OBSERVED = new Date("2026-08-21T06:00:00Z");

const change = (
  row: Partial<HeadCoachChangeRow> & Pick<HeadCoachChangeRow, "club">
): HeadCoachChangeRow => ({
  direction: "out",
  head_coach: "A Coach",
  manner: "Sacked",
  dated_on: "2026-05-30",
  ...row
});

const inPost = (
  row: Partial<HeadCoachRow> & Pick<HeadCoachRow, "club" | "head_coach">
): HeadCoachRow => ({ observed_at: OBSERVED, ...row });

const BOTH_IN_POST = [
  inPost({ club: "Liverpool", head_coach: "Arne Slot" }),
  inPost({ club: "Everton", head_coach: "David Moyes" })
];

const build = (
  changes: HeadCoachChangeRow[],
  overrides: {
    competition?: string;
    season?: string;
    deadline?: Date;
    headCoaches?: HeadCoachRow[];
  } = {}
) => buildHeadCoachContext({
  competition: "PL",
  season: "2026-27",
  deadline: DEADLINE,
  homeTeam: "Liverpool",
  awayTeam: "Everton",
  headCoaches: BOTH_IN_POST,
  changes,
  ...overrides
});

describe("the Head Coach section", () => {
  test("names both clubs' Head Coach, with that club's changes beneath", () => {
    expect(build([
      change({
        club: "Liverpool", direction: "out", head_coach: "A Sacked Coach",
        manner: "Sacked", dated_on: "2026-05-30"
      }),
      change({
        club: "Liverpool", direction: "in", head_coach: "Arne Slot",
        manner: null, dated_on: "2026-06-04"
      }),
      change({
        club: "Everton", direction: "out", head_coach: "A Departed Coach",
        manner: "End of contract", dated_on: "2026-06-02"
      }),
      change({
        club: "Everton", direction: "in", head_coach: "David Moyes",
        manner: null, dated_on: "2026-07-07"
      })
    ])).toBe([
      "Head Coach and changes this Season:",
      "",
      "Liverpool",
      "Head Coach: Arne Slot",
      "In: Arne Slot (4 Jun 2026)",
      "Out: A Sacked Coach (sacked, 30 May 2026)",
      "",
      "Everton",
      "Head Coach: David Moyes",
      "In: David Moyes (7 Jul 2026)",
      "Out: A Departed Coach (end of contract, 2 Jun 2026)"
    ].join("\n"));
  });

  /**
   * Keeping a Head Coach is ordinary, so an unchanged club costs its name and
   * its incumbent and nothing else.
   */
  test("carries no change lines under a club that kept its Head Coach", () => {
    expect(build([])).toBe([
      "Head Coach and changes this Season:",
      "",
      "Liverpool",
      "Head Coach: Arne Slot",
      "",
      "Everton",
      "Head Coach: David Moyes"
    ].join("\n"));
  });

  /**
   * Every club has a Head Coach, so a club this render cannot name is the
   * record failing and the packet says so rather than leaving the club's
   * block bare.
   */
  test("announces a Gap for a club with no stored Head Coach", () => {
    expect(build([], {
      headCoaches: [inPost({ club: "Liverpool", head_coach: "Arne Slot" })]
    })).toBe([
      "Head Coach and changes this Season:",
      "",
      "Liverpool",
      "Head Coach: Arne Slot",
      "",
      "Everton",
      "Head Coach: unavailable; no Head Coach is readable for this Gameweek."
    ].join("\n"));
  });

  /**
   * Migration 0033's triggers already refuse such a row at the write, both
   * ways round; this is the same rule held again at the render, where the
   * deadline is. A sacking on the morning of the match cannot reach a packet
   * that predates the Lock, and the club it belonged to reads as the Gap it
   * then is -- which is why the Gap sentence says what is readable rather
   * than what is stored.
   */
  test("never reads a Head Coach observed after the deadline", () => {
    expect(build([], {
      headCoaches: [
        inPost({ club: "Liverpool", head_coach: "Arne Slot" }),
        inPost({
          club: "Everton",
          head_coach: "A Later Coach",
          observed_at: new Date("2026-08-21T18:00:00Z")
        })
      ]
    })).toBe([
      "Head Coach and changes this Season:",
      "",
      "Liverpool",
      "Head Coach: Arne Slot",
      "",
      "Everton",
      "Head Coach: unavailable; no Head Coach is readable for this Gameweek."
    ].join("\n"));
  });

  /**
   * The table publishes the future: a Head Coach announced in April to arrive
   * on 1 July is on the page for three months before the seat is his.
   */
  test("never reaches a change dated after the deadline", () => {
    const rendered = build([
      change({
        club: "Liverpool", direction: "out", head_coach: "A Sacked Coach",
        manner: "Sacked", dated_on: "2026-05-30"
      }),
      change({
        club: "Liverpool", direction: "in", head_coach: "A Later Coach",
        manner: null, dated_on: "2026-09-01"
      })
    ]);

    expect(rendered).toContain("Out: A Sacked Coach (sacked, 30 May 2026)");
    expect(rendered).not.toContain("A Later Coach");
  });

  test("keeps a change dated the deadline's own day, observed before it", () => {
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
   * A Change stored for a club that is not in this Fixture belongs to another
   * Fixture's packet and reaches none of this one's lines.
   */
  test("reads neither club's block into the other's", () => {
    expect(build([change({ club: "Arsenal", head_coach: "Somebody Else" })]))
      .not.toContain("Somebody Else");
  });

  test("is absent for a Season whose article is not listed", () => {
    expect(build([change({ club: "Liverpool" })], { season: "2030-31" }))
      .toBeUndefined();
    // `XX`, outside the `competition_code` domain -- see
    // `test/openrouter-entrant.test.ts`'s comment on the same choice: `BL1`
    // is now listed (ticket 0058, ADR-0054), so `XX` is what stays outside
    // the domain to exercise this refusal. `headCoachSource` never touches
    // the database.
    expect(build([change({ club: "Liverpool" })], { competition: "XX" }))
      .toBeUndefined();
  });
});

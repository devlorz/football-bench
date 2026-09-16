import { describe, expect, test } from "vitest";
import {
  buildNationalTeamHeadCoachContext,
  type NationalTeamHeadCoachRow
} from "../src/context/build-national-team-head-coach-context.js";

const DEADLINE = new Date("2026-09-24T14:30:00Z");

/** One morning's reading of one side, as the fetch stores it. */
const snapshot = (
  team: string,
  day: string,
  headCoach: string | null,
  assumedOn: string | null,
  at = "06:00:00Z"
): NationalTeamHeadCoachRow => ({
  team,
  observed_on: day,
  observed_at: new Date(`${day}T${at}`),
  head_coach: headCoach,
  assumed_on: assumedOn
});

const render = (headCoaches: NationalTeamHeadCoachRow[]): string =>
  buildNationalTeamHeadCoachContext({
    deadline: DEADLINE,
    homeTeam: "Germany",
    awayTeam: "Spain",
    headCoaches
  });

describe("the Nations League's Head Coach section", () => {
  test("names who picks each side and the date the list says they took it",
    () => {
      // Story 34 of spec 0027: ADR-0045's promise, kept for a national side by
      // a source that publishes a state and no event at all.
      expect(render([
        snapshot("Germany", "2026-09-22", "Jürgen Klopp", "2026-07-24"),
        snapshot("Germany", "2026-09-23", "Jürgen Klopp", "2026-07-24"),
        snapshot("Spain", "2026-09-22", "Luis de la Fuente", "2022-12-08"),
        snapshot("Spain", "2026-09-23", "Luis de la Fuente", "2022-12-08")
      ])).toBe([
        "Head Coach and changes:",
        "A change is visible from 22 Sep 2026, when this list was first read "
        + "here; one before that is not.",
        "",
        "Germany",
        "Head Coach: Jürgen Klopp, in the role since 24 Jul 2026",
        "",
        "Spain",
        "Head Coach: Luis de la Fuente, in the role since 8 Dec 2022"
      ].join("\n"));
    });

  test("shows a Change dated by the morning it was first read", () => {
    // Story 35, and the one date this source can honestly state: the page says
    // when the role was assumed and never when its own answer changed, so the
    // Change is dated by the day this record first read the new one.
    const rendered = render([
      snapshot("Germany", "2026-09-22", "Julian Nagelsmann", "2023-09-22"),
      snapshot("Germany", "2026-09-23", "Jürgen Klopp", "2026-09-21"),
      snapshot("Spain", "2026-09-22", "Luis de la Fuente", "2022-12-08"),
      snapshot("Spain", "2026-09-23", "Luis de la Fuente", "2022-12-08")
    ]);

    expect(rendered).toContain(
      "Head Coach: Jürgen Klopp, in the role since 21 Sep 2026\n"
      + "Change: Julian Nagelsmann to Jürgen Klopp, first read 23 Sep 2026"
    );
    // A side whose snapshots agree carries no Change line at all: keeping a
    // Head Coach is ordinary and says so by the absence of the event.
    expect(rendered).toContain(
      "Spain\nHead Coach: Luis de la Fuente, in the role since 8 Dec 2022"
    );
    expect(rendered.match(/Change:/g)).toHaveLength(1);
  });

  test("shows both of two Changes inside the window", () => {
    // Every disagreement and not only the latest: two changes are two things
    // that happened, and a section showing one of them would be a section
    // that quietly picked.
    expect(render([
      snapshot("Germany", "2026-09-21", "Julian Nagelsmann", "2023-09-22"),
      snapshot("Germany", "2026-09-22", null, null),
      snapshot("Germany", "2026-09-23", "Jürgen Klopp", "2026-09-22")
    ])).toContain([
      "Head Coach: Jürgen Klopp, in the role since 22 Sep 2026",
      "Change: Julian Nagelsmann to vacant, first read 22 Sep 2026",
      "Change: vacant to Jürgen Klopp, first read 23 Sep 2026"
    ].join("\n"));
  });

  test("renders a vacant post as vacant and never as the previous holder",
    () => {
      // Story 37. The previous holder is in the rows above and is not what an
      // Entrant is handed: a packet naming a Head Coach who has left would be
      // wrong about the one fact this section exists to state.
      const rendered = render([
        snapshot("Germany", "2026-09-22", "Julian Nagelsmann", "2023-09-22"),
        snapshot("Germany", "2026-09-23", null, null)
      ]);

      expect(rendered).toContain(
        "Germany\nHead Coach: vacant; the list names nobody in post."
      );
      expect(rendered).not.toContain(
        "Head Coach: Julian Nagelsmann"
      );
    });

  test("announces a side with nothing stored as the Gap it is", () => {
    // ADR-0045's own sentence, shared with the leagues' section rather than
    // written twice: the promise is the ADR's and one wording of it changing
    // would have to change both.
    expect(render([
      snapshot("Germany", "2026-09-23", "Jürgen Klopp", "2026-07-24")
    ])).toContain(
      "Spain\nHead Coach: unavailable; no Head Coach is readable for this "
      + "Gameweek."
    );
  });

  test("holds the Lock, which this store has no trigger to hold for it", () => {
    // The only thing standing between an Entrant and a page read after its
    // own Lock: a row here has no Gameweek for a trigger to find a deadline
    // through (migration 0045), unlike every club's Head Coach row.
    const rendered = render([
      snapshot("Germany", "2026-09-23", "Julian Nagelsmann", "2023-09-22"),
      // One read after the Lock and one at the Lock's own instant. The second
      // is the boundary: a page read at 14:30:00Z was not read before a Lock
      // at 14:30:00Z, however close the two are.
      snapshot("Germany", "2026-09-24", "Jürgen Klopp", "2026-09-24", "15:00:00Z"),
      snapshot("Spain", "2026-09-24", "Luis de la Fuente", "2022-12-08",
        "14:30:00Z")
    ]);

    expect(rendered).toContain(
      "Head Coach: Julian Nagelsmann, in the role since 22 Sep 2023"
    );
    expect(rendered).not.toContain("Klopp");
    expect(rendered).not.toContain("Change:");
    expect(rendered).toContain(
      "Spain\nHead Coach: unavailable; no Head Coach is readable for this "
      + "Gameweek."
    );
  });

  test("states no window at all when nothing is stored", () => {
    // Both sides read as the Gap they are, and the line about what is visible
    // is absent rather than dated to a day nothing was read on.
    expect(render([])).toBe([
      "Head Coach and changes:",
      "",
      "Germany",
      "Head Coach: unavailable; no Head Coach is readable for this Gameweek.",
      "",
      "Spain",
      "Head Coach: unavailable; no Head Coach is readable for this Gameweek."
    ].join("\n"));
  });
});

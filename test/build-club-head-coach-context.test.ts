import { describe, expect, test } from "vitest";
import {
  buildClubHeadCoachContext,
  type ClubHeadCoachRow
} from "../src/context/build-club-head-coach-context.js";

const DEADLINE = new Date("2026-10-21T15:15:00Z");

const row = (
  team: string,
  observedOn: string,
  headCoach: string | null,
  observedAt = `${observedOn}T05:00:00Z`
): ClubHeadCoachRow => ({
  team,
  observed_on: observedOn,
  observed_at: new Date(observedAt),
  head_coach: headCoach
});

describe("a club cup's Head Coach section", () => {
  test("names who picks each side, with a dated Change for A, B, B", () => {
    expect(buildClubHeadCoachContext({
      deadline: DEADLINE,
      homeTeam: "Lens",
      awayTeam: "Arsenal",
      headCoaches: [
        // Out of order on purpose: the section orders by day itself.
        row("Lens", "2026-10-15", "Yannick Cahuzac"),
        row("Lens", "2026-10-13", "Dino Toppmöller"),
        row("Lens", "2026-10-14", "Yannick Cahuzac"),
        row("Arsenal", "2026-10-13", "Mikel Arteta"),
        row("Arsenal", "2026-10-14", "Mikel Arteta")
      ]
    })).toBe([
      "Head Coach and changes:",
      "Each club's English Wikipedia infobox names who picks the team and "
      + "states no appointment date, so a Head Coach line says who and not "
      + "since when.",
      "A change is visible from 13 Oct 2026, when the infoboxes were "
      + "first read here; one before that is not.",
      "",
      "Lens",
      "Head Coach: Yannick Cahuzac",
      "Change: Dino Toppmöller to Yannick Cahuzac, first read 14 Oct 2026",
      "",
      "Arsenal",
      "Head Coach: Mikel Arteta"
    ].join("\n"));
  });

  test("shows nothing observed after the Lock", () => {
    const section = buildClubHeadCoachContext({
      deadline: DEADLINE,
      homeTeam: "Lens",
      awayTeam: "Arsenal",
      headCoaches: [
        row("Lens", "2026-10-21", "Yannick Cahuzac"),
        // The Lock's own morning, read after it.
        row("Lens", "2026-10-21", "Pierre Sage", "2026-10-21T16:00:00Z"),
        row("Arsenal", "2026-10-22", "Somebody Else")
      ]
    });
    expect(section).toContain("Head Coach: Yannick Cahuzac");
    expect(section).not.toMatch(/Pierre Sage|Somebody Else|Change:/);
    // A side with no snapshot before the Lock is the Gap, said as one.
    expect(section).toContain(
      "Arsenal\nHead Coach: unavailable; no Head Coach is readable for this "
      + "Gameweek."
    );
  });

  test("says when an infobox names nobody, and dates a Change to or from it",
    () => {
      const section = buildClubHeadCoachContext({
        deadline: DEADLINE,
        homeTeam: "Lens",
        awayTeam: "Arsenal",
        headCoaches: [
          row("Lens", "2026-10-13", "Dino Toppmöller"),
          row("Lens", "2026-10-14", null),
          row("Arsenal", "2026-10-13", "Mikel Arteta")
        ]
      });
      expect(section).toContain(
        "Lens\nHead Coach: none named; the club's infobox names nobody.\n"
        + "Change: Dino Toppmöller to nobody named, first read 14 Oct 2026"
      );
    });
});

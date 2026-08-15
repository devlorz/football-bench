import { describe, expect, test } from "vitest";
import {
  DERIVED_DEADLINE_LEAD_MS,
  deriveDeadline
} from "../src/football-data-org/derived-deadline.js";

const at = (iso: string): Date => new Date(iso);

/** La Liga's opening Saturday, the schedule ADR-0036 stress-tests against. */
const SATURDAY_EVENING = at("2026-08-15T19:00:00Z");
const SATURDAY_AFTERNOON = at("2026-08-15T15:00:00Z");
const SUNDAY = at("2026-08-16T17:00:00Z");

describe("the derived deadline", () => {
  test("is the Gameweek's earliest kickoff minus ninety minutes", () => {
    const { deadlineAt } = deriveDeadline(
      [SUNDAY, SATURDAY_EVENING, SATURDAY_AFTERNOON],
      null,
      at("2026-08-10T06:00:00Z")
    );

    expect(deadlineAt).toEqual(
      new Date(SATURDAY_AFTERNOON.getTime() - DERIVED_DEADLINE_LEAD_MS)
    );
    expect(deadlineAt.toISOString()).toBe("2026-08-15T13:30:00.000Z");
  });

  test("is recomputed while the Gameweek is still open", () => {
    const stored = at("2026-08-15T13:30:00Z");
    const broughtForward = at("2026-08-15T11:00:00Z");

    const earlier = deriveDeadline(
      [broughtForward, SUNDAY],
      stored,
      at("2026-08-12T06:00:00Z")
    );
    expect(earlier.deadlineAt.toISOString()).toBe("2026-08-15T09:30:00.000Z");
    expect(earlier.locked).toBe(false);
    expect(earlier.breachedBy).toBeNull();

    // A Fixture pushed back moves it too: until the Lock, the deadline tracks
    // the schedule in both directions.
    const later = deriveDeadline(
      [SATURDAY_EVENING, SUNDAY],
      stored,
      at("2026-08-12T06:00:00Z")
    );
    expect(later.deadlineAt.toISOString()).toBe("2026-08-15T17:30:00.000Z");
  });

  test("freezes at the Lock, whatever the schedule does afterwards", () => {
    const stored = at("2026-08-15T13:30:00Z");

    const { deadlineAt, locked, breachedBy } = deriveDeadline(
      // Every Fixture postponed a week; the earliest kickoff is now nowhere
      // near the stored deadline.
      [at("2026-08-22T19:00:00Z")],
      stored,
      at("2026-08-16T06:00:00Z")
    );

    expect(deadlineAt).toEqual(stored);
    expect(locked).toBe(true);
    expect(breachedBy).toBeNull();
  });

  test("performs the Lock on the first fetch at or past the deadline", () => {
    const stored = at("2026-08-15T13:30:00Z");

    expect(
      deriveDeadline([SATURDAY_AFTERNOON], stored, at("2026-08-15T13:29:59Z"))
        .locked
    ).toBe(false);
    expect(
      deriveDeadline([SATURDAY_AFTERNOON], stored, stored).locked
    ).toBe(true);
  });

  test("alerts on a kickoff observed inside the frozen deadline", () => {
    const stored = at("2026-08-15T13:30:00Z");
    const broughtForward = at("2026-08-15T12:00:00Z");

    const { deadlineAt, locked, breachedBy } = deriveDeadline(
      [broughtForward, SUNDAY],
      stored,
      at("2026-08-15T18:00:00Z")
    );

    expect(breachedBy).toEqual(broughtForward);
    // Alerted, never absorbed: the deadline it was Locked at stands.
    expect(deadlineAt).toEqual(stored);
    expect(locked).toBe(true);
  });

  test("alerts rather than relocking when the recomputation lands in the past", () => {
    const { locked, breachedBy } = deriveDeadline(
      [at("2026-08-15T07:00:00Z")],
      at("2026-08-15T13:30:00Z"),
      at("2026-08-15T06:00:00Z")
    );

    expect(breachedBy).toEqual(at("2026-08-15T07:00:00Z"));
    expect(locked).toBe(false);
  });

  test("meets the Lock's edge exactly, leaving no instant to neither", () => {
    const kickoff = at("2026-08-15T07:30:00Z");
    const stored = at("2026-08-15T13:30:00Z");

    // One millisecond of window is a window, and is written.
    expect(deriveDeadline([kickoff], stored, at("2026-08-15T05:59:59.999Z")))
      .toMatchObject({ breachedBy: null, locked: false });
    // None at all is the breach. A strict `<` here called this instant normal
    // and wrote a deadline equal to the moment of writing.
    expect(deriveDeadline([kickoff], stored, at("2026-08-15T06:00:00Z")))
      .toMatchObject({ breachedBy: kickoff });
  });

  test("takes a Gameweek first seen after its kickoffs as already Locked", () => {
    const { deadlineAt, locked, breachedBy } = deriveDeadline(
      [SATURDAY_AFTERNOON],
      null,
      at("2026-09-01T06:00:00Z")
    );

    expect(deadlineAt.toISOString()).toBe("2026-08-15T13:30:00.000Z");
    expect(locked).toBe(true);
    expect(breachedBy).toBeNull();
  });

  test("refuses a Gameweek with no scheduled kickoff", () => {
    expect(() => deriveDeadline([], null, at("2026-08-10T06:00:00Z")))
      .toThrow("at least one scheduled kickoff");
  });
});

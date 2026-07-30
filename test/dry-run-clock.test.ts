import { describe, expect, test } from "vitest";
import { resolveDryRunInstant } from "../src/dry-run/dry-run-clock.js";

describe("the dry run clock", () => {
  const deadline = new Date("2026-08-21T17:30:00.000Z");

  test("places the run a stated interval before the archived deadline", () => {
    expect(resolveDryRunInstant("deadline-6h", deadline))
      .toEqual(new Date("2026-08-21T11:30:00.000Z"));
  });

  test("places the run after the deadline, so the refused-write path is reachable", () => {
    expect(resolveDryRunInstant("deadline+90m", deadline))
      .toEqual(new Date("2026-08-21T19:00:00.000Z"));
  });

  test("accepts the deadline itself, the instant at which writes stop", () => {
    expect(resolveDryRunInstant("deadline", deadline)).toEqual(deadline);
  });

  test("accepts an absolute instant unrelated to the deadline", () => {
    expect(resolveDryRunInstant("2026-08-20T09:00:00Z", deadline))
      .toEqual(new Date("2026-08-20T09:00:00.000Z"));
  });

  test("refuses an unreadable instant rather than silently running at the wrong time", () => {
    expect(() => resolveDryRunInstant("six hours ago", deadline))
      .toThrow(/six hours ago/);
  });
});

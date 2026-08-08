import type { Client } from "pg";
import { describe, expect, test } from "vitest";
import {
  rehearsalExitCode,
  rehearseInThrowawayPostgres
} from "../src/rehearsal.js";
import type { FplRehearsalResult } from "../src/fpl-rehearsal/run-fpl-rehearsal.js";

function cluster() {
  const stopped: string[] = [];
  return {
    stopped,
    start: () => ({
      connectionString: "postgresql://throwaway",
      stop: () => { stopped.push("stopped"); }
    })
  };
}

describe("rehearsing in a throwaway Postgres", () => {
  test("removes the cluster when the rehearsal fails", async () => {
    const postgres = cluster();

    // The migration path is what fails here, which is the earliest a real run
    // can fail with a cluster already built.
    await expect(rehearseInThrowawayPostgres({
      start: postgres.start,
      rehearse: async () => undefined,
      connect: async () => ({
        query: async () => { throw new Error("migrations refused"); },
        end: async () => undefined
      } as unknown as Client)
    })).rejects.toThrow("migrations refused");

    // A command run repeatedly while something is being got right must not
    // make the next run fail for a reason belonging to the last one.
    expect(postgres.stopped).toEqual(["stopped"]);
  });

  test("removes the cluster even when closing the connection throws", async () => {
    const postgres = cluster();

    // Tearing the connection down is itself something that can fail, and it
    // fails after the rehearsal has finished with it. A cluster left running
    // because a socket would not close is the one leak nothing else catches.
    await expect(rehearseInThrowawayPostgres({
      start: postgres.start,
      rehearse: async () => undefined,
      connect: async () => ({
        query: async () => { throw new Error("migrations refused"); },
        end: async () => { throw new Error("socket would not close"); }
      } as unknown as Client)
    })).rejects.toThrow();

    expect(postgres.stopped).toEqual(["stopped"]);
  });

  test("removes the cluster when it cannot even be connected to", async () => {
    const postgres = cluster();

    await expect(rehearseInThrowawayPostgres({
      start: postgres.start,
      rehearse: async () => undefined,
      connect: async () => { throw new Error("connection refused"); }
    })).rejects.toThrow("connection refused");

    expect(postgres.stopped).toEqual(["stopped"]);
  });
});

describe("what the rehearsal command exits with", () => {
  const whole: FplRehearsalResult = {
    report: {
      season: "2026-27",
      startedAt: 1,
      qualification: "",
      entrants: [],
      incomplete: []
    },
    expected: { entrants: 9, gameweeks: 3, metricRows: 216 },
    observed: { entrants: 9, gameweeks: 3, metricRows: 216 },
    shortfalls: []
  };

  test("succeeds only when nothing fell short", () => {
    expect(rehearsalExitCode(whole)).toBe(0);
  });

  test("fails on an incomplete path even though the run reached the end", () => {
    // The run finished. That is precisely the outcome an operator must not
    // read as success when a seat is missing a Gameweek.
    const short: FplRehearsalResult = {
      ...whole,
      observed: { entrants: 9, gameweeks: 3, metricRows: 192 },
      shortfalls: ["fpl/idle holds 2 of 3 Gameweeks"]
    };
    expect(rehearsalExitCode(short)).toBe(1);
  });
});

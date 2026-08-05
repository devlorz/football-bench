import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import {
  startTemporaryPostgres,
  type RunCommand
} from "../src/db/temporary-postgres.js";

const PREFIX = "football-benchmark-cleanup-test-";

/** The directories this prefix has left in /tmp, which should always be none. */
function leaked(): string[] {
  return readdirSync("/tmp").filter((entry) => entry.startsWith(PREFIX));
}

// One test deliberately leaves a directory behind, and a run that fails
// part-way can too. Cleared here so each test measures what it did rather than
// what the one before it left.
beforeEach(() => {
  for (const entry of leaked()) {
    rmSync(`/tmp/${entry}`, { recursive: true, force: true });
  }
});

describe("a throwaway Postgres that never comes up", () => {
  test("leaves no directory behind when initdb fails", () => {
    const run: RunCommand = (file) => {
      if (file === "initdb") {
        throw new Error("initdb: command not found");
      }
    };

    expect(() => startTemporaryPostgres(PREFIX, run))
      .toThrow("initdb: command not found");

    // The command an operator retries while fixing something is the one that
    // must not leave a /tmp entry behind on each attempt.
    expect(leaked()).toEqual([]);
  });

  test("leaves no directory behind when the cluster publishes no port", () => {
    // Every command succeeds and no postmaster.pid is ever written, which is
    // the shape of a cluster that started and died.
    expect(() => startTemporaryPostgres(PREFIX, () => undefined)).toThrow();

    expect(leaked()).toEqual([]);
  });
});

describe("stopping a throwaway Postgres", () => {
  /** A cluster that came up, with a pid file, so `stop` can be reached. */
  function started(onStop: RunCommand) {
    const run: RunCommand = (file, args, environment) => {
      if (file === "pg_ctl" && args.includes("stop")) {
        onStop(file, args, environment);
        return;
      }
      if (file === "pg_ctl") {
        // A started cluster publishes its port on the fourth line.
        const data = args[args.indexOf("--pgdata") + 1]!;
        mkdirSync(data, { recursive: true });
        writeFileSync(`${data}/postmaster.pid`, "1\n/tmp\n0\n5432\n");
      }
    };
    return startTemporaryPostgres(PREFIX, run);
  }

  test("removes everything it wrote", () => {
    const postgres = started(() => undefined);

    postgres.stop();

    expect(leaked()).toEqual([]);
  });

  test("escalates a failed fast stop, then removes the directory", () => {
    const modes: string[] = [];
    const postgres = started((_file, args) => {
      const mode = args[args.indexOf("--mode") + 1]!;
      modes.push(mode);
      if (mode === "fast") {
        throw new Error("pg_ctl: server does not shut down");
      }
    });

    // The immediate stop worked, so the cluster is gone and the run succeeded:
    // there is nothing left for the caller to do about it.
    expect(() => postgres.stop()).not.toThrow();
    expect(modes).toEqual(["fast", "immediate"]);
    expect(leaked()).toEqual([]);
  });

  test("keeps the directory when the server will not stop at all", () => {
    const postgres = started(() => {
      throw new Error("pg_ctl: server does not shut down");
    });

    // Deleting the files under a server that is still running would turn a
    // cluster that refused to die into an orphan reading files that no longer
    // exist. A directory to remove by hand is the smaller harm, and the error
    // says where it is.
    expect(() => postgres.stop()).toThrow(/would not shut down/);
    expect(() => postgres.stop()).toThrow(/must be removed by hand/);

    const kept = leaked();
    expect(kept).toHaveLength(1);
    expect(existsSync(`/tmp/${kept[0]!}`)).toBe(true);
    rmSync(`/tmp/${kept[0]!}`, { recursive: true, force: true });
  });
});

describe("a throwaway Postgres whose start command fails", () => {
  test("stops the server it may already have spawned", () => {
    const commands: string[] = [];
    // `pg_ctl --wait start` spawns the postmaster and then waits for it, so a
    // timeout throws with a server already running. Treating the failure as
    // "nothing started" would delete the files under it.
    const run: RunCommand = (file, args) => {
      commands.push(`${file} ${args.includes("stop") ? "stop" : "start"}`);
      if (file === "pg_ctl" && !args.includes("stop")) {
        throw new Error("pg_ctl: server did not start in time");
      }
    };

    expect(() => startTemporaryPostgres(PREFIX, run))
      .toThrow("pg_ctl: server did not start in time");

    expect(commands).toContain("pg_ctl stop");
    expect(leaked()).toEqual([]);
  });

  test("reports both failures when the cleanup cannot finish either", () => {
    const run: RunCommand = (file, args) => {
      if (file === "pg_ctl") {
        throw new Error(args.includes("stop")
          ? "pg_ctl: server does not shut down"
          : "pg_ctl: server did not start in time");
      }
    };

    // Told only the start failure, an operator would never go looking for the
    // server and directory that have been left behind.
    let thrown: unknown;
    try {
      startTemporaryPostgres(PREFIX, run);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AggregateError);
    const messages = (thrown as AggregateError).errors.map(String);
    expect(messages.some((line) => line.includes("did not start in time")))
      .toBe(true);
    expect(messages.some((line) => line.includes("must be removed by hand")))
      .toBe(true);

    // And the directory it names really is still there.
    const kept = leaked();
    expect(kept).toHaveLength(1);
    rmSync(`/tmp/${kept[0]!}`, { recursive: true, force: true });
  });
});

describe("a throwaway Postgres that starts but cannot be used", () => {
  test("stops the server before removing what it wrote", () => {
    const commands: string[] = [];
    // `pg_ctl start` succeeds and the pid file it writes is missing the line
    // the port is read from — a server that came up and published nothing
    // usable. A server is running by the time that is discovered.
    const run: RunCommand = (file, args) => {
      commands.push(`${file} ${args.includes("stop") ? "stop" : "start"}`);
      if (file === "pg_ctl" && !args.includes("stop")) {
        const data = args[args.indexOf("--pgdata") + 1]!;
        mkdirSync(data, { recursive: true });
        writeFileSync(`${data}/postmaster.pid`, "1\n/tmp\n0\n");
      }
    };

    expect(() => startTemporaryPostgres(PREFIX, run))
      .toThrow("Temporary Postgres did not publish its port");

    // The failure the caller is told about is the useful one, and the server
    // was shut down rather than left running over deleted files.
    expect(commands).toContain("pg_ctl stop");
    expect(leaked()).toEqual([]);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface TemporaryPostgres {
  connectionString: string;
  stop: () => void;
}

/**
 * How a command is run. Injected so the cleanup paths below can be driven in a
 * test without an `initdb` on the machine — every one of them is a failure
 * path, and a leak that only shows when Postgres is already broken is exactly
 * the leak nobody reproduces by hand.
 */
export type RunCommand = (
  file: string,
  args: string[],
  environment: NodeJS.ProcessEnv
) => void;

const runCommand: RunCommand = (file, args, env) => {
  execFileSync(file, args, { env });
};

/**
 * Builds a throwaway Postgres cluster and returns its connection string. The
 * test suite and the dry run share this so a rehearsal writes somewhere that
 * cannot be confused with real data, and disappears when it finishes.
 */
export function startTemporaryPostgres(
  prefix: string,
  run: RunCommand = runCommand
): TemporaryPostgres {
  // macOS limits Unix-domain socket paths to 103 bytes. /tmp keeps the
  // temporary cluster's socket safely below that limit.
  const root = mkdtempSync(`/tmp/${prefix}`);
  const dataDirectory = join(root, "data");
  const socketDirectory = join(root, "socket");
  const postgresEnvironment = {
    ...process.env,
    LANG: "C",
    LC_ALL: "C"
  };

  // Everything from here on can fail, and the directory already exists. A
  // cluster that never came up is the failure most likely to be retried in a
  // loop while something is being fixed, so it is also the one that must not
  // leave a `/tmp` entry behind each time.
  //
  // Whether `pg_ctl start` was *attempted* decides how that is cleaned up —
  // not whether it returned. `pg_ctl --wait start` spawns the postmaster and
  // then waits for it, so a timeout throws with a server already running: a
  // flag set on the way out would take the branch that deletes the files under
  // it. Before the call nothing can be running and the directory is just
  // files; from the call onwards a server may hold them open, and it is
  // stopped before anything is removed, and kept if it will not stop.
  let mayBeRunning = false;
  try {
    run("mkdir", ["-p", socketDirectory], postgresEnvironment);
    run("initdb", [
      "--auth=trust",
      "--encoding=UTF8",
      "--no-locale",
      "--username=postgres",
      "--pgdata",
      dataDirectory
    ], postgresEnvironment);
    mayBeRunning = true;
    run("pg_ctl", [
      "--pgdata",
      dataDirectory,
      "--log",
      join(root, "postgres.log"),
      "--options",
      `-F -k ${socketDirectory} -h ''`,
      "--wait",
      "start"
    ], postgresEnvironment);

    // The fourth line of the pid file. Blank counts as missing: a trailing
    // newline makes the line exist while saying nothing, and a connection
    // string built from it would name no port at all and fail much later.
    const port = readFileSync(join(dataDirectory, "postmaster.pid"), "utf8")
      .split("\n")[3]?.trim();
    if (port === undefined || port === "") {
      throw new Error("Temporary Postgres did not publish its port");
    }

    return {
      connectionString:
        `postgresql://postgres@localhost:${port}/postgres`
        + `?host=${encodeURIComponent(socketDirectory)}`,
      stop: () => stop(root, dataDirectory, postgresEnvironment, run)
    };
  } catch (error) {
    if (!mayBeRunning) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
    // A server may be up and something after it failed. Stopping it is what
    // makes the files safe to remove.
    try {
      stop(root, dataDirectory, postgresEnvironment, run);
    } catch (cleanupFailure) {
      // Both are reported. The setup failure says what went wrong; the cleanup
      // failure says that a server and a directory have been left behind and
      // where — and an operator told only the first would never go looking.
      throw new AggregateError(
        [error, cleanupFailure],
        "Temporary Postgres failed to start and could not be cleaned up"
      );
    }
    throw error;
  }
}

/**
 * Stops the cluster, and removes everything it wrote once it has stopped.
 *
 * A fast stop that fails is escalated to an immediate one, and only a
 * confirmed shutdown is followed by removal. If neither mode works the
 * directory is deliberately kept: a server that will not stop is still holding
 * those files, and deleting them would turn a cluster that refused to die into
 * an orphan reading files that no longer exist — leaving the operator with
 * neither a working server nor anything to diagnose. A `/tmp` directory that
 * has to be removed by hand is the smaller harm, and the thrown error says
 * where it is.
 */
function stop(
  root: string,
  dataDirectory: string,
  environment: NodeJS.ProcessEnv,
  run: RunCommand
): void {
  const shutdown = (mode: string): void => {
    run("pg_ctl", [
      "--pgdata",
      dataDirectory,
      "--mode",
      mode,
      "--wait",
      "stop"
    ], environment);
  };
  try {
    shutdown("fast");
  } catch (fastFailure) {
    try {
      shutdown("immediate");
    } catch {
      throw new Error(
        `Temporary Postgres at ${root} would not shut down; its directory has `
        + "been kept for diagnosis and must be removed by hand once the "
        + `server is gone (${String(fastFailure)})`
      );
    }
  }
  rmSync(root, { recursive: true, force: true });
}

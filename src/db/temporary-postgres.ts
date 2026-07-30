import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface TemporaryPostgres {
  connectionString: string;
  stop: () => void;
}

/**
 * Builds a throwaway Postgres cluster and returns its connection string. The
 * test suite and the dry run share this so a rehearsal writes somewhere that
 * cannot be confused with real data, and disappears when it finishes.
 */
export function startTemporaryPostgres(prefix: string): TemporaryPostgres {
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

  execFileSync("mkdir", ["-p", socketDirectory], {
    env: postgresEnvironment
  });
  execFileSync("initdb", [
    "--auth=trust",
    "--encoding=UTF8",
    "--no-locale",
    "--username=postgres",
    "--pgdata",
    dataDirectory
  ], { env: postgresEnvironment });
  execFileSync("pg_ctl", [
    "--pgdata",
    dataDirectory,
    "--log",
    join(root, "postgres.log"),
    "--options",
    `-F -k ${socketDirectory} -h ''`,
    "--wait",
    "start"
  ], { env: postgresEnvironment });

  const port = readFileSync(join(dataDirectory, "postmaster.pid"), "utf8")
    .split("\n")[3];
  if (port === undefined) {
    throw new Error("Temporary Postgres did not publish its port");
  }

  return {
    connectionString:
      `postgresql://postgres@localhost:${port}/postgres`
      + `?host=${encodeURIComponent(socketDirectory)}`,
    stop: () => {
      execFileSync("pg_ctl", [
        "--pgdata",
        dataDirectory,
        "--mode",
        "fast",
        "--wait",
        "stop"
      ], { env: postgresEnvironment });
      rmSync(root, { recursive: true, force: true });
    }
  };
}

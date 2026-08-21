import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

async function archivedBytes(name: string): Promise<Buffer> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return readFile(fileURLToPath(url));
}

export async function archivedBody(name: string): Promise<string> {
  return gunzipSync(await archivedBytes(name)).toString("utf8");
}

export async function archivedBase64Body(name: string): Promise<string> {
  const encoded = (await archivedBytes(name)).toString("utf8");
  return Buffer.from(encoded, "base64").toString("utf8");
}

/**
 * The `HomeTeam` identities a committed football-data.co.uk file holds, which
 * is the value side of both reviewed identity maps and so the thing four
 * derivation tests read. Extracted at the fourth copy, and only the reading is
 * shared: what each league requires of the set — how many, which are relegated
 * out of it, which pair could still read if it were swapped — stays in that
 * league's own test, because that is the part a reviewer has to check.
 */
export async function archivedHomeTeams(name: string): Promise<Set<string>> {
  const rows = (await archivedBody(name))
    .split(/\r?\n/).filter((line) => line.length > 0);
  const column = rows[0]?.split(",").indexOf("HomeTeam") ?? -1;
  return new Set(rows.slice(1).map((row) => row.split(",")[column] ?? ""));
}

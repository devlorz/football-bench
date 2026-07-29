import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function archivedBody(name: string): Promise<string> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return gunzipSync(await readFile(fileURLToPath(url))).toString("utf8");
}

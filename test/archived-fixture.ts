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

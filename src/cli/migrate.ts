import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required");
}

const migrationUrl = new URL("../../migrations/0001_initial.sql", import.meta.url);
const database = new Client({ connectionString: databaseUrl });

await database.connect();
try {
  await database.query(await readFile(fileURLToPath(migrationUrl), "utf8"));
} finally {
  await database.end();
}

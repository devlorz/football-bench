import pg from "pg";
import { applyMigrations } from "../db/migrations.js";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required");
}

const database = new Client({ connectionString: databaseUrl });

await database.connect();
try {
  const applied = await applyMigrations(database);
  console.log(applied.length === 0
    ? "No migrations to apply."
    : `Applied ${applied.length}: ${applied.join(", ")}`);
} finally {
  await database.end();
}

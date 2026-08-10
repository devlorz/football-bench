import pg from "pg";
import { applyMigrations } from "../db/migrations.js";
import {
  assertEmptyDatabase, assertLocalDatabase, pinPublicSchema, seedSeason,
  type SeedStop
} from "../seed-season.js";
import { readScoreJobConfig } from "./config.js";

const STOPS: SeedStop[] = ["pre-season", "pending", "the design's"];

const { Client } = pg;
// The same two fields the scoring job needs, and for the same reason: every
// table is Season-scoped.
const config = readScoreJobConfig(process.env);
assertLocalDatabase(config.databaseUrl);

const argv = process.argv.slice(2);
const reset = argv.includes("--reset");
const asked = argv.find((argument) => !argument.startsWith("--"))
  ?? "the design's";
const stopAt = STOPS.find((stop) => stop === asked);
if (stopAt === undefined) {
  throw new Error(
    `Unknown stopping point ${JSON.stringify(asked)}; `
    + `expected one of ${STOPS.map((stop) => JSON.stringify(stop)).join(", ")}`
  );
}

const database = new Client({ connectionString: config.databaseUrl });
await database.connect();
try {
  // First of all, so that the schema this certifies empty is the schema the
  // migrations and the seed then write to.
  await pinPublicSchema(database);
  // `--reset` exists because the command cannot be one transaction: the seed
  // writes in phases with the scorer between them and the scorer commits its
  // own, so a run that fails part way leaves rows the next attempt collides
  // with. Rebuilding from nothing is the way out of that, and it is the
  // operator's word rather than the seed's assumption, because a local
  // database is not automatically a disposable one.
  if (reset) {
    await database.query("drop schema public cascade; create schema public");
  }
  // Before the migrations, not after: applying them is itself a write, and a
  // command that refuses a database it has already run DDL against has not
  // refused it. A database with no tables at all reads as empty here, which is
  // the first-run case.
  await assertEmptyDatabase(database);
  await applyMigrations(database);
  // And again, because a migration that back-fills rows would put a Season in
  // front of the seed between those two lines. None does today.
  await assertEmptyDatabase(database);
  await seedSeason({ database, season: config.season, stopAt });
  console.log(
    `Seeded ${config.season} to ${stopAt}${reset ? " after a reset" : ""}.`
  );
} finally {
  await database.end();
}

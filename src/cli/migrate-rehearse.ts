import pg from "pg";
import { rehearseMigration } from "../db/rehearse-migration.js";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required");
}

const rehearsal = await rehearseMigration({
  sourceUrl: databaseUrl,
  connect: async (connectionString) => {
    const target = new Client({ connectionString });
    await target.connect();
    return target;
  }
});

// It threw or it did not: the check inside raises, so there is no shortfall to
// interpret here and no exit code to choose. What is printed is what the
// rehearsal ran over, which is the part an operator has to judge — a green run
// against a record of zero rows has proven nothing about the live one.
console.log(rehearsal.applied.length === 0
  ? "Nothing to rehearse: the copied record is already at the latest migration."
  : `Rehearsed ${rehearsal.applied.join(", ")} over a copy of the record:`);
for (const [table, count] of Object.entries(rehearsal.rows)) {
  console.log(
    `  ${table}: ${count} row${count === 1 ? "" : "s"}, `
    + "every one relabelled and unchanged"
  );
}

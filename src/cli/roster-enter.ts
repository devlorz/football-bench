import pg from "pg";
import {
  editionRosterOf, enterActiveCompetitionRosters
} from "../season-roster.js";
import { MATCH_PROMPT_COMPETITIONS } from "../predictions/openrouter-entrant.js";
import { readScoreJobConfig } from "./config.js";

const { Client } = pg;
// The same two fields the scoring job needs: a database, and the Season whose
// Prompt Version the seats are entered under.
const config = readScoreJobConfig(process.env);

// Which Edition's roster of record to seat (ADR-0061, ADR-0062). Unset is
// Edition 1, so the command every Competition opened with is unchanged; the
// operator names a later one by number, never "latest" -- the Editions row
// and this flag are the two places the operator says which, and neither is
// inferred from the other.
const editionFlag = process.env.EDITION?.trim();
const edition = editionFlag === undefined || editionFlag === ""
  ? 1
  : Number(editionFlag);
if (!Number.isInteger(edition) || edition < 1) {
  throw new Error("EDITION must be a positive integer");
}

const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const entered = await enterActiveCompetitionRosters(
    database, config.season, edition
  );
  console.log(
    `Entered ${entered.length} Entrants for Edition ${edition}: `
    + entered.join(", ")
  );
  // Said rather than silent: a Competition with no roster of record for this
  // Edition was left as it stands, and an operator reading a count of
  // thirty-two who expected thirty-nine should see which one was not asked.
  const skipped = MATCH_PROMPT_COMPETITIONS
    .filter((competition) => editionRosterOf(competition, edition) === null);
  if (skipped.length > 0) {
    console.log(
      `Left as they stand, having no Edition ${edition} roster of record: `
      + skipped.join(", ")
    );
  }
} finally {
  await database.end();
}

import pg from "pg";
import {
  buildMatchContext,
  loadMatchContextData
} from "../predictions/build-match-context.js";
import type { MatchPromptFixture } from "../predictions/openrouter-entrant.js";
import { readFetchJobConfig } from "./config.js";

/**
 * Print the context each Entrant would be sent for one Gameweek, built by the
 * real builder over the real database — and nothing else. No OpenRouter call,
 * no write, no key: the free look at what `predict` is about to pay to send.
 */
const { Client } = pg;
const config = readFetchJobConfig(process.env);

const database = new Client({ connectionString: config.databaseUrl });
await database.connect();
try {
  const fixtures = await database.query<MatchPromptFixture>(
    `select fixture_id, home_team, away_team, kickoff_at from fixtures
      where competition = 'PL' and season = $1
        and coalesce(locked_in_gw, gw) = $2 and not deferred
      order by kickoff_at, fixture_id`,
    [config.season, config.gameweek]
  );
  const data = await loadMatchContextData(
    database, "PL", config.season, config.gameweek
  );
  for (const fixture of fixtures.rows) {
    console.log(`\n${"=".repeat(76)}`);
    console.log(
      `Fixture ${fixture.fixture_id}: `
      + `${fixture.home_team} v ${fixture.away_team}`
    );
    console.log("=".repeat(76));
    console.log(buildMatchContext(fixture, data));
  }
  console.log(
    `\n${fixtures.rows.length} fixtures, `
    + `${data.historicalMatches.length} historical matches behind the form `
    + `lines, ${data.fplPlayers.length} FPL player rows`
  );
} finally {
  await database.end();
}

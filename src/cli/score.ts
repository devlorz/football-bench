import pg from "pg";
import {
  scoreMatchCompetitions
} from "../predictions/score-match-gameweek.js";
import { readScoreJobConfig } from "./config.js";

const { Client } = pg;
const config = readScoreJobConfig(process.env);
// The cron sets no `COMPETITION` and scores every listed league; an operator
// who has just landed an Exhibition Run in one of them can name it and skip
// the four with nothing new to say. Read here rather than in the config
// reader because `readScoreJobConfig` is also the roster CLI's, which has no
// Competition to narrow -- and defaulted to absent rather than to `PL`, so a
// forgotten variable scores everything instead of silently scoring one league.
const competition = process.env.COMPETITION?.trim().toUpperCase() || null;
const database = new Client({ connectionString: config.databaseUrl });

await database.connect();
try {
  const scored = await scoreMatchCompetitions({
    database,
    season: config.season,
    // Spread rather than passed as `competition: null`: an absent option must
    // stay absent, which is what tells the scorer to take every listed league.
    ...(competition === null ? {} : { competition }),
    now: () => new Date()
  });
  // A Season with no Competition listed is the one state this job cannot tell
  // apart from success by its exit code, and it is a state a fresh deploy is
  // actually in: migration 0022 relabels the record it finds, so a database
  // migrated from empty has no `competitions` row until an operator writes one
  // (docs/runbooks/pre-cron-checklist.md). Left to the loop it would print
  // nothing at all, which reads as a clean run.
  if (scored.length === 0) {
    console.log(
      competition === null
        ? `No Competition is listed for ${config.season}, so nothing was `
          + "scored. List the Season's Competitions before trusting this job."
        : `${competition} is not listed for ${config.season}, so nothing was `
          + "scored. Check the code, or drop COMPETITION to score them all."
    );
  }
  for (const { competition, gameweeks } of scored) {
    console.log(
      gameweeks.length === 0
        ? `No Gameweek of ${competition} ${config.season} owns a Lock yet; `
          + "nothing to score"
        : `Scored ${competition} ${config.season} Gameweeks `
          + gameweeks.join(", ")
    );
  }
} finally {
  await database.end();
}

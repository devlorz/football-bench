import pg from "pg";
import { buildFplTrackContext } from "../context/build-fpl-track-context.js";
import { FPL_PROMPT_VERSION } from "../context/build-fpl-track-context.js";
import { openingManagerState } from "../fpl/apply-gameweek-action.js";
import { loadLockedGameweek } from "../fpl/fpl-gameweek-context.js";
import { loadStandingManagerState } from "../fpl/manager-state-store.js";
import { carriedThroughSilence } from "../fpl/open-fpl-gameweek.js";
import { readFetchJobConfig } from "./config.js";

/**
 * Print the context each Entrant would be sent for one FPL Gameweek, built by
 * the real builder over the real database — and nothing else. No OpenRouter
 * call, no write, no key: the free look at what `fpl:scheduled` is about to
 * pay to send, which is what `context:show` is for the Match track.
 *
 * Its own command and not a flag on that one: a Match context is one Fixture's
 * and the same text goes to every Entrant, while an FPL context is one
 * Entrant's from the second Gameweek onwards because it carries that Entrant's
 * own Squad. The two loop over different things.
 */
const { Client } = pg;
const config = readFetchJobConfig(process.env);

const database = new Client({ connectionString: config.databaseUrl });
await database.connect();
try {
  const { deadline, pool, ...windows } =
    await loadLockedGameweek(database, config.season, config.gameweek);

  const seats = await database.query<{ id: string }>(
    `select id from models
      where role = 'entrant' and prompt_version = $1
      order by id`,
    [FPL_PROMPT_VERSION]
  );
  if (seats.rows.length === 0) {
    throw new Error(
      `No Entrant is seated under ${FPL_PROMPT_VERSION}; `
      + "`npm run roster:enter` seats them"
    );
  }

  const bodies = new Map<string, string[]>();
  for (const { id } of seats.rows) {
    // What the Entrant carries in, exactly as the run reads it: the standing
    // Manager State folded through every Gameweek it was silent in. A seat
    // with none has not opened yet, and the opening is the empty Squad every
    // Entrant starts from (`startFplTrack`).
    const standing = await loadStandingManagerState(database, {
      entrantId: id,
      season: config.season,
      before: config.gameweek
    });
    const state = standing === null
      ? openingManagerState()
      : await carriedThroughSilence(
        database, config.season, standing, config.gameweek
      );
    const body = buildFplTrackContext({
      season: config.season,
      gameweek: config.gameweek,
      state,
      pool,
      ...windows
    });
    bodies.set(body, [...bodies.get(body) ?? [], id]);
  }

  // Grouped by body, because at the opening every Entrant starts from the same
  // empty Squad and the bodies are identical — the run stores ten copies for a
  // reason of its own, and printing ten here would bury the one thing worth
  // reading in nine repeats of it.
  for (const [body, seated] of bodies) {
    console.log(`\n${"=".repeat(76)}`);
    console.log(seated.join(", "));
    console.log("=".repeat(76));
    console.log(body);
  }

  console.log(
    `\nFPL ${config.season} Gameweek ${config.gameweek}, deadline `
    + `${deadline.toISOString()}: ${seats.rows.length} seats, `
    + `${bodies.size} distinct ${bodies.size === 1 ? "body" : "bodies"}, `
    + `${pool.length} players in the locked pool`
  );
} finally {
  await database.end();
}

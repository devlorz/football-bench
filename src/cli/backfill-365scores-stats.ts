import pg from "pg";
import { nodeHttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import { datasetNameOf } from "../international-results/fetch-results.js";
import {
  listingSource,
  scores365CompetitionIdOf,
  parseScores365Games,
  parseScores365Sheet,
  SCORES_365_SOURCE,
  sheetSource,
  sheetUrl,
  storedTeamName
} from "../365scores/fetch-match-stats.js";

/**
 * A one-off, by hand: shots and xG for internationals already played, read
 * from 365Scores into `team_match_stats` so a side's recent form can carry
 * them (ADR-0058). The daily fetch reads sheets only for this Season's own
 * settled Fixtures; this reads them for the rows `international_results`
 * already holds, over a date range, for one Competition's own tournament.
 *
 * Reaches no Base Model. Every response is archived before it is read, as the
 * daily fetch archives its own. Rows land under `SEASON` as given, keyed by
 * source and 365Scores' own game id, so a later run is an upsert and a sheet
 * already complete is not asked for again.
 *
 *   DATABASE_URL=... SEASON=2024-25 FROM=2024-09-01 TO=2025-06-30 \
 *     npm run --silent stats:backfill
 *
 * `COMPETITION` defaults to `UNL`; `DRY_RUN=1` reads and archives nothing and
 * only says which days and games it would ask for.
 *
 * Every tournament the dataset names for these sides is asked, not only the
 * Competition's own: a side's five most recent internationals are World Cup
 * and qualifying matches as often as Nations League ones, and the form line
 * carries figures for whichever a sheet was read for. Each dataset tournament
 * maps to the 365Scores competition that lists it, read off its search
 * endpoint on 2026-09-22; a tournament outside the map is reported and
 * skipped. The rows are filed under the Competition whose packet reads them
 * (`competition` is the reader, not the tournament -- migration 0042's key
 * says where the number came from, and that is the source and the game id).
 */

/**
 * International friendlies have no one competition on 365Scores -- each is
 * filed under a regional "Friendly International" -- so the day's whole
 * football listing is asked and the pair does the matching. `ALL` is the
 * marker for that.
 */
const ALL = "all";

/** 365Scores' competition for each name the dataset gives a tournament. */
const SCORES_365_BY_TOURNAMENT: Readonly<Record<string, string>> = {
  "UEFA Nations League": "7016",
  "FIFA World Cup": "5930",
  "FIFA World Cup qualification": "5421", // UEFA's qualifiers; the sides are UEFA's
  Friendly: ALL,
  "FIFA Series": "9034",
  "Baltic Cup": "6372"
};

const COMMON_PARAMS =
  "appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1";

function listingUrlFor(scoresId: string, date: string): string {
  const day = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return scoresId === ALL
    ? `https://webws.365scores.com/web/games/allscores/?${COMMON_PARAMS}`
      + `&startDate=${day}&endDate=${day}&sports=1`
    : `https://webws.365scores.com/web/games/?${COMMON_PARAMS}`
      + `&competitions=${scoresId}&startDate=${day}&endDate=${day}`;
}

/** The UTC day after, as `YYYY-MM-DD`. */
function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
const { Client } = pg;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
const season = required("SEASON");
const from = required("FROM");
const to = required("TO");
const competition = process.env.COMPETITION ?? "UNL";
const dryRun = process.env.DRY_RUN === "1";
if (!/^\d{4}-\d{2}$/.test(season) || !/^\d{4}-\d{2}-\d{2}$/.test(from)
  || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
  throw new Error("SEASON must look like 2024-25 and FROM/TO like 2024-09-01");
}
if (datasetNameOf(competition) === undefined) {
  throw new Error(`Competition ${competition} has no dataset name`);
}

const database = new Client({ connectionString: databaseUrl });
await database.connect();
try {
  // The days to ask about are the record's own: every day the dataset holds a
  // match of this tournament in the range. Names come back in the record's
  // spelling already (the dataset fetch resolved them), which is what the
  // listing's names are mapped onto below.
  const { rows: matches } = await database.query<{
    played_on: string;
    home_team: string;
    away_team: string;
    tournament: string;
  }>(
    `select played_on::text as played_on, home_team, away_team, tournament
       from international_results
      where played_on between $1 and $2
      order by played_on`,
    [from, to]
  );
  // One listing per (tournament, day); the pairs of that day are what a
  // listed game has to match, either way round, since a neutral-venue match
  // may be ordered differently by the two sources.
  const byDay = new Map<string, Set<string>>();
  const unmapped = new Set<string>();
  for (const match of matches) {
    if (SCORES_365_BY_TOURNAMENT[match.tournament] === undefined) {
      unmapped.add(match.tournament);
      continue;
    }
    const key = `${match.tournament}|${match.played_on}`;
    const day = byDay.get(key) ?? new Set<string>();
    day.add(`${match.home_team}|${match.away_team}`);
    byDay.set(key, day);
  }
  for (const name of unmapped) {
    console.error(`no 365Scores competition mapped for "${name}", skipped`);
  }
  const { rows: stored } = await database.query<{ source_match_id: string }>(
    `select source_match_id from team_match_stats
      where competition = $1 and season = $2 and source = $3
        and home_xg is not null and away_xg is not null`,
    [competition, season, SCORES_365_SOURCE]
  );
  const complete = new Set(stored.map(({ source_match_id: id }) => id));
  console.log(
    `${matches.length} rows over ${byDay.size} tournament-days, `
    + `${complete.size} sheets already complete${dryRun ? " (dry run)" : ""}`
  );

  let asked = 0;
  let written = 0;
  let holes = 0;
  for (const [key, pairs] of byDay) {
    const [tournament, day] = key.split("|") as [string, string];
    const scoresId = SCORES_365_BY_TOURNAMENT[tournament]!;
    // The Competition's own listing keeps the daily fetch's name; another
    // tournament's carries its 365Scores id, so two listings of one day are
    // two snapshots and not one overwriting the other.
    if (dryRun) {
      console.log(`${day} ${tournament}: would list ${[...pairs].join(", ")}`);
      continue;
    }
    // The dataset dates a match by where it was played; 365Scores by UTC. A
    // World Cup match in the Americas at 19:00 local is the next UTC day, so
    // the day after is listed too and the pair does the matching. The
    // snapshot is named by the day listed, so the two are two rows.
    const games = [];
    for (const listed of [day, dayAfter(day)]) {
      const source = scoresId === scores365CompetitionIdOf(competition)
        ? listingSource(competition, season, listed)
        : `${listingSource(competition, season, listed)}:${scoresId}`;
      const listing = await nodeHttpFetcher(
        listingUrlFor(scoresId, listed), { method: "GET" }
      );
      await storeRawSnapshots(database, [{ source, body: listing.body }]);
      if (listing.status < 200 || listing.status >= 300) {
        console.error(`${listed} ${tournament}: listing answered ${listing.status}`);
        continue;
      }
      // A day 365Scores lists nothing for answers without a `games` array at
      // all rather than with an empty one; that is an empty day here,
      // reported so a tournament that never answers is visible, and never a
      // crash that leaves the rest of the range unread.
      try {
        games.push(...parseScores365Games(source, listing.body));
      } catch (error) {
        console.error(`${listed} ${tournament}: listing unreadable `
          + `(${error instanceof Error ? error.message.slice(0, 80) : String(error)})`);
      }
    }
    for (const game of games) {
      const listedHome = storedTeamName(game.home.name);
      const listedAway = storedTeamName(game.away.name);
      // Stored in the dataset's orientation, which is the key the packet
      // joins on; a listing that has the sides the other way round has its
      // figures swapped to match.
      const swapped = !pairs.has(`${listedHome}|${listedAway}`)
        && pairs.has(`${listedAway}|${listedHome}`);
      if ((!pairs.has(`${listedHome}|${listedAway}`) && !swapped)
        || complete.has(game.id)) {
        continue;
      }
      const home = swapped ? listedAway : listedHome;
      const away = swapped ? listedHome : listedAway;
      asked += 1;
      const sheetName = sheetSource(competition, season, game.id);
      const response = await nodeHttpFetcher(sheetUrl(game.id), { method: "GET" });
      await storeRawSnapshots(database, [{ source: sheetName, body: response.body }]);
      if (response.status < 200 || response.status >= 300) {
        console.error(`${day} ${home} v ${away}: sheet answered ${response.status}`);
        continue;
      }
      const sheet = parseScores365Sheet(sheetName, response.body);
      if (sheet.game.id !== game.id) {
        console.error(`${day} ${home} v ${away}: sheet answered for another game`);
        continue;
      }
      await database.query(
        `insert into team_match_stats (
           season, competition, source, source_match_id, kicked_off_at,
           home_team, away_team, home_shots, away_shots,
           home_shots_on_target, away_shots_on_target, home_xg, away_xg
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (season, competition, source, source_match_id)
         do update set
           kicked_off_at        = excluded.kicked_off_at,
           home_shots           = excluded.home_shots,
           away_shots           = excluded.away_shots,
           home_shots_on_target = excluded.home_shots_on_target,
           away_shots_on_target = excluded.away_shots_on_target,
           home_xg              = excluded.home_xg,
           away_xg              = excluded.away_xg`,
        [
          season, competition, SCORES_365_SOURCE, game.id, game.kickedOffAt,
          home, away,
          swapped ? sheet.awayShots : sheet.homeShots,
          swapped ? sheet.homeShots : sheet.awayShots,
          swapped ? sheet.awayShotsOnTarget : sheet.homeShotsOnTarget,
          swapped ? sheet.homeShotsOnTarget : sheet.awayShotsOnTarget,
          swapped ? sheet.awayXg : sheet.homeXg,
          swapped ? sheet.homeXg : sheet.awayXg
        ]
      );
      written += 1;
      if (sheet.homeXg === null || sheet.awayXg === null) {
        holes += 1;
        console.log(`${day} ${home} v ${away}: shots stored, xG is a hole`);
      }
    }
  }
  console.log(`asked ${asked} sheets, wrote ${written} rows, ${holes} holes`);
} finally {
  await database.end();
}

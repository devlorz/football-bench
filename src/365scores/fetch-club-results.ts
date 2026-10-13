import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";
import {
  clubResultsSource,
  clubResultsUrl,
  parsed,
  parseScores365Sheet,
  readAndArchive,
  type Scores365Side,
  Scores365ValidationError,
  SCORES_365_SOURCE,
  sheetSource,
  sheetUrl,
  storedTeamName
} from "./fetch-match-stats.js";

type Database = Pick<Client, "query">;

/**
 * Each cup side's 365Scores competitor id, keyed by the side as the record
 * stores it (ADR-0063). Derived from 365Scores' own standings for the
 * competition, joined through the reviewed name map of ticket 0101, and never
 * found by a search: a search for "Inter" or "Sporting" answers with whichever
 * club ranks first. A Competition with no map is refused (ADR-0054), so `UEL`
 * and `UECL` read nothing here until tickets 0107 and 0108.
 */
const COMPETITOR_ID_BY_SIDE: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  UCL: {
    "AEK Athens": 1024,
    Arsenal: 104,
    "Aston Villa": 109,
    Atleti: 134,
    "B. Dortmund": 341,
    Barcelona: 132,
    "Bayern München": 331,
    "Bodø/Glimt": 1978,
    "Club Brugge": 1169,
    Como: 6117,
    Fenerbahçe: 946,
    Feyenoord: 691,
    Galatasaray: 945,
    Inter: 224,
    LASK: 1743,
    Leipzig: 7171,
    Lens: 481,
    Lille: 478,
    Liverpool: 108,
    "Man City": 110,
    "Man Utd": 105,
    Napoli: 234,
    Paris: 480,
    Porto: 887,
    PSV: 725,
    "Real Betis": 146,
    "Real Madrid": 131,
    Roma: 225,
    "S. Bratislava": 2112,
    Sabah: 50201,
    Shakhtar: 1955,
    "Slavia Praha": 1789,
    "Sporting CP": 890,
    Stuttgart: 338,
    Viking: 1980,
    Villarreal: 133
  }
};

/** This Competition's competitor ids, or undefined where it has none. */
export function clubCompetitorIdsOf(
  competition: string
): Readonly<Record<string, number>> | undefined {
  return COMPETITOR_ID_BY_SIDE[competition];
}

/**
 * The competitions 365Scores lists that are friendlies, dropped at the fetch
 * so that none ever counts as competitive form (ADR-0063). A reviewed list
 * and not a flag: 365Scores' competition metadata marks no friendly as one,
 * and the pre-season invitationals are listed as competitions of their own.
 * Read off all 36 `UCL` pages on 2026-10-12.
 */
const FRIENDLIES: ReadonlySet<string> = new Set([
  "Club Friendlies",
  "Emirates Cup",
  "Joan Gamper Trophy"
]);

/** The first day a club cup's history is stored for (spec 0028). */
const STORED_FROM = new Date("2026-07-01T00:00:00Z");

/** The pause between two clubs' listings: polite to an undocumented host. */
const PAUSE_MS = 400;

const sideSchema = z.looseObject({
  id: z.number().int(),
  name: z.string().min(1),
  /** `-1` for a match the listing carries without a score, e.g. postponed. */
  score: z.number()
});

const resultsSchema = z.looseObject({
  competitions: z.array(z.looseObject({
    id: z.number().int(),
    name: z.string().min(1)
  })),
  games: z.array(z.looseObject({
    id: z.number().int(),
    competitionId: z.number().int(),
    startTime: z.iso.datetime({ offset: true }),
    homeCompetitor: sideSchema,
    awayCompetitor: sideSchema
  }))
});

export class UnknownClubCompetitorError extends Error {
  constructor(
    public readonly competition: string,
    public readonly team: string
  ) {
    super(
      `${team} plays in Competition ${competition} and has no 365Scores `
      + "competitor id; add it to src/365scores/fetch-club-results.ts from "
      + "365Scores' standings rather than searching for the club"
    );
    this.name = "UnknownClubCompetitorError";
  }
}

export class ClubResultsFetchError extends AggregateError {
  constructor(
    public readonly competition: string,
    public readonly teams: string[],
    errors: unknown[]
  ) {
    super(
      errors,
      `Competition ${competition}: no 365Scores results read for `
      + teams.join(", ")
    );
    this.name = "ClubResultsFetchError";
  }
}

export interface FetchClubResultsOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  pause?: (() => Promise<void>) | undefined;
}

/**
 * Every settled match each of a cup's sides has played, in any competition
 * but a friendly, from one 365Scores results page a side (ADR-0063).
 *
 * One page and no more: a page held 18 to 29 matches for every side on
 * 2026-10-12, and a packet shows five.
 * ponytail: `previousPage` is not followed; follow it when a side comes back
 * with fewer than five competitive matches, and the packet already says so.
 *
 * A side's failed listing does not stop the others being read: each is stored
 * as it arrives, and the sides that failed fail the Competition's day by name
 * at the end.
 */
export async function fetchClubResults({
  database,
  competition,
  season,
  http,
  pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}: FetchClubResultsOptions): Promise<void> {
  const { rows } = await database.query<{ team: string }>(
    `select home_team as team from fixtures
      where competition = $1 and season = $2
     union
     select away_team from fixtures
      where competition = $1 and season = $2
     order by team`,
    [competition, season]
  );
  const ids = clubCompetitorIdsOf(competition) ?? {};
  // Asked of every side before the first request, so a side the map lacks is
  // refused by name rather than read under a guess.
  const sides = rows.map(({ team }) => {
    const id = ids[team];
    if (id === undefined) {
      throw new UnknownClubCompetitorError(competition, team);
    }
    return { team, id };
  });
  const failed: string[] = [];
  const errors: unknown[] = [];
  for (const [index, { team, id }] of sides.entries()) {
    if (index > 0) {
      await pause();
    }
    try {
      const source = clubResultsSource(competition, season, id);
      const listing = parsed(source, resultsSchema, await readAndArchive(
        database, http, clubResultsUrl(id), source
      ));
      const names = new Map(listing.competitions
        .map((entry) => [entry.id, entry.name]));
      // The listed side is named as the record stores it, found by its id
      // rather than its spelling; an opponent keeps 365Scores' spelling unless
      // it is another of the cup's sides.
      const nameOf = (side: z.infer<typeof sideSchema>): string =>
        side.id === id ? team : storedTeamName(competition, side.name);
      // The whole page is read into rows before any is written, so a page
      // refused for one game stores none of its others.
      const rows = listing.games.flatMap((game) => {
        const competitionName = names.get(game.competitionId);
        // Refused rather than skipped: a match nobody can name is a match a
        // packet would silently lack.
        if (competitionName === undefined) {
          throw new Scores365ValidationError(source, [{
            field: `games.${game.id}.competitionId`,
            detail: `${game.competitionId} is not among the page's competitions`
          }]);
        }
        const kickedOffAt = new Date(game.startTime);
        if (
          FRIENDLIES.has(competitionName)
          || kickedOffAt.getTime() < STORED_FROM.getTime()
          || game.homeCompetitor.score < 0
          || game.awayCompetitor.score < 0
        ) {
          return [];
        }
        return [[
          SCORES_365_SOURCE,
          String(game.id),
          kickedOffAt,
          nameOf(game.homeCompetitor),
          nameOf(game.awayCompetitor),
          game.homeCompetitor.score,
          game.awayCompetitor.score,
          competitionName
        ]];
      });
      for (const row of rows) {
        await database.query(
          `insert into club_results (
             source, source_match_id, kicked_off_at, home_team, away_team,
             home_goals, away_goals, competition_name
           ) values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (source, source_match_id) do update set
             kicked_off_at    = excluded.kicked_off_at,
             home_team        = excluded.home_team,
             away_team        = excluded.away_team,
             home_goals       = excluded.home_goals,
             away_goals       = excluded.away_goals,
             competition_name = excluded.competition_name`,
          row
        );
      }
    } catch (error) {
      failed.push(team);
      errors.push(error);
    }
  }
  if (failed.length > 0) {
    throw new ClubResultsFetchError(competition, failed, errors);
  }
}

export class ClubResultSheetsFetchError extends AggregateError {
  constructor(
    public readonly competition: string,
    public readonly games: string[],
    errors: unknown[]
  ) {
    super(
      errors,
      `Competition ${competition}: no 365Scores sheet read for games `
      + games.join(", ")
    );
    this.name = "ClubResultSheetsFetchError";
  }
}

export interface FetchClubResultSheetsOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  now: () => Date;
  pause?: (() => Promise<void>) | undefined;
}

/** How old a match is before its sheet is read (spec 0028 story 50d). */
const SHEET_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The shots, shots on target and xG of each `club_results` row touching one
 * of this cup's sides, from its 365Scores sheet (ADR-0063 as amended
 * 2026-10-13). A row is read once a day old and once only: `sheet_read_at`
 * marks it read whatever the sheet held, so a sheet without xG is final and a
 * row another cup already read is not asked for again.
 *
 * A failed request leaves its row unread for the next morning; the others are
 * stored as they arrive, and the failures fail the Competition's day by name.
 */
export async function fetchClubResultSheets({
  database,
  competition,
  season,
  http,
  now,
  pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
}: FetchClubResultSheetsOptions): Promise<void> {
  const readAt = now();
  const { rows } = await database.query<{
    source_match_id: string;
    home_team: string;
    away_team: string;
  }>(
    `select source_match_id, home_team, away_team from club_results r
      where r.source = $3 and r.sheet_read_at is null
        and r.kicked_off_at <= $4
        and exists (
          select 1 from fixtures f
           where f.competition = $1 and f.season = $2
             and (r.home_team in (f.home_team, f.away_team)
               or r.away_team in (f.home_team, f.away_team)))
      order by r.kicked_off_at`,
    [competition, season, SCORES_365_SOURCE,
      new Date(readAt.getTime() - SHEET_AGE_MS)]
  );
  const ids = clubCompetitorIdsOf(competition) ?? {};
  // A sheet's side named as `fetchClubResults` names a listing's: a cup side
  // by its competitor id, anyone else by 365Scores' spelling.
  const nameOf = (side: Scores365Side): string =>
    Object.entries(ids).find(([, id]) => id === side.id)?.[0]
      ?? storedTeamName(competition, side.name);
  const failed: string[] = [];
  const errors: unknown[] = [];
  for (const [index, row] of rows.entries()) {
    if (index > 0) {
      await pause();
    }
    try {
      const source = sheetSource(competition, season, row.source_match_id);
      const sheet = parseScores365Sheet(source, await readAndArchive(
        database, http, sheetUrl(row.source_match_id), source
      ));
      const home = nameOf(sheet.game.home);
      const away = nameOf(sheet.game.away);
      if (
        sheet.game.id !== row.source_match_id
        || home !== row.home_team
        || away !== row.away_team
      ) {
        throw new Scores365ValidationError(source, [{
          field: "games.0",
          detail: `sheet is game ${sheet.game.id}, ${home} v ${away}; `
            + `the row is ${row.home_team} v ${row.away_team}`
        }]);
      }
      await database.query(
        `update club_results set
           home_shots = $3, away_shots = $4,
           home_shots_on_target = $5, away_shots_on_target = $6,
           home_xg = $7, away_xg = $8, sheet_read_at = $9
         where source = $1 and source_match_id = $2`,
        [
          SCORES_365_SOURCE, row.source_match_id,
          sheet.homeShots, sheet.awayShots,
          sheet.homeShotsOnTarget, sheet.awayShotsOnTarget,
          sheet.homeXg, sheet.awayXg, readAt
        ]
      );
    } catch (error) {
      failed.push(row.source_match_id);
      errors.push(error);
    }
  }
  if (failed.length > 0) {
    throw new ClubResultSheetsFetchError(competition, failed, errors);
  }
}

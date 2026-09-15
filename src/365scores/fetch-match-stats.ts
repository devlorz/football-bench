import type { Client } from "pg";
import { z } from "zod";
import type { FixtureResult } from "../fixture-result.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";

type Database = Pick<Client, "query">;

const API_ROOT = "https://webws.365scores.com/web";

/**
 * The envelope 365Scores' web frontend sends on every call, carried verbatim:
 * the app type and language decide the field names the sheet is read by, and
 * `timezoneName=UTC` is what makes a day a UTC day here rather than a day in
 * whatever zone the host guessed.
 */
const COMMON_PARAMS =
  "appTypeId=5&langId=1&timezoneName=UTC&userCountryId=1";

/**
 * 365Scores' own id for each Competition this record reads from it, on the
 * same terms as UEFA's: not derivable from the Competition code, so a
 * Competition that is not here is refused rather than read under another
 * Competition's number.
 */
const SCORES_365_COMPETITION_IDS: Readonly<Record<string, string>> = {
  UNL: "7016"
};

/**
 * The three sides 365Scores spells differently from the record (ADR-0058);
 * the other fifty-one match character for character. A map and not a
 * normalisation rule: "Ireland" is a different side from the "Northern
 * Ireland" the record also holds, so nothing but a reviewed pair can say
 * which one this source means.
 */
const STORED_NAME_BY_LISTED_NAME: Readonly<Record<string, string>> = {
  Ireland: "Republic of Ireland",
  Turkiye: "Türkiye",
  "Bosnia & Herzegovina": "Bosnia and Herzegovina"
};

/**
 * What `team_match_stats.source` holds for every row this fetch writes, and
 * the word the registry names this source by: the table is keyed by the
 * source that issued the id (migration 0042), so the fetch that writes a row
 * and the packet that reads it back have to agree.
 *
 * The comparisons are tied by the compiler -- the registry's `stats` is a
 * union of literals, so a rename on one side alone is a type error at every
 * `===` -- and the strings inside SQL are not tied by anything. This is what
 * both ends read, so the untied half is one constant rather than one per
 * query, and a test seeding the row binds it too.
 */
export const SCORES_365_SOURCE = "365scores";

/** The three names this source reads by, of the thirty-eight a sheet holds. */
const XG = "Expected Goals";
const SHOTS = "Total Shots";
const SHOTS_ON_TARGET = "Shots On Target";

/**
 * What each of the three may look like. A count and a rate and not a number
 * of decimal places: nothing here is rounded or reformatted, the value is
 * read as the source wrote it, and these decide only whether it was written
 * as the figure its name says.
 */
const A_COUNT = /^\d+$/;
const A_RATE = /^\d+(\.\d+)?$/;

const competitorSchema = z.looseObject({
  id: z.number().int(),
  name: z.string().min(1),
  /** `-1` until the match is played, and the goals scored once it is. */
  score: z.number()
});

const gameSchema = z.looseObject({
  id: z.number().int(),
  startTime: z.iso.datetime({ offset: true }),
  homeCompetitor: competitorSchema,
  awayCompetitor: competitorSchema
});

const listingSchema = z.looseObject({
  games: z.array(gameSchema)
});

const sheetSchema = z.looseObject({
  statistics: z.array(z.looseObject({
    name: z.string().min(1),
    competitorId: z.number().int(),
    value: z.string()
  })),
  /**
   * A match sheet names its own game. Read from here rather than taken from
   * the listing that supplied the id, so a sheet answered for another match is
   * visible instead of being filed under the match that was asked for.
   */
  games: z.array(gameSchema).min(1)
});

export interface Scores365Side {
  id: number;
  name: string;
  score: number;
}

export interface Scores365Game {
  /** The feed sends a number; the record keys a source's match by its text. */
  id: string;
  kickedOffAt: Date;
  home: Scores365Side;
  away: Scores365Side;
}

export interface Scores365Sheet {
  game: Scores365Game;
  /**
   * Null is ADR-0058's hole and never a zero: about four per cent of sheets
   * carry every shot count and no xG at all, on repeated reads.
   */
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homeXg: number | null;
  awayXg: number | null;
}

export interface Scores365Issue {
  field: string;
  detail: string;
}

export class Scores365ValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: Scores365Issue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "Scores365ValidationError";
  }
}

export class Scores365HttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "Scores365HttpError";
  }
}

export class UnknownScores365CompetitionError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads 365Scores, which needs its 365Scores `
      + "competition id in src/365scores/fetch-match-stats.ts"
    );
    this.name = "UnknownScores365CompetitionError";
  }
}

export class UnknownScores365TeamError extends Error {
  constructor(
    public readonly competition: string,
    public readonly team: string
  ) {
    super(
      `365Scores lists ${team} in Competition ${competition}, which is not a `
      + "side this record stores; add the spelling to the name map in "
      + "src/365scores/fetch-match-stats.ts rather than letting a Fixture "
      + "join the wrong side"
    );
    this.name = "UnknownScores365TeamError";
  }
}

export function storedTeamName(listedName: string): string {
  return STORED_NAME_BY_LISTED_NAME[listedName] ?? listedName;
}

/** This Competition's 365Scores id, or undefined where the map has none. */
export function scores365CompetitionIdOf(
  competition: string
): string | undefined {
  return SCORES_365_COMPETITION_IDS[competition];
}

/**
 * The Competition a 365Scores competition id stands for, for a URL read back.
 * The same three lines `uefaCompetitionOf` is, over a different map, and left
 * as two copies: what they share is the shape of a reversed lookup, which is
 * smaller than the import a shared one would cost, and the two maps are never
 * read together.
 */
export function scores365CompetitionOf(id: string): string | undefined {
  return Object.entries(SCORES_365_COMPETITION_IDS)
    .find(([, known]) => known === id)?.[0];
}

/** 365Scores asks for a day as `DD/MM/YYYY`; the record writes `YYYY-MM-DD`. */
function listedDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function listingUrl(competition: string, date: string): string {
  const id = scores365CompetitionIdOf(competition);
  if (id === undefined) {
    throw new UnknownScores365CompetitionError(competition);
  }
  const day = listedDate(date);
  return `${API_ROOT}/games/?${COMMON_PARAMS}&competitions=${id}`
    + `&startDate=${day}&endDate=${day}`;
}

export function sheetUrl(gameId: string): string {
  return `${API_ROOT}/game/stats/?${COMMON_PARAMS}&games=${gameId}`;
}

/**
 * `source:season:competition:...`, the shape every other source in this
 * archive is named by (`uefa:2026-27:UNL:0`, `understat:2026-27:EPL`).
 *
 * Neither URL carries the Season, and a third naming shape was the other
 * option: the dry run's replay has to turn a URL back into one of these, and
 * a name holding more than its URL does cannot be built from the URL alone.
 * It does not have to be — `fplLiveSource` has matched a Gameweek's snapshot
 * by its ending since the first rehearsal, and the replay reads these two the
 * same way. The alternative saved ten lines there and left this archive with
 * one family of names that did not say which Season its bytes were from.
 */
export function listingSource(
  competition: string,
  season: string,
  date: string
): string {
  return `365scores:${season}:${competition}:games:${date}`;
}

export function sheetSource(
  competition: string,
  season: string,
  gameId: string
): string {
  return `365scores:${season}:${competition}:stats:${gameId}`;
}

/** What the replay matches a sheet's URL on, Season and Competition aside. */
export const SHEET_SOURCE_ENDING = ":stats:";

function parsed<T>(
  source: string,
  schema: z.ZodType<T>,
  body: string
): T {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Scores365ValidationError(
      source, [{ field: "$", detail: "invalid JSON" }]
    );
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Scores365ValidationError(
      source,
      result.error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "$",
        detail: issue.message
      }))
    );
  }
  return result.data;
}

function gameOf(game: z.infer<typeof gameSchema>): Scores365Game {
  return {
    id: String(game.id),
    kickedOffAt: new Date(game.startTime),
    home: {
      id: game.homeCompetitor.id,
      name: game.homeCompetitor.name,
      score: game.homeCompetitor.score
    },
    away: {
      id: game.awayCompetitor.id,
      name: game.awayCompetitor.name,
      score: game.awayCompetitor.score
    }
  };
}

export function parseScores365Games(
  source: string,
  body: string
): Scores365Game[] {
  return parsed(source, listingSchema, body).games.map(gameOf);
}

/**
 * One side's figure, or null where the sheet has no row for it. A value that
 * is present and is not the number its name says is refused rather than read
 * as a hole: a hole is a row that is absent, and a source that changed the
 * shape of a row it still sends would otherwise be retried every morning for
 * ever behind a packet line reading "unavailable".
 */
function figure(
  source: string,
  rows: { name: string; competitorId: number; value: string }[],
  competitorId: number,
  name: string,
  shape: RegExp
): number | null {
  const row = rows.find((candidate) =>
    candidate.name === name && candidate.competitorId === competitorId);
  if (row === undefined) {
    return null;
  }
  if (!shape.test(row.value)) {
    throw new Scores365ValidationError(source, [{
      field: `statistics.${name}.${competitorId}`,
      detail: `expected a non-negative number, received ${row.value}`
    }]);
  }
  return Number(row.value);
}

export function parseScores365Sheet(
  source: string,
  body: string
): Scores365Sheet {
  const sheet = parsed(source, sheetSchema, body);
  const game = gameOf(sheet.games[0]!);
  const sides = new Set([game.home.id, game.away.id]);
  // A row for a competitor that is not in this match means the sheet is not
  // the match it was asked for, whatever its `games` says.
  const stranger = sheet.statistics
    .find((row) => !sides.has(row.competitorId));
  if (stranger !== undefined) {
    throw new Scores365ValidationError(source, [{
      field: "statistics.competitorId",
      detail: `${stranger.competitorId} plays no part in game ${game.id}`
    }]);
  }
  const read = (competitorId: number, name: string, shape: RegExp) =>
    figure(source, sheet.statistics, competitorId, name, shape);
  return {
    game,
    homeShots: read(game.home.id, SHOTS, A_COUNT),
    awayShots: read(game.away.id, SHOTS, A_COUNT),
    homeShotsOnTarget: read(game.home.id, SHOTS_ON_TARGET, A_COUNT),
    awayShotsOnTarget: read(game.away.id, SHOTS_ON_TARGET, A_COUNT),
    homeXg: read(game.home.id, XG, A_RATE),
    awayXg: read(game.away.id, XG, A_RATE)
  };
}

/**
 * One Fixture whose stored result 365Scores' own score does not agree with
 * (ADR-0056). Reported and never resolved: preferring either source would
 * decide a Gameweek's scoring by which host answered second.
 */
export interface ResultDisagreement {
  competition: string;
  fixtureId: number;
  kickoffAt: Date;
  homeTeam: string;
  awayTeam: string;
  stored: string;
  reported: string;
}

/**
 * One settled Fixture the day's listing did not carry, so no sheet was read
 * for it and no shots or xG were stored.
 *
 * Reported rather than skipped, and rather than refused. Skipped, it is the
 * failure this project has already had once: Understat's dates drift on some
 * matchdays, a join rate falls, and nothing says so — the packet simply reads
 * "unavailable" over a source that was answering. Refused, one Fixture
 * 365Scores has not published would take the whole Competition's morning out
 * every day until it did.
 *
 * It is what a date the two sources disagree about looks like from here: the
 * listing is asked for the day the record says the Fixture kicked off, the
 * join is made on the day 365Scores says its own game did, and a Fixture that
 * falls between them is named here rather than retried in silence.
 */
export interface UnlistedFixture {
  competition: string;
  fixtureId: number;
  kickoffAt: Date;
  homeTeam: string;
  awayTeam: string;
}

export interface FetchScores365StatsResult {
  disagreements: ResultDisagreement[];
  unlistedFixtures: UnlistedFixture[];
}

export interface FetchScores365StatsOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  now: () => Date;
}

interface StoredFixture {
  fixture_id: number;
  kickoff_at: Date;
  home_team: string;
  away_team: string;
  result: FixtureResult | null;
}

function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * How a match is named on both sides of this fetch: the day it kicked off and
 * the two sides, in the record's spelling. There is no shared id to key on —
 * 365Scores' game ids are its own and the record's Fixture ids are UEFA's —
 * and the day is the source's own on both sides, never the request's, so that
 * a date the two sources disagree about fails to join and is reported rather
 * than written under a day nothing will look for it on.
 */
function matchKey(kickedOffAt: Date, home: string, away: string): string {
  return `${utcDate(kickedOffAt)}|${home}|${away}`;
}

function scoreLine(home: number, away: number): string {
  return `${home}-${away}`;
}

async function readAndArchive(
  database: Database,
  http: HttpFetcher,
  url: string,
  source: string
): Promise<string> {
  const response = await http(url, { method: "GET" });
  // Archived before validation, so a changed or unusable response is still
  // evidence a human can read (ADR-0058: the numbers already in the record
  // have to survive the source).
  await storeRawSnapshots(database, [{ source, body: response.body }]);
  if (response.status < 200 || response.status >= 300) {
    throw new Scores365HttpError(source, response.status, url);
  }
  return response.body;
}

/**
 * One Competition's per-side shots and xG from 365Scores, and its scores as
 * the second source of results ADR-0056 asks for (ADR-0058).
 *
 * What is outstanding decides what is read, and nothing else: a settled
 * Fixture whose figures are absent or hold a hole costs one listing for its
 * day and one sheet for itself, and a day whose Fixtures are all complete is
 * never asked about again. That is ADR-0058's budget read literally — one
 * listing a day and one sheet per settled Fixture, plus the retries of holes
 * it names. Asking for every past date instead would have grown to a dozen
 * listings a morning by `MD6` and gone on until the Season closed, for days
 * nothing was left to learn about.
 *
 * A Competition whose schedule has not been read yet asks for nothing.
 */
export async function fetchScores365Stats({
  database,
  competition,
  season,
  http,
  now
}: FetchScores365StatsOptions): Promise<FetchScores365StatsResult> {
  const observedAt = now();
  const { rows: fixtures } = await database.query<StoredFixture>(
    `select fixture_id, kickoff_at, home_team, away_team, result
       from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );
  if (fixtures.length === 0) {
    return { disagreements: [], unlistedFixtures: [] };
  }
  // The record's own fifty-four, which is the only list of them there is: a
  // side is stored under the spelling its schedule source published. Reading
  // them off the stored Fixtures is sound because the schedule source refuses
  // a Season that is missing a round (ticket 0071), so this set is all
  // fifty-four or it is empty and nothing below runs at all.
  const storedNames = new Set(fixtures
    .flatMap(({ home_team: home, away_team: away }) => [home, away]));

  const { rows: stored } = await database.query<{
    kicked_off_at: Date;
    home_team: string;
    away_team: string;
  }>(
    `select kicked_off_at, home_team, away_team from team_match_stats
      where competition = $1 and season = $2 and source = $3
        and home_xg is not null and away_xg is not null`,
    [competition, season, SCORES_365_SOURCE]
  );
  const complete = new Set(stored.map((row) =>
    matchKey(row.kicked_off_at, row.home_team, row.away_team)));

  // Settled in the record, kicked off, and still short of a figure: every
  // request below is made for one of these and for nothing else. A hole keeps
  // its Fixture here until the source fills it or the Season closes
  // (ADR-0058), which is the one case where a day is read more than once.
  const outstanding = new Map(fixtures
    .filter((fixture) =>
      fixture.result !== null
      && fixture.kickoff_at.getTime() <= observedAt.getTime()
      && !complete.has(matchKey(
        fixture.kickoff_at, fixture.home_team, fixture.away_team
      )))
    .map((fixture) => [
      matchKey(fixture.kickoff_at, fixture.home_team, fixture.away_team),
      fixture
    ]));
  const dates = [...new Set([...outstanding.values()]
    .map(({ kickoff_at: kickoff }) => utcDate(kickoff)))].sort();

  const disagreements: ResultDisagreement[] = [];
  const listed = new Set<string>();
  for (const date of dates) {
    const source = listingSource(competition, season, date);
    const games = parseScores365Games(source, await readAndArchive(
      database, http, listingUrl(competition, date), source
    ));
    for (const game of games) {
      const home = storedTeamName(game.home.name);
      const away = storedTeamName(game.away.name);
      // Asked of every listed side before anything is joined: a name this
      // record does not hold is a Fixture about to be joined to the wrong
      // side or to none, and neither is a thing to discover in a packet.
      for (const [listedName, resolved] of [
        [game.home.name, home], [game.away.name, away]
      ] as const) {
        if (!storedNames.has(resolved)) {
          throw new UnknownScores365TeamError(competition, listedName);
        }
      }
      const key = matchKey(game.kickedOffAt, home, away);
      const fixture = outstanding.get(key);
      // A game that is not one of the outstanding Fixtures is not this read's
      // business: another stage, another edition, a Fixture the record has
      // not settled, or one whose figures are already complete.
      if (fixture === undefined) {
        continue;
      }
      listed.add(key);
      if (game.home.score >= 0 && game.away.score >= 0) {
        // 365Scores reports the score a match finished on, which past the
        // league phase includes extra time; the only Fixtures the record
        // holds here are league-phase ones, where there is none to include
        // (ticket 0071 refuses the knockout matchdays outright).
        //
        // Checked on the read that the shots arrive with, and so once per
        // Fixture rather than every morning: the listing is not asked for
        // again once a Fixture's figures are complete.
        const reported = scoreLine(game.home.score, game.away.score);
        const storedScore = scoreLine(
          fixture.result!.home_goals, fixture.result!.away_goals
        );
        if (reported !== storedScore) {
          disagreements.push({
            competition,
            fixtureId: fixture.fixture_id,
            kickoffAt: fixture.kickoff_at,
            homeTeam: fixture.home_team,
            awayTeam: fixture.away_team,
            stored: storedScore,
            reported
          });
        }
      }
      const sheetName = sheetSource(competition, season, game.id);
      const sheet = parseScores365Sheet(sheetName, await readAndArchive(
        database, http, sheetUrl(game.id), sheetName
      ));
      // The sheet names its own game, and this is where that is worth
      // anything: a body answered for another match would otherwise be
      // written under whichever id the row is keyed by -- one match's numbers
      // filed against another's Fixture, and nothing to point at it.
      if (sheet.game.id !== game.id) {
        throw new Scores365ValidationError(sheetName, [{
          field: "games.0.id",
          detail: `sheet for game ${game.id} answered for ${sheet.game.id}`
        }]);
      }
      // One row per sheet as it is read, and no transaction around the loop:
      // the writes are interleaved with requests to another host, and a
      // transaction held open across them would hold a row lock for as long
      // as that host takes to answer twenty-six times. A run that fails
      // half-way leaves the sheets it did read stored, which costs nothing --
      // every read is an upsert and the next morning asks only for what is
      // still outstanding.
      await database.query(
        `insert into team_match_stats (
           season, competition, source, source_match_id, kicked_off_at,
           home_team, away_team, home_shots, away_shots,
           home_shots_on_target, away_shots_on_target, home_xg, away_xg
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (season, competition, source, source_match_id)
         do update set
           kicked_off_at        = excluded.kicked_off_at,
           home_team            = excluded.home_team,
           away_team            = excluded.away_team,
           home_shots           = excluded.home_shots,
           away_shots           = excluded.away_shots,
           home_shots_on_target = excluded.home_shots_on_target,
           away_shots_on_target = excluded.away_shots_on_target,
           home_xg              = excluded.home_xg,
           away_xg              = excluded.away_xg`,
        [
          season,
          competition,
          SCORES_365_SOURCE,
          sheet.game.id,
          game.kickedOffAt,
          // The names the refusal above has already held against the record,
          // and not a second resolution of the sheet's own copy of them: one
          // guarded spelling reaches the row, or none does.
          home,
          away,
          sheet.homeShots,
          sheet.awayShots,
          sheet.homeShotsOnTarget,
          sheet.awayShotsOnTarget,
          sheet.homeXg,
          sheet.awayXg
        ]
      );
    }
  }
  return {
    disagreements,
    unlistedFixtures: [...outstanding]
      .filter(([key]) => !listed.has(key))
      .map(([, fixture]) => ({
        competition,
        fixtureId: fixture.fixture_id,
        kickoffAt: fixture.kickoff_at,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team
      }))
  };
}

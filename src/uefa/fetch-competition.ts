import type { Client } from "pg";
import { z } from "zod";
import { outcomeOf, type FixtureResult } from "../fixture-result.js";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  writeCompetitionSchedule,
  type ScheduledMatch,
  type WriteCompetitionScheduleResult
} from "../fetch/write-schedule.js";

type Database = Pick<Client, "query">;

const API_ROOT = "https://match.uefa.com/v5/matches";

/**
 * A hundred is what the feed answers by default and the most it will answer;
 * asking for it explicitly is what makes a short page mean something.
 */
const PAGE_LIMIT = 100;

/**
 * What this record reads of one Competition in UEFA's feed.
 *
 * - `id` is UEFA's own competitionId. It is not derivable from the
 *   Competition code, and a wrong one would return another Competition's
 *   schedule under this one's name.
 * - `round`, where present, is the one round read, spelled exactly as the feed
 *   spells it. Every match of any other round is skipped without a word: the
 *   club cups' qualifiers have been in their feeds since July and share the
 *   names `MD1` and `MD2` with the league phase, and a knockout round arrives
 *   the same way (ADR-0063). A respelling skips every match, which the stale
 *   guard then refuses. `UNL` names none, so its knockouts reach the map below
 *   and are refused there, as they always have been (ADR-0057).
 * - `matchdays` is the league phase's length: matchday `MDn` is Gameweek *n*
 *   up to it, and a read match outside it is refused with its name.
 */
interface UefaCompetition {
  id: string;
  round?: string;
  matchdays: number;
}

/** A Competition not in it is refused rather than guessed. */
const UEFA_COMPETITIONS: Readonly<Record<string, UefaCompetition>> = {
  UNL: { id: "2014", matchdays: 6 },
  UCL: { id: "1", round: "League Phase", matchdays: 8 },
  UEL: { id: "14", round: "League Phase", matchdays: 8 },
  UECL: { id: "2019", round: "League Phase", matchdays: 6 }
};

/**
 * The matchday names this Competition's read round is played under, in
 * Gameweek order: the whole map, and the one place its spelling lives.
 */
function matchdayNames(competition: string): string[] {
  return Array.from(
    { length: uefaCompetition(competition).matchdays },
    (_, i) => `MD${i + 1}`
  );
}

/**
 * The status that takes a Fixture off the live calendar here. It is the only
 * one either recording holds: `ABANDONED`, which 2024-25's Romania–Kosovo
 * carried forever after Kosovo left the pitch and UEFA awarded the match 3–0
 * away from the 0–0 the feed still shows.
 *
 * Unknown statuses stay on the calendar unsettled, exactly as they do in the
 * football-data.org fetch. `LIVE` has never been observed but is presumed, and
 * refusing a word nobody has seen would take the Competition's whole day out
 * in the middle of a matchday evening — the opposite of what a loud refusal is
 * for.
 */
const WITHDRAWN_STATUSES = new Set(["ABANDONED"]);

/** UEFA calls a match final with one word. */
const SETTLED_STATUSES = new Set(["FINISHED"]);

const teamSchema = z.looseObject({
  internationalName: z.string().min(1)
});

const sideScoreSchema = z.looseObject({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative()
});

const matchSchema = z.looseObject({
  id: z.string().regex(/^\d+$/),
  status: z.string().min(1),
  kickOffTime: z.looseObject({ dateTime: z.iso.datetime() }),
  matchday: z.looseObject({ name: z.string().min(1) }),
  /**
   * "League Phase": which round of the Competition the match belongs to.
   * Lenient at every level, because `UNL` does not read it and a cup that
   * does refuses a match without it by name (`inTheReadRound`).
   */
  round: z.looseObject({
    metaData: z.looseObject({ name: z.string() }).optional()
  }).optional(),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  /** "Group A2": the league-phase group, absent on a knockout match. */
  group: z.looseObject({
    metaData: z.looseObject({ groupName: z.string().min(1) })
  }).optional(),
  /**
   * Absent until a match is played, and three readings once it is: `regular`
   * at ninety minutes, `total` with extra time, `penalty` for the shoot-out.
   * Only the first settles a Fixture.
   */
  score: z.looseObject({
    regular: sideScoreSchema.optional(),
    total: sideScoreSchema.optional(),
    penalty: sideScoreSchema.optional()
  }).optional()
}).check(({ value: match, issues }) => {
  // A settled match with no ninety-minute score would be scoreable with
  // nothing to score.
  if (!SETTLED_STATUSES.has(match.status) || match.score?.regular !== undefined) {
    return;
  }
  issues.push({
    code: "custom",
    input: match.score,
    path: ["score", "regular"],
    message: `${match.status} match ${match.id} has no ninety-minute score`
  });
});

const matchesSchema = z.array(matchSchema);

export type UefaMatch = z.infer<typeof matchSchema>;

export interface UefaIssue {
  field: string;
  detail: string;
}

export class UefaValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: UefaIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "UefaValidationError";
  }
}

export class UefaHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "UefaHttpError";
  }
}

export class UnknownUefaCompetitionError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads UEFA, which needs its UEFA `
      + "competitionId in src/uefa/fetch-competition.ts"
    );
    this.name = "UnknownUefaCompetitionError";
  }
}

export class UefaMatchWithoutRoundError extends Error {
  constructor(
    public readonly competition: string,
    public readonly matchId: string
  ) {
    super(
      `Competition ${competition} match ${matchId} names no round, so it `
      + "cannot be told from a qualifier; nothing has been written"
    );
    this.name = "UefaMatchWithoutRoundError";
  }
}

export class UnknownUefaMatchdayError extends Error {
  constructor(
    public readonly competition: string,
    public readonly matchday: string,
    public readonly matchId: string
  ) {
    super(
      `Competition ${competition} match ${matchId} is in matchday `
      + `${matchday}, which is outside its league phase; no Gameweek has `
      + "been decided for it (ADR-0057, ADR-0063)"
    );
    this.name = "UnknownUefaMatchdayError";
  }
}

/**
 * The stale-source guard (ADR-0036), asked of the first page only. UEFA
 * publishes the whole league phase at the draw, so an empty first page is a
 * wrong competitionId, a wrong Season or a dead feed and never a quiet "not
 * yet" — while an empty *later* page is the ordinary way this feed says the
 * Season has run out. Only the caller of a paged source can tell those two
 * apart, which is why the guard is here and not in the shared writer.
 */
export class StaleUefaSourceError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string
  ) {
    super(
      `Competition ${competition} produced no scheduled Fixture for Season `
      + `${season}; check the Competition code and UEFA's competitionId `
      + "before the Gameweek Locks empty"
    );
    this.name = "StaleUefaSourceError";
  }
}

/**
 * The completeness guard paging makes necessary.
 *
 * UEFA answers this feed last match first: the Nations League's first page
 * holds `MD6` down to `MD3`, and only twenty-two of `MD3`'s twenty-six. Every
 * remaining `MD3` match — including the earliest kickoff of the round — plus
 * all of `MD2` and `MD1` are on the second page. So a second page that comes
 * back empty or short for a moment is not a smaller Season, it is most of a
 * Season missing, and nothing downstream can see that:
 *
 * - the stale-source guard only fires on nothing at all;
 * - the derived deadline is computed from whatever arrived, so Gameweek 3
 *   would Lock at 17:15Z off an 18:45Z kickoff, an hour and a quarter after
 *   the 16:00Z match the read never saw;
 * - the breach alert has nothing to breach on a first read, and on a later one
 *   `fixturesGoneFromTheFeed` would have withdrawn the fifty-six Fixtures the
 *   missing page carries before it could look.
 *
 * So the assembled Season is held against the matchday map before anything is
 * written: every round this Competition plays has to be in the read.
 *
 * What it does not catch: a page truncated *inside* a matchday that an earlier
 * page also carries — a second page cut off after forty of its fifty-six would
 * still hold some `MD1`, and that round's deadline could be derived from the
 * wrong kickoff. Closing that needs a total from the source, which this feed
 * publishes nowhere, or a request at a non-multiple offset, whose behaviour no
 * recording covers. The mitigation is the one ADR-0036 already relies on: an
 * unLocked deadline is re-derived on every fetch, so a bad read is corrected
 * by the next good one unless it is the last before the Lock.
 */
export class IncompleteUefaSeasonError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string,
    public readonly missing: string[],
    public readonly matchesRead: number
  ) {
    super(
      `Competition ${competition} Season ${season} was read as `
      + `${matchesRead} matches carrying no ${missing.join(", ")}; UEFA pages `
      + "the Season last match first, so a missing round is a page that did "
      + "not arrive and not a smaller Season — nothing has been written"
    );
    this.name = "IncompleteUefaSeasonError";
  }
}

export function sourceName(
  competition: string,
  season: string,
  offset: number
): string {
  return `uefa:${season}:${competition}:${offset}`;
}

/**
 * UEFA names a Season by the calendar year it closes in, so `2026-27` is
 * `seasonYear=2027` — the opposite of football-data.org, which names it by the
 * year it opens in.
 */
export function seasonYear(season: string): string {
  const match = /^(\d{4})-\d{2}$/.exec(season);
  if (match === null) {
    throw new Error(`Season must look like 2026-27, received ${season}`);
  }
  return String(Number(match[1]) + 1);
}

/** The Competition a UEFA competitionId stands for, for reading a URL back. */
export function uefaCompetitionOf(id: string): string | undefined {
  return Object.entries(UEFA_COMPETITIONS)
    .find(([, known]) => known.id === id)?.[0];
}

function uefaCompetition(competition: string): UefaCompetition {
  const entry = UEFA_COMPETITIONS[competition];
  if (entry === undefined) {
    throw new UnknownUefaCompetitionError(competition);
  }
  return entry;
}

export function competitionId(competition: string): string {
  return uefaCompetition(competition).id;
}

/**
 * The matches of the one round this Competition is read in, and every match
 * when it names none. A match with no round at all is refused: skipped, a
 * league-phase match would read as gone from the feed and be withdrawn.
 */
function inTheReadRound(
  competition: string,
  matches: readonly UefaMatch[]
): UefaMatch[] {
  const { round } = uefaCompetition(competition);
  if (round === undefined) {
    return [...matches];
  }
  return matches.filter((match) => {
    const name = match.round?.metaData?.name;
    // An empty name is no name: skipped, it would be withdrawn all the same.
    if (name === undefined || name === "") {
      throw new UefaMatchWithoutRoundError(competition, match.id);
    }
    return name === round;
  });
}

export function sourceUrl(
  competition: string,
  season: string,
  offset: number
): string {
  return `${API_ROOT}?competitionId=${competitionId(competition)}`
    + `&seasonYear=${seasonYear(season)}&limit=${PAGE_LIMIT}&offset=${offset}`;
}

export function parseUefaMatches(source: string, body: string): UefaMatch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new UefaValidationError(source, [{ field: "$", detail: "invalid JSON" }]);
  }
  const result = matchesSchema.safeParse(parsed);
  if (!result.success) {
    throw new UefaValidationError(
      source,
      result.error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "$",
        detail: issue.message
      }))
    );
  }
  return result.data;
}

/**
 * The ninety-minute result, and never `total` or `penalty`. Exported because
 * it is the only place the requirement can be proven: extra time is played in
 * the knockout rounds alone, so every archived match whose two scores differ
 * is in a matchday `normaliseUefaMatches` refuses outright.
 */
export function settledResultOf(match: UefaMatch): string | null {
  const regular = match.score?.regular;
  if (!SETTLED_STATUSES.has(match.status) || regular === undefined) {
    return null;
  }
  const result: FixtureResult = {
    home_goals: regular.home,
    away_goals: regular.away,
    outcome: outcomeOf(regular.home, regular.away)
  };
  return JSON.stringify(result);
}

/**
 * UEFA writes Türkiye with a combining dot above the `i` (U+0307), left over
 * from lowercasing the Turkish `İ`. Every other source this record reads —
 * 365Scores, the internationals dataset, Wikipedia's managers list — spells it
 * with a plain `i`, and a Fixture stored under the composed form is a side
 * that never joins any of them.
 *
 * Written as the removal of the stray mark rather than as a one-entry name
 * map, because that is what the defect is; no other name in the Nations
 * League's fifty-four or a club cup's league phase carries a combining mark
 * after an `i`.
 */
function storedTeamName(internationalName: string): string {
  return internationalName.replace(/i̇/g, "i");
}

export interface NormalisedUefaMatches {
  scheduled: ScheduledMatch[];
  withdrawnIds: number[];
  /** The league-phase group of each scheduled Fixture, by UEFA match id. */
  groups: Map<number, string>;
}

/**
 * UEFA's matches in the only shape `writeCompetitionSchedule` reads: the
 * matchday as a Gameweek number, the kickoff as a `Date`, the id as a number,
 * the team names as they are stored, and the result already read off the right
 * one of three scores.
 *
 * Every difference between this source and football-data.org is spent here, so
 * that the half that derives deadlines and attaches Fixtures has nothing left
 * to tell them apart (ticket 0071).
 */
export function normaliseUefaMatches(
  competition: string,
  matches: readonly UefaMatch[]
): NormalisedUefaMatches {
  const scheduled: ScheduledMatch[] = [];
  const withdrawnIds: number[] = [];
  const groups = new Map<number, string>();
  const names = matchdayNames(competition);
  for (const match of inTheReadRound(competition, matches)) {
    // Asked of every match and not only of the ones still on, so that a
    // knockout Fixture is a refusal whatever its status says.
    const gameweek = names.indexOf(match.matchday.name) + 1;
    if (gameweek === 0) {
      throw new UnknownUefaMatchdayError(
        competition,
        match.matchday.name,
        match.id
      );
    }
    if (WITHDRAWN_STATUSES.has(match.status)) {
      withdrawnIds.push(Number(match.id));
      continue;
    }
    if (match.group !== undefined) {
      groups.set(Number(match.id), match.group.metaData.groupName);
    }
    scheduled.push({
      fixtureId: Number(match.id),
      matchday: gameweek,
      kickoffAt: new Date(match.kickOffTime.dateTime),
      homeTeam: storedTeamName(match.homeTeam.internationalName),
      awayTeam: storedTeamName(match.awayTeam.internationalName),
      settled: SETTLED_STATUSES.has(match.status),
      result: settledResultOf(match)
    });
  }
  return { scheduled, withdrawnIds, groups };
}

/**
 * The stored Fixtures this Competition's feed no longer carries at all.
 *
 * The other two schedule sources never need this. football-data.org keeps a
 * postponed match in the response with its old matchday, and the FPL API keeps
 * one with `event: null` — in both, a withdrawn Fixture is a row to read a
 * status off, which is why `WITHDRAWN_STATUSES` and a null round are the whole
 * question there. UEFA keeps nothing: a match that is off is absent, and the
 * only way to see it is to compare what is stored against what arrived. The
 * comparison is made here rather than in the shared writer because it is this
 * source's shape that requires it, and putting it there would change what
 * five running leagues do with a response that dropped a row.
 *
 * Asked only after every page has validated and the stale guard has passed, so
 * a half-read Season can never answer "gone" for a hundred Fixtures at once.
 * A feed that truncates for a day still withdraws whatever it dropped, which
 * is ADR-0024's trade and not a new one: a never-Locked Fixture is deleted and
 * the next fetch rebuilds it, and a Locked one keeps its row, its Predictions
 * and its Gameweek.
 */
async function fixturesGoneFromTheFeed(
  database: Database,
  competition: string,
  season: string,
  matches: readonly UefaMatch[]
): Promise<number[]> {
  const inTheFeed = new Set(matches.map((match) => Number(match.id)));
  const stored = await database.query<{ fixture_id: number }>(
    `select fixture_id from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );
  return stored.rows
    .map(({ fixture_id: fixtureId }) => fixtureId)
    .filter((fixtureId) => !inTheFeed.has(fixtureId));
}

export type FetchUefaCompetitionResult = WriteCompetitionScheduleResult;

export interface FetchUefaCompetitionOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * One Competition's schedule, kickoffs and ninety-minute results from UEFA's
 * match feed, written to the same `gameweeks` and `fixtures` every other
 * source writes (ADR-0036, ADR-0057). No key and no token: the feed is open,
 * undocumented, and answers a hundred matches a page.
 *
 * Two requests a day for the Nations League's 156, against a feed nobody
 * publishes a rate limit for.
 */
export async function fetchUefaCompetition({
  database,
  competition,
  season,
  http,
  now
}: FetchUefaCompetitionOptions): Promise<FetchUefaCompetitionResult> {
  const observedAt = now();
  const everyMatch: UefaMatch[] = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const source = sourceName(competition, season, offset);
    const url = sourceUrl(competition, season, offset);
    const response = await http(url, { method: "GET" });
    // Archived before validation, so a changed or unusable response is still
    // evidence a human can read.
    await storeRawSnapshots(database, [{ source, body: response.body }]);
    if (response.status < 200 || response.status >= 300) {
      throw new UefaHttpError(source, response.status, url);
    }
    const page = parseUefaMatches(source, response.body);
    everyMatch.push(...page);
    // A page shorter than the one asked for is the last one, and an empty page
    // is how a Season whose match count divides by a hundred says the same
    // thing. Both are needed: neither alone terminates both Seasons.
    if (page.length < PAGE_LIMIT) {
      break;
    }
  }
  // Narrowed before either guard: a qualifier's `MD1` would otherwise answer
  // for a league-phase page that never arrived.
  const matches = inTheReadRound(competition, everyMatch);
  if (matches.length === 0) {
    throw new StaleUefaSourceError(competition, season);
  }
  const roundsRead = new Set(matches.map((match) => match.matchday.name));
  const missing = matchdayNames(competition)
    .filter((round) => !roundsRead.has(round));
  if (missing.length > 0) {
    throw new IncompleteUefaSeasonError(
      competition,
      season,
      missing,
      matches.length
    );
  }

  const { scheduled, withdrawnIds, groups } = normaliseUefaMatches(
    competition,
    matches
  );
  const written = await writeCompetitionSchedule({
    database,
    competition,
    season,
    observedAt,
    scheduled,
    withdrawnIds: [
      ...withdrawnIds,
      ...await fixturesGoneFromTheFeed(database, competition, season, matches)
    ]
  });
  // The group beside the engine's own write and not through it: the shared
  // writer carries what every schedule source has, and a group is what this
  // one has (migration 0047). Idempotent, and a Fixture the engine did not
  // keep -- withdrawn, or refused an attachment -- matches no row.
  for (const [fixtureId, group] of groups) {
    await database.query(
      `update fixtures set group_name = $4
        where competition = $1 and season = $2 and fixture_id = $3`,
      [competition, season, fixtureId, group]
    );
  }
  return written;
}

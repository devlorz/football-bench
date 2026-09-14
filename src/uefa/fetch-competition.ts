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
 * UEFA's own id for each Competition this record reads from it. One entry, and
 * a Competition not in it is refused rather than guessed: the id is not
 * derivable from the Competition code, and a wrong one would return another
 * Competition's schedule under this one's name.
 */
const UEFA_COMPETITION_IDS: Readonly<Record<string, string>> = {
  UNL: "2014"
};

/**
 * The matchdays the league phase is played under, and the whole map (ADR-0057).
 * `MD7` and `MD8` are the two-legged quarter-finals, and `SF`, `3rd place` and
 * `Final` are the finals tournament — all of them deferred, none of them
 * handled. The day November's draw puts one in this feed it is refused with
 * its name, which is how a decision nobody has taken stays a decision nobody
 * has taken rather than becoming a Gameweek 7.
 */
const GAMEWEEK_BY_MATCHDAY: ReadonlyMap<string, number> = new Map([
  ["MD1", 1], ["MD2", 2], ["MD3", 3], ["MD4", 4], ["MD5", 5], ["MD6", 6]
]);

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
  homeTeam: teamSchema,
  awayTeam: teamSchema,
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

export class UnknownUefaMatchdayError extends Error {
  constructor(
    public readonly competition: string,
    public readonly matchday: string,
    public readonly matchId: string
  ) {
    super(
      `Competition ${competition} match ${matchId} is in matchday `
      + `${matchday}, which is not one of MD1-MD6; the knockout rounds are `
      + "deferred (ADR-0057) and no Gameweek has been decided for them"
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
  return Object.entries(UEFA_COMPETITION_IDS)
    .find(([, known]) => known === id)?.[0];
}

export function competitionId(competition: string): string {
  const id = UEFA_COMPETITION_IDS[competition];
  if (id === undefined) {
    throw new UnknownUefaCompetitionError(competition);
  }
  return id;
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
 * map, because that is what the defect is; no other name in the fifty-four
 * carries a combining mark after an `i`.
 */
function storedTeamName(internationalName: string): string {
  return internationalName.replace(/i̇/g, "i");
}

export interface NormalisedUefaMatches {
  scheduled: ScheduledMatch[];
  withdrawnIds: number[];
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
  for (const match of matches) {
    // Asked of every match and not only of the ones still on, so that a
    // knockout Fixture is a refusal whatever its status says.
    const gameweek = GAMEWEEK_BY_MATCHDAY.get(match.matchday.name);
    if (gameweek === undefined) {
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
  return { scheduled, withdrawnIds };
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
  const matches: UefaMatch[] = [];
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
    matches.push(...page);
    // A page shorter than the one asked for is the last one, and an empty page
    // is how a Season whose match count divides by a hundred says the same
    // thing. Both are needed: neither alone terminates both Seasons.
    if (page.length < PAGE_LIMIT) {
      break;
    }
  }
  if (matches.length === 0) {
    throw new StaleUefaSourceError(competition, season);
  }

  const { scheduled, withdrawnIds } = normaliseUefaMatches(
    competition,
    matches
  );
  return writeCompetitionSchedule({
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
}

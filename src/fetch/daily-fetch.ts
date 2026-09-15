import type { Client } from "pg";
import {
  fetchFootballDataSeason,
  FOOTBALL_DATA_SOURCE,
  FootballDataSourceHttpError
} from "../football-data/fetch-season.js";
import {
  projectSettledFixturesIntoHistoricalMatches
} from "../football-data/project-settled-fixtures.js";
import {
  fetchFootballDataOrgCompetition,
  type MovedAttachment,
  type RefusedAttachment
} from "../football-data-org/fetch-competition.js";
import { fetchUefaCompetition } from "../uefa/fetch-competition.js";
import type { WriteCompetitionScheduleResult } from "./write-schedule.js";
import {
  fetchFplDaily,
  type FetchFplDailyResult
} from "../fpl/fetch-gameweek.js";
import { fetchFplPlayerPoints } from "../fpl/fetch-player-points.js";
import { scoreFplGameweek } from "../fpl/score-fpl-gameweek.js";
import { fetchUnderstatSeasonXg } from "../understat/fetch-season-xg.js";
import {
  fetchScores365Stats,
  SCORES_365_SOURCE,
  type ResultDisagreement,
  type UnlistedFixture
} from "../365scores/fetch-match-stats.js";
import {
  fetchInternationalResults,
  INTERNATIONAL_RESULTS_SOURCE,
  RESULTS_SNAPSHOT
} from "../international-results/fetch-results.js";
import {
  fetchSquadChanges,
  type FetchSquadChangesResult
} from "../squad-changes/fetch-squad-changes.js";
import {
  fetchHeadCoachChanges,
  type FetchHeadCoachChangesResult
} from "../head-coach/fetch-head-coach-changes.js";
import { errorText } from "../error-text.js";
import {
  sourcesOf,
  UnknownCompetitionSourcesError,
  type CompetitionSources
} from "./competition-sources.js";
import type { HttpFetcher } from "../http.js";

export type {
  MovedAttachment, RefusedAttachment, ResultDisagreement, UnlistedFixture
};

type Database = Pick<Client, "query">;

export interface RunDailyFetchOptions {
  database: Database;
  season: string;
  footballDataSeason: string;
  /**
   * `null` until a Competition that reads football-data.org is listed. The
   * Premier League has never needed it, so requiring it would have made every
   * existing deployment carry a secret it does not spend; the fetch of a
   * Competition that does need it refuses loudly instead.
   */
  footballDataOrgToken: string | null;
  http: HttpFetcher;
  now: () => Date;
}

/**
 * xG is enrichment, so its outcome is reported rather than thrown: per
 * ADR 0019 an Understat outage degrades the affected form lines to an explicit
 * marker and must never cost a Gameweek of Predictions.
 */
export type DailyXgOutcome =
  | { stored: true }
  | { stored: false; failure: string };

/**
 * Squad Changes are enrichment on the same terms as xG (ADR-0031): a Wikipedia
 * outage degrades the section to a stated absence and must never cost a
 * Gameweek of Predictions. A day outside the render gate stores nothing and is
 * not a failure.
 */
export type DailySquadChangeOutcome =
  | FetchSquadChangesResult
  | { stored: false; failure: string };

/**
 * Head Coach changes are enrichment on the same terms as Squad Changes
 * (ADR-0044): a Wikipedia outage degrades the section to a stated absence and
 * must never cost a Gameweek of Predictions. A Season the article list does
 * not carry stores nothing and is not a failure.
 */
export type DailyHeadCoachOutcome =
  | FetchHeadCoachChangesResult
  | { stored: false; failure: string };

export interface DailyFetchResult {
  fpl: FetchFplDailyResult;
  xg: DailyXgOutcome;
  squadChanges: DailySquadChangeOutcome;
  headCoachChanges: DailyHeadCoachOutcome;
  movedAttachments: MovedAttachment[];
  refusedAttachments: RefusedAttachment[];
  /**
   * Fixtures whose stored result the second source of results does not agree
   * with (ADR-0056), reported on the same terms as the attachments above: a
   * line for an operator to read on the day, and no row moved either way.
   */
  resultDisagreements: ResultDisagreement[];
  /**
   * Settled Fixtures a stats source did not carry on the day the record says
   * they were played, so nothing was stored for them and the packet will say
   * their figures are unavailable. Reported for the reason the disagreements
   * are: the alternative is a join rate that falls with nothing saying so.
   */
  unlistedFixtures: UnlistedFixture[];
}

export class StaleFootballDataSeasonError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string,
    public readonly footballDataSeason: string
  ) {
    // `FOOTBALL_DATA_SEASON` is one variable over every league while
    // football-data.co.uk publishes one file at a time, so this guidance can
    // be true for the league that raised it and premature for another that
    // has not published yet. Naming the Competition is what lets an operator
    // tell those apart; the pre-cron checklist carries the rest.
    const guidance = footballDataSeason === season
      ? "the current feed yielded zero stored matches"
      : `advance FOOTBALL_DATA_SEASON from ${footballDataSeason} to ${season}`;
    super(
      `Competition ${competition} has no stored football-data matches for `
      + `Season ${season} after its own Gameweek 1 deadline; ${guidance}`
    );
    this.name = "StaleFootballDataSeasonError";
  }
}

export class StaleInternationalResultsError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} has read no international results since `
      + "its own Gameweek 1 deadline; the martj42/international_results "
      + "dataset has not reached this record since that Competition Locked"
    );
    this.name = "StaleInternationalResultsError";
  }
}

/**
 * Whether one Competition's history source has produced a result by the time
 * that Competition's own Gameweek 1 has Locked.
 *
 * A literal `'PL'` on both halves guaranteed one league that and denied it to
 * every other: `gw = 1` returns a row per listed Competition, and a Spanish
 * result answered "the English feed is live".
 *
 * Which table answers is the registry's business and not the caller's
 * (ADR-0057), so the whole entry comes in and the question is asked of the
 * source it names. The deadline is read once and the table asked only past it,
 * which is also what replaced a single query with a correlated `exists`: the
 * two sources' rows are found by different columns -- a league's by Season and
 * Competition, a cup's by neither, because `international_results` holds no
 * Season and no Competition at all (migration 0042) -- and one query that can
 * ask either is one query with a table name in a string.
 */
async function requireHistoryAfterFirstDeadline(
  database: Database,
  competition: string,
  sources: CompetitionSources,
  season: string,
  footballDataSeason: string,
  observedAt: Date
): Promise<void> {
  if (sources.history === null) {
    return;
  }
  const firstGameweek = await database.query<{ deadline_at: Date }>(
    `select deadline_at from gameweeks
      where season = $1 and gw = 1 and competition = $2`,
    [season, competition]
  );
  const deadline = firstGameweek.rows[0]?.deadline_at;
  if (
    deadline === undefined
    || observedAt.getTime() < deadline.getTime()
  ) {
    return;
  }
  if (sources.history === FOOTBALL_DATA_SOURCE) {
    const stored = await database.query(
      `select 1 from historical_matches
        where season = $1 and competition = $2 limit 1`,
      [season, competition]
    );
    if (stored.rows.length === 0) {
      throw new StaleFootballDataSeasonError(
        competition, season, footballDataSeason
      );
    }
    return;
  }
  // The same question the league half asks, in the only terms this table can
  // answer it: one file of every men's international is read for whichever
  // Competitions name it, so it carries no Season and no Competition to filter
  // by, and "has this record read it since this Competition Locked its first
  // Gameweek" is what stands in for "has the feed produced a current-Season
  // result". Asking merely whether the table holds a row would be answered by
  // rows a read last year left behind.
  //
  // How fresh the *file* is, which is the other half an operator wants, is
  // deliberately not asked here: a dataset that is committed monthly is stale
  // by this guard's standards every month, and ADR-0057 puts that fact in the
  // line the Entrant reads rather than in a failure.
  const read = await database.query(
    `select 1 from international_results_source
      where source = $1 and read_at >= $2 limit 1`,
    [RESULTS_SNAPSHOT, deadline]
  );
  if (read.rows.length === 0) {
    throw new StaleInternationalResultsError(competition);
  }
}

interface ListedCompetition {
  competition: string;
  sources: CompetitionSources;
}

interface ListedCompetitions {
  /** Those the registry names sources for, in code order. */
  named: ListedCompetition[];
  /** Those it does not, in code order. */
  unnamed: string[];
}

/**
 * Every Competition the Season lists, in code order, split by whether the
 * registry names its sources.
 *
 * Read once and walked by each source, rather than each source deciding for
 * itself which Competitions it is for. The dispatch keys on the registry —
 * data the fetch reads (ADR-0057) — rather than on a mode flag or a literal
 * code, so opening a Competition is the `competitions` insert plus its entry
 * and nothing here.
 *
 * Returns the unnamed rather than recording them: the caller owns the run's
 * failures, and a reader of this name should not have to guess that it also
 * appends to something.
 */
async function listedCompetitions(
  database: Database,
  season: string
): Promise<ListedCompetitions> {
  const active = await database.query<{ competition: string }>(
    `select competition from competitions
      where season = $1 order by competition`,
    [season]
  );
  const named: ListedCompetition[] = [];
  const unnamed: string[] = [];
  for (const { competition } of active.rows) {
    const sources = sourcesOf(competition);
    if (sources === undefined) {
      unnamed.push(competition);
    } else {
      named.push({ competition, sources });
    }
  }
  return { named, unnamed };
}

export async function runDailyFetch({
  database,
  season,
  footballDataSeason,
  footballDataOrgToken,
  http,
  now
}: RunDailyFetchOptions): Promise<DailyFetchResult> {
  const observedAt = now();
  const errors: unknown[] = [];
  // Read before the first request of the run, so a Competition the registry
  // does not name fails before any source is reached rather than part-way
  // through a day the rest of the record has already started. Its error being
  // first in `errors` is what says so, and what the daily-fetch suite asserts.
  const { named: listed, unnamed } = await listedCompetitions(database, season);
  for (const competition of unnamed) {
    errors.push(new UnknownCompetitionSourcesError(competition));
  }
  let fpl: FetchFplDailyResult | undefined;
  try {
    fpl = await fetchFplDaily({
      database,
      season,
      http,
      now: () => observedAt
    });
  } catch (error) {
    errors.push(error);
  }
  if (fpl !== undefined) {
    for (const gameweek of fpl.settledGameweeks) {
      try {
        await fetchFplPlayerPoints({ database, season, gameweek, http });
      } catch (error) {
        errors.push(error);
      }
    }
    // Every settled Gameweek's points are stored before any of them is
    // scored, and deliberately in two passes rather than one. A Gameweek's
    // record is folded from the Season's whole path, so scoring Gameweek 3
    // while Gameweek 2's points were still to be written would find a hole
    // where Gameweek 2 should be and skip the lot.
    //
    // This is where the record is written in production. The scorer is a pure
    // function of stored Manager States, attempts and player points, and the
    // daily fetch is where settlement is learnt — so the run that discovers a
    // Gameweek has checked is the run that records what it came to. An
    // unsettled Gameweek, or one an Entrant stored no Manager State for, is
    // skipped by the scorer rather than refused, and a Season whose FPL track
    // has not started scores nothing at all.
    for (const gameweek of fpl.settledGameweeks) {
      try {
        await scoreFplGameweek({ database, season, gameweek });
      } catch (error) {
        errors.push(error);
      }
    }
  }
  // Every source below walks the listed Competitions whose registry entry
  // names it, and each Competition's failure is collected rather than thrown:
  // one league's dead token must not cost another league its schedule, and the
  // run still fails loudly at the end. Opening a Competition is the
  // `competitions` insert and its registry entry, and nothing here.
  const movedAttachments: MovedAttachment[] = [];
  const refusedAttachments: RefusedAttachment[] = [];
  for (const { competition, sources } of listed) {
    // One loop over one field, rather than one loop per schedule source: the
    // two fetches differ in what they call and in nothing else — who is read,
    // whose failure is collected, where the attachments are gathered — and a
    // second copy of those eleven lines would be a second place to forget one
    // of them. `"fpl"` reads nothing here by design: the FPL API answers the
    // Season's own track as well as the Premier League's schedule, so it is
    // read once above whether or not a Competition names it (ADR-0035).
    const read = sources.schedule === "football-data.org"
      ? (): Promise<WriteCompetitionScheduleResult> =>
        fetchFootballDataOrgCompetition({
          database,
          competition,
          season,
          apiToken: footballDataOrgToken,
          http,
          now: () => observedAt
        })
      : sources.schedule === "uefa"
        ? (): Promise<WriteCompetitionScheduleResult> => fetchUefaCompetition({
          database,
          competition,
          season,
          http,
          now: () => observedAt
        })
        : null;
    if (read === null) {
      continue;
    }
    try {
      const outcome = await read();
      movedAttachments.push(...outcome.movedAttachments);
      refusedAttachments.push(...outcome.refusedAttachments);
    } catch (error) {
      errors.push(error);
    }
  }
  // The four remaining sources took a `PL` literal until La Liga went live,
  // which is exactly as long as that was honest: a Competition nobody predicts
  // has no stale table to leave behind. From the moment one is listed, a
  // literal here means its history, its xG and its Squad Changes are whatever
  // the backfill left and never move again — and every one of those staleness
  // failures renders as a section that reads calm rather than broken. The
  // registry is what replaced the literal, and it says the same thing about a
  // Competition that has no such source at all: it is not walked here, so it
  // never fails for lacking one (ADR-0057).
  for (const { competition, sources } of listed) {
    if (sources.history === FOOTBALL_DATA_SOURCE) {
      try {
        await fetchFootballDataSeason({
          database,
          competition,
          season: footballDataSeason,
          http
        });
      } catch (error) {
        errors.push(error);
        // ADR-0056 projects only when football-data.co.uk could not be
        // reached at all -- a non-2xx response, `FootballDataSourceHttpError`'s
        // one job. A `FootballDataSourceValidationError` means the opposite:
        // the site answered and its body is the problem, whether a malformed
        // row in the *other* division (a Ligue 2 hiccup must not cost Ligue 1
        // its shots) or a redirect to another division's file entirely (the
        // co.uk-to-Portugal case ADR-0050 records) -- and projecting over
        // either would paper over a data bug with results that read clean.
        //
        // `footballDataSeason === season` besides: the projection is "temporary
        // by construction" only because the *next* successful fetch targets the
        // same Season it wrote into and rewrites the division whole. A fetch
        // still pointed at last Season's file by a stale `FOOTBALL_DATA_SEASON`
        // will never do that, so a projection made here would never heal --
        // and it would also erase the one signal that tells an operator the env
        // is behind, `StaleFootballDataSeasonError`'s own "advance
        // FOOTBALL_DATA_SEASON" guidance, by giving the guard a current-Season
        // result to find.
        if (
          error instanceof FootballDataSourceHttpError
          && footballDataSeason === season
        ) {
          // The same settled Fixtures were already stored this morning from
          // football-data.org or the FPL API. Written here rather than left
          // absent, and the run still fails on the line above: saving the
          // projected results was never the reason it was failing.
          try {
            await projectSettledFixturesIntoHistoricalMatches({
              database,
              competition,
              season
            });
          } catch (projectionError) {
            errors.push(projectionError);
          }
        }
      }
    }
    // One file for every Competition that names it, read once a day whatever
    // is outstanding (ADR-0057). Unlike the four above it is not a league's
    // source under a cup's name: `historical_matches` is keyed by a Division a
    // national side does not have, so a cup's history has its own table and
    // its own read, and the ADR-0056 projection above can never reach it.
    if (sources.history === INTERNATIONAL_RESULTS_SOURCE) {
      try {
        await fetchInternationalResults({
          database, competition, season, http, now: () => observedAt
        });
      } catch (error) {
        errors.push(error);
      }
    }
    // Each Competition against its own clock, which is ADR-0036's consequence
    // read literally: a Competition whose feed has produced no current-Season
    // result by its own Gameweek 1 deadline fails by name, and one still
    // inside its own deadline stays quiet whatever the others are doing.
    //
    // Run whether or not the fetch above threw, and after the projection: a
    // Competition whose results arrived by projection has a current-Season
    // result now, and asking before the projection ran would answer a
    // question ADR-0056 has already changed the answer to.
    //
    // Outside the gate above and passed the whole entry, so that it reads the
    // registry's history source itself rather than inheriting a filter: which
    // table answers "has it produced a result yet" is that source's business,
    // and a Competition with a history source of its own gets a branch in
    // there rather than a second guard out here.
    try {
      await requireHistoryAfterFirstDeadline(
        database,
        competition,
        sources,
        season,
        footballDataSeason,
        observedAt
      );
    } catch (error) {
      errors.push(error);
    }
  }
  // The Premier League's outcome is the one this job has always reported, and
  // that shape is a contract with the workflow that reads it. Every other
  // Competition's failure joins `errors` and fails the run at the end.
  //
  // One shape for all three, extracted when the registry gate made them three
  // near-identical copies of eighteen lines rather than three of twelve: what
  // differs between them is the source they call and the absence they report,
  // and everything else — who is reported, who is collected, who wins when two
  // Competitions both answer — is the same sentence said three times.
  //
  // The `competition === "PL"` literals live here and are the last ones in this
  // file. They are not the dispatch the registry replaced: the registry decides
  // who is *read*, and these decide whose outcome is *reported* in the result
  // shape the fetch workflow has always consumed. A Competition still reports
  // when it is the only one to answer, so a `PL`-less Season is not silent.
  let xg: DailyXgOutcome | undefined;
  let squadChanges: DailySquadChangeOutcome | undefined;
  let headCoachChanges: DailyHeadCoachOutcome | undefined;
  async function reported<T>(
    competition: string,
    previous: T | undefined,
    read: () => Promise<T>,
    absence: (failure: string) => T
  ): Promise<T | undefined> {
    try {
      const outcome = await read();
      return competition === "PL" || previous === undefined
        ? outcome
        : previous;
    } catch (error) {
      if (competition === "PL") {
        return absence(errorText(error));
      }
      errors.push(error);
      return previous;
    }
  }
  const resultDisagreements: ResultDisagreement[] = [];
  const unlistedFixtures: UnlistedFixture[] = [];
  for (const { competition, sources } of listed) {
    // Outside `reported` and collected rather than reported, unlike the three
    // below: `xg` is the Premier League's Understat outcome the fetch
    // workflow has always consumed, and a cup's shots are not that outcome
    // under another name. A 365Scores failure is this Competition's failure,
    // it fails the run at the end, and it costs no other Competition its day.
    if (sources.stats === SCORES_365_SOURCE) {
      try {
        const outcome = await fetchScores365Stats({
          database,
          competition,
          season,
          http,
          now: () => observedAt
        });
        resultDisagreements.push(...outcome.disagreements);
        unlistedFixtures.push(...outcome.unlistedFixtures);
      } catch (error) {
        errors.push(error);
      }
    }
    if (sources.stats === "understat") {
      xg = await reported<DailyXgOutcome>(
        competition,
        xg,
        async () => {
          await fetchUnderstatSeasonXg({ database, competition, season, http });
          return { stored: true };
        },
        (failure) => ({ stored: false, failure })
      );
    }
    if (sources.squadChanges === "wikipedia-transfers") {
      squadChanges = await reported<DailySquadChangeOutcome>(
        competition,
        squadChanges,
        () => fetchSquadChanges({
          database,
          competition,
          season,
          http,
          now: () => observedAt
        }),
        (failure) => ({ stored: false, failure })
      );
    }
    if (sources.headCoaches === "wikipedia-season-article") {
      headCoachChanges = await reported<DailyHeadCoachOutcome>(
        competition,
        headCoachChanges,
        () => fetchHeadCoachChanges({
          database,
          competition,
          season,
          http,
          now: () => observedAt
        }),
        (failure) => ({ stored: false, failure })
      );
    }
  }
  // A Season with no Competition listed reaches no source at all, which the
  // pre-cron checklist calls the quietest way for a deployment to do nothing.
  // A Season that lists Competitions none of which read these three is the
  // other way, and it arrives with the first cup: reporting it as "nothing is
  // listed" would send an operator to the `competitions` table over a row that
  // is there and correct.
  const unreached = listed.length === 0
    ? "no Competition is listed for the Season"
    : "no listed Competition reads this source";
  xg ??= { stored: false, failure: unreached };
  squadChanges ??= { stored: false, failure: unreached };
  headCoachChanges ??= { stored: false, failure: unreached };
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Daily fetch failed for multiple sources");
  }
  if (fpl === undefined) {
    throw new Error("Daily FPL fetch completed without a result");
  }
  return {
    fpl,
    xg,
    squadChanges,
    headCoachChanges,
    movedAttachments,
    refusedAttachments,
    resultDisagreements,
    unlistedFixtures
  };
}

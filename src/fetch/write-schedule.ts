import type { Client } from "pg";
import {
  DERIVED_DEADLINE_LEAD_MS,
  deriveDeadline
} from "../football-data-org/derived-deadline.js";

type Database = Pick<Client, "query">;

/**
 * One match a source has scheduled, in the only shape this writer reads.
 *
 * Everything a source knows about its own feed is already decided by the time
 * a match reaches here: which key held the kickoff, what its status words are,
 * whether the round name is a number or `MD4`, which of two score objects is
 * the ninety-minute one. A field this writer had to interpret per source would
 * mean the seam is in the wrong place — the four things that differ between
 * football-data.org and UEFA (the paging, the matchday map, the score field
 * and the status set) all happen before this call and none of them is visible
 * from inside it (ticket 0071).
 */
export interface ScheduledMatch {
  /** The source's own match id, stored as `fixtures.fixture_id`. */
  readonly fixtureId: number;
  /** The round this match is labelled with, as a Gameweek number. */
  readonly matchday: number;
  readonly kickoffAt: Date;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /**
   * Whether the source calls this match final. Carried beside `result` rather
   * than inferred from it: what makes a match settled is the source's status
   * word, and a writer that read `result !== null` instead would be trusting a
   * parser's invariant it cannot see.
   */
  readonly settled: boolean;
  /** The settled `FixtureResult` as JSON, or `null` while unsettled. */
  readonly result: string | null;
}

export interface MovedAttachment {
  competition: string;
  fixtureId: number;
  matchday: number;
  attachedGameweek: number;
}

export interface RefusedAttachment {
  competition: string;
  fixtureId: number;
  matchday: number;
  kickoffAt: Date;
}

/**
 * The loud alert of ADR-0036, story 13. A Prediction must always precede
 * kick-off, and the ninety-minute buffer is the whole margin — so a kickoff
 * that lands inside the deadline in force is raised and the fetch writes
 * nothing, rather than being absorbed by a silent relock.
 */
export class KickoffInsideDeadlineError extends Error {
  constructor(
    public readonly competition: string,
    public readonly season: string,
    public readonly gameweek: number,
    public readonly deadlineAt: Date,
    public readonly kickoffAt: Date
  ) {
    super(
      `Competition ${competition} Season ${season} Gameweek ${gameweek} has a `
      + `kickoff at ${kickoffAt.toISOString()} inside its deadline of `
      + `${deadlineAt.toISOString()}; the Lock margin was breached and nothing `
      + `has been written`
    );
    this.name = "KickoffInsideDeadlineError";
  }
}

export interface WriteCompetitionScheduleResult {
  movedAttachments: MovedAttachment[];
  refusedAttachments: RefusedAttachment[];
}

export interface WriteCompetitionScheduleOptions {
  database: Database;
  competition: string;
  season: string;
  observedAt: Date;
  /** Every match still on the calendar, normalised by its source. */
  scheduled: readonly ScheduledMatch[];
  /** The ids of matches the source has taken off it. */
  withdrawnIds: readonly number[];
}

/**
 * ADR-0036's deadline derivation, Gameweek attachment and write, over matches
 * any source has normalised — the half of a schedule fetch that has never been
 * about the source.
 *
 * It was football-data.org's alone until the Nations League arrived reading
 * UEFA (ticket 0071), and it is shared rather than copied because of what its
 * own history costs: ADR-0036 was amended twice inside a fortnight, both times
 * here, and one of those amendments was paid for with fifty-nine withdrawn
 * Predictions. A third amendment applied to one copy and not the other would
 * be wrong in the Competition nobody is watching.
 *
 * The parsing half is not shared and must not become so. It stays one file per
 * source, so that the paging, the matchday map, the score field and the status
 * set stay four sentences each source says for itself rather than four
 * switches said here.
 *
 * The stale-source guard is the caller's, not this function's: a source that
 * pages answers an empty body both when it is dead and when the pages have run
 * out, and only the caller can tell those apart.
 */
export async function writeCompetitionSchedule({
  database,
  competition,
  season,
  observedAt,
  scheduled,
  withdrawnIds
}: WriteCompetitionScheduleOptions): Promise<WriteCompetitionScheduleResult> {
  // Preserved attachments from existing fixtures. Once a Fixture has locked into
  // a Gameweek, migration 0022 makes that attachment immutable and this fetch
  // preserves it. Any Gameweek with locked fixtures also keeps its deadline
  // frozen under migration 0025.
  const storedFixturesResult = await database.query<{
    fixture_id: number;
    locked_in_gw: number | null;
  }>(
    `select fixture_id, locked_in_gw
       from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );
  const storedLockedInGws = new Map<number, number>(
    storedFixturesResult.rows
      .filter((row): row is { fixture_id: number; locked_in_gw: number } => row.locked_in_gw !== null)
      .map((row) => [row.fixture_id, row.locked_in_gw])
  );
  const committedGameweeks = new Set(storedLockedInGws.values());

  const storedGameweeksResult = await database.query(
    `select gw, deadline_at
       from gameweeks
      where competition = $1 and season = $2`,
    [competition, season]
  );
  const storedDeadlines = new Map<number, Date>(
    storedGameweeksResult.rows.map(({ gw, deadline_at: deadlineAt }) => [
      gw as number,
      deadlineAt as Date
    ])
  );

  // The window of each matchday is the earliest kickoff among matches the source
  // labels with it, excluding kickoffs pulled ahead of an earlier round's window
  // (ADR-0036 2026-09-03 amendment, ticket 0064).
  const matchesByMatchday = new Map<number, Date[]>();
  for (const match of scheduled) {
    const list = matchesByMatchday.get(match.matchday) ?? [];
    list.push(match.kickoffAt);
    matchesByMatchday.set(match.matchday, list);
  }

  const windowByMatchday = new Map<number, Date>();
  const matchdays = [...matchesByMatchday.keys()].sort((a, b) => a - b);
  for (const md of matchdays) {
    const kickoffs = matchesByMatchday.get(md);
    if (kickoffs === undefined || kickoffs.length === 0) {
      continue;
    }
    kickoffs.sort((a, b) => a.getTime() - b.getTime());
    const earlierMaxWindow = Math.max(
      0,
      ...matchdays.filter((m) => m < md).map((m) => windowByMatchday.get(m)?.getTime() ?? 0)
    );
    const notPulledAhead = kickoffs.filter((k) => k.getTime() >= earlierMaxWindow);
    const earliestKickoff = notPulledAhead[0] ?? kickoffs[0];
    if (earliestKickoff !== undefined) {
      windowByMatchday.set(md, earliestKickoff);
    }
  }

  // A match not yet locked whose kickoff has already passed cannot define or
  // drag the deadline of any Gameweek the record already knows: a deadline is
  // a promise about the future, and a match already kicked off cannot promise
  // anything (ADR-0036 rule 3).
  //
  // One case is admitted all the same: a Competition adopted mid-Season
  // (ADR-0015) arrives holding past Gameweeks the database has never seen.
  // Those Gameweeks must be written so their Fixtures have a parent row to
  // point to; for them storedDeadlines is empty, and deriveDeadline locks them
  // cleanly on arrival.
  //
  // One case is an existing commitment breach: if that Gameweek is already
  // locked and an honest match of that round (not pulled ahead of an earlier
  // round) kicked off before the locked deadline, the commitment made to
  // Entrants who predicted that Gameweek was violated, and the fetch alerts
  // loudly via KickoffInsideDeadlineError rather than silently absorbing it.
  //
  // The kickoff is the test, not the result: a Fixture already played is caught
  // by it, and so is one this fetch found in flight or one whose result the
  // source has not posted yet — the recorded first response for La Liga
  // carried all ten of its opening Fixtures as `TIMED` hours after they
  // kicked off, and a result-only test would have queued six of them for a
  // Lock five days later.
  const isPastKickoffForKnownGameweek = (match: {
    fixtureId: number;
    matchday: number;
    kickoffAt: Date;
  }): boolean => {
    if (storedLockedInGws.has(match.fixtureId)) {
      return false;
    }
    const storedDeadline = storedDeadlines.get(match.matchday);
    if (storedDeadline === undefined) {
      return false;
    }
    if (
      observedAt.getTime() >= storedDeadline.getTime()
      && match.kickoffAt.getTime() < storedDeadline.getTime()
    ) {
      const roundWindow = windowByMatchday.get(match.matchday);
      const isPulledAhead = roundWindow !== undefined
        && match.kickoffAt.getTime() < roundWindow.getTime();
      if (!isPulledAhead) {
        return false;
      }
    }
    return match.kickoffAt.getTime() <= observedAt.getTime();
  };

  // Open Gameweeks whose deadlines have not passed as of observedAt, ordered
  // by deadline and then by Gameweek number. The pure decision of whether a
  // Gameweek is locked (by the clock or by migration 0025) lives in deriveDeadline.
  interface OpenGameweek {
    gw: number;
    deadlineAt: Date;
    windowOpen: Date;
    hasStoredDeadline: boolean;
    locked: boolean;
  }

  const openGameweeks: OpenGameweek[] = [];
  for (const [gw, windowKickoff] of windowByMatchday) {
    const storedDeadline = storedDeadlines.get(gw) ?? null;
    const decision = deriveDeadline(
      [windowKickoff],
      storedDeadline,
      observedAt,
      committedGameweeks.has(gw)
    );
    if (!decision.locked) {
      openGameweeks.push({
        gw,
        deadlineAt: storedDeadline ?? decision.deadlineAt,
        windowOpen: windowKickoff,
        hasStoredDeadline: storedDeadline !== null,
        locked: decision.locked
      });
    }
  }
  openGameweeks.sort(
    (a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime() || a.gw - b.gw
  );

  // Attach each scheduled match to a Gameweek (ticket 0064, ADR-0036).
  //
  // A match whose Fixture is already locked in the database keeps its attachment
  // unchanged whatever the schedule now says; migration 0022's trigger enforces
  // it and the fetch does not try to rewrite it.
  //
  // For not-yet-locked matches:
  // Ordinarily, a match belongs to its own label. But if its own matchday is
  // already Locked (the ticket 0065 postponement case), or if it kicks off
  // before an earlier open Gameweek's window (the ticket 0064 brought-forward
  // case), it cannot remain in its label:
  //
  // 1. It attaches to the latest open candidate Gameweek whose window has
  //    opened by the match's kickoff.
  // 2. When no open candidate's window has opened by the kickoff, the existing
  //    next-open rule applies: the earliest open candidate whose Lock precedes
  //    the kickoff. If that candidate's deadline is frozen (already locked or
  //    committed under migration 0025) or the match is from an already-locked
  //    round (ADR-0015), the kickoff must postdate the deadline; if it is
  //    pulled ahead into an open round (ticket 0064), the re-derived deadline
  //    must still be in the future so Entrants have an unbreached window.
  // 3. If no candidate qualifies, the attachment is refused (stays null).
  //    A refused match that was pulled ahead of an earlier open Gameweek does
  //    not attach and does not drag its open label's deadline. It is reported
  //    via refusedAttachments on the day it occurs.
  const movedAttachments: MovedAttachment[] = [];
  const refusedAttachments: RefusedAttachment[] = [];
  const attachments = new Map<number, number>();
  const refusedMatchIds = new Set<number>();

  for (const match of scheduled) {
    const existingLock = storedLockedInGws.get(match.fixtureId);
    if (existingLock !== undefined) {
      attachments.set(match.fixtureId, existingLock);
      continue;
    }

    if (isPastKickoffForKnownGameweek(match)) {
      continue;
    }

    const isMatchdayLocked = !openGameweeks.some((g) => g.gw === match.matchday);
    const isPulledAheadOfEarlierOpen = openGameweeks.some(
      (g) => g.gw < match.matchday && match.kickoffAt.getTime() < g.windowOpen.getTime()
    );

    if (!isMatchdayLocked && !isPulledAheadOfEarlierOpen) {
      continue;
    }

    const candidates = isMatchdayLocked
      ? openGameweeks
      : openGameweeks.filter((g) => g.gw < match.matchday);

    const opened = candidates.filter(
      (g) => g.windowOpen.getTime() <= match.kickoffAt.getTime()
    );

    let targetGw: number | undefined;
    if (opened.length > 0) {
      targetGw = opened.reduce((latest, current) =>
        current.gw > latest.gw ? current : latest
      ).gw;
    } else {
      const qualifying = candidates.find((c) => {
        if (isMatchdayLocked || c.locked || committedGameweeks.has(c.gw)) {
          return match.kickoffAt.getTime() > c.deadlineAt.getTime();
        }
        const derivedDeadline = Math.min(c.windowOpen.getTime(), match.kickoffAt.getTime())
          - DERIVED_DEADLINE_LEAD_MS;
        return derivedDeadline > observedAt.getTime();
      });
      targetGw = qualifying?.gw;
    }

    if (targetGw !== undefined && targetGw !== match.matchday) {
      attachments.set(match.fixtureId, targetGw);
      movedAttachments.push({
        competition,
        fixtureId: match.fixtureId,
        matchday: match.matchday,
        attachedGameweek: targetGw
      });
    } else if (targetGw === undefined && isPulledAheadOfEarlierOpen) {
      refusedMatchIds.add(match.fixtureId);
      refusedAttachments.push({
        competition,
        fixtureId: match.fixtureId,
        matchday: match.matchday,
        kickoffAt: match.kickoffAt
      });
    }
  }

  // A Fixture already Locked and already settled at the source is left out of
  // the derivation entirely (ADR-0036 rule 3, ticket 0068). It cannot be
  // excluded by `isPastKickoffForKnownGameweek`, which admits every Locked
  // match by design, and it cannot stop being Locked; so with a deadline moved
  // out past its kickoff it would report a breach on every fetch for the rest
  // of the Season and La Liga's schedule, results and later deadlines would
  // stop landing. The promise the breach alert guards is that a Prediction
  // precedes its kick-off, and a settled Fixture's Predictions are all already
  // made — the narrowing is that a breach first observed after the Fixture is
  // settled is no longer alerted here; the record still shows it in
  // `predicted_at` against `kickoff_at`.
  const isSettledAndLocked = (match: ScheduledMatch): boolean =>
    storedLockedInGws.has(match.fixtureId) && match.settled;

  const kickoffsByGameweek = new Map<number, Date[]>();
  for (const match of scheduled) {
    if (
      refusedMatchIds.has(match.fixtureId)
      || isPastKickoffForKnownGameweek(match)
      || isSettledAndLocked(match)
    ) {
      continue;
    }
    const attachedGw = attachments.get(match.fixtureId) ?? match.matchday;
    const kickoffs = kickoffsByGameweek.get(attachedGw) ?? [];
    kickoffs.push(match.kickoffAt);
    kickoffsByGameweek.set(attachedGw, kickoffs);
  }

  // Only the Gameweeks this response scheduled something for. A Gameweek whose
  // every Fixture was withdrawn is absent — as is one whose every Fixture is
  // Locked and settled, by the carve-out above — and keeps the deadline it
  // already had: with no kickoff there is nothing to derive a new one from, and the
  // stored instant is the last one the schedule justified. It has no Fixtures
  // left to predict either way, so what the stale deadline can still do is
  // report a Lock for an empty Gameweek — visible in the record rather than
  // acted on. The alternative, deleting it, would take its Locked Fixtures'
  // foreign key with it.
  const deadlines = new Map(
    [...kickoffsByGameweek].map(([gameweek, kickoffs]) => [
      gameweek,
      deriveDeadline(
        kickoffs,
        storedDeadlines.get(gameweek) ?? null,
        observedAt,
        committedGameweeks.has(gameweek)
      )
    ])
  );
  for (const [gameweek, decision] of deadlines) {
    if (decision.breachedBy !== null) {
      throw new KickoffInsideDeadlineError(
        competition,
        season,
        gameweek,
        decision.deadlineAt,
        decision.breachedBy
      );
    }
  }

  await database.query("begin");
  try {
    for (const [gameweek, decision] of deadlines) {
      // A Locked Gameweek's deadline is a stored fact and is not rewritten,
      // even with the same value: the write that could move it is the write
      // that must not exist (ADR-0015, migration 0025). One Locked Gameweek
      // is written all the same — the one the record has never seen, which a
      // Competition adopted after its Season began arrives holding. It has no
      // stored deadline to move, and its Fixtures have nowhere to point without it.
      if (!decision.locked || !storedDeadlines.has(gameweek)) {
        await database.query(
          `insert into gameweeks (competition, season, gw, deadline_at)
           values ($1, $2, $3, $4)
           on conflict (competition, season, gw)
           do update set deadline_at = excluded.deadline_at`,
          [competition, season, gameweek, decision.deadlineAt]
        );
      }
    }

    if (withdrawnIds.length > 0) {
      await database.query(
        `delete from fixtures
          where competition = $1 and season = $2
            and fixture_id = any($3::integer[])
            and locked_in_gw is null`,
        [competition, season, withdrawnIds]
      );
      await database.query(
        `update fixtures f
            set deferred = true,
                updated_at = now()
           from gameweeks locked_gameweek
          where f.competition = $1
            and f.season = $2
            and f.fixture_id = any($3::integer[])
            and f.locked_in_gw = locked_gameweek.gw
            and f.competition = locked_gameweek.competition
            and f.season = locked_gameweek.season
            and locked_gameweek.deadline_at <= $4
            and not f.deferred`,
        [competition, season, withdrawnIds, observedAt]
      );
      // Only Locked rows survive the deletion above. The mark reports the live
      // calendar, where `deferred` records history (ADR-0024).
      await database.query(
        `update fixtures
            set unscheduled = true,
                updated_at = now()
          where competition = $1 and season = $2
            and fixture_id = any($3::integer[])
            and not unscheduled`,
        [competition, season, withdrawnIds]
      );
    }

    for (const match of scheduled) {
      // A Fixture whose Gameweek Locked before the record ever saw it joins
      // the next open Gameweek (ADR-0015, ADR-0036, ticket 0064) — but only if
      // that Gameweek's Lock still precedes its kick-off.
      //
      // The kickoff is the test, not the result: a Fixture already played is
      // caught by it, and so is one this fetch found in flight or one whose
      // result the source has not posted yet — the recorded first response for
      // La Liga carried all ten of its opening Fixtures as `TIMED` hours after
      // they kicked off, and a result-only test would have queued six of them
      // for a Lock five days later.
      //
      // A Fixture brought forward ahead of a lower-numbered open Gameweek
      // attaches to the Gameweek it is played in (ticket 0064, ADR-0036).
      //
      // When attached to another Gameweek, locked_in_gw is written on both
      // insert and update so an unattached row already in the record is updated
      // when brought forward. Once written, locked_in_gw is immutable
      // (migration 0022). If the fixture later moves past its locked Gameweek's
      // deadline, it is flagged deferred (ADR-0013).
      //
      // When refused because no open Gameweek's Lock precedes its kickoff,
      // locked_in_gw stays null: history the context can read and the scorer
      // ignores (the scorer selects on `locked_in_gw is not null`). The
      // predict path guards on `kickoff_at > now` so an unpredicted match
      // whose kickoff has passed is never queued for Entrants.
      const lockedInGameweek = attachments.get(match.fixtureId) ?? null;
      await database.query(
        `insert into fixtures (
           competition, season, fixture_id, gw, locked_in_gw, home_team,
           away_team, kickoff_at, result
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (competition, season, fixture_id)
         do update set
           gw = excluded.gw,
           locked_in_gw = coalesce(fixtures.locked_in_gw, excluded.locked_in_gw),
           result = coalesce(excluded.result, fixtures.result),
           home_team = excluded.home_team,
           away_team = excluded.away_team,
           kickoff_at = excluded.kickoff_at,
           unscheduled = false,
           deferred = fixtures.deferred or (
             fixtures.locked_in_gw is not null
             and fixtures.locked_in_gw <> excluded.gw
             and exists (
               select 1
                 from gameweeks locked_gameweek
                where locked_gameweek.competition = fixtures.competition
                  and locked_gameweek.season = fixtures.season
                  and locked_gameweek.gw = fixtures.locked_in_gw
                  and locked_gameweek.deadline_at <= $10
             )
           ),
           updated_at = now()`,
        [
          competition,
          season,
          match.fixtureId,
          match.matchday,
          lockedInGameweek,
          match.homeTeam,
          match.awayTeam,
          match.kickoffAt,
          match.result,
          observedAt
        ]
      );
    }
    await database.query("commit");
    return { movedAttachments, refusedAttachments };
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

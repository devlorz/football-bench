import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  SCHEDULE_GAMEWEEKS,
  type FplFixture,
  type FplLeagueTable,
  type FplPerformanceWindow,
  type FplPlayerPerformance,
  type FplTrackPlayer,
  type OwnRecord,
  type OwnRecordPick
} from "../context/build-fpl-track-context.js";
import {
  leagueTable,
  type HistoricalMatch
} from "../context/build-historical-context.js";
import { teamNamesOf } from "../football-data/team-identity.js";
import {
  FPL_POINTS_METRIC,
  FPL_POINTS_SEASON_TO_DATE_METRIC
} from "./demonstration-record.js";
import type { Position, TeamSheet } from "./apply-gameweek-action.js";
import type {
  PlayerGameweekPoints,
  PlayerPosition,
  ScoreDetail
} from "./score-team-sheet.js";

type Database = Pick<Client, "query">;

interface PoolRow {
  fpl_id: number;
  team_name: string;
  web_name: string;
  position: Position;
  price_tenths: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
}

/**
 * A Gameweek's Lock, the pool as its Lock found it, the schedule ahead of it,
 * the Season's table so far and the two windows behind it.
 */
export interface LockedGameweek {
  deadline: Date;
  pool: FplTrackPlayer[];
  schedule: FplFixture[];
  league: FplLeagueTable | null;
  performance: FplPlayerPerformance[];
  settledThrough: number | null;
}

interface WindowRow {
  fpl_id: number;
  appearances: number;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  /** `numeric` arrives as the fixed-point string the context renders. */
  expected_goals: string;
  expected_assists: string;
  expected_goals_conceded: string;
}

/**
 * One window's aggregate per player, over the Settled Gameweeks from `from` up
 * to the Gameweek being played. Summed by Postgres rather than in memory: the
 * expected-goals family is `numeric`, and adding it here would be a float
 * rounding step in the one place the source's two decimals still hold.
 *
 * A player who played no minutes in the window is dropped, so the pool line
 * carries no block for it — the absence is the statement "no Settled
 * appearance". `appearances` counts Gameweeks rather than rows because the
 * table is keyed by Gameweek: a Double Gameweek is one row, and one
 * appearance.
 */
/** Below every Gameweek number a Season has: a window floored at nothing. */
const SEASON_START = 0;

async function performanceWindow(
  database: Database,
  season: string,
  gameweek: number,
  from: number
): Promise<Map<number, FplPerformanceWindow>> {
  const summed = await database.query<WindowRow>(
    `select fpl_id,
            count(*) filter (where minutes > 0)::int as appearances,
            sum(total_points)::int            as points,
            sum(minutes)::int                 as minutes,
            sum(goals_scored)::int            as goals,
            sum(assists)::int                 as assists,
            sum(clean_sheets)::int            as clean_sheets,
            sum(bonus)::int                   as bonus,
            sum(yellow_cards)::int            as yellow_cards,
            sum(red_cards)::int               as red_cards,
            sum(saves)::int                   as saves,
            sum(expected_goals)               as expected_goals,
            sum(expected_assists)             as expected_assists,
            sum(expected_goals_conceded)      as expected_goals_conceded
       from fpl_player_points
      where season = $1 and gw < $2 and gw >= $3
      group by fpl_id
     having sum(minutes) > 0`,
    [season, gameweek, from]
  );
  return new Map(summed.rows.map((row) => [row.fpl_id, {
    points: row.points,
    minutes: row.minutes,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    cleanSheets: row.clean_sheets,
    bonus: row.bonus,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    saves: row.saves,
    expectedGoals: row.expected_goals,
    expectedAssists: row.expected_assists,
    expectedGoalsConceded: row.expected_goals_conceded
  }]));
}

/**
 * Both windows for every player who has played a Settled Gameweek, and the
 * Gameweek they run through.
 *
 * Settled-ness is the presence of stored points rows and nothing else, exactly
 * as scoring reads it: a Gameweek the fetch never wrote contributes to neither
 * window and cannot be the one the context announces. The five most recent
 * Settled Gameweeks are read first and the window floored at the earliest of
 * them, so the boundary is drawn across the Season's Gameweeks rather than
 * across each player's own appearances — a player who missed one of the five
 * carries four appearances, not a sixth Gameweek dragged in to make up the
 * number.
 */
async function settledPerformance(
  database: Database,
  season: string,
  gameweek: number
): Promise<Pick<LockedGameweek, "performance" | "settledThrough">> {
  const mostRecent = await database.query<{ gw: number }>(
    `select distinct gw
       from fpl_player_points
      where season = $1 and gw < $2
      order by gw desc
      limit 5`,
    [season, gameweek]
  );
  const settled = mostRecent.rows.map((row) => row.gw);
  if (settled.length === 0) {
    return { performance: [], settledThrough: null };
  }

  const [wholeSeason, lastFive] = await Promise.all([
    performanceWindow(database, season, gameweek, SEASON_START),
    performanceWindow(database, season, gameweek, settled[settled.length - 1]!)
  ]);
  return {
    settledThrough: settled[0]!,
    // Keyed off the Season's window, which every last-five player is in: a
    // player with Settled minutes only outside the five carries a season block
    // and no last5, which is what "no Settled appearance in this window" is.
    performance: [...wholeSeason].map(([fplId, whole]) => {
      const recent = lastFive.get(fplId);
      return recent === undefined
        ? { fplId, season: whole }
        : { fplId, season: whole, lastFive: recent };
    })
  };
}

interface FixtureRow {
  gw: number;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
}

/**
 * The Fixtures of this Gameweek and the ten after it, ordered as the section
 * renders them. `gw` is read rather than `locked_in_gw`, which is the Match
 * track's record of where a Prediction was priced: a Fixture FPL has moved to
 * another Gameweek belongs to the Gameweek it has moved to, and the fetch
 * writes that move onto `gw`.
 *
 * The window is whatever the calendar holds: near the season's end there are
 * simply fewer rows, and the section is shorter without saying why. An
 * Unscheduled Fixture is off the calendar and so out of the window, and the
 * Blank that leaves carries the fact by itself (ADR-0024).
 */
async function schedule(
  database: Database,
  season: string,
  gameweek: number
): Promise<FplFixture[]> {
  const ahead = await database.query<FixtureRow>(
    // The Premier League's Fixtures only. `fixtures` holds one row per
    // Competition since ADR-0035, so an unfiltered read hands an FPL
    // Entrant La Liga's calendar beside its own -- clubs its pool does not
    // contain, in a Gameweek numbering that is not the one it plays.
    `select gw, home_team, away_team, kickoff_at
       from fixtures
      where competition = 'PL' and season = $1
        and gw between $2 and $3 and not unscheduled
      order by gw, kickoff_at, fixture_id`,
    [season, gameweek, gameweek + SCHEDULE_GAMEWEEKS - 1]
  );
  return ahead.rows.map((row) => ({
    gameweek: row.gw,
    homeClub: row.home_team,
    awayClub: row.away_team,
    kickoff: row.kickoff_at
  }));
}

/**
 * The current Season's Premier League table, summed from the final results the
 * Match track's fetch stores — the cross-track read ADR-0021 accepts, rather
 * than a second summation of scores the FPL feed also carries.
 *
 * The summation and the ordering are the Match track's own function, so the
 * two contexts cannot come to disagree about who is second. Nothing is cut off
 * at the deadline: `historical_matches` holds matches that have been played,
 * and the announced date of the latest one is what states the coverage — a
 * cutoff mapped onto Gameweeks would lag every midweek round (ADR-0021).
 *
 * `competition = 'PL'` beside the division, both literals: the FPL track is the
 * Premier League by nature and takes no Competition of its own (ADR-0035), but
 * a division belongs to a Competition only by convention -- nothing in the
 * schema holds it -- so the division alone is not the filter it looks like.
 */
async function currentSeasonTable(
  database: Database,
  season: string
): Promise<FplLeagueTable | null> {
  const results = await database.query<HistoricalMatch>(
    `select season, division, played_on, home_team, away_team,
            home_goals, away_goals
       from historical_matches
      where season = $1
        and competition = 'PL' and division = 'Premier League'
      order by played_on`,
    [season]
  );
  const latest = results.rows.at(-1);
  return latest === undefined
    ? null
    : {
        through: latest.played_on,
        rows: leagueTable(teamNamesOf("PL"), results.rows)
      };
}

/**
 * What a Gameweek offers every Entrant that plays it: one deadline shared with
 * the Match track (ADR-0006), one snapshot of the pool, one schedule of the
 * Gameweeks ahead and one set of performance windows. All are read before any
 * Entrant is called, because all belong to the Gameweek rather than to whoever
 * is reading it — which is also what leaves the ten Entrants nothing to
 * differ over.
 */
export async function loadLockedGameweek(
  database: Database,
  season: string,
  gameweek: number
): Promise<LockedGameweek> {
  // `gameweeks` holds one row per Competition since ADR-0035, so a read
  // filtered by Season and Gameweek alone matches La Liga's row as readily as
  // the Premier League's and takes whichever Postgres returns first. The FPL
  // track is the Premier League by nature rather than by argument, which is
  // the literal every FPL read states at its own boundary.
  const scheduled = await database.query<{ deadline_at: Date }>(
    `select deadline_at from gameweeks
      where competition = 'PL' and season = $1 and gw = $2`,
    [season, gameweek]
  );
  const [gameweekRow] = scheduled.rows;
  if (gameweekRow === undefined) {
    throw new Error(`Gameweek ${gameweek} of ${season} is not scheduled`);
  }

  const players = await database.query<PoolRow>(
    `select fpl_id, team_name, web_name, position, price_tenths, status,
            chance_of_playing_next_round, news, penalties_order,
            direct_freekicks_order, corners_and_indirect_freekicks_order
       from fpl_players
      where season = $1 and gw = $2
      order by fpl_id`,
    [season, gameweek]
  );
  // Behind the Gameweek and ahead of it: three reads with nothing to say to
  // each other, so none waits on the others.
  const [windows, ahead, league] = await Promise.all([
    settledPerformance(database, season, gameweek),
    schedule(database, season, gameweek),
    currentSeasonTable(database, season)
  ]);
  return {
    ...windows,
    schedule: ahead,
    league,
    deadline: gameweekRow.deadline_at,
    pool: players.rows.map((row) => ({
      fplId: row.fpl_id,
      webName: row.web_name,
      club: row.team_name,
      position: row.position,
      priceTenths: row.price_tenths,
      status: row.status,
      chanceOfPlaying: row.chance_of_playing_next_round,
      news: row.news,
      penaltyOrder: row.penalties_order,
      directFreeKickOrder: row.direct_freekicks_order,
      cornerOrder: row.corners_and_indirect_freekicks_order
    }))
  };
}

/**
 * Every player's position across the Season, for however many the Season
 * records exactly one for. Read the same way the scorer reads it
 * (`scoreFplGameweek`): scoring prices nobody, so a Gameweek whose pre-Lock
 * snapshot was missed still has to be scoreable, and a player the Season
 * disagrees with itself about is left out rather than guessed at.
 */
export async function loadSeasonPositions(
  database: Database,
  season: string
): Promise<PlayerPosition[]> {
  const listed = await database.query<{ fpl_id: number; positions: Position[] }>(
    `select fpl_id, array_agg(distinct position) as positions
       from fpl_players
      where season = $1
      group by fpl_id`,
    [season]
  );
  return listed.rows.flatMap((row) =>
    row.positions.length === 1 ? [{ fplId: row.fpl_id, position: row.positions[0]! }] : []
  );
}

/** One Gameweek's settled points, every player FPL scored. */
export async function loadGameweekPoints(
  database: Database,
  season: string,
  gameweek: number
): Promise<PlayerGameweekPoints[]> {
  const settled = await database.query<{
    fpl_id: number;
    minutes: number;
    total_points: number;
  }>(
    `select fpl_id, minutes, total_points
       from fpl_player_points
      where season = $1 and gw = $2`,
    [season, gameweek]
  );
  return settled.rows.map((row) => ({
    fplId: row.fpl_id,
    minutes: row.minutes,
    totalPoints: row.total_points
  }));
}

/**
 * The `OwnRecord` a Team Sheet and a scored detail come to, over one
 * Gameweek's raw settled points — the one seam both readers of an Entrant's
 * own record share, whether the detail came from the scorer's stored row (the
 * roster) or from calling `scoreTeamSheet` directly (an Exhibition Run, whose
 * own scored rows do not exist yet at replay time; ADR-0041).
 *
 * Each pick's points are read off the raw settled record rather than off
 * `detail.players`, because that list holds only the eleven or fifteen that
 * counted after substitutions — a bench player who never came on has a raw
 * return, and "what each pick returned" means the whole Team Sheet's.
 */
export function ownRecordFromDetail(
  gameweek: number,
  teamSheet: TeamSheet,
  pointsOf: ReadonlyMap<number, number>,
  detail: ScoreDetail,
  seasonPoints: number
): OwnRecord {
  const pick = (fplId: number): OwnRecordPick => ({
    fplId,
    points: pointsOf.get(fplId) ?? 0
  });
  const wore = detail.captain === null
    ? undefined
    : detail.players.find(({ fplId }) => fplId === detail.captain);
  return {
    gameweek,
    starters: teamSheet.starters.map(pick),
    bench: teamSheet.bench.map(pick),
    // `points * multiplier` restates a stored factor rather than deriving a
    // new number — the same read the dashboard's `fplEntrants` endpoint
    // already makes off this exact `ScoreDetail` shape for its own
    // `captainPoints` field, not a second scoring of the Team Sheet.
    armband: wore === undefined
      ? null
      : {
          fplId: wore.fplId,
          points: wore.points,
          multiplier: wore.multiplier,
          contribution: wore.points * wore.multiplier
        },
    seasonPoints
  };
}

/**
 * An Entrant's own record as the roster reads it: the scorer's own stored
 * detail and cumulative row for the latest Gameweek this Entrant holds a
 * scored FPL record for, strictly before `gameweek` — or null before one
 * exists, which the opening always is.
 *
 * Reads `scores` rather than `fpl_player_points` for "the latest Settled
 * Gameweek", deliberately: a Gameweek whose points have landed but has not
 * yet been scored has nothing this Entrant's own record can show, and the
 * block falls back to the Gameweek before it rather than a fact the scorer
 * has not written yet.
 */
export async function loadOwnRecord(
  database: Database,
  season: string,
  entrantId: string,
  gameweek: number
): Promise<OwnRecord | null> {
  const scored = await database.query<{ gw: number; detail: ScoreDetail }>(
    `select gw, detail
       from scores
      where model_id = $1 and season = $2 and track = 'fpl'
        and metric = $3 and gw < $4
      order by gw desc
      limit 1`,
    [entrantId, season, FPL_POINTS_METRIC, gameweek]
  );
  const [row] = scored.rows;
  if (row === undefined) {
    return null;
  }
  const settledGw = row.gw;

  const stored = await database.query<{ team_sheet: TeamSheet }>(
    `select team_sheet
       from manager_states
      where model_id = $1 and season = $2 and gw = $3`,
    [entrantId, season, settledGw]
  );
  const teamSheet = stored.rows[0]?.team_sheet;
  if (teamSheet === undefined) {
    throw new Error(
      `${entrantId} holds a scored FPL record for Gameweek ${settledGw} of `
      + `${season} but no Manager State for it`
    );
  }

  const points = await loadGameweekPoints(database, season, settledGw);
  const pointsOf = new Map(points.map((point) => [point.fplId, point.totalPoints]));

  const total = await database.query<{ value: string }>(
    `select value
       from scores
      where model_id = $1 and season = $2 and track = 'fpl'
        and metric = $3 and gw = $4`,
    [entrantId, season, FPL_POINTS_SEASON_TO_DATE_METRIC, settledGw]
  );
  const totalRow = total.rows[0];
  // The scorer writes both rows in the same transaction (`writeRecord`), so
  // one without the other is a corrupted record rather than a Gameweek with
  // nothing to report — a silent zero would misreport the Entrant's Season.
  if (totalRow === undefined) {
    throw new Error(
      `${entrantId} holds a scored FPL Gameweek ${settledGw} points row for `
      + `${season} but no Season-to-date row for it`
    );
  }
  const seasonPoints = Number(totalRow.value);

  return ownRecordFromDetail(
    settledGw,
    teamSheet,
    pointsOf,
    row.detail,
    seasonPoints
  );
}

/**
 * Stores one Entrant's FPL context for a Gameweek and returns the body that is
 * on record. A later run gets the stored text back rather than the one it just
 * built, so a player snapshot that moved in between cannot price a Squad from
 * a text the Entrant was never shown and the stored hash does not cover.
 *
 * One row per Entrant per Gameweek, because from the second Gameweek onwards
 * the text carries that Entrant's own Squad. The opening's ten bodies are
 * identical — every Entrant is seeded from the same empty Squad — and are
 * still stored one apiece, so that no reader of `contexts` has to know which
 * Gameweek was the exception.
 */
export async function storeFplContext(
  database: Database,
  season: string,
  gameweek: number,
  entrantId: string,
  body: string
): Promise<string> {
  const inserted = await database.query<{ body: string }>(
    `insert into contexts (season, gw, track, model_id, hash, body)
     values ($1, $2, 'fpl', $3, $4, $5)
     on conflict (
       competition, season, gw, track,
       (coalesce(fixture_id, -1)), (coalesce(model_id, ''))
     ) do nothing
     returning body`,
    [
      season,
      gameweek,
      entrantId,
      createHash("sha256").update(body).digest("hex"),
      body
    ]
  );
  const insertedBody = inserted.rows[0]?.body;
  if (insertedBody !== undefined) {
    return insertedBody;
  }

  const stored = await database.query<{ body: string }>(
    `select body
       from contexts
      where season = $1 and gw = $2 and track = 'fpl' and model_id = $3`,
    [season, gameweek, entrantId]
  );
  const storedBody = stored.rows[0]?.body;
  if (storedBody === undefined) {
    throw new Error(
      `FPL context for ${entrantId} at Gameweek ${gameweek} of ${season} `
      + "was not stored"
    );
  }
  return storedBody;
}

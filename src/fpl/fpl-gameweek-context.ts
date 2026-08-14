import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  SCHEDULE_GAMEWEEKS,
  type FplFixture,
  type FplLeagueTable,
  type FplPerformanceWindow,
  type FplPlayerPerformance,
  type FplTrackPlayer
} from "../context/build-fpl-track-context.js";
import {
  leagueTable,
  type HistoricalMatch
} from "../context/build-historical-context.js";
import type { Position } from "./apply-gameweek-action.js";

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
 * The Fixtures of this Gameweek and the five after it, ordered as the section
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
    `select gw, home_team, away_team, kickoff_at
       from fixtures
      where season = $1 and gw between $2 and $3 and not unscheduled
      order by gw, kickoff_at, fpl_id`,
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
 */
async function currentSeasonTable(
  database: Database,
  season: string
): Promise<FplLeagueTable | null> {
  const results = await database.query<HistoricalMatch>(
    `select season, division, played_on, home_team, away_team,
            home_goals, away_goals
       from historical_matches
      where season = $1 and division = 'Premier League'
      order by played_on`,
    [season]
  );
  const latest = results.rows.at(-1);
  return latest === undefined
    ? null
    : { through: latest.played_on, rows: leagueTable(results.rows) };
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
  const scheduled = await database.query<{ deadline_at: Date }>(
    "select deadline_at from gameweeks where season = $1 and gw = $2",
    [season, gameweek]
  );
  const [gameweekRow] = scheduled.rows;
  if (gameweekRow === undefined) {
    throw new Error(`Gameweek ${gameweek} of ${season} is not scheduled`);
  }

  const players = await database.query<PoolRow>(
    `select fpl_id, team_name, web_name, position, price_tenths, status,
            chance_of_playing_next_round, news
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
      news: row.news
    }))
  };
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
       season, gw, track, (coalesce(fpl_id, -1)), (coalesce(model_id, ''))
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

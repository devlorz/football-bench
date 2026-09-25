import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  FplSourceHttpError,
  parseFplSource
} from "./fetch-gameweek.js";

/**
 * FPL sends the expected-goals family as decimal strings with two places
 * ("0.42"), and migration 0015 stores them fixed-point at that precision.
 *
 * The bound is what the column can hold without losing information, not the
 * source's spelling of it: "0.4" widens to "0.40" and says the same thing,
 * while a third decimal could only be stored by rounding it away. Both ends of
 * `numeric(5, 2)` are checked here so an out-of-range value is refused at the
 * boundary, naming its field, rather than reaching Postgres as an overflow.
 */
const expectedGoalsStat = z.string().regex(
  /^\d{1,3}(\.\d{1,2})?$/,
  "expected a non-negative decimal string below 1000 with at most two decimal places"
);

const countStat = z.number().int().nonnegative();

/**
 * The live endpoint's stat block for a player who did nothing: the shape the
 * schema above requires, written once. A scripted body and the rehearsal's own
 * cannot drift away from the boundary they both have to pass.
 */
export const NO_LIVE_STATS = {
  minutes: 0,
  total_points: 0,
  goals_scored: 0,
  assists: 0,
  clean_sheets: 0,
  bonus: 0,
  yellow_cards: 0,
  red_cards: 0,
  saves: 0,
  expected_goals: "0.00",
  expected_assists: "0.00",
  expected_goals_conceded: "0.00"
} as const;

const liveSchema = z.looseObject({
  elements: z.array(z.looseObject({
    id: z.number().int().positive(),
    stats: z.looseObject({
      minutes: z.number().int().nonnegative(),
      // Points go negative on a red card or an own goal.
      total_points: z.number().int(),
      goals_scored: countStat,
      assists: countStat,
      clean_sheets: countStat,
      bonus: countStat,
      yellow_cards: countStat,
      red_cards: countStat,
      saves: countStat,
      expected_goals: expectedGoalsStat,
      expected_assists: expectedGoalsStat,
      expected_goals_conceded: expectedGoalsStat
    })
  }))
});

type Database = Pick<Client, "query">;

export interface FetchFplPlayerPointsOptions {
  database: Database;
  season: string;
  gameweek: number;
  http: HttpFetcher;
}

function liveUrl(gameweek: number): string {
  return `https://fantasy.premierleague.com/api/event/${gameweek}/live/`;
}

/**
 * Stores one Gameweek's per-player points once settled (ADR-0053);
 * this function never reads a clock.
 */
export async function fetchFplPlayerPoints({
  database,
  season,
  gameweek,
  http
}: FetchFplPlayerPointsOptions): Promise<void> {
  const url = liveUrl(gameweek);
  const response = await http(url);

  await storeRawSnapshots(database, [{
    source: `fpl_live:${season}:${gameweek}`,
    body: response.body
  }]);

  if (response.status < 200 || response.status >= 300) {
    throw new FplSourceHttpError("fpl_live", response.status, url);
  }
  const live = parseFplSource("fpl_live", liveSchema, response.body);

  await database.query("begin");
  try {
    // Keyed the way the table is, because a batch upsert cannot touch one
    // row twice: the last copy of an id FPL sends is the one stored, as it
    // was when each row was its own statement.
    const players = [
      ...new Map(live.elements.map((player) => [player.id, player])).values()
    ];
    await database.query(
      `insert into fpl_player_points (
         season, gw, fpl_id, minutes, total_points,
         goals_scored, assists, clean_sheets, bonus,
         yellow_cards, red_cards, saves,
         expected_goals, expected_assists, expected_goals_conceded
       )
       select $1, $2, * from unnest(
         $3::integer[], $4::integer[], $5::integer[],
         $6::integer[], $7::integer[], $8::integer[], $9::integer[],
         $10::integer[], $11::integer[], $12::integer[],
         $13::numeric[], $14::numeric[], $15::numeric[]
       )
       on conflict (season, gw, fpl_id)
       do update set
         minutes = excluded.minutes,
         total_points = excluded.total_points,
         goals_scored = excluded.goals_scored,
         assists = excluded.assists,
         clean_sheets = excluded.clean_sheets,
         bonus = excluded.bonus,
         yellow_cards = excluded.yellow_cards,
         red_cards = excluded.red_cards,
         saves = excluded.saves,
         expected_goals = excluded.expected_goals,
         expected_assists = excluded.expected_assists,
         expected_goals_conceded = excluded.expected_goals_conceded`,
      [
        season,
        gameweek,
        players.map(({ id }) => id),
        players.map(({ stats }) => stats.minutes),
        players.map(({ stats }) => stats.total_points),
        players.map(({ stats }) => stats.goals_scored),
        players.map(({ stats }) => stats.assists),
        players.map(({ stats }) => stats.clean_sheets),
        players.map(({ stats }) => stats.bonus),
        players.map(({ stats }) => stats.yellow_cards),
        players.map(({ stats }) => stats.red_cards),
        players.map(({ stats }) => stats.saves),
        // Passed through as the source's own strings: parsing to a float
        // and back is a rounding step with nothing to gain.
        players.map(({ stats }) => stats.expected_goals),
        players.map(({ stats }) => stats.expected_assists),
        players.map(({ stats }) => stats.expected_goals_conceded)
      ]
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
}

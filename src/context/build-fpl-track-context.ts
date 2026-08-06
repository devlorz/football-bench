import { z } from "zod";
import {
  carriedIntoNextGameweek,
  chipRefusal,
  CHIPS,
  FIRST_HALF_FINAL_GAMEWEEK,
  GAMEWEEK_RULES,
  type Chip,
  type ChipsUsed,
  type ManagerState,
  type PoolPlayer,
  type Position
} from "../fpl/apply-gameweek-action.js";

/** Frozen (prompt template + context builder) pair for the FPL track. */
export const FPL_PROMPT_VERSION = "fpl/2026-27-v2";

export interface FplTrackPlayer {
  fplId: number;
  webName: string;
  club: string;
  position: Position;
  priceTenths: number;
  status: string;
}

/**
 * One window's aggregate of a player's Settled Gameweeks: raw events summed,
 * never averaged or rated (ADR-0018). `appearances` is the count of Settled
 * Gameweeks the player played minutes in, derived rather than stored.
 *
 * The expected-goals family keeps the fixed-point decimal spelling the live
 * feed and the points table both use. Summing them is Postgres' job on a
 * `numeric` column; parsing to a float here to render them would be a rounding
 * step with nothing to gain.
 */
export interface FplPerformanceWindow {
  points: number;
  minutes: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  expectedGoals: string;
  expectedAssists: string;
  expectedGoalsConceded: string;
}

/**
 * One player's two windows, as the opening flow computes them. `lastFive` is
 * absent for a player whose Settled minutes all fall outside the five most
 * recent Gameweeks, which is the same statement an empty window would make.
 */
export interface FplPlayerPerformance {
  fplId: number;
  season: FplPerformanceWindow;
  lastFive?: FplPerformanceWindow;
}

/** This Gameweek and the five after it: the planning window (ADR-0021). */
export const SCHEDULE_GAMEWEEKS = 6;

/**
 * One Fixture of the schedule window: who plays whom, in which Gameweek, and
 * when. Kickoff carries the instant the row holds and the section shows the
 * date alone — the schedule informs selection, not travel plans (ADR-0021).
 *
 * Clubs rather than teams, as the pool line's `club` is: a team in this
 * vocabulary is a Squad or a Team Sheet (CONTEXT.md), and the column these
 * come out of is named from FPL's feed rather than from the domain.
 */
export interface FplFixture {
  gameweek: number;
  homeClub: string;
  awayClub: string;
  kickoff: Date;
}

export interface BuildFplTrackContextOptions {
  season: string;
  gameweek: number;
  state: ManagerState;
  pool: FplTrackPlayer[];
  /**
   * This Gameweek's Fixtures and the five Gameweeks after it, ordered by
   * Gameweek and then by kickoff. Ordering and windowing are the opening
   * flow's, as the stat windows are; the builder groups what it is handed.
   */
  schedule: FplFixture[];
  /**
   * The two windows per player, for however many players have a Settled
   * Gameweek to their name. A player absent from this list carries no window
   * at all, which is how the pool says "no Settled appearance".
   */
  performance: FplPlayerPerformance[];
  /**
   * The Settled Gameweek the windows run through, or null when none has
   * settled — Gameweek 1's normal case. The context announces it either way,
   * so the stored text never depends on when the fetch ran.
   */
  settledThrough: number | null;
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  a: "available",
  d: "doubtful",
  i: "injured",
  s: "suspended",
  u: "unavailable"
};

/**
 * What each half-Season's set still holds. An Entrant is refused for reaching
 * for a Chip it has spent (ADR-0004), so it is told what it holds rather than
 * left to remember, and told it half by half because the two sets are counted
 * apart and the first cannot be carried into the second.
 *
 * The names come from the reducer's own inventory and in its order, so a Chip
 * the rules gain is offered here without anyone remembering to add it.
 */
function chipsSection(state: ManagerState, gameweek: number): string[] {
  const named = (chips: readonly Chip[]): string =>
    chips.length === 0 ? "none" : chips.join(", ");
  const unspent = (half: keyof ChipsUsed): string =>
    named(CHIPS.filter((chip) => !state.chipsUsed[half].includes(chip)));

  return [
    `Chips unspent, first half (through Gameweek ${FIRST_HALF_FINAL_GAMEWEEK}`
    + `): ${unspent("firstHalf")}`,
    `Chips unspent, second half (from Gameweek ${FIRST_HALF_FINAL_GAMEWEEK + 1}`
    + `): ${unspent("secondHalf")}`,
    // The two counts above are what an Entrant plans a Season with. This is
    // what this Gameweek will actually accept, and the two differ whenever a
    // Chip is held but withheld — a Free Hit the Gameweek after a Free Hit,
    // and both transfer Chips in the Gameweek the track opens on. Asking the
    // rules rather than restating them is what keeps the answer true.
    "Chips you can play this Gameweek: "
    + named(CHIPS.filter(
      (chip) => chipRefusal(state, chip, gameweek) === null
    ))
  ];
}

function money(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

/**
 * One window as it goes on a pool line, or nothing at all when the window
 * holds no Settled minutes — six hundred players over a Season is what makes
 * every omitted key worth omitting, and an absent block is itself the
 * statement "no Settled appearance in this window".
 *
 * A zero-valued key is dropped for the same reason: the legend says a missing
 * key is a zero, so nothing is lost. `pts` survives at a negative, which a red
 * card and an own goal both produce.
 */
function statBlock(
  window: FplPerformanceWindow
): Record<string, number | string> | undefined {
  if (window.minutes === 0) {
    return undefined;
  }
  const block: Record<string, number | string> = {
    pts: window.points,
    min: window.minutes,
    app: window.appearances,
    g: window.goals,
    a: window.assists,
    cs: window.cleanSheets,
    b: window.bonus,
    yc: window.yellowCards,
    rc: window.redCards,
    sv: window.saves,
    xg: window.expectedGoals,
    xa: window.expectedAssists,
    xgc: window.expectedGoalsConceded
  };
  return Object.fromEntries(
    Object.entries(block).filter(([, value]) => Number(value) !== 0)
  );
}

function playerLine(
  player: FplTrackPlayer,
  performance: FplPlayerPerformance | undefined
): string {
  const status = STATUS_LABELS[player.status]
    ?? `unrecognised (${player.status})`;
  const season = performance === undefined
    ? undefined
    : statBlock(performance.season);
  const lastFive = performance?.lastFive === undefined
    ? undefined
    : statBlock(performance.lastFive);
  return JSON.stringify({
    id: player.fplId,
    name: player.webName,
    club: player.club,
    position: player.position,
    price: money(player.priceTenths),
    price_tenths: player.priceTenths,
    status,
    ...(season === undefined ? {} : { season }),
    ...(lastFive === undefined ? {} : { last5: lastFive })
  });
}

/**
 * The line the pool starts on. The pool is pinned inside the context rather
 * than re-read from `fpl_players`, because that table is rewritten by every
 * pre-deadline fetch: an Entrant handed a stored context must be charged the
 * prices that context showed it, not whatever the latest snapshot holds.
 */
const POOL_HEADING = "Player pool for this Gameweek, one player per line:";

/**
 * What the pool section says before its first line: which Gameweek the windows
 * run through, and what the abbreviated keys mean.
 *
 * The Gameweek is named rather than left to be inferred from the Gameweek
 * being played, because a Gameweek FPL has not settled is announced as absent
 * rather than estimated — so the stored text never depends on the minute the
 * fetch ran. A Season that has settled nothing says so outright and carries no
 * legend: keys nothing below uses would be a definition of nothing.
 */
function performanceHeading(settledThrough: number | null): string[] {
  if (settledThrough === null) {
    return [
      "No Gameweek has settled yet, so no player performance appears below."
    ];
  }
  return [
    `Performance below runs through Settled Gameweek ${settledThrough}.`,
    "Stat keys: pts = points, min = minutes, app = appearances, g = goals, "
    + "a = assists, cs = clean sheets, b = bonus, yc = yellow cards, "
    + "rc = red cards, sv = saves, xg = expected goals, "
    + "xa = expected assists, xgc = expected goals conceded.",
    "A player's season block covers every Settled Gameweek of the Season and "
    + "last5 the five most recent. A key a block leaves out is zero; a window "
    + "a player played no Settled minutes in carries no block at all."
  ];
}

/**
 * Loose where it once was strict: a v2 line carries two stat blocks this
 * parser has no use for, and describing them here would be the frozen stat set
 * written down a second place to drift from. What it prices from is still
 * checked to the letter — the reducer does arithmetic on these fields, and a
 * body it cannot price is refused rather than half-read.
 */
const poolLineSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  club: z.string().min(1),
  position: z.enum(["GKP", "DEF", "MID", "FWD"]),
  price: z.string(),
  price_tenths: z.number().int().nonnegative(),
  status: z.string()
});

/**
 * Reads back the pool the stored context pinned, in the shape the reducer
 * prices Squads with.
 */
export function parseFplTrackContextPool(body: string): PoolPlayer[] {
  const lines = body.split("\n");
  const start = lines.indexOf(POOL_HEADING);
  if (start === -1) {
    throw new Error("Stored FPL context has no player pool");
  }

  const pool: PoolPlayer[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line === "") {
      return pool;
    }
    const parsed = poolLineSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      throw new Error("Stored FPL context has a malformed player pool line");
    }
    pool.push({
      fplId: parsed.data.id,
      club: parsed.data.club,
      position: parsed.data.position,
      priceTenths: parsed.data.price_tenths
    });
  }
  return pool;
}

/**
 * The schedule, one raw line per Fixture under the Gameweek it belongs to.
 *
 * Nothing is annotated: a club with two lines in a Gameweek has a Double and a
 * club with none has a Blank, and both are read off the list rather than
 * pointed at (ADR-0021). A window the calendar has run out of simply carries
 * fewer Gameweeks.
 */
function fixturesSection(schedule: FplFixture[]): string[] {
  // The heading spells out the window `SCHEDULE_GAMEWEEKS` sets, in words
  // rather than from the constant: this text is half of a frozen Prompt
  // Version, and a sentence that rewrote itself when a later ADR widened the
  // window would change a frozen pair without anyone deciding to.
  const lines = ["Fixtures, this Gameweek and the five ahead:"];
  let headed: number | undefined;
  for (const fixture of schedule) {
    if (fixture.gameweek !== headed) {
      headed = fixture.gameweek;
      lines.push(`Gameweek ${headed}`);
    }
    lines.push(
      `- ${fixture.homeClub} v ${fixture.awayClub} | `
      + fixture.kickoff.toISOString().slice(0, 10)
    );
  }
  return lines;
}

function squadSection(state: ManagerState): string[] {
  if (state.squad.active.length === 0) {
    return ["Squad: none yet — this is your opening Squad."];
  }
  return [
    "Squad, with what you paid for each player:",
    ...state.squad.active.map(({ fplId, purchasePriceTenths }) =>
      `- ${fplId} | bought for ${money(purchasePriceTenths)}`
    )
  ];
}

export function buildFplTrackContext({
  season,
  gameweek,
  state: stored,
  pool,
  schedule,
  performance,
  settledThrough
}: BuildFplTrackContextOptions): string {
  const windows = new Map(
    performance.map((player) => [player.fplId, player])
  );
  // The same reversion the reducer performs on the same stored row, so what
  // the Entrant is shown is what its action will be judged against. Taking the
  // row as it stands would show a Free Hit's borrowed Squad and borrowed bank
  // to an Entrant that owns neither. Doing it here rather than leaving it to
  // callers means no caller can forget, and doing it twice is doing it once.
  const state = carriedIntoNextGameweek(stored);

  return [
    `Fantasy Premier League — ${season} Gameweek ${gameweek}`,
    "",
    "You manage one Squad for the whole Season. Your decisions persist: the "
    + "Squad you pick now is the Squad you carry into the next Gameweek.",
    "",
    "Your Manager State",
    ...squadSection(state),
    `Bank: ${money(state.bankTenths)}`,
    `Free Transfers: ${state.freeTransfers}`,
    ...chipsSection(state, gameweek),
    "",
    ...fixturesSection(schedule),
    "",
    ...performanceHeading(settledThrough),
    POOL_HEADING,
    ...pool.map((player) => playerLine(player, windows.get(player.fplId))),
    "",
    "The rules your action must satisfy",
    ...GAMEWEEK_RULES.map((rule) => `- ${rule}`),
    "",
    "Return only JSON in exactly this shape, with no other text:",
    JSON.stringify({
      transfers_in: [],
      transfers_out: [],
      chip: null,
      team_sheet: {
        starters: [],
        bench: [],
        captain: 0,
        vice_captain: 0
      }
    })
  ].join("\n");
}

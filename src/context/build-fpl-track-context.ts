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
import type { LeagueTableRow } from "./build-historical-context.js";

/** Frozen (prompt template + context builder) pair for the FPL track. */
export const FPL_PROMPT_VERSION = "fpl/2026-27-v2";

export interface FplTrackPlayer {
  fplId: number;
  webName: string;
  club: string;
  position: Position;
  priceTenths: number;
  status: string;
  /**
   * FPL's own percentage chance of the player playing the next round, or null
   * when it publishes none — which is most of the pool most weeks. Zero is a
   * statement rather than an absence: it is FPL saying he will not play.
   */
  chanceOfPlaying: number | null;
  /** FPL's own note behind a flag, empty when there is nothing to report. */
  news: string;
  /**
   * A club's known penalty, direct-free-kick and corner/indirect-free-kick
   * takers, in the order FPL ranks them — null wherever FPL names none, which
   * is most of the pool: the source's own silence, not a fact dressed up as
   * one (ADR-0041).
   */
  penaltyOrder: number | null;
  directFreeKickOrder: number | null;
  cornerOrder: number | null;
}

export interface OwnRecordPick {
  fplId: number;
  /** This pick's raw Gameweek points, from the settled player record. */
  points: number;
}

/**
 * Who actually wore the armband and what it returned, already multiplied —
 * two ordinarily, three under a Triple Captain — read from the scorer's own
 * stored detail rather than recomputed here. Null when neither the captain
 * nor the vice-captain played, which is not a nought: nobody wore it.
 */
export interface OwnRecordArmband {
  fplId: number;
  points: number;
  multiplier: number;
  contribution: number;
}

/**
 * The Entrant's own record: the latest Settled Gameweek's Team Sheet with
 * what each pick returned, what the armband contributed, and the Season's
 * points to date — read entirely from stored facts (ADR-0041). Null before
 * any Gameweek has settled, which the opening always is.
 */
export interface OwnRecord {
  gameweek: number;
  starters: OwnRecordPick[];
  bench: OwnRecordPick[];
  armband: OwnRecordArmband | null;
  seasonPoints: number;
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

/**
 * The current Season's Premier League table and the date of the latest result
 * summed into it, or null before any result is stored — Gameweek 1's normal
 * case, which the context announces rather than leaving the section out.
 *
 * The two travel together because neither is true without the other: a table
 * whose coverage is unstated is a table that goes quietly stale, and the
 * results are read from the Match track's own store (ADR-0021), which this
 * track does not control the freshness of.
 */
export interface FplLeagueTable {
  through: Date;
  rows: LeagueTableRow[];
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
   * The current Season's table, summed and ordered by the opening flow, or
   * null when no result is stored yet. As with the schedule, the builder
   * renders what it is handed and orders nothing itself.
   */
  league: FplLeagueTable | null;
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
  /**
   * This Entrant's own record — its latest Settled Gameweek's Team Sheet, or
   * null before one exists. Required rather than defaulted, so a caller
   * cannot forget to read it and silently show the opening's absence to an
   * Entrant with a real record standing (ADR-0041).
   */
  ownRecord: OwnRecord | null;
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
    // Each key stands on its own emptiness rather than on the other's: FPL
    // sends news with no percentage often, so either can appear without the
    // other and each is dropped on its own — which is what leaves a line with
    // neither exactly as it was.
    ...(player.chanceOfPlaying === null
      ? {}
      : { chance: player.chanceOfPlaying }),
    ...(player.news.trim() === "" ? {} : { news: player.news }),
    ...(player.penaltyOrder === null ? {} : { pen: player.penaltyOrder }),
    ...(player.directFreeKickOrder === null
      ? {}
      : { fk: player.directFreeKickOrder }),
    ...(player.cornerOrder === null ? {} : { corners: player.cornerOrder }),
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
 * What the two availability keys mean, once, above the pool that carries them
 * — and nothing at all when no line below carries either, on the same rule the
 * stat legend follows: keys nothing below uses would be a definition of
 * nothing.
 *
 * It is a separate line from the stat legend because the two go quiet for
 * different reasons. A Season that has settled nothing has no stat to define
 * for anyone; a pool with nothing flagged is this week's pool, and next week's
 * may carry a flag with no Gameweek settled behind it.
 *
 * Both keys are FPL's own number and text — no verdict is drawn from them
 * here, so that any forecast in an Entrant's answer is the Entrant's own
 * (ADR-0018).
 */
const AVAILABILITY_LEGEND =
  "Availability keys: chance = FPL's own percentage chance of the player "
  + "playing the next round, news = FPL's own note behind a flag, both "
  + "verbatim. A player with nothing flagged carries neither key.";

function availabilityLegend(pool: FplTrackPlayer[]): string[] {
  const carried = pool.some(
    (player) => player.chanceOfPlaying !== null || player.news.trim() !== ""
  );
  return carried ? [AVAILABILITY_LEGEND] : [];
}

/**
 * What the three duty keys mean, on the same rule as the availability legend:
 * shown only when a line below carries at least one of them, and never a
 * verdict about who scores — the order alone, verbatim from FPL (ADR-0041).
 */
const DUTIES_LEGEND =
  "Duty keys: pen = penalty order, fk = direct free-kick order, corners = "
  + "corner and indirect free-kick order, each FPL's own ranking of known "
  + "takers. A player FPL names no taker for carries none of the three.";

function dutiesLegend(pool: FplTrackPlayer[]): string[] {
  const carried = pool.some(
    (player) => player.penaltyOrder !== null
      || player.directFreeKickOrder !== null
      || player.cornerOrder !== null
  );
  return carried ? [DUTIES_LEGEND] : [];
}

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

/**
 * The current Season's table, one line per side that has played, in the
 * competition's order with its rank spelled out — an Entrant reads position
 * off the line rather than counting down the section.
 *
 * The heading dates the table by its latest result, because the results come
 * from the Match track's fetch rather than this track's: a table a day behind
 * is honest about being a day behind, and one that never arrived says so
 * outright rather than being missing (ADR-0021).
 */
function leagueSection(league: FplLeagueTable | null): string[] {
  if (league === null) {
    return ["Premier League table: no result has been played yet this Season."];
  }
  return [
    "Premier League table, from results through "
    + `${league.through.toISOString().slice(0, 10)}:`,
    ...league.rows.map((row, index) =>
      `- ${index + 1} ${row.club} | ${row.played} played, `
      + `${row.wins}W ${row.draws}D ${row.losses}L, `
      + `GF ${row.goalsFor}, GA ${row.goalsAgainst}, ${row.points} pts`
    )
  ];
}

function squadSection(state: ManagerState): string[] {
  if (state.squad.active.length === 0) {
    // The one Gameweek where every player arrives through transfers_in, said
    // outright: seats that read only "none yet" still sent a transfers_out
    // they had nothing to fill (spec 0010, amended inside v2 under ADR-0026).
    return [
      "Squad: none yet — this is your opening Squad. Buy all fifteen players "
      + "through transfers_in; transfers_out stays empty."
    ];
  }
  return [
    "Squad, with what you paid for each player:",
    ...state.squad.active.map(({ fplId, purchasePriceTenths }) =>
      `- ${fplId} | bought for ${money(purchasePriceTenths)}`
    )
  ];
}

/**
 * A pick's own return, or the armband's — the one line shape both lists and
 * the armband share, so a reader learns it once.
 */
function pickLine({ fplId, points }: OwnRecordPick): string {
  return `- ${fplId} | ${points} pts`;
}

/**
 * The Entrant's own record, appended inside the Manager State block: the
 * latest Settled Gameweek's Team Sheet with what each pick returned and what
 * the armband contributed, and the Season's points to date — always naming
 * the Gameweek it reads (ADR-0041).
 *
 * Every branch is one sentence or a run of `- ` lines, and none of them is
 * blank: the splice finds the block's end at the first blank line, so this
 * section must never hand it one before the block is meant to close.
 */
function ownRecordSection(ownRecord: OwnRecord | null): string[] {
  if (ownRecord === null) {
    return ["Your own record: no Gameweek has settled yet."];
  }
  const armband = ownRecord.armband === null
    ? "Armband: nobody wore it."
    : `Armband: ${ownRecord.armband.fplId} | ${ownRecord.armband.points} pts `
    + `x${ownRecord.armband.multiplier} = ${ownRecord.armband.contribution} pts`;
  return [
    `Your own record, from Gameweek ${ownRecord.gameweek}, the latest `
    + "Settled Gameweek:",
    "Starters, with what each returned:",
    ...ownRecord.starters.map(pickLine),
    "Bench, with what each returned:",
    ...ownRecord.bench.map(pickLine),
    armband,
    `Season points to date: ${ownRecord.seasonPoints}`
  ];
}

/** The heading the Manager State block opens on, and the splice finds it by. */
const MANAGER_STATE_HEADING = "Your Manager State";

/**
 * The one block that belongs to the Manager State rather than to the Gameweek:
 * the Squad, the bank, the Free Transfers, the Chips and the Entrant's own
 * record. Everything else the context shows is the same whoever is reading
 * it, which is what lets an Exhibition Run borrow a stored body and replace
 * only this (spec 0013).
 *
 * The reversion happens here, on the same stored row the reducer reverts, so
 * what the reader is shown is what its action will be judged against. Taking
 * the row as it stands would show a Free Hit's borrowed Squad and borrowed bank
 * to a reader that owns neither. Doing it in the block means neither the
 * builder nor the splice can forget, and doing it twice is doing it once.
 *
 * `ownRecord` is taken rather than read off `stored`, because the two callers
 * differ over where it comes from: the roster reads the scorer's own record,
 * and an Exhibition Run — whose own scored rows do not exist yet at replay
 * time — computes it for itself over the same shared player points
 * (ADR-0041). Neither belongs to this function to decide.
 */
function managerStateSection(
  stored: ManagerState,
  gameweek: number,
  ownRecord: OwnRecord | null
): string[] {
  const state = carriedIntoNextGameweek(stored);
  return [
    MANAGER_STATE_HEADING,
    ...squadSection(state),
    `Bank: ${money(state.bankTenths)}`,
    `Free Transfers: ${state.freeTransfers}`,
    ...chipsSection(state, gameweek),
    ...ownRecordSection(ownRecord)
  ];
}

export function buildFplTrackContext({
  season,
  gameweek,
  state: stored,
  pool,
  schedule,
  league,
  performance,
  settledThrough,
  ownRecord
}: BuildFplTrackContextOptions): string {
  const windows = new Map(
    performance.map((player) => [player.fplId, player])
  );

  return [
    `Fantasy Premier League — ${season} Gameweek ${gameweek}`,
    "",
    "You manage one Squad for the whole Season. Your decisions persist: the "
    + "Squad you pick now is the Squad you carry into the next Gameweek.",
    "",
    ...managerStateSection(stored, gameweek, ownRecord),
    "",
    ...fixturesSection(schedule),
    "",
    ...leagueSection(league),
    "",
    ...performanceHeading(settledThrough),
    ...availabilityLegend(pool),
    ...dutiesLegend(pool),
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
      },
      rationale: ""
    })
  ].join("\n");
}

/** The line the body opens on, which is also where its Gameweek is written. */
const TRACK_HEADING_PATTERN = /^Fantasy Premier League — .+ Gameweek (\d+)$/;

/**
 * A stored body as it would have read for a holder of `state` — the donor's
 * Manager State block replaced, every shared section carried over untouched
 * (ADR-0032). The Gameweek comes off the donor's own heading, so the Chip line
 * is recomputed against the Gameweek the body was frozen for.
 *
 * This couples to the rendered structure of a frozen Prompt Version, which is
 * what makes the coupling safe: a version that redraws the block's delimiting
 * must revisit this function, and a body it cannot find the block in is refused
 * rather than patched approximately.
 */
export function spliceManagerState(
  donor: string,
  state: ManagerState,
  ownRecord: OwnRecord | null
): string {
  const lines = donor.split("\n");
  const title = TRACK_HEADING_PATTERN.exec(lines[0] ?? "");
  const blockOpens = lines.indexOf(MANAGER_STATE_HEADING);
  const blockCloses = lines.indexOf("", blockOpens);
  if (title?.[1] === undefined) {
    throw new Error(
      `the donor is not a ${FPL_PROMPT_VERSION} body: `
      + `its first line names no Gameweek`
    );
  }
  if (blockOpens === -1 || blockCloses === -1) {
    throw new Error(
      `the donor is not a ${FPL_PROMPT_VERSION} body: its `
      + `${MANAGER_STATE_HEADING} block never `
      + `${blockOpens === -1 ? "opens" : "closes"}`
    );
  }
  return [
    ...lines.slice(0, blockOpens),
    ...managerStateSection(state, Number(title[1]), ownRecord),
    ...lines.slice(blockCloses)
  ].join("\n");
}

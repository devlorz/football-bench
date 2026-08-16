/**
 * Every sentence, mark and position the FPL section is read through, apart from
 * the pages that print them.
 *
 * They live here for the reason `chart-domain.ts` does: each of them can be
 * wrong without looking wrong. A span that says "Gameweeks 1-5" over a record
 * missing Gameweek 4, a footnote naming the Gameweek the movement was not
 * measured against, a status line that claims a Gameweek settled before one
 * has, a movement marker that reads a fall as a rise, or a chart whose labels
 * have swapped lines all render perfectly. So does a Team Sheet that seats a
 * midfielder in the defenders' row, an armband on the wrong shirt, and a plate
 * naming the club its player plays for where it should name the one he faced.
 * The pages around them are scripts over a fetch and have no test; these do —
 * and a sentence a page builds for itself is one outside that rule, so none of
 * them are built there.
 */

import type {
  Chip, Position, TeamSheet, ViolationKind
} from "../../src/fpl/apply-gameweek-action.js";

/** Which way an Entrant moved, and how the design colours it. */
export interface Movement {
  mark: string;
  tone: "up" | "down" | "flat" | "none";
}

/**
 * The design's `▲n` for a rise, `▼n` for a fall and `–` for holding a place.
 *
 * No movement at all -- the first Settled Gameweek of the record, where there
 * is no snapshot behind the ranking to measure against -- draws nothing. The
 * dash is the mark for "did not move", and an Entrant nothing is known about
 * has not stood still.
 */
export const movement = (places: number | null): Movement => {
  if (places === null) return { mark: "", tone: "none" };
  if (places > 0) return { mark: `▲${places}`, tone: "up" };
  if (places < 0) return { mark: `▼${-places}`, tone: "down" };
  return { mark: "–", tone: "flat" };
};

/**
 * Money as the design prints it: tenths of a million to one decimal, with no
 * unit, because every place a figure like this appears is a column headed
 * "Squad value" or a cell labelled "In the bank" and the label carries the unit
 * for the whole of it.
 *
 * One spelling for a Squad value, a player's price, his Selling Price and the
 * bank, because they are one quantity in one currency and a page that printed
 * `100.0` in a column and `10` in the cell beside it would be reporting two.
 */
export const money = (tenths: number | null): string =>
  tenths === null ? "—" : (tenths / 10).toFixed(1);

/**
 * The same figure with the sign, for the places the design puts one: a Cards
 * tile's tag and the stat strip's two money cells, each of which is a single
 * figure with nowhere else to carry the unit.
 *
 * A figure that was not read is the dash alone. `£—` is a price tag on a Squad
 * the record holds nothing about.
 */
export const pounds = (tenths: number | null): string =>
  tenths === null ? "—" : `£${money(tenths)}`;

/**
 * A count the record may not hold. The dash means the record says nothing, and
 * nought means the record says nought — a distinction every figure on these two
 * pages has to keep, so it is kept once.
 */
export const figure = (value: number | null): string =>
  value === null ? "—" : String(value);

/**
 * The Gameweeks the record actually holds, in order: the span, less the holes
 * announced inside it.
 *
 * Derived from the three fields the body states rather than gathered back out
 * of the Race variant's series. The endpoint computed `missingGws` by taking
 * exactly this difference, so this reads the answer it published — and a page
 * that re-derives the record from the payload of one chart is a page that
 * disagrees with the body the moment that chart changes shape.
 *
 * The Race variant's own axis is labelled from this for the same reason: a
 * Gameweek settles for the whole field or for none of it (ADR-0011), so the
 * Gameweeks are a fact about the record and not about whichever Entrant the
 * page happened to read a series off.
 */
export const settledGws = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): number[] =>
  fromGw === null || throughGw === null
    ? []
    : Array.from(
        { length: throughGw - fromGw + 1 },
        (_, offset) => fromGw + offset
      ).filter((gw) => !missingGws.includes(gw));

/**
 * The kicker beside the title: what the ranking is cumulative over, and any
 * Gameweek inside that span the record holds nothing for.
 *
 * The hole is named rather than smoothed over. A Gameweek any Entrant stored no
 * Manager State in is removed from every Season path (ADR-0011), so it is in no
 * total on the page -- and "Gameweeks 1-5" over a record that skipped one is a
 * claim about five Gameweeks that four of them answer.
 */
export const gameweekSpan = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): string => {
  const span = fromGw === null || throughGw === null
    ? "no Gameweek settled"
    : fromGw === throughGw
      ? `Gameweek ${throughGw}`
      : `Gameweeks ${fromGw}–${throughGw}`;
  const missing = missingGws.length === 0
    ? ""
    : ` · not in the record: ${missingGws.map((gw) => `GW${gw}`).join(", ")}`;
  return `Cumulative, ${span}${missing}`;
};

/**
 * The Season as the rest of the site prints it. One place, because the header
 * and the pre-Season panel both say it and two spellings of one Season on one
 * page is a page that cannot decide what it is showing.
 */
export const seasonLabel = (season: string): string => season.replace("-", "/");

/**
 * What the Δ column is measured against, or nothing at all.
 *
 * The last Gameweek the record holds before the one on screen, and never
 * `throughGw − 1`: a record that skipped a Gameweek has no snapshot there, and
 * the movement beside every row was measured against the last Gameweek that has
 * one. Naming the wrong Gameweek is the quietest error on the page -- the
 * sentence reads perfectly either way.
 *
 * It takes the same three fields the kicker does, so the whole of the step from
 * a body to a Gameweek is here under test, and the page hands over what it was
 * given rather than working any of it out on the way.
 *
 * At the first Settled Gameweek there is nothing behind the ranking, the Δ
 * column is empty, and the sentence would be naming a Gameweek that does not
 * exist. It says nothing instead.
 */
export const deltaNote = (
  fromGw: number | null,
  throughGw: number | null,
  missingGws: number[]
): string => {
  const previousGw = settledGws(fromGw, throughGw, missingGws).at(-2);
  return previousGw === undefined
    ? ""
    : `Δ is the change against the cumulative snapshot at GW${previousGw}.`;
};

/**
 * The Cards variant's Chips tag, which counts in words as well as in figures.
 *
 * One Chip is a chip. The table's own column is the bare number under a header
 * that says what it counts, so it needs none of this; a tile carries its own
 * noun and a tile reading "1 chips" is the only thing on it that can be wrong
 * without being a wrong figure.
 */
export const chipsTag = (remaining: number | null): string =>
  remaining === null ? "—" : `${remaining} ${remaining === 1 ? "chip" : "chips"}`;

/** How the design draws a place in the field, wherever that place is drawn. */
export interface RankBand {
  /** The weight: the leader, the two behind it, or the rest of the field. */
  band: "1" | "top" | "rest";
  /** The dash the design gives third place, so second and third stay apart. */
  dashed: boolean;
}

/**
 * Which of the design's three weights a rank is drawn at.
 *
 * A band and never a tier: CONTEXT.md keeps that word for the Match Points tier
 * and nothing else, and this is a place in the FPL ranking.
 *
 * One classification for the whole page — the Race line, the name at the end of
 * it and the Cards tile are three pictures of one hierarchy, and three readings
 * of `rank` are three chances for them to disagree about who the leader is. The
 * dash is part of the same answer for the same reason: it was the one thing the
 * page still read `rank` a second time to decide.
 *
 * Here rather than in the page because a leader drawn in the colour of the
 * ninth renders perfectly, which is the whole of what this module is for. An
 * Entrant with no rank at all is the rest of the field: ranks are null before
 * the first Settled Gameweek, where the Race is not drawn, so nothing reaches
 * this that a lighter line would misrepresent.
 */
export const rankBand = (rank: number | null): RankBand => ({
  band: rank === 1 ? "1" : rank !== null && rank <= 3 ? "top" : "rest",
  dashed: rank === 3
});

/**
 * Where a column of labels sits once none of them overlap: each at the position
 * it asked for, or pushed down far enough to clear the one above it by `gap`.
 *
 * The Race chart's labels hang off the end of nine lines, and nine Entrants
 * that opened on the same fifteen players can end a Gameweek on the same total
 * — so the ends they are hung on are not spread out at all, and the design
 * fixes the minimum gap rather than hoping. Positions come back in the order
 * they were given, because the caller pairs them with its own rows by index.
 *
 * Pushed down and never reordered: the label a line ends above stays above, and
 * a de-overlap that sorted the collisions apart would hand a rank's name to
 * another rank's line.
 *
 * A run that passed `height` is then pulled back off the foot one label at a
 * time, from the bottom up, and never as one block: a runaway leader with the
 * rest of the field packed on the baseline is a real Season, and shifting all
 * nine by what the pack overflowed by would carry that one label off the top of
 * the panel. Taken from the bottom, only the labels that have to move do, every
 * gap survives, and the whole column stays inside the plot for as long as the
 * field needs less of it than there is — nine labels at the design's 17 units
 * need 136 of the plot's 300.
 *
 * It lives here rather than in `chart-domain.ts` because that module is the
 * Match track's cumulative chart, down to its docstring, and a second track's
 * geometry moving in makes it neither track's. This is the module the slice's
 * own rule points at: what the FPL ranking can get wrong without looking wrong.
 */
export const spreadLabels = (
  positions: number[],
  gap: number,
  height: number
): number[] => {
  const placed = new Array<number>(positions.length);
  // Stable, so labels that asked for the same position keep the order they
  // arrived in rather than an order the sort invented.
  const order = positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position - b.position);

  let cursor = -Infinity;
  for (const { position, index } of order) {
    cursor = Math.max(position, cursor + gap);
    placed[index] = cursor;
  }

  cursor = height;
  for (const { index } of [...order].reverse()) {
    cursor = Math.min(placed[index]!, cursor);
    placed[index] = cursor;
    cursor -= gap;
  }
  return placed;
};

/* ── the Team Sheet ───────────────────────────────────────────────────────── */

/** As much of one of the fifteen as deciding where he sits depends on. */
export interface Seatable {
  fplId: number;
  position: Position;
}

/**
 * The place a Team Sheet gave one of the fifteen, and how the design draws it.
 *
 * A seat and never a role, for the reason `rankBand` is not a tier: CONTEXT.md
 * spends `role` on the `models` column that says whether a seat holds an Entrant
 * or a Reference Line, and this is a place in a Team Sheet. The list view's
 * column is still headed "Role", which is the design's word to a reader; the
 * word this file is careful with is the one a later reader greps for.
 */
export interface Seat {
  /** The design's tag: `Captain`, `Vice`, `Starter`, `Bench GK`, `Bench 1`. */
  label: string;
  tone: "accent" | "neutral" | "outline";
  /** Which the list view dims and the pitch draws in the bench strip. */
  bench: boolean;
  /**
   * What the bench strip prints in the slot the pitch gives an opponent, or
   * null for one of the eleven. The same answer as `label` and not a second
   * one: the strip has room for `GK` and the list's tag has room for
   * `Bench GK`, and a page slicing the one out of the other would be deciding
   * for itself which part of a seat is the number.
   */
  slot: string | null;
  /** The armband badge on the shirt, or none. */
  badge: "C" | "V" | null;
}

/** One of the fifteen with the seat the Team Sheet gave him. */
export interface Seated<P> {
  player: P;
  seat: Seat;
}

/**
 * The fifteen as the two views draw them: the eleven in the four rows of the
 * pitch, the four on the bench in the order they would come on, and all of them
 * in one list.
 *
 * The three are one answer and not three reads of the Sheet, because they are
 * three pictures of one Team Sheet and a page that worked each of them out
 * separately could draw a captain on the pitch and tag a different player
 * Captain in the list.
 */
export interface SeatedSheet<P> {
  /** GKP, DEF, MID then FWD, each in Squad order — the design's four rows. */
  rows: Array<Seated<P>[]>;
  bench: Array<Seated<P>>;
  /** The eleven then the four, which is the order the list view prints. */
  all: Array<Seated<P>>;
}

/** The four rows the pitch draws, from the goal outwards. */
const ROWS: readonly Position[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * Where each of the fifteen sits, read once off the stored Team Sheet.
 *
 * Here rather than in the page because every part of it renders perfectly while
 * being wrong: a midfielder in the defenders' row is a formation the Entrant
 * never picked, an armband on the wrong shirt credits the wrong player with a
 * doubled score, and a bench number that counts the goalkeeper says the wrong
 * player comes on first.
 *
 * A player the Sheet seats nowhere stops the read. A Squad's fifteen are exactly
 * the eleven and the four — the rules refuse a Team Sheet that is anything else
 * (`benchSeatsTheRest`) — so a player in neither list is a broken record, and
 * drawing the other fourteen would be a Team Sheet that looks complete and is
 * missing a player.
 *
 * No Sheet at all is not that: an Entrant with no Manager State has no Team
 * Sheet, which is the pre-Season state every page has to render, and it seats
 * nobody rather than failing.
 */
export const seatTeamSheet = <P extends Seatable>(
  players: readonly P[],
  sheet: TeamSheet | null
): SeatedSheet<P> => {
  if (sheet === null) return { rows: ROWS.map(() => []), bench: [], all: [] };

  const keeper = (fplId: number): boolean =>
    players.some((each) => each.fplId === fplId && each.position === "GKP");

  const seat = (player: P): Seated<P> => {
    const starting = { tone: "outline", bench: false, slot: null } as const;
    if (player.fplId === sheet.captain) {
      return {
        player,
        seat: { ...starting, label: "Captain", tone: "accent", badge: "C" }
      };
    }
    if (player.fplId === sheet.viceCaptain) {
      return { player, seat: { ...starting, label: "Vice", badge: "V" } };
    }
    if (sheet.starters.includes(player.fplId)) {
      return { player, seat: { ...starting, label: "Starter", badge: null } };
    }
    const seatedAt = sheet.bench.indexOf(player.fplId);
    if (seatedAt === -1) {
      throw new Error(
        `The Team Sheet neither starts nor benches player ${player.fplId}`
      );
    }
    // The goalkeeper is the substitution the rules make for you and the other
    // three are the ones they make in order, so the design labels him by his
    // position and numbers the rest 1, 2, 3 among themselves. Counting him
    // would number the first outfielder to come on as the second.
    const slot = player.position === "GKP"
      ? "GK"
      : String(
        sheet.bench.slice(0, seatedAt).filter((fplId) => !keeper(fplId)).length
        + 1
      );
    return {
      player,
      seat: {
        label: `Bench ${slot}`, tone: "neutral", bench: true, slot, badge: null
      }
    };
  };

  const seated = players.map(seat);
  const rows = ROWS.map((position) => seated.filter(({ player, seat }) =>
    !seat.bench && player.position === position));
  // In the order the Sheet benched them, which is the order they come on, and
  // not in the Squad order the eleven above keep.
  const bench = sheet.bench.flatMap((fplId) =>
    seated.filter(({ player }) => player.fplId === fplId));
  return { rows, bench, all: [...rows.flat(), ...bench] };
};

/**
 * How a club is named where the design has room for three letters: its own
 * code, and its name where the record holds no code for it (migration 0029).
 *
 * The shirt on the pitch, the Club column of the list and the opponent on a
 * name plate all read it, so no two of them can name one club two ways on one
 * page — which is why the body spells a player's club and the club he faced
 * with the same two field names. Never three letters of the name: `Man City`
 * and `Man Utd` share theirs, and `AVL` and `NFO` are not slices of the names
 * they belong to.
 */
export const clubTag = (
  club: { club: string; clubCode: string | null }
): string => club.clubCode ?? club.club;

/**
 * Who a player's club played, as the design prints it on his plate: the
 * opponent's three-letter code and whether it was at home.
 *
 * The club's name where the record holds no code for it (migration 0029), which
 * is longer than the plate was drawn for and is what the record actually says.
 * Never three letters of the name: `Man City` and `Man Utd` share theirs.
 *
 * A club with no Fixture in the Gameweek is blank, which is a real Gameweek and
 * not a missing read — the plate says so rather than leaving the slot empty for
 * a reader to take as a rendering fault.
 */
export const opponentLabel = (
  opponents: ReadonlyArray<
    { club: string; clubCode: string | null; home: boolean }
  >
): string =>
  opponents.length === 0
    ? "Blank"
    : opponents
        .map((each) => `${clubTag(each)} (${each.home ? "H" : "A"})`)
        .join(" ");

/**
 * The deadline a Team Sheet answers, under the Entrant's name.
 *
 * In UTC and saying so, which is the design's own spelling and the only one
 * that is unambiguous: a Lock is one instant for the whole field, and a reader
 * in Bangkok reading a Friday deadline as Saturday morning would have a
 * different answer to "which deadline is this" than a reader in London. The
 * Match track's Fixtures page prints its deadline in the reader's own zone,
 * where the question is when the next Lock falls for them; this one is a stamp
 * on a Gameweek that has already been scored.
 *
 * The date is in it and the design's line has only the weekday and the time.
 * The prototype had four Gameweeks and this Season has 38: "Fri 18:30" names
 * five deadlines by the end of the first month.
 *
 * Nothing at all where the record holds no deadline, rather than a line that
 * says "locked" and then nothing.
 */
const lockedAt = (iso: string | null): string => {
  if (iso === null) return "";
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
  return `locked ${when} UTC`;
};

/**
 * The line under an Entrant's name on its Team Sheet: which Base Model, served
 * by which provider, answering which deadline.
 *
 * All three are the design's, and all three are in the record — the Base Model
 * and the provider are columns of the seat this endpoint already reads
 * (ADR-0009 pins the provider, and a served open-weight Base Model at another
 * one is another Base Model), and the deadline is the Gameweek's.
 *
 * A record with no deadline drops that clause rather than printing a line that
 * says "locked" and stops.
 */
export const sheetSubLine = (
  entrant: { baseModel: string; provider: string },
  deadlineAt: string | null
): string => [
  entrant.baseModel, entrant.provider, lockedAt(deadlineAt)
].filter((part) => part !== "").join(" · ");

/**
 * A Gameweek where a column header or a tag has room for two characters and a
 * number. One spelling, because `GW5` appears in a table header, a stat cell
 * and a Cards tag on two pages, and a Gameweek is the thing on this dashboard
 * most easily printed off by one.
 */
export const gwTag = (gw: number | null): string =>
  gw === null ? "GW" : `GW${gw}`;

/** The kicker over an Entrant's name: which Sheet, for which Gameweek. */
export const sheetKicker = (gw: number | null): string =>
  gw === null ? "Team Sheet" : `Team Sheet · Gameweek ${gw}`;

/* ── the Gameweek around it ───────────────────────────────────────────────── */

/**
 * A Chip as the Premier League writes it, or the design's `None`.
 *
 * Typed on `Chip`, so a Chip added to the rules and not to this table fails the
 * build rather than reaching a stat strip as `triple_captain`.
 */
const CHIP_LABELS: Record<Chip, string> = {
  wildcard: "Wildcard",
  free_hit: "Free Hit",
  triple_captain: "Triple Captain",
  bench_boost: "Bench Boost"
};

export const chipLabel = (chip: Chip | null): string =>
  chip === null ? "None" : CHIP_LABELS[chip];

/**
 * A broken rule of the game in the words the rules use for it, typed on
 * `ViolationKind` for the reason the Chips above are.
 */
const VIOLATION_LABELS: Record<ViolationKind, string> = {
  budget: "Budget",
  squad_quota: "Squad quota",
  club_limit: "Club limit",
  unknown_player: "Unknown player",
  formation: "Formation",
  captain: "Captain",
  chip_unavailable: "Chip unavailable"
};

/** One row of the design's validation block. */
export interface ValidationRow {
  label: string;
  value: string;
}

/**
 * The three rows under the Squad: how many Repairs the Gameweek's action cost
 * before it was legal, whether it ever became legal, and the last rule broken
 * on the way.
 *
 * Read against the allowance the body serves rather than a `3` written here, so
 * the sentence cannot outlive ADR-0010's number. A Gameweek with no Manager
 * State has none of the three and says so rather than reporting nought Repairs
 * and a clean Roll Over for an Entrant that did not play.
 */
export const validationRows = (
  record: {
    repairs: number | null;
    rolledOver: boolean | null;
    lastViolation: ViolationKind | null;
  },
  maxRepairs: number
): ValidationRow[] => [
  {
    label: "Repairs used",
    value: record.repairs === null
      ? "—"
      : `${record.repairs} of ${maxRepairs}`
  },
  {
    label: "Rolled over",
    value: record.rolledOver === null ? "—" : record.rolledOver ? "Yes" : "No"
  },
  {
    label: "Last violation",
    // A Gameweek that broke no rule of the game says so. `None` and not a dash,
    // because the dash above means the record holds nothing and this means the
    // record holds a clean Gameweek.
    value: record.lastViolation === null
      ? "None"
      : VIOLATION_LABELS[record.lastViolation]
  }
];

/**
 * What the Transfers below the Squad are Transfers into, and what they are
 * measured against.
 *
 * The Gameweek behind is named whenever it is not the one immediately before: a
 * Gameweek an Entrant Gapped stores no Manager State (ADR-0011), so its Squad is
 * diffed against the last one that stood, and "Transfers into GW5" over changes
 * made since GW3 reads a hole as a quiet week.
 *
 * An Entrant at the Gameweek it opened in has nothing behind it and made no
 * Transfers: fifteen players arriving is a Squad being bought.
 */
export const transfersHeading = (
  gw: number | null,
  sinceGw: number | null
): string => {
  if (gw === null) return "Transfers";
  if (sinceGw === null) return `Opening Squad, Gameweek ${gw}`;
  return sinceGw === gw - 1
    ? `Transfers into GW${gw}`
    : `Transfers into GW${gw}, against GW${sinceGw}`;
};

/**
 * What the Gameweek's Transfers cost, stated once for the Gameweek and not once
 * per Transfer.
 *
 * The design puts `Free transfer` or `−4 Hit` on each row. The record cannot:
 * a Manager State stores the Squad an action arrived at and the points the
 * Gameweek's paid Transfers cost, and never which of them was the paid one. So
 * the cost is reported where it is known — over the whole list — rather than
 * guessed onto a row.
 */
export const transferCost = (
  moves: number,
  hitPoints: number | null
): string =>
  // A Gameweek nobody changed anything in has no cost to report, and "No Hit
  // taken" under an empty list would be answering a question the Gameweek did
  // not raise.
  moves === 0
    ? "No Transfers"
    : hitPoints === null || hitPoints === 0
      ? "No Hit taken"
      : `−${hitPoints} Hit`;

/** One cell of the design's six-cell stat strip. */
export interface StatCell {
  label: string;
  value: string;
  /** The accent the design gives the Gameweek and an active Chip, or none. */
  tone: "accent" | "off" | null;
}

/**
 * The six figures over a Team Sheet, labelled.
 *
 * Here and not in the page for the reason `validationRows` is: five of the six
 * labels are fixed words and the sixth names a Gameweek, the Chip cell says
 * `None` in words rather than showing an empty box, and two of the figures
 * carry a currency the other four must not. Every one of those renders
 * perfectly while being wrong.
 */
export const statStrip = (
  entrant: {
    gwPoints: number | null;
    totalPoints: number | null;
    squadValueTenths: number | null;
    bankTenths: number | null;
    freeTransfers: number | null;
    chipActive: Chip | null;
  },
  gw: number | null
): StatCell[] => [
  { label: `${gwTag(gw)} points`, value: figure(entrant.gwPoints), tone: "accent" },
  { label: "Season total", value: figure(entrant.totalPoints), tone: null },
  { label: "Squad value", value: pounds(entrant.squadValueTenths), tone: null },
  { label: "In the bank", value: pounds(entrant.bankTenths), tone: null },
  { label: "Free transfers", value: figure(entrant.freeTransfers), tone: null },
  {
    label: "Chip",
    value: chipLabel(entrant.chipActive),
    // Dimmed rather than blank when none is active: the cell is answering, and
    // the answer is None.
    tone: entrant.chipActive === null ? "off" : "accent"
  }
];

/**
 * The header's status line. A Season with nothing settled says so rather than
 * showing a Gameweek nought.
 */
export const statusLine = (
  season: string,
  throughGw: number | null,
  entrants: number
): string => [
  `Season ${seasonLabel(season)}`,
  throughGw === null ? "no Gameweek settled" : `GW${throughGw} settled`,
  `${entrants} ${entrants === 1 ? "entrant" : "entrants"}`
].join(" · ");

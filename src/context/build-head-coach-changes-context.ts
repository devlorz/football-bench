import { headCoachSource } from "../head-coach/head-coach-source.js";

/**
 * One stored `head_coach_changes` row, in the shape the query returns it.
 *
 * `dated_on` arrives as its own text rather than as a Date. The column is a
 * `date`, which the driver hands back as local midnight, and this is the one
 * reader that both compares it and prints it -- so a deployment an hour east
 * of UTC would render an appointment a day early and bound it a day wrong.
 * The database already holds the only calendar that matters here.
 */
export interface HeadCoachChangeRow {
  club: string;
  direction: "in" | "out";
  head_coach: string;
  /** Null for an Arrival, which states no manner. */
  manner: string | null;
  /** `YYYY-MM-DD`. */
  dated_on: string;
}

export interface BuildHeadCoachChangesContextOptions {
  competition: string;
  season: string;
  deadline: Date;
  homeTeam: string;
  awayTeam: string;
  changes: HeadCoachChangeRow[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** `2026-05-24` as `24 May 2026`, from the text and never through a Date. */
function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** By code point: the same answer on every runtime, for all time. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Everything the Season's table states up to and including the deadline's own
 * day, and nothing after it.
 *
 * The bound is on the event's date rather than on when it was observed, and
 * both are needed: the store's trigger already proves every row was fetched
 * before the Lock, and this proves none of them is about a day the Entrant
 * could not have seen. They are different facts, because this table publishes
 * the future -- a Head Coach announced in April to arrive on 1 July is on the
 * page for three months before the seat is his, and rendering him at a June
 * deadline would hand an Entrant a club it does not yet have.
 *
 * Inclusive of the deadline's own day. Everything stored was observed before
 * the Lock, so an event the page had already dated to that day is one the
 * Entrant could genuinely have read; only a later date is a fact from the
 * other side of the Lock.
 */
function boundedByDeadline(
  changes: HeadCoachChangeRow[],
  deadline: Date
): HeadCoachChangeRow[] {
  const lastDay = deadline.toISOString().slice(0, 10);
  return changes.filter(({ dated_on: dated }) => dated <= lastDay);
}

function orderChangesForDisplay(
  changes: HeadCoachChangeRow[]
): HeadCoachChangeRow[] {
  // Total over the row's whole stored identity, and by code point rather than
  // by locale: the rendered context is hashed and kept as the evidence of what
  // an Entrant was handed, so an order that depends on the database's mood is
  // not an order at all.
  return [...changes].sort((left, right) =>
    compare(left.dated_on, right.dated_on)
    || compare(left.head_coach, right.head_coach));
}

/**
 * `Andoni Iraola (end of contract, 24 May 2026)`, and an Arrival as
 * `Marco Rose (1 Jun 2026)` — no manner, because arriving is not a manner of
 * anything. Lowering the case of the manner is presentation and belongs here,
 * on the same terms as the Squad Change fee: a stored row says what the source
 * said.
 */
function changeText(change: HeadCoachChangeRow): string {
  const dated = formatDate(change.dated_on);
  return change.manner === null
    ? `${change.head_coach} (${dated})`
    : `${change.head_coach} (${change.manner.toLowerCase()}, ${dated})`;
}

/**
 * A club's lines, and nothing at all for a club that kept its Head Coach. The
 * absence of the event is the fact (ADR-0044), so an unchanged club costs no
 * line and a club that has not filled its vacancy yet costs one.
 *
 * Arrivals before Departures, which is the Squad Changes section's order and
 * not this data's natural one -- a seat is vacated before it is filled, and
 * the two lines read backwards from that. The section is asked to render in
 * that section's manner, and a reader moving down a packet meets `In` first
 * everywhere or nowhere.
 */
const DIRECTIONS = [
  { direction: "in", label: "In" },
  { direction: "out", label: "Out" }
] as const;

function clubSection(club: string, changes: HeadCoachChangeRow[]): string[] {
  const clubChanges = changes.filter((change) => change.club === club);
  if (clubChanges.length === 0) {
    return [];
  }
  return [
    "",
    club,
    ...DIRECTIONS.flatMap(({ direction, label }) => {
      const line = orderChangesForDisplay(
        clubChanges.filter((change) => change.direction === direction)
      ).map(changeText);
      return line.length === 0 ? [] : [`${label}: ${line.join(", ")}`];
    })
  ];
}

/**
 * The Season's Head Coach changes for both clubs, or undefined for a
 * Competition and Season whose article is not listed -- then the section is
 * absent rather than empty, exactly as a Gameweek outside the transfer
 * window's gate states no squad movement at all (ADR-0031).
 */
export function buildHeadCoachChangesContext(
  options: BuildHeadCoachChangesContextOptions
): string | undefined {
  if (headCoachSource(options.competition, options.season) === undefined) {
    return undefined;
  }
  // An empty partition renders as the heading with nothing under it, and so
  // does a Season in which nobody has changed Head Coach yet. They are one
  // sentence here on purpose.
  //
  // The Squad Change section says "no Squad Change data stored" over an empty
  // partition, and that line was copied here first. It is wrong on this
  // source: a transfer window's page always lists moves, so an empty Squad
  // Change partition really is a fetch that did not land, while a
  // managerial-changes table with no rows in it is an ordinary August in a
  // league where every club kept its Head Coach. Distinguishing the two would
  // need the store to record that a fetch ran, which it does not, and until
  // it does the honest reading is ADR-0044's: absence of the event is the
  // fact, for a club and for a league alike. Stating a Gap that is not one is
  // the worse error of the two -- it is a sentence about our pipeline in a
  // packet that is supposed to be about football.
  const changes = boundedByDeadline(options.changes, options.deadline);
  return [
    "Head Coach changes this Season:",
    ...clubSection(options.homeTeam, changes),
    ...clubSection(options.awayTeam, changes)
  ].join("\n");
}

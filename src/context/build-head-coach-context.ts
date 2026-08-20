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

/**
 * One stored `head_coaches` row: who is in post at a club for this Gameweek,
 * and the instant the row was observed.
 *
 * `observed_at` is a real instant rather than a date, and is the whole of this
 * store's pre-Lock guarantee -- the source is the article's present tense and
 * states no date at all (ADR-0045).
 */
export interface HeadCoachRow {
  club: string;
  head_coach: string;
  observed_at: Date;
}

export interface BuildHeadCoachContextOptions {
  competition: string;
  season: string;
  deadline: Date;
  homeTeam: string;
  awayTeam: string;
  headCoaches: HeadCoachRow[];
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
 * Every club has a Head Coach, so a club with none to render is a Gap in the
 * record and is announced as one (ADR-0045).
 *
 * The sentence states what this render could reach, not what the record
 * holds, because those are not the same thing: no fetch landed, a fetch
 * landed short, and a row landed but was observed after the deadline all end
 * here, and only the first two are "nothing is stored". Saying the club has
 * no Head Coach would be worse still -- that is a claim about football, of
 * the kind ADR-0045 struck out of this section's other empty state.
 */
const NO_HEAD_COACH =
  "unavailable; no Head Coach is readable for this Gameweek.";

/**
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

/**
 * A club's block: its Head Coach, then the Changes that explain how the seat
 * came to be his. Both clubs always render, because both always have a Head
 * Coach line -- a name or an announced Gap -- so no packet can reach a reader
 * with a heading and nothing under it.
 *
 * A club that kept its Head Coach carries no Change lines at all. The absence
 * of the event is the fact (ADR-0044) and keeping a Head Coach is ordinary,
 * where a missing incumbent above is not.
 */
function clubSection(
  club: string,
  headCoaches: HeadCoachRow[],
  changes: HeadCoachChangeRow[]
): string[] {
  const inPost = headCoaches.find((row) => row.club === club);
  const clubChanges = changes.filter((change) => change.club === club);
  return [
    "",
    club,
    `Head Coach: ${inPost === undefined ? NO_HEAD_COACH : inPost.head_coach}`,
    ...DIRECTIONS.flatMap(({ direction, label }) => {
      const line = orderChangesForDisplay(
        clubChanges.filter((change) => change.direction === direction)
      ).map(changeText);
      return line.length === 0 ? [] : [`${label}: ${line.join(", ")}`];
    })
  ];
}

/**
 * Both clubs' Head Coach with their Season's Changes beneath, or undefined for
 * a Competition and Season whose article is not listed -- then the section is
 * absent rather than empty, exactly as a Gameweek outside the transfer
 * window's gate states no squad movement at all (ADR-0031).
 *
 * One section and not two, because an Entrant is answering one question --
 * who picks this team, and did that recently change -- and splitting it across
 * two headings makes it read two places to assemble one fact (ADR-0045).
 */
export function buildHeadCoachContext(
  options: BuildHeadCoachContextOptions
): string | undefined {
  if (headCoachSource(options.competition, options.season) === undefined) {
    return undefined;
  }
  // The same rule the store already holds, held again at the render. Migration
  // 0033's two triggers cover the writes -- a row may not arrive after its
  // Gameweek's deadline, and a deadline may not be moved back over a row that
  // already arrived -- so this is defence in depth over a path they cover and
  // not a hole they leave. It is here because the deadline is here: this is
  // the reader that bounds the Changes by it, and a section that bounds one
  // of its two stores and trusts the other for the same guarantee is a
  // section that has to be read twice to be believed. A club left without one
  // reads as the Gap it is.
  const headCoaches = options.headCoaches.filter(
    ({ observed_at: observed }) => observed < options.deadline
  );
  const changes = boundedByDeadline(options.changes, options.deadline);
  return [
    "Head Coach and changes this Season:",
    ...clubSection(options.homeTeam, headCoaches, changes),
    ...clubSection(options.awayTeam, headCoaches, changes)
  ].join("\n");
}

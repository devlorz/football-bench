import { squadChangeWindow } from "../squad-changes/transfer-window.js";

/** One stored `squad_changes` row, in the shape the query returns it. */
export interface SquadChangeRow {
  club: string;
  direction: "in" | "out";
  player: string;
  counterpart_club: string;
  fee: string | null;
  loan: boolean;
  /**
   * Null for a source that files its moves under no date at all, which is
   * every Spanish row: the page carries neither a date column nor a fee one
   * (migration 0027). It has never reached an Entrant -- `changeText` does not
   * render it and the heading dates itself from the window -- so it is an
   * ordering key here and nothing else.
   */
  dated_on: Date | null;
}

export interface BuildSquadChangesContextOptions {
  competition: string;
  deadline: Date;
  homeTeam: string;
  awayTeam: string;
  changes: SquadChangeRow[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatHeadingDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} `
    + `${date.getUTCFullYear()}`;
}

/**
 * The fee as a number to order by, or undefined for a fee the page states in
 * words -- `Free`, `Undisclosed` -- and for the null every loan carries. Those
 * sort after every amount rather than as a zero: absence of a number is a
 * statement, never a value (ADR-0018).
 */
function feeAmount(fee: string | null): number | undefined {
  const match = /^£([\d.,]+)(m|k)?$/i.exec(fee ?? "");
  if (match?.[1] === undefined) {
    return undefined;
  }
  const scale = match[2]?.toLowerCase() === "m"
    ? 1e6
    : match[2]?.toLowerCase() === "k" ? 1e3 : 1;
  return Number(match[1].replace(/,/g, "")) * scale;
}

/** By code point: the same answer on every runtime, for all time. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderChangesForDisplay(changes: SquadChangeRow[]): SquadChangeRow[] {
  return [...changes].sort((left, right) => {
    const leftFee = feeAmount(left.fee);
    const rightFee = feeAmount(right.fee);
    return (leftFee === undefined ? 1 : 0) - (rightFee === undefined ? 1 : 0)
      || (rightFee ?? 0) - (leftFee ?? 0)
      // Undated after dated, on the same terms as a fee stated in words: the
      // page said nothing, which sorts last rather than as an early date. A
      // partition where every row is undated -- every Spanish one -- falls
      // through to the player, which is deterministic, and it has to be:
      // a context is hashed and stored as evidence, so one Gameweek's facts
      // must render in one order every time.
      || (left.dated_on === null ? 1 : 0) - (right.dated_on === null ? 1 : 0)
      || (left.dated_on?.getTime() ?? 0) - (right.dated_on?.getTime() ?? 0)
      // Total over the row's whole stored identity, and by code point rather
      // than by locale. Two rows that tie this far are two different moves --
      // the same player leaving for two different clubs in one window -- and
      // if the comparator called them equal their order would be the order
      // Postgres happened to return them in. The rendered context is hashed
      // and kept as the evidence of what an Entrant was handed, so an order
      // that depends on the database's mood, or on which ICU the runtime was
      // built against, is not an order at all.
      || compare(left.player, right.player)
      || compare(left.counterpart_club, right.counterpart_club);
  });
}

/**
 * `Tonali (from Newcastle United, £92.5m)`, and a loan as
 * `Odobert (to Hull City) (loan)` — its own marker rather than a word in the
 * fee slot, because a loan has no fee to state and spec 0012 fixes the label.
 *
 * The counterpart is the page's own spelling, deliberately unresolved: most
 * counterparts are EFL or foreign clubs no alias table covers, so shortening
 * the few that are Premier League clubs would make the column inconsistent to
 * buy nothing.
 */
function changeText(change: SquadChangeRow): string {
  const preposition = change.direction === "in" ? "from" : "to";
  if (change.loan) {
    return `${change.player} (${preposition} ${change.counterpart_club}) (loan)`;
  }
  const fee = change.fee?.toLowerCase() ?? "fee not stated";
  return `${change.player} (${preposition} ${change.counterpart_club}, ${fee})`;
}

function directionLine(
  label: string,
  changes: SquadChangeRow[]
): string {
  return changes.length === 0
    ? `${label}: none recorded`
    : `${label}: ${orderChangesForDisplay(changes).map(changeText).join(", ")}`;
}

function clubSection(club: string, changes: SquadChangeRow[]): string[] {
  const clubChanges = changes.filter((change) => change.club === club);
  return [
    club,
    directionLine(
      "In",
      clubChanges.filter(({ direction }) => direction === "in")
    ),
    directionLine(
      "Out",
      clubChanges.filter(({ direction }) => direction === "out")
    )
  ];
}

/**
 * The transfer window's movement for both clubs, or undefined for a Gameweek
 * outside the render gate -- a mid-season Gameweek states no squad movement at
 * all rather than a stale list (ADR-0031).
 *
 * Membership carries no recency test of its own: whatever the window's page
 * stated is what the stored partition holds, so a June Signing renders at the
 * gate's last Gameweek exactly as at its first.
 */
export function buildSquadChangesContext(
  options: BuildSquadChangesContextOptions
): string | undefined {
  const window = squadChangeWindow(options.competition, options.deadline);
  if (window === undefined) {
    return undefined;
  }
  const heading = `Squad changes since ${formatHeadingDate(window.since)}:`;
  // An empty partition is a fetch that did not land, not twenty quiet clubs:
  // a stated absence, and never a blocked Prediction (spec 0012).
  if (options.changes.length === 0) {
    return [
      heading,
      "",
      "Squad change data status: no Squad Change data stored for this Gameweek."
    ].join("\n");
  }
  return [
    heading,
    "",
    ...clubSection(options.homeTeam, options.changes),
    "",
    ...clubSection(options.awayTeam, options.changes)
  ].join("\n");
}

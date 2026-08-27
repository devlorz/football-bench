import type { WikipediaClub } from "../squad-changes/club-identity.js";
import {
  cellText,
  clubLink,
  parseDate,
  withoutCitations
} from "../wikipedia/wikitext.js";

/**
 * One club's side of one Head Coach change (ADR-0044): a Departure carries who
 * left, the manner the page states and the date the seat fell vacant; an
 * Arrival carries who came and the date they were appointed. Two rows rather
 * than one, on the same argument `squad_changes` files a move under both
 * clubs: the two halves are dated independently, and a club can be between
 * coaches at a deadline that falls between them.
 */
export interface HeadCoachChange {
  club: string;
  direction: "in" | "out";
  headCoach: string;
  /** As the page states it. Null for an Arrival, which states none. */
  manner: string | null;
  /** `YYYY-MM-DD`. Every row of both tables carries both of its dates. */
  datedOn: string;
}

export interface HeadCoachSourceIssue {
  field: string;
  detail: string;
}

/**
 * Named for this pipeline rather than shared with the Squad Change one it is
 * shaped after: an error that says Squad Change while reporting a season
 * article is the kind of message an operator reads at the wrong hour.
 */
export class HeadCoachSourceValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: HeadCoachSourceIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "HeadCoachSourceValidationError";
  }
}

/** The clubs a Season's context can ask about, by Season spelling. */
export type PinnedClubs = Map<string, WikipediaClub>;

/**
 * The season article's own section name and column labels, quoted here to
 * detect their movement and for no other purpose -- everything this pipeline
 * names is a Head Coach. Pinning the labels is what makes a reordered or
 * re-scoped table a refusal rather than a page of confidently transposed
 * names, which a column count alone would let through.
 */
const SECTION_HEADING = "Managerial changes";

const SOURCE_COLUMNS = [
  "Team",
  "Outgoing manager",
  "Manner of departure",
  "Date of vacancy",
  "Position in the table",
  "Incoming manager",
  "Date of appointment"
];

const CLUB = 0;
const OUTGOING = 1;
const MANNER = 2;
const VACANCY = 3;
const INCOMING = 5;
const APPOINTMENT = 6;

/**
 * Where an article's own column list moves the two dated fields -- vacancy
 * and appointment -- off the common 0/3/6 layout, plus `incoming`, the name
 * column beside them: the Bundesliga's Managerial changes table splits both
 * dates into an announced date and the actual one, which the common layout
 * has no room for, and that split also pushes `Incoming` off its common
 * position. Named rather than numbered so each position is resolved against
 * the same `columns` list the header is validated against: one registry
 * entry, not two that can drift apart from each other.
 *
 * `vacancy` and `appointment` name the *actual* date -- when the seat truly
 * fell vacant or was truly filled -- and not the day the move was announced,
 * on the same reading `Date of vacancy` and `Date of appointment` already
 * have on every other article.
 */
export interface HeadCoachChangeFields {
  vacancy?: string;
  incoming?: string;
  appointment?: string;
}

function fieldIndex(
  source: string,
  columns: readonly string[],
  name: string | undefined,
  fallback: number
): number {
  if (name === undefined) {
    return fallback;
  }
  const index = columns.indexOf(name);
  if (index < 0) {
    throw new HeadCoachSourceValidationError(source, [{
      field: SECTION_HEADING,
      detail: `no column named ${name} among ${columns.join(", ")}`
    }]);
  }
  return index;
}

/**
 * The table's header cells, one label per data column, whichever of the two
 * shapes the article writes: one row, on four of the five articles, or a
 * group row of `colspan` headings over a second row of their own sub-labels,
 * on the Bundesliga's alone -- it splits both of its dated columns this way.
 * A grouped column's label is `<group>/<sub-label>` rather than the
 * sub-label alone, so the group word is part of what is pinned too and not a
 * header cell that sits outside the check -- and so that the Bundesliga's two
 * `Announced on` sub-labels, one under each group, come out as the two
 * distinct strings `Exit date/Announced on` and `Incoming date/Announced on`
 * rather than one label a `columns.indexOf` could resolve to the wrong one of.
 *
 * Single-row articles take this branch too, trivially: with no second row to
 * draw from, every cell's span is 1 and each contributes its own label,
 * which is `headerRows.flat()` restated for the one shape it used to assume.
 *
 * A third header row, or a group whose row-two sub-labels run out before its
 * `colspan` does, is a shape change and stops the parse here rather than
 * being quietly ignored or reaching a `cellText(undefined)` `TypeError` --
 * the second is exactly the case this pipeline's own validation error exists
 * to name instead of.
 */
function leafColumnLabels(
  source: string,
  headerRows: readonly string[][]
): string[] {
  const [row1, row2, ...extra] = headerRows;
  if (extra.length > 0) {
    throw new HeadCoachSourceValidationError(source, [{
      field: SECTION_HEADING,
      detail:
        `expected at most two header rows, found ${headerRows.length}`
    }]);
  }
  const labels: string[] = [];
  let next = 0;
  for (const cell of row1 ?? []) {
    const span = colspanOf(cell);
    if (span <= 1) {
      labels.push(cellText(cell));
      continue;
    }
    const group = cellText(cell);
    for (let i = 0; i < span; i += 1) {
      const subCell = (row2 ?? [])[next];
      if (subCell === undefined) {
        throw new HeadCoachSourceValidationError(source, [{
          field: SECTION_HEADING,
          detail:
            `the "${group}" group header names ${span} columns but its `
            + `second row names fewer`
        }]);
      }
      labels.push(`${group}/${cellText(subCell)}`);
      next += 1;
    }
  }
  return labels;
}

/**
 * A section's table, from its opening `{|` to its closing `|}`, with the
 * citations taken out first. The heading is the article's own word for the
 * section, quoted by the caller and never translated.
 *
 * The citations come out before anything is split, for the reason
 * `withoutCitations` carries: they are not merely noise to a reader that takes
 * one cell per line.
 *
 * A heading is matched at any depth and with or without the spaces around it,
 * because the two articles write it differently today and neither is more
 * correct. More than one heading is the same reason carried further: the two
 * articles keep their personnel table under different words. They are tried in
 * order and each one is the article's own, never a pattern of ours, so
 * whichever refusal an operator is paged with names a heading they can find on
 * the page.
 */
export interface SectionTable {
  /** The article's own heading, as it was found. */
  heading: string;
  /** The table under it, `{|` to `|}`. */
  wikitable: string;
}

export function sectionTable(
  source: string,
  headings: string[],
  wikitext: string
): SectionTable {
  const page = withoutCitations(wikitext);
  for (const heading of headings) {
    const found = new RegExp(
      `^={2,4}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
      + "\\s*={2,4}\\s*$",
      "m"
    ).exec(page);
    const headingAt = found?.index ?? -1;
    const opensAt = headingAt < 0
      ? -1
      : page.indexOf("{|", headingAt);
    const closesAt = opensAt < 0
      ? -1
      : page.indexOf("\n|}", opensAt);
    if (closesAt >= 0) {
      return { heading, wikitable: page.slice(opensAt, closesAt) };
    }
  }
  throw new HeadCoachSourceValidationError(source, [{
    field: headings.join(" or "),
    detail: "expected a wikitable under this heading"
  }]);
}

export interface TableLines {
  /**
   * The header's own rows, kept apart rather than flattened, because a header
   * can span two of them: Ligue 1's Personnel table heads five columns
   * `rowspan="2"` and puts a `colspan="2"` group over two more named on a
   * second line. Flattened, that table counts eight header cells for seven
   * columns and every body row reads one short. The first row is the one that
   * describes the table's shape; anything below it names a subdivision.
   */
  headerRows: string[][];
  rows: string[][];
}

/**
 * The table's header cells and its rows' cells, each still unread. A line
 * opening `!` is a header cell and a line opening `|` is a data cell; a line
 * opening with neither continues the cell above it, which is how a name
 * wrapped over two lines stays one name.
 */
export function tableLines(wikitable: string): TableLines {
  const headerRows: string[][] = [];
  const rows: string[][] = [];
  let headerRow: string[] | undefined;
  let current: string[] | undefined;
  // A `|-` closes whatever row is open. Header cells after one belong to a new
  // header row, not to the row above them.
  let broken = false;
  for (const line of wikitable.split("\n")) {
    if (line.startsWith("|-")) {
      broken = true;
      current = [];
      rows.push(current);
    } else if (line.startsWith("!")) {
      if (headerRow === undefined || broken) {
        headerRow = [];
        headerRows.push(headerRow);
        broken = false;
      }
      headerRow.push(line.slice(1));
    } else if (line.startsWith("|") && !line.startsWith("|+")) {
      // The table's own opening line is `{|`, which never reaches here.
      if (current === undefined && headerRow === undefined) {
        headerRow = [];
        headerRows.push(headerRow);
      }
      (current ?? headerRow as string[]).push(line.slice(1));
    } else if (current !== undefined && current.length > 0) {
      current[current.length - 1] += `\n${line}`;
    }
  }
  return { headerRows, rows: rows.filter((row) => row.length > 0) };
}

/**
 * How many columns a cell claims, from its own attributes and nothing else —
 * the companion to `rowspanOf`, and what makes a header's width the number of
 * columns rather than the number of cells written for it.
 */
export function colspanOf(cell: string): number {
  const attributes = /^[^|[{]*\bcolspan\s*=\s*"?(\d+)"?/i.exec(cell);
  return Number(attributes?.[1] ?? 1);
}

/**
 * How many rows a cell claims, from its own attributes and nothing else. Read
 * rather than inferred, unlike the transfer lists' single leading date column:
 * this table spans three different columns at once and a short row cannot be
 * aligned without knowing which cells above it are still standing.
 */
function rowspanOf(cell: string): number {
  const attributes = /^[^|[{]*\browspan\s*=\s*"?(\d+)"?/i.exec(cell);
  return Number(attributes?.[1] ?? 1);
}

/**
 * Every row as its full width, with each `rowspan` cell repeated down the rows
 * it covers.
 *
 * A row that does not come out to exactly the header's width, or that has
 * cells left over once it does, is a shape change and stops the parse. There
 * is no skipping a row here: this table is short and every row of it is a
 * club's Season, so one row quietly dropped is a club that reads as having
 * kept its Head Coach.
 *
 * The header's own spans are deliberately not carried into the first row. One
 * of the two articles writes `!rowspan=2|Date of vacancy` in a header that has
 * only one row, and carrying it would refuse a page that renders correctly.
 *
 * The width comes from the caller's `columns` — the same list the labels above
 * were validated against — and not from `SOURCE_COLUMNS`. Reading the constant
 * here made the table's width and the table's labels two facts that could
 * disagree, and they only agreed because Ligue 1's list happens to be the same
 * length as the default. A league whose article carries one column more would
 * have had every row refused for a width nobody had stated.
 *
 * A cell's own `colspan` is expanded the same way its `rowspan` is carried
 * down: the Bundesliga writes one merged date cell, `colspan=2`, wherever a
 * club's announced date and actual date are the same day, rather than
 * repeating the text. Both attributes read from the one cell that carries
 * them, because a `rowspan` cell here never also spans columns.
 */
function filledRows(
  source: string,
  rows: string[][],
  columns: readonly string[]
): string[][] {
  const issues: HeadCoachSourceIssue[] = [];
  const carried = new Map<number, { cell: string; remaining: number }>();
  const filled: string[][] = [];
  for (const [index, cells] of rows.entries()) {
    const row: string[] = [];
    let next = 0;
    let column = 0;
    while (column < columns.length) {
      const carry = carried.get(column);
      if (carry !== undefined) {
        row.push(carry.cell);
        carry.remaining -= 1;
        if (carry.remaining === 0) {
          carried.delete(column);
        }
        column += 1;
        continue;
      }
      const cell = cells[next];
      if (cell === undefined) {
        break;
      }
      next += 1;
      const span = colspanOf(cell);
      const rowspan = rowspanOf(cell);
      for (let filledColumn = column; filledColumn < column + span;
        filledColumn += 1) {
        row.push(cell);
        if (rowspan > 1) {
          carried.set(filledColumn, { cell, remaining: rowspan - 1 });
        }
      }
      column += span;
    }
    if (row.length !== columns.length || next !== cells.length) {
      issues.push({
        field: `${SECTION_HEADING}.${index}`,
        detail:
          `a row reads as ${row.length} of ${columns.length} columns `
          + `from ${cells.length} cells`
      });
      continue;
    }
    filled.push(row);
  }
  if (issues.length > 0) {
    throw new HeadCoachSourceValidationError(source, issues);
  }
  return filled;
}

/**
 * Which of the Competition's clubs a Team cell is, by either identity the pin
 * holds.
 *
 * Both, rather than the article alone the transfer lists are read by, because
 * these are different pages with different link habits: the Spanish transfer
 * list links Real Madrid as `[[Real Madrid]]` and the Spanish season article
 * links the same club as `[[Real Madrid CF|Real Madrid]]`, and both are that
 * club. The check the transfer lists get from insisting on the article is not
 * lost -- it is stronger here, because this column holds nothing but the
 * Competition's own clubs, so a cell resolving to neither identity is drift
 * and is refused by name.
 */
export function resolveClub(
  cell: string,
  pinned: PinnedClubs
): string | undefined {
  const link = clubLink(cell);
  // Every article before any displayed name, and not the first of either to
  // match. A cell displaying one club while linking another is the ambiguous
  // case, and the link is what decides it -- a row reading `Real Madrid` over
  // a link to Rayo Vallecano is about Rayo Vallecano. Taken in one pass, that
  // row would resolve to whichever of the two the roster happened to list
  // first, which is not a rule at all.
  for (const [club, { article }] of pinned) {
    if (article === link.article) {
      return club;
    }
  }
  for (const [club, { name }] of pinned) {
    if (name === link.text) {
      return club;
    }
  }
  return undefined;
}

function dateOf(
  cell: string,
  field: string,
  issues: HeadCoachSourceIssue[]
): string | undefined {
  const stated = cellText(cell);
  const date = parseDate(stated);
  if (date === undefined) {
    issues.push({
      field,
      detail: `expected a date like 6 February 2026, received ${stated}`
    });
  }
  return date;
}

/**
 * The Season's Head Coach changes for the Competition's clubs, from the season
 * article's raw wikitext.
 *
 * A row whose Incoming column is empty is a club still looking, and it yields
 * its Departure alone rather than an issue: the vacancy is the fact the packet
 * is for, and a seat nobody has taken yet is a state this table publishes on
 * purpose.
 */
export function parseHeadCoachChanges(
  source: string,
  wikitext: string,
  pinned: PinnedClubs,
  columns: readonly string[] = SOURCE_COLUMNS,
  fields?: HeadCoachChangeFields
): HeadCoachChange[] {
  const issues: HeadCoachSourceIssue[] = [];
  const changes: HeadCoachChange[] = [];
  const { headerRows, rows } = tableLines(
    sectionTable(source, [SECTION_HEADING], wikitext).wikitable
  );

  // A group cell over two sub-labels on the Bundesliga's article, the one of
  // the five that carries one, and plain flattening restated for the other
  // four: either way, one label per data column, so a reordered or
  // re-scoped table is still a refusal rather than a page of confidently
  // transposed names.
  const labels = leafColumnLabels(source, headerRows);
  if (labels.join("|") !== columns.join("|")) {
    throw new HeadCoachSourceValidationError(source, [{
      field: SECTION_HEADING,
      detail:
        `expected the columns ${columns.join(", ")}, `
        + `received ${labels.join(", ")}`
    }]);
  }

  const vacancyAt = fieldIndex(source, columns, fields?.vacancy, VACANCY);
  const incomingAt = fieldIndex(source, columns, fields?.incoming, INCOMING);
  const appointmentAt =
    fieldIndex(source, columns, fields?.appointment, APPOINTMENT);

  for (const [index, row] of filledRows(source, rows, columns).entries()) {
    const club = resolveClub(row[CLUB] as string, pinned);
    if (club === undefined) {
      issues.push({
        field: `${SECTION_HEADING}.${index}.club`,
        detail: `unknown club spelling ${cellText(row[CLUB] as string)}`
      });
      continue;
    }
    const vacancy = dateOf(
      row[vacancyAt] as string, `${SECTION_HEADING}.${index}.vacancy`, issues
    );
    const outgoing = cellText(row[OUTGOING] as string);
    const manner = cellText(row[MANNER] as string);
    if (outgoing === "" || manner === "") {
      issues.push({
        field: `${SECTION_HEADING}.${index}.out`,
        detail: "a row states no departing Head Coach or no manner"
      });
    } else if (vacancy !== undefined) {
      changes.push({
        club, direction: "out", headCoach: outgoing, manner, datedOn: vacancy
      });
    }

    const incoming = cellText(row[incomingAt] as string);
    if (incoming === "") {
      continue;
    }
    const appointment = dateOf(
      row[appointmentAt] as string,
      `${SECTION_HEADING}.${index}.appointment`,
      issues
    );
    if (appointment !== undefined) {
      changes.push({
        club, direction: "in", headCoach: incoming, manner: null,
        datedOn: appointment
      });
    }
  }

  if (issues.length > 0) {
    throw new HeadCoachSourceValidationError(source, issues);
  }
  return changes;
}

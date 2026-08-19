import type { WikipediaClub } from "../squad-changes/club-identity.js";
import { cellText, clubLink, parseDate } from "../wikipedia/wikitext.js";

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
 * The Head Coach changes table, from its opening `{|` to its closing `|}`,
 * with the citations taken out first. The heading it sits under is the
 * article's own word for it, quoted in `SECTION_HEADING` above.
 *
 * The citations come out before anything is split because they are not merely
 * noise here: a `{{cite}}` runs to several lines on both pages and its
 * continuation lines begin with `|url=`, which is indistinguishable from a new
 * cell to anything reading this table line by line. A row carrying a
 * multi-line citation would arrive one cell too wide and every column after it
 * would be somebody else's.
 *
 * The heading is matched at any depth and with or without the spaces around
 * it, because the two articles write it differently today and neither is more
 * correct.
 */
function headCoachChangesTable(source: string, wikitext: string): string {
  const withoutCitations = wikitext
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const heading = new RegExp(
    `^={2,4}\\s*${SECTION_HEADING}\\s*={2,4}\\s*$`, "m"
  ).exec(withoutCitations);
  const headingAt = heading?.index ?? -1;
  const opensAt = headingAt < 0
    ? -1
    : withoutCitations.indexOf("{|", headingAt);
  const closesAt = opensAt < 0 ? -1 : withoutCitations.indexOf("\n|}", opensAt);
  if (closesAt < 0) {
    throw new HeadCoachSourceValidationError(source, [{
      field: SECTION_HEADING,
      detail: "expected a wikitable under this heading"
    }]);
  }
  return withoutCitations.slice(opensAt, closesAt);
}

interface TableLines {
  header: string[];
  rows: string[][];
}

/**
 * The table's header cells and its rows' cells, each still unread. A line
 * opening `!` is a header cell and a line opening `|` is a data cell; a line
 * opening with neither continues the cell above it, which is how a name
 * wrapped over two lines stays one name.
 */
function tableLines(wikitable: string): TableLines {
  const header: string[] = [];
  const rows: string[][] = [];
  let current: string[] | undefined;
  for (const line of wikitable.split("\n")) {
    if (line.startsWith("|-")) {
      current = [];
      rows.push(current);
    } else if (line.startsWith("!")) {
      header.push(line.slice(1));
    } else if (line.startsWith("|") && !line.startsWith("|+")) {
      // The table's own opening line is `{|`, which never reaches here.
      (current ?? header).push(line.slice(1));
    } else if (current !== undefined && current.length > 0) {
      current[current.length - 1] += `\n${line}`;
    }
  }
  return { header, rows: rows.filter((row) => row.length > 0) };
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
 */
function filledRows(source: string, rows: string[][]): string[][] {
  const issues: HeadCoachSourceIssue[] = [];
  const carried = new Map<number, { cell: string; remaining: number }>();
  const filled: string[][] = [];
  for (const [index, cells] of rows.entries()) {
    const row: string[] = [];
    let next = 0;
    for (let column = 0; column < SOURCE_COLUMNS.length; column += 1) {
      const carry = carried.get(column);
      if (carry !== undefined) {
        row.push(carry.cell);
        carry.remaining -= 1;
        if (carry.remaining === 0) {
          carried.delete(column);
        }
        continue;
      }
      const cell = cells[next];
      if (cell === undefined) {
        break;
      }
      next += 1;
      row.push(cell);
      const span = rowspanOf(cell);
      if (span > 1) {
        carried.set(column, { cell, remaining: span - 1 });
      }
    }
    if (row.length !== SOURCE_COLUMNS.length || next !== cells.length) {
      issues.push({
        field: `${SECTION_HEADING}.${index}`,
        detail:
          `a row reads as ${row.length} of ${SOURCE_COLUMNS.length} columns `
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
function resolveClub(
  cell: string,
  pinned: PinnedClubs
): string | undefined {
  const link = clubLink(cell);
  for (const [club, { article, name }] of pinned) {
    if (article === link.article || name === link.text) {
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
  pinned: PinnedClubs
): HeadCoachChange[] {
  const issues: HeadCoachSourceIssue[] = [];
  const changes: HeadCoachChange[] = [];
  const { header, rows } = tableLines(
    headCoachChangesTable(source, wikitext)
  );

  const labels = header.map(cellText);
  if (labels.join("|") !== SOURCE_COLUMNS.join("|")) {
    throw new HeadCoachSourceValidationError(source, [{
      field: SECTION_HEADING,
      detail:
        `expected the columns ${SOURCE_COLUMNS.join(", ")}, `
        + `received ${labels.join(", ")}`
    }]);
  }

  for (const [index, row] of filledRows(source, rows).entries()) {
    const club = resolveClub(row[CLUB] as string, pinned);
    if (club === undefined) {
      issues.push({
        field: `${SECTION_HEADING}.${index}.club`,
        detail: `unknown club spelling ${cellText(row[CLUB] as string)}`
      });
      continue;
    }
    const vacancy = dateOf(
      row[VACANCY] as string, `${SECTION_HEADING}.${index}.vacancy`, issues
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

    const incoming = cellText(row[INCOMING] as string);
    if (incoming === "") {
      continue;
    }
    const appointment = dateOf(
      row[APPOINTMENT] as string,
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

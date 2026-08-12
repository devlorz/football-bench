import type { WikipediaClub } from "./club-identity.js";

/** One club's side of one move (ADR-0031). */
export interface SquadChange {
  club: string;
  direction: "in" | "out";
  player: string;
  /** As the row displays it, deliberately unresolved. */
  counterpartClub: string;
  /**
   * Exactly as the page states it -- an amount, `Free` or `Undisclosed` --
   * and null only where the page states none, which is every loan. Lowering
   * the case of the two words is presentation and belongs to the builder: a
   * stored row says what the source said.
   */
  fee: string | null;
  loan: boolean;
  /** `YYYY-MM-DD`, the date the page files the move under. */
  datedOn: string;
}

export interface SquadChangeSourceIssue {
  field: string;
  detail: string;
}

export class SquadChangeSourceValidationError extends Error {
  constructor(
    public readonly source: string,
    public readonly issues: SquadChangeSourceIssue[]
  ) {
    super(issues
      .map(({ field, detail }) => `${source}.${field}: ${detail}`)
      .join("; "));
    this.name = "SquadChangeSourceValidationError";
  }
}

/** The twenty clubs a Season's context can ask about, by Season spelling. */
export type PinnedClubs = Map<string, WikipediaClub>;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/** "6 February 2026" — the only date form either table uses. */
function parseDate(value: string): string | undefined {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  const month = MONTHS.indexOf((match?.[2] ?? "").toLowerCase());
  if (match?.[1] === undefined || match[3] === undefined || month < 0) {
    return undefined;
  }
  const day = match[1].padStart(2, "0");
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
}

/**
 * A cell with its wrapping stripped but its links intact: the flag and
 * sort-key templates that decorate every name, and the citation each fee row
 * carries, are noise in every column.
 */
function cellSource(cell: string): string {
  return cell
    // A cell may open with HTML attributes -- `rowspan="9" |` -- and the
    // spacing around them is not consistent down the page.
    .replace(/^\s*[a-z]+="[^"]*"\s*\|/i, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    // {{ntsh|92500000}} is the column's hidden sort key, not a fee.
    .replace(/\{\{ntsh\|[^}]*\}\}/gi, "")
    .replace(/\{\{flagg?\|[^}]*\}\}/gi, "")
    // {{sortname|Jan Paul|van Hecke|dab=footballer}} -- named parameters are
    // disambiguation for the link target and are never part of the name.
    .replace(/\{\{sortname\|([^}]*)\}\}/gi, (_, parameters: string) =>
      parameters.split("|").filter((part) => !part.includes("=")).join(" "))
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a reader sees in a cell: link syntax collapsed to its display text. */
function cellText(cell: string): string {
  return cellSource(cell)
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .trim();
}

interface ClubLink {
  /** The linked article's title, or the bare text where a cell has no link. */
  article: string;
  /** What the row displays. */
  text: string;
}

/**
 * A club cell as both of the things it says: which article it points at and
 * what it shows. The article is the identity -- `[[Tottenham Hotspur F.C.|`
 * is Spurs whether the row displays `Tottenham Hotspur`, `Spurs` or
 * `THFC` -- and the display text is what a Squad Change row records as the
 * counterpart.
 */
function clubLink(cell: string): ClubLink {
  const source = cellSource(cell);
  const link = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(source);
  if (link?.[1] === undefined) {
    return { article: source, text: source };
  }
  return {
    article: link[1].trim(),
    text: (link[2] ?? link[1]).trim()
  };
}

/**
 * The wikitable under a heading, from its opening `{|` to its closing `|}`.
 * A heading with no table under it, or a table the page never closes, is a
 * shape change like any other and stops the parse rather than yielding an
 * empty window.
 */
function wikitableUnder(
  source: string,
  wikitext: string,
  heading: string
): string {
  const headingAt = wikitext.indexOf(`== ${heading} ==`);
  const opensAt = headingAt < 0 ? -1 : wikitext.indexOf("{|", headingAt);
  const closesAt = opensAt < 0 ? -1 : wikitext.indexOf("\n|}", opensAt);
  if (closesAt < 0) {
    throw new SquadChangeSourceValidationError(source, [{
      field: heading,
      detail: "expected a wikitable under this heading"
    }]);
  }
  return wikitext.slice(opensAt, closesAt);
}

/** Both tables carry five columns, and the date is always the first. */
const COLUMNS = 5;

/**
 * A wikitable's rows, each as its five cells and none of them yet read. Both
 * tables file consecutive moves under one date cell carrying a `rowspan`, so
 * such a row is short by exactly that leading cell and inherits the one above
 * -- the rowspan count itself is not read, because a community-edited count
 * that disagrees with the rows below it must not cost the whole page. A row of
 * any other width is skipped: it is a heading, a note, or an edit in progress,
 * never a move.
 */
function tableRows(wikitable: string): string[][] {
  const rows: string[][] = [];
  let current: string[] | undefined;
  for (const line of wikitable.split("\n")) {
    if (line.startsWith("|-")) {
      if (current !== undefined) {
        rows.push(current);
      }
      current = [];
    } else if (current === undefined) {
      continue;
    } else if (line.startsWith("|")) {
      current.push(line.slice(1));
    } else if (current.length > 0) {
      current[current.length - 1] += `\n${line}`;
    }
  }
  if (current !== undefined) {
    rows.push(current);
  }

  const filled: string[][] = [];
  let carried: string | undefined;
  for (const row of rows) {
    if (row.length === COLUMNS) {
      carried = row[0] as string;
      filled.push(row);
    } else if (row.length === COLUMNS - 1 && carried !== undefined) {
      filled.push([carried, ...row]);
    }
  }
  return filled;
}

/**
 * The two tables the page publishes, and which column holds what. They differ
 * only in that: the loans table spends its second column on an end date the
 * context does not state, and has no fee column at all.
 */
const TABLES: readonly {
  heading: string;
  loan: boolean;
  player: number;
  movingFrom: number;
  movingTo: number;
  fee: number | undefined;
}[] = [
  {
    heading: "Transfers",
    loan: false,
    player: 1,
    movingFrom: 2,
    movingTo: 3,
    fee: 4
  },
  {
    heading: "Loans",
    loan: true,
    player: 2,
    movingFrom: 3,
    movingTo: 4,
    fee: undefined
  }
];

/**
 * Which of the twenty a club cell is, or undefined for one of the hundreds of
 * clubs on the page that are simply not ours.
 *
 * Identity is the linked article and nothing else. A row that displays one of
 * the twenty while linking elsewhere is the one ambiguous case, and it is an
 * issue rather than a guess: either the article moved or the row now points at
 * a different club, and both are for an operator to read rather than for this
 * to decide.
 */
function resolveClub(
  link: ClubLink,
  byArticle: Map<string, string>,
  byName: Map<string, string>,
  issues: SquadChangeSourceIssue[]
): string | undefined {
  const club = byArticle.get(link.article);
  if (club !== undefined) {
    return club;
  }
  const displayed = byName.get(link.text);
  if (displayed !== undefined) {
    issues.push({
      field: "club",
      detail:
        `a row displays ${link.text} but links to ${link.article}, `
        + "which is not that club's pinned article"
    });
  }
  return undefined;
}

/**
 * One move as the rows the context stores: a Departure for the club it leaves
 * and a Signing for the club it joins, so a move between two Premier League
 * clubs is stored twice and read once by each club's block. A side that is not
 * one of the twenty contributes no row and is kept only as the other side's
 * counterpart, recorded as that row displays it.
 */
function clubRowsForMove(
  from: string | undefined,
  to: string | undefined,
  movingFrom: ClubLink,
  movingTo: ClubLink,
  row: Omit<SquadChange, "club" | "direction" | "counterpartClub">
): SquadChange[] {
  return [
    ...from === undefined ? [] : [{
      ...row, club: from, direction: "out" as const,
      counterpartClub: movingTo.text
    }],
    ...to === undefined ? [] : [{
      ...row, club: to, direction: "in" as const,
      counterpartClub: movingFrom.text
    }]
  ];
}

/**
 * Permanent transfers and loans for the twenty clubs, from the page's raw
 * wikitext. A move touching none of them is skipped rather than stored: the
 * page lists the whole English pyramid.
 *
 * Two checks stand between a re-linked club and a silently thinner partition,
 * and both compare exact article titles rather than judging one spelling to
 * look like another. Every pinned article must be linked somewhere on the
 * page, which catches a club whose article moved; and no row may display one
 * of the twenty while linking away from it, which catches the single row the
 * first check cannot see because the other rows still hold the club up. Both
 * are the loud failure ADR-0031 asks for over silent thinning: a whole window
 * in which one club moved nobody at all fails here too, and reaches an Entrant
 * as the section's stated absence rather than as a club that stood still.
 */
export function parseSquadChanges(
  source: string,
  wikitext: string,
  pinned: PinnedClubs
): SquadChange[] {
  const issues: SquadChangeSourceIssue[] = [];
  const changes: SquadChange[] = [];
  const byArticle = new Map(
    [...pinned].map(([club, { article }]) => [article, club])
  );
  const byName = new Map([...pinned].map(([club, { name }]) => [name, club]));
  const linked = new Set<string>();

  for (const spec of TABLES) {
    const rows = tableRows(wikitableUnder(source, wikitext, spec.heading));
    for (const [index, cells] of rows.entries()) {
      const movingFrom = clubLink(cells[spec.movingFrom] as string);
      const movingTo = clubLink(cells[spec.movingTo] as string);
      linked.add(movingFrom.article).add(movingTo.article);
      const from = resolveClub(movingFrom, byArticle, byName, issues);
      const to = resolveClub(movingTo, byArticle, byName, issues);

      const date = cellText(cells[0] as string);
      const datedOn = parseDate(date);
      if (datedOn === undefined) {
        issues.push({
          field: `${spec.heading}.${index}.date`,
          detail: `expected a date like 6 February 2026, received ${date}`
        });
        continue;
      }
      if (from === undefined && to === undefined) {
        continue;
      }
      changes.push(...clubRowsForMove(from, to, movingFrom, movingTo, {
        player: cellText(cells[spec.player] as string),
        fee: spec.fee === undefined
          ? null
          : cellText(cells[spec.fee] as string),
        loan: spec.loan,
        datedOn
      }));
    }
  }

  for (const [club, { article }] of pinned) {
    if (!linked.has(article)) {
      issues.push({
        field: "club",
        detail: `no move on the page links ${club}'s article ${article}`
      });
    }
  }

  if (issues.length > 0) {
    throw new SquadChangeSourceValidationError(source, issues);
  }
  return changes;
}

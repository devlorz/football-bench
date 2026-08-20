import type { WikipediaClub } from "./club-identity.js";
import type { TransferListFormat } from "./transfer-window.js";
import {
  cellSource,
  cellText,
  clubLink,
  parseDate,
  withoutCitations,
  type ClubLink
} from "../wikipedia/wikitext.js";

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
  /**
   * `YYYY-MM-DD`, the date the page files the move under, and null for a page
   * that files its moves under no date at all -- which is every Spanish row.
   * It has never reached an Entrant; migration 0027 has the reasoning for
   * storing the absence rather than a stand-in.
   */
  datedOn: string | null;
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

/**
 * The pinned clubs read the two ways a page can name one. Both parsers need
 * both and neither is useful alone, so they are built once and travel
 * together: the article is the identity wherever a page links, and the
 * displayed name is what is left where it does not.
 */
interface ClubIndex {
  byArticle: Map<string, string>;
  byName: Map<string, string>;
}

function clubIndex(pinned: PinnedClubs): ClubIndex {
  return {
    byArticle: new Map(
      [...pinned].map(([club, { article }]) => [article, club])
    ),
    byName: new Map([...pinned].map(([club, { name }]) => [name, club]))
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
  { byArticle, byName }: ClubIndex,
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
function parseTables(
  source: string,
  wikitext: string,
  pinned: PinnedClubs
): SquadChange[] {
  const issues: SquadChangeSourceIssue[] = [];
  const changes: SquadChange[] = [];
  const clubs = clubIndex(pinned);
  const linked = new Set<string>();
  // Before the table is cut out and long before it is split into cells: a
  // citation wrapped mid-parameter carries a line opening `|url=` that
  // `tableRows` would otherwise count as a cell of its own.
  const page = withoutCitations(wikitext);

  for (const spec of TABLES) {
    const rows = tableRows(wikitableUnder(source, page, spec.heading));
    for (const [index, cells] of rows.entries()) {
      const movingFrom = clubLink(cells[spec.movingFrom] as string);
      const movingTo = clubLink(cells[spec.movingTo] as string);
      linked.add(movingFrom.article).add(movingTo.article);
      const from = resolveClub(movingFrom, clubs, issues);
      const to = resolveClub(movingTo, clubs, issues);

      const date = cellText(cells[0] as string);
      const datedOn = parseDate(date);
      // A row this cannot date refuses the whole page, on the same terms the
      // Head Coach table does and deliberately not softened because this table
      // is long enough that one skipped row would not be missed. That length
      // is the argument for refusing, not against it: nobody reads 320 rows to
      // notice four are gone. The one time this fired -- a citation wrapped
      // mid-parameter on 2026-08-19, which `withoutCitations` now takes out
      // before the split -- every one of the four rows was correct on the page
      // and the parser was wrong about them, so skipping would have dropped
      // four real moves, one of them a Chelsea Signing, under a fetch that
      // reported success. The refusal cost a day of staleness and named the
      // bug; skipping would have cost the Signing and named nothing.
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

/**
 * Where a character sits in wikitext at the top level -- outside every `[[`
 * link and every `{{` template -- or -1. Both of this file's two ways of
 * cutting a string need exactly this: a template's parameters are its
 * top-level pipes, and a move's current clause ends at its top-level comma.
 * Neither can use `indexOf`, because `[[Fran García (footballer, born
 * 1999)|Fran García]]` carries one of each inside a link.
 */
function topLevelIndexOf(wikitext: string, character: string): number {
  let depth = 0;
  for (let index = 0; index < wikitext.length; index += 1) {
    const pair = wikitext.slice(index, index + 2);
    if (pair === "[[" || pair === "{{") {
      depth += 1;
      index += 1;
    } else if (pair === "]]" || pair === "}}") {
      depth -= 1;
      index += 1;
    } else if (wikitext[index] === character && depth === 0) {
      return index;
    }
  }
  return -1;
}

/**
 * A template's parameters, split on the pipes that are the template's own.
 * `{{fs player|name=[[Fran García (footballer, born 1999)|Fran García]]}}`
 * carries a pipe inside a link and another inside the nested template a flag
 * expands to, and neither separates a parameter.
 */
function templateParameters(body: string): string[] {
  const parameters: string[] = [];
  let rest = body;
  for (;;) {
    const at = topLevelIndexOf(rest, "|");
    if (at < 0) {
      parameters.push(rest);
      return parameters;
    }
    parameters.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
}

/**
 * The named parameter's value, or undefined. A parameter stated twice is the
 * first one, which is what MediaWiki itself would not do -- it takes the last
 * -- and the difference cannot arise on a page that renders, so it is not
 * worth a check.
 */
function parameter(body: string, name: string): string | undefined {
  for (const part of templateParameters(body)) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim().toLowerCase() === name) {
      return part.slice(at + 1);
    }
  }
  return undefined;
}

/**
 * Every `{{fs player}}` in one block, each as its own parameter list. Scanned
 * by brace depth rather than by regex because the citation that follows a
 * player sits outside the template and the flag inside one is a template of
 * its own.
 */
function squadListPlayers(block: string): string[] {
  const players: string[] = [];
  const opening = /\{\{fs player/gi;
  let found: RegExpExecArray | null;
  while ((found = opening.exec(block)) !== null) {
    let depth = 0;
    for (let index = found.index; index < block.length; index += 1) {
      const pair = block.slice(index, index + 2);
      if (pair === "{{") {
        depth += 1;
        index += 1;
      } else if (pair === "}}") {
        depth -= 1;
        index += 1;
        if (depth === 0) {
          players.push(block.slice(found.index + "{{".length, index - 1));
          opening.lastIndex = index;
          break;
        }
      }
    }
  }
  return players;
}

/**
 * The two squad lists under one club heading, in the order the page lays them
 * out. Both editions of the Spanish page put arrivals first and departures
 * second, and neither states the direction anywhere a parser can read it: the
 * `'''In:'''` and `'''Out:'''` labels are column headers that sit in a
 * different `{{col-2}}` from their own list in the 2026 summer edition. The
 * layout is the assertion, so a section that does not hold exactly two lists
 * is a shape change and stops the parse.
 */
const CLUB_SECTION_DIRECTIONS = ["in", "out"] as const;

function squadLists(section: string): string[] {
  return [...section.matchAll(/\{\{fs start[^}]*\}\}([\s\S]*?)\{\{fs end\}\}/gi)]
    .map((match) => match[1] as string);
}

/**
 * Which of the Competition's clubs a section heading is, or undefined for one
 * of the Segunda sections and the page furniture around them.
 *
 * The heading is linked in the 2026 summer edition -- `=== [[FC Barcelona|
 * Barcelona]] ===` -- and bare text in every winter edition before it --
 * `===Barcelona===`. Identity is the article where there is one, exactly as on
 * the English page, and the displayed name where there is not, which is the
 * only thing a bare heading offers.
 */
function resolveSectionClub(
  heading: string,
  { byArticle, byName }: ClubIndex
): string | undefined {
  const link = clubLink(heading);
  return heading.includes("[[")
    ? byArticle.get(link.article)
    : byName.get(link.text);
}

/**
 * The move the row is actually recording, which is the first clause of the
 * `other=` sentence and never the whole of it.
 *
 * That cell is prose, and its later clauses are a career summary: `from
 * [[ACF Fiorentina|Fiorentina]], previously on loan at [[UD Las Palmas|Las
 * Palmas]]` is a permanent signing, and `loan return to [[Fortaleza EC|
 * Fortaleza]], later loaned to [[SC Internacional|Internacional]]` is a loan
 * ending with a club this Competition never had. Reading the whole sentence
 * calls thirty of the real page's rows loans that are not -- twenty-one on the
 * 2026 summer edition and nine on the winter edition before it, all of the
 * shape "previously on loan at". Both the loan marker and the counterpart come
 * from this clause and nowhere else.
 *
 * The comma is found by depth so that a link carrying one of its own -- `[[Fran
 * García (footballer, born 1999)|Fran García]]` -- does not end the clause.
 */
function currentMove(other: string): string {
  const source = cellSource(other);
  const at = topLevelIndexOf(source, ",");
  return at < 0 ? source : source.slice(0, at);
}

/**
 * A counterpart as the row displays it: the club the current clause links to,
 * and where it links to nothing the clause itself with its direction word
 * taken off -- `to TBD`, `retired`, `free agent`.
 *
 * Deliberately not resolved and deliberately not cross-checked against the
 * direction the layout gave: the page says `from`, `to`, `on loan from`, `loan
 * return to`, `promoted from` and `free agent` in both columns, and a parser
 * that required the preposition to agree with the column would refuse a page
 * that is not wrong.
 */
function counterpartOf(move: string): string {
  // `clubLink` answers with the clause itself under both names when there is
  // no link in it, and what a reader sees in that case is the clause without
  // its direction word.
  return move.includes("[[")
    ? clubLink(move).text
    : move.replace(/^(?:from|to)\s+/i, "").trim();
}

/**
 * The Spanish page's shape: one section per club, each holding an arrivals
 * list and a departures list of `{{fs player}}` lines. It shares no structure
 * with the English page beyond the domain it is served from -- no wikitable,
 * no date column and no fee column anywhere on it -- so a move parsed here
 * carries a null date and a null fee, which is what the page says.
 *
 * The check that stands between a re-headed club and a silently thinner
 * partition is that every one of the Competition's clubs has a section, which
 * is the same loud failure ADR-0031 asks for and the direct equivalent of the
 * English page's every-article-is-linked check. It is the stronger of the two
 * here: on this page a club that moved nobody still has a heading, so a
 * missing one is always a shape change and never a quiet window.
 */
function parseClubSections(
  source: string,
  wikitext: string,
  pinned: PinnedClubs
): SquadChange[] {
  const issues: SquadChangeSourceIssue[] = [];
  const changes: SquadChange[] = [];
  const clubs = clubIndex(pinned);
  const seen = new Set<string>();

  // Split rather than matched, so each heading arrives paired with the text
  // that runs to the next one.
  const sections = wikitext.split(/^===\s*(.+?)\s*===\s*$/m);
  for (let index = 1; index < sections.length; index += 2) {
    const club = resolveSectionClub(sections[index] as string, clubs);
    if (club === undefined) {
      continue;
    }
    seen.add(club);
    const lists = squadLists(sections[index + 1] as string);
    if (lists.length !== CLUB_SECTION_DIRECTIONS.length) {
      issues.push({
        field: "club",
        detail:
          `${club}'s section holds ${lists.length} squad lists, expected `
          + `${CLUB_SECTION_DIRECTIONS.length}`
      });
      continue;
    }
    for (const [position, direction] of CLUB_SECTION_DIRECTIONS.entries()) {
      for (const player of squadListPlayers(lists[position] as string)) {
        const name = parameter(player, "name");
        const other = parameter(player, "other");
        if (name === undefined || other === undefined) {
          issues.push({
            field: `${club}.${direction}`,
            detail: "a squad list entry states no name or no counterpart"
          });
          continue;
        }
        const move = currentMove(other);
        changes.push({
          club,
          direction,
          player: cellText(name),
          counterpartClub: counterpartOf(move),
          fee: null,
          loan: /loan/i.test(move),
          datedOn: null
        });
      }
    }
  }

  for (const club of pinned.keys()) {
    if (!seen.has(club)) {
      issues.push({
        field: "club",
        detail: `the page carries no section for ${club}`
      });
    }
  }

  if (issues.length > 0) {
    throw new SquadChangeSourceValidationError(source, issues);
  }
  return changes;
}

/**
 * A window's moves, read through whichever shape its page is published in.
 * The format travels with the window rather than with the Competition because
 * it is the page that has a shape, and the window is what names the page.
 */
export function parseSquadChanges(
  source: string,
  wikitext: string,
  pinned: PinnedClubs,
  format: TransferListFormat
): SquadChange[] {
  return format === "tables"
    ? parseTables(source, wikitext, pinned)
    : parseClubSections(source, wikitext, pinned);
}

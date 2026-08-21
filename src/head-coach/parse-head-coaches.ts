import { cellText } from "../wikipedia/wikitext.js";
import {
  HeadCoachSourceValidationError,
  resolveClub,
  sectionTable,
  tableLines,
  type HeadCoachSourceIssue,
  type PinnedClubs
} from "./parse-head-coach-changes.js";

/** Who is in post at one club, as the season article names them (ADR-0045). */
export interface HeadCoachInPost {
  club: string;
  headCoach: string;
}

/**
 * The section each article keeps its per-club personnel table under, in the
 * article's own words: the Premier League writes "Personnel and kits" and La
 * Liga "Personnel and sponsorship", and neither is more correct. Both are
 * quoted whole rather than folded into one pattern, so that the heading a
 * refusal names is a heading the operator can find on the page.
 */
const SECTION_HEADINGS = ["Personnel and kits", "Personnel and sponsorship"];

/**
 * The table's leading columns, quoted from the source. Only these two are
 * pinned, because the two articles part company after them -- the sponsor
 * columns are named differently on each -- and only these two are read. A
 * captain filed as a Head Coach is exactly what pinning the pair prevents:
 * `Manager` moving out of the second column stops the parse.
 */
const SOURCE_COLUMNS = ["Team", "Manager"];

const CLUB = 0;

/**
 * Each club's Head Coach for the Season, from the season article's raw
 * wikitext -- the same bytes the Head Coach change fetch already archives, so
 * naming twenty coaches costs this parser and not a second request.
 *
 * The captain, the kit manufacturer and the sponsors sit in the same rows and
 * none of them is read (ADR-0018). Every club in the table must resolve: this
 * column holds nothing but the Competition's own twenty, so a spelling the
 * identity map has never seen is drift rather than a counterpart.
 */
export function parseHeadCoaches(
  source: string,
  wikitext: string,
  pinned: PinnedClubs,
  columns: readonly string[] = SOURCE_COLUMNS
): HeadCoachInPost[] {
  // Read off the labels rather than fixed at 1: the column the Head Coach sits
  // in is wherever this article's own pinned list puts `Manager`, so an article
  // that leads with an extra column moves the read with it instead of needing a
  // second constant that could disagree with the first.
  const headCoachAt = columns.indexOf("Manager");
  const issues: HeadCoachSourceIssue[] = [];
  const inPost: HeadCoachInPost[] = [];
  const { heading, wikitable } = sectionTable(
    source, SECTION_HEADINGS, wikitext
  );
  const { header, rows } = tableLines(wikitable);

  const labels = header.map(cellText);
  if (labels.slice(0, columns.length).join("|") !== columns.join("|")) {
    throw new HeadCoachSourceValidationError(source, [{
      field: heading,
      detail:
        `expected the columns ${columns.join(", ")}, `
        + `received ${labels.join(", ")}`
    }]);
  }

  for (const [index, cells] of rows.entries()) {
    // The width the header states, exactly. No cell here spans a row, so a
    // row that is not the header's width is a shape change and there is no
    // honest way to say which column it gained or lost.
    if (cells.length !== labels.length) {
      issues.push({
        field: `${heading}.${index}`,
        detail: `a row reads as ${cells.length} cells of ${labels.length} `
          + "columns"
      });
      continue;
    }
    const club = resolveClub(cells[CLUB] as string, pinned);
    if (club === undefined) {
      issues.push({
        field: `${heading}.${index}.club`,
        detail: `unknown club spelling ${cellText(cells[CLUB] as string)}`
      });
      continue;
    }
    const headCoach = cellText(cells[headCoachAt] as string);
    if (headCoach === "") {
      issues.push({
        field: `${heading}.${index}.headCoach`,
        detail: `${club} states no Head Coach`
      });
      continue;
    }
    inPost.push({ club, headCoach });
  }

  if (issues.length > 0) {
    throw new HeadCoachSourceValidationError(source, issues);
  }
  return inPost;
}

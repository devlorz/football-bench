/**
 * Reading English Wikipedia's raw wikitext, for the three pipelines that do
 * it.
 *
 * Extracted when the second one arrived: Squad Changes (ADR-0031) wrote all of
 * this against the transfer lists, and Head Coach changes (ADR-0044) reads the
 * season articles' tables with the same four questions -- what does this cell
 * say, what does it link to, what date is that, and what is decoration. They
 * are one thing now because a fix to any of them is a fix both pages need, and
 * that is a different test from "these look alike".
 *
 * The third is the current national team head coaches list (ADR-0057), which
 * asks the same four questions of a fourth page shape and answered the test
 * the same way: its date column wraps the same templates the Italian transfer
 * list wraps, so widening `parseDate` was a fix the older pages would have
 * needed the day an editor wrote a date that way there.
 */

/**
 * What Wikimedia's user-agent policy asks every request to carry: a contactable
 * identifier. One fact about this project and not one per page, so the three
 * fetches that read these articles send the same string — and this module is
 * where those three already meet.
 *
 * Not a fact about wikitext, which is what everything else here is about. It
 * lives here anyway because the alternative was a fourth file holding two
 * lines, or a third copy of the string.
 */
export const WIKIMEDIA_REQUEST_HEADERS = {
  "User-Agent": "football-bench/1.0 (https://github.com/football-bench)"
};

/**
 * A page with its citations and its editorial comments taken out, which is the
 * first thing done to either article's wikitext and always before it is split.
 *
 * Not merely noise removal. A `{{cite}}` runs to several lines on both pages
 * and its continuation lines begin with `|url=`, which is indistinguishable
 * from a new cell to anything reading a wikitable line by line. MediaWiki
 * expands the template before it reads the table and so renders such a row
 * correctly; a line splitter that does not know templates from cells sees the
 * row one cell too wide, and every column after it is somebody else's. The
 * season articles have carried multi-line citations from the start, and on
 * 2026-08-19 the English transfer list grew its first -- a `{{Cite web}}`
 * wrapped mid-parameter on the Alfie Osbourne row -- which put a player's name
 * where the date column belongs and, through the date `rowspan` under it, on
 * the three rows below as well.
 *
 * `|}` and `|-` can appear inside a citation for the same reason, so this runs
 * before the table is even cut out of the page rather than after.
 */
export function withoutCitations(wikitext: string): string {
  return wikitext
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/**
 * `{{dts|format=dmy|2026|2|12}}` — the Italian transfer list's date cell, and
 * the only one of these pages that writes a date as three separate numbers.
 * Its leading named parameters are display instructions; the three numbers
 * after them are the date, always year first whatever `format` says.
 */
const SORTABLE_DATE =
  /^\{\{dts\|(?:[^|}]*=[^|}]*\|)*(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}$/i;

/**
 * `{{dts|format=dmy|19 May 2026}}`, `{{DTS|17 February 2025}}` and
 * `{{Date table sorting|6 August 2025}}` — the current national team head
 * coaches list's whole date column, which wraps the same sortable templates
 * round a written date rather than round the three numbers above. All three
 * forms appear on that one page, which is why they are one pattern and not
 * three: they are one editor's habit varying, not three facts.
 *
 * The wrapper is a display and sorting instruction and the date inside it is
 * the date, so this takes the wrapper off and the written form below reads
 * what is left. Nothing here decides whether what is left *is* a date: the
 * anchored pattern below is the only gate, and it refuses `2026|2|12`,
 * `format=dmy` and `Pre-season` alike. A second guard in this character class
 * would refuse exactly the same strings one line earlier, and a guard that
 * cannot be observed is a guard nobody can be sure still works.
 *
 * The three-number form is not this one's business either: the pattern above
 * is tried first and takes it.
 */
const WRAPPED_DATE =
  /^\{\{(?:dts|date table sorting)\|(?:[^|}]*=[^|}]*\|)*([^}]+)\}\}$/i;

/**
 * "6 February 2026", or either of the two date templates these pages wrap that
 * round it. Undefined for anything else, which is what refuses a page whose
 * date column has changed shape.
 */
export function parseDate(value: string): string | undefined {
  const sortable = SORTABLE_DATE.exec(value);
  if (sortable !== null) {
    const year = sortable[1] as string;
    const month = (sortable[2] as string).padStart(2, "0");
    const day = (sortable[3] as string).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const written = WRAPPED_DATE.exec(value)?.[1]?.trim() ?? value;
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(written);
  const month = MONTHS.indexOf((match?.[2] ?? "").toLowerCase());
  if (match?.[1] === undefined || match[3] === undefined || month < 0) {
    return undefined;
  }
  const day = match[1].padStart(2, "0");
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
}

/**
 * A cell's leading HTML attributes and the pipe that ends them, in the four
 * shapes these pages write them: `rowspan="9" |`, the unquoted `rowspan=2|`
 * the Spanish tables prefer, the hyphenated
 * `data-sort-value="Iraola, Andoni"|` every sortable name column carries, and
 * the Bundesliga season article's Personnel table, which leads a sortable
 * Team cell with the bare keyword `nowrap` ahead of `data-sort-value`.
 * `nowrap` carries no `=` of its own and so needs naming as its own
 * alternative rather than falling out of the `key=value` shape the other
 * three write. `\b` rather than a required trailing space, because the same
 * table also writes it immediately against the pipe, `nowrap|`, with no
 * value after it at all.
 *
 * The second alternative is the empty attribute list a line opening `||`
 * leaves in front of its content, which MediaWiki reads as a cell with no
 * attributes. It is not cell recovery: a row splitter that takes one cell per
 * line hands the whole of `||x` over as a single cell, and this is only what
 * takes the stray pipe off the front of it.
 *
 * Nothing else may be stripped. A bare pipe is an attribute separator to
 * MediaWiki wherever it appears, but a prefix that is not attribute-shaped is
 * text, and eating it would silently shorten a name.
 */
const CELL_ATTRIBUTES =
  /^\s*(?:nowrap\b\s*|[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|]*)\s*)+\||^\s*\|/i;

/**
 * A cell with its wrapping stripped but its links intact: the flag and
 * sort-key templates that decorate every name, and the citation each fee row
 * carries, are noise in every column.
 */
export function cellSource(cell: string): string {
  return cell
    .replace(CELL_ATTRIBUTES, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    // {{ntsh|92500000}} is the column's hidden sort key, not a fee.
    .replace(/\{\{ntsh\|[^}]*\}\}/gi, "")
    // Every way these pages draw a flag beside a name, and none of them is
    // part of it: `{{flag|ENG}}`, `{{flagicon|ESP}}`, `{{Flag icon|The
    // Netherlands}}` and the module call `{{#invoke:flag|icon|GER}}` all
    // appear, sometimes three of them in one column.
    .replace(/\{\{flagg?\s*icon\|[^}]*\}\}/gi, "")
    .replace(/\{\{#invoke:flag\|[^}]*\}\}/gi, "")
    .replace(/\{\{flagg?\|[^}]*\}\}/gi, "")
    // {{nobreak|...}} keeps a La Liga personnel cell on one line and says
    // nothing about the name inside it; the Premier League never writes it.
    // It runs after the flag templates because it is what those cells wrap.
    // Its content may hold no template of its own: `[^}]*` crosses `{` freely
    // and stops at the first `}`, so a wrapper round anything an earlier
    // replace has not already taken out mispairs its braces and leaves raw
    // wikitext inside a Head Coach's name. Today only the flags are wrapped.
    .replace(/\{\{nobreak\|([^}]*)\}\}/gi, "$1")
    // {{Abbr|Manner|Manner of departure}} -- the Bundesliga season article's
    // way of putting a tooltip on a header cell. The first parameter is what
    // the reader sees and the second is the tooltip text, never part of the
    // label itself.
    .replace(/\{\{abbr\|([^|}]*)\|[^}]*\}\}/gi, "$1")
    // {{sortname|Jan Paul|van Hecke|dab=footballer}} -- named parameters are
    // disambiguation for the link target and are never part of the name.
    .replace(/\{\{sortname\|([^}]*)\}\}/gi, (_, parameters: string) =>
      parameters.split("|").filter((part) => !part.includes("=")).join(" "))
    // {{Sort|Jiménez, Álex|{{flagicon|ESP}} [[Álex Jiménez ...|Álex Jiménez]]}}
    // -- the Italian page's whole name column. The first parameter is the
    // column's sort key and the rest is what the row displays. It runs after
    // the flag templates because the flag it wraps is one, and the key itself
    // holds no brace and no pipe, so what is left to match is flat.
    .replace(/\{\{sort\|[^|}]*\|([^}]*)\}\}/gi, "$1")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a reader sees in a cell: link syntax collapsed to its display text. */
export function cellText(cell: string): string {
  return cellSource(cell)
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .trim();
}

export interface ClubLink {
  /** The linked article's title, or the bare text where a cell has no link. */
  article: string;
  /** What the row displays. */
  text: string;
  /**
   * Whether the cell linked at all, which is the difference between a row
   * pointing at another club and one pointing nowhere: the first disagrees
   * with what it displays and the second has nothing to disagree with.
   */
  linked: boolean;
}

/**
 * A club cell as both of the things it says: which article it points at and
 * what it shows. The article is the identity -- `[[Tottenham Hotspur F.C.|`
 * is Spurs whether the row displays `Tottenham Hotspur`, `Spurs` or
 * `THFC` -- and the display text is what a Squad Change row records as the
 * counterpart.
 */
export function clubLink(cell: string): ClubLink {
  const source = cellSource(cell);
  const link = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(source);
  if (link?.[1] === undefined) {
    return { article: source, text: source, linked: false };
  }
  return {
    article: link[1].trim(),
    text: (link[2] ?? link[1]).trim(),
    linked: true
  };
}

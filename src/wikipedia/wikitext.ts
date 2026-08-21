/**
 * Reading English Wikipedia's raw wikitext, for the two pipelines that do it.
 *
 * Extracted when the second one arrived: Squad Changes (ADR-0031) wrote all of
 * this against the transfer lists, and Head Coach changes (ADR-0044) reads the
 * season articles' tables with the same four questions -- what does this cell
 * say, what does it link to, what date is that, and what is decoration. They
 * are one thing now because a fix to any of them is a fix both pages need, and
 * that is a different test from "these look alike".
 */

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
 * the only page of the three that writes its dates as a template rather than
 * as text. Its leading named parameters are display instructions; the three
 * numbers after them are the date, always year first whatever `format` says.
 */
const SORTABLE_DATE =
  /^\{\{dts\|(?:[^|}]*=[^|}]*\|)*(\d{4})\|(\d{1,2})\|(\d{1,2})\}\}$/i;

/**
 * "6 February 2026", or the `{{dts}}` template that says the same thing.
 * Undefined for anything else, which is what refuses a page whose date column
 * has changed shape.
 */
export function parseDate(value: string): string | undefined {
  const sortable = SORTABLE_DATE.exec(value);
  if (sortable?.[1] !== undefined) {
    const [, year, month, day] = sortable as unknown as string[];
    return `${year}-${(month as string).padStart(2, "0")}`
      + `-${(day as string).padStart(2, "0")}`;
  }
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  const month = MONTHS.indexOf((match?.[2] ?? "").toLowerCase());
  if (match?.[1] === undefined || match[3] === undefined || month < 0) {
    return undefined;
  }
  const day = match[1].padStart(2, "0");
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${day}`;
}

/**
 * A cell's leading HTML attributes and the pipe that ends them, in the three
 * shapes these pages write them: `rowspan="9" |`, the unquoted `rowspan=2|`
 * the Spanish tables prefer, and the hyphenated
 * `data-sort-value="Iraola, Andoni"|` every sortable name column carries.
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
const CELL_ATTRIBUTES = /^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|]*)\s*)+\||^\s*\|/i;

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
    return { article: source, text: source };
  }
  return {
    article: link[1].trim(),
    text: (link[2] ?? link[1]).trim()
  };
}

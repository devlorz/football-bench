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

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/** "6 February 2026" — the only date form any of these tables uses. */
export function parseDate(value: string): string | undefined {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
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
 * the Spanish tables prefer, the hyphenated `data-sort-value="Iraola, Andoni"|`
 * every sortable name column carries, and the empty one a line opening `||`
 * leaves behind. Nothing else may be stripped: a bare pipe is an attribute
 * separator to MediaWiki wherever it appears, but a prefix that is not
 * attribute-shaped is text, and eating it would silently shorten a name.
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
    .replace(/\{\{(?:#invoke:)?flagg?\s*icon\|[^}]*\}\}/gi, "")
    .replace(/\{\{#invoke:flag\|[^}]*\}\}/gi, "")
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

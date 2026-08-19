import { describe, expect, test } from "vitest";
import {
  cellSource,
  cellText,
  clubLink,
  parseDate
} from "../src/wikipedia/wikitext.js";

/**
 * The reading these helpers do is shared by two pipelines whose pages have
 * different habits, and the second one widened three of them: the attribute
 * regex now takes several attributes and unquoted values, a bare leading pipe
 * is stripped, and three flag templates are recognised where one was.
 *
 * Every widening is pinned here, and so is the boundary each stops at. The
 * squad-changes suite proves the transfer lists still read the same, but it
 * proves it over bytes that happen not to contain any of these shapes; what
 * follows is the shape itself, asserted rather than met by luck.
 */
describe("reading a wikitext cell", () => {
  test("strips a quoted attribute and the pipe that ends it", () => {
    expect(cellText('rowspan="9" |Pre-season')).toBe("Pre-season");
  });

  test("strips an attribute whose value carries no quotes", () => {
    expect(cellText("rowspan=2|End of contract")).toBe("End of contract");
  });

  test("strips a hyphenated attribute whose value carries a comma", () => {
    expect(cellText('data-sort-value="Iraola, Andoni"|Andoni Iraola'))
      .toBe("Andoni Iraola");
  });

  test("strips several attributes at once", () => {
    expect(cellText('rowspan="3" style="text-align:left" |24 May 2026'))
      .toBe("24 May 2026");
  });

  /**
   * A line opening `||` reaches a per-line row splitter as one cell whose
   * content begins with a stray pipe. MediaWiki reads that as a cell with an
   * empty attribute list, and so does this -- it recovers no second cell.
   */
  test("strips the empty attribute list a line opening || leaves", () => {
    expect(cellText("|[[Andoni Iraola]]")).toBe("Andoni Iraola");
  });

  /**
   * The boundary the widening must not cross. A pipe is an attribute
   * separator to MediaWiki wherever it appears, but a prefix that is not
   * attribute-shaped is a reader's text, and eating it would silently shorten
   * a name with nothing to show for it.
   */
  test("leaves a prefix that is not attribute-shaped where it is", () => {
    expect(cellText("Sacked|and rehired")).toBe("Sacked|and rehired");
    expect(cellText("£92.5m")).toBe("£92.5m");
  });

  test("keeps a pipe that belongs to a link or a template", () => {
    expect(cellText("[[Tottenham Hotspur F.C.|Spurs]]")).toBe("Spurs");
    expect(clubLink("[[Tottenham Hotspur F.C.|Spurs]]")).toEqual({
      article: "Tottenham Hotspur F.C.",
      text: "Spurs"
    });
  });

  test("reads a cell with no link as its own text under both names", () => {
    expect(clubLink("rowspan=2|free agent")).toEqual({
      article: "free agent",
      text: "free agent"
    });
  });

  test("takes out every way these pages draw a flag", () => {
    expect(cellText("{{flag|ENG}} [[Eddie Howe]]")).toBe("Eddie Howe");
    expect(cellText("{{flagicon|ESP}} [[Xabi Alonso]]")).toBe("Xabi Alonso");
    expect(cellText("{{Flag icon|The Netherlands}} [[Arne Slot]]"))
      .toBe("Arne Slot");
    expect(cellText("{{#invoke:flag|icon|GER}} [[Marco Rose]]"))
      .toBe("Marco Rose");
  });

  test("takes out a citation, whether or not it closes", () => {
    expect(cellText("[[Marco Silva]]<ref>{{cite|url=x}}</ref>"))
      .toBe("Marco Silva");
    expect(cellText("[[Marco Silva]]<ref name=a />")).toBe("Marco Silva");
  });

  test("takes out a hidden sort key but keeps the fee beside it", () => {
    expect(cellText("{{ntsh|92500000}}£92.5m")).toBe("£92.5m");
  });

  test("reads a sortname's parameters as the name and drops its options", () => {
    expect(cellText("{{sortname|Jan Paul|van Hecke|dab=footballer}}"))
      .toBe("Jan Paul van Hecke");
  });

  test("keeps the links a source read needs and collapses the ones a reader sees",
    () => {
      expect(cellSource("[[AFC Bournemouth|Bournemouth]]"))
        .toBe("[[AFC Bournemouth|Bournemouth]]");
      expect(cellText("[[AFC Bournemouth|Bournemouth]]")).toBe("Bournemouth");
    });
});

describe("reading a wikitext date", () => {
  test("reads the one form these tables write", () => {
    expect(parseDate("6 February 2026")).toBe("2026-02-06");
    expect(parseDate("24 May 2026")).toBe("2026-05-24");
  });

  /**
   * A table by hand, and not `Date.parse`, which would answer for `May 2026`
   * and for `2026-05-24` and for a dozen forms these pages never write -- and
   * would answer in the runtime's own zone for some of them.
   */
  test("refuses anything else", () => {
    for (const value of [
      "May 2026", "2026-05-24", "24 Mayo 2026", "Pre-season", "", "24 May"
    ]) {
      expect(parseDate(value)).toBeUndefined();
    }
  });
});

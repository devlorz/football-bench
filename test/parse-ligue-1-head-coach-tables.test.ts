import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { archivedBody } from "./archived-fixture.js";
import {
  parseHeadCoachChanges,
  HeadCoachSourceValidationError,
  type PinnedClubs
} from "../src/head-coach/parse-head-coach-changes.js";
import { parseHeadCoaches } from "../src/head-coach/parse-head-coaches.js";
import { headCoachSource } from "../src/head-coach/head-coach-source.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "../src/squad-changes/club-identity.js";

/**
 * The French season article as it read on 2026-08-21, pinned like the English
 * and Spanish ones: this file exists because Ligue 1's two Head Coach tables
 * are shaped unlike the other three leagues' and the parser is proved against
 * what Wikipedia publishes rather than what we remember it publishing.
 * Re-pinning the digest means re-reading every assertion below.
 */
const ARTICLE_SHA256 =
  "8cd90e27d704709e48f88f7d633a25174c4e620c262145cb22910a7f475c6d39";

const SOURCE = "wikipedia:head-coach-changes:2026-27-ligue-1";

const CLUBS = [
  "AJ Auxerre", "AS Monaco FC", "Angers SCO", "ES Troyes AC", "FC Lorient",
  "Le Havre AC", "Le Mans FC", "Lille OSC", "OGC Nice", "Olympique Lyonnais",
  "Olympique de Marseille", "Paris FC", "Paris Saint-Germain FC",
  "RC Strasbourg Alsace", "Racing Club de Lens", "Stade Brestois 29",
  "Stade Rennais FC 1901", "Toulouse FC"
];

async function article(): Promise<string> {
  const body = await archivedBody("wikipedia-2026-27-ligue-1.txt.gz");
  expect(createHash("sha256").update(body).digest("hex"))
    .toBe(ARTICLE_SHA256);
  return body;
}

const pinned: PinnedClubs = new Map(CLUBS.map((club) =>
  [club, resolveWikipediaClub("FL1", club) as WikipediaClub]));

const ligue1 = headCoachSource("FL1", "2026-27");

describe("the Ligue 1 season article's Head Coach tables", () => {
  test("the registry carries both of the article's own column lists", () => {
    // Without these the two reads below are the parser's defaults, which are
    // the other three leagues' shapes -- so their absence is the bug, not a
    // missing nicety.
    expect(ligue1?.columns).toContain("Position in table");
    expect(ligue1?.personnelColumns).toEqual(["Team", "Chairman", "Manager"]);
  });

  test("Managerial changes parses under the article's own column labels", async () => {
    const awaited = await article();
    expect(() => parseHeadCoachChanges(
      SOURCE, awaited, pinned, ligue1?.columns
    )).not.toThrow();
  });

  test("and is refused under the other three leagues' labels", async () => {
    // shrugged at the difference would accept that wording from every league.
    const awaited = await article();
    expect(() => parseHeadCoachChanges(SOURCE, awaited, pinned))
      .toThrow(HeadCoachSourceValidationError);
  });

  test("Personnel and kits is refused under the common leading pair", async () => {
    // the feature.
    const awaited = await article();
    expect(() => parseHeadCoaches(SOURCE, awaited, pinned))
      .toThrow(HeadCoachSourceValidationError);
  });

  test("and still refuses under its own labels, on the row width", async () => {
    // lost. Ligue 1 renders no Head Coach section until this is fixed.
    const awaited = await article();
    expect(() => parseHeadCoaches(
      SOURCE, awaited, pinned, ligue1?.personnelColumns
    )).toThrow(/reads as 7 cells of 8 columns/);
  });
});

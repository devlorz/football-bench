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
 * The German season article as it read on 2026-08-27, pinned like the other
 * four: this file exists because the Bundesliga's Managerial changes table
 * is shaped unlike any of them -- ten leaf columns, not seven, over a
 * two-row grouped header none of the other four write -- and the parser is
 * proved against what Wikipedia publishes rather than what we remember it
 * publishing. Re-pinning the digest means re-reading every assertion below.
 */
const ARTICLE_SHA256 =
  "2e2427a93d058fcea1fb7ac5f6821f29f3ba8c863449cead81af51a4a0816e39";

const SOURCE = "wikipedia:head-coach-changes:2026-27-bundesliga";

const CLUBS = [
  "1. FC Köln", "1. FC Union Berlin", "1. FSV Mainz 05",
  "Bayer 04 Leverkusen", "Borussia Dortmund", "Borussia Mönchengladbach",
  "Eintracht Frankfurt", "FC Augsburg", "FC Bayern München",
  "FC Schalke 04", "Hamburger SV", "RB Leipzig", "SC Freiburg",
  "SC Paderborn 07", "SV 07 Elversberg", "SV Werder Bremen",
  "TSG 1899 Hoffenheim", "VfB Stuttgart"
];

async function article(): Promise<string> {
  const body = await archivedBody("wikipedia-2026-27-bundesliga.txt.gz");
  expect(createHash("sha256").update(body).digest("hex"))
    .toBe(ARTICLE_SHA256);
  return body;
}

const pinned: PinnedClubs = new Map(CLUBS.map((club) =>
  [club, resolveWikipediaClub("BL1", club) as WikipediaClub]));

const bundesliga = headCoachSource("BL1", "2026-27");

describe("the Bundesliga season article's Head Coach tables", () => {
  test("the registry points the dated fields at the article's own labels",
    () => {
      // Without these the change table falls back to the common 0/1/2/3/5/6
      // layout, which reads this article's `Position in table` cell as an
      // incoming manager's name and its `Incoming` cell as a date -- so their
      // absence is the bug, not a missing nicety. Each grouped leaf is
      // `<group>/<sub-label>` (`leafColumnLabels`) rather than the sub-label
      // alone, because both groups head an `Announced on` sub-column and the
      // bare word would not tell the two apart.
      expect(bundesliga?.columns).toEqual([
        "Team", "Outgoing", "Manner", "Exit date/Announced on",
        "Exit date/Departed on", "Position in table", "Incoming",
        "Incoming date/Announced on", "Incoming date/Arrived on", "Ref."
      ]);
      expect(bundesliga?.fields).toEqual({
        vacancy: "Exit date/Departed on",
        incoming: "Incoming",
        appointment: "Incoming date/Arrived on"
      });
    });

  test("Managerial changes parses under the article's own labels and fields",
    async () => {
      const awaited = await article();
      expect(() => parseHeadCoachChanges(
        SOURCE, awaited, pinned, bundesliga?.columns, bundesliga?.fields
      )).not.toThrow();
    });

  test("reads the actual date a seat moved, not the day it was announced",
    async () => {
      // Union Berlin's row states its vacancy was announced 11 April 2026 but
      // did not fall vacant until the Season's end, 30 June 2026 -- and the
      // new Head Coach was announced 21 May but not appointed until 1 July.
      // A read that grabbed the announced-on columns instead would pass the
      // shape check and still hand back the wrong day.
      const awaited = await article();
      const changes = parseHeadCoachChanges(
        SOURCE, awaited, pinned, bundesliga?.columns, bundesliga?.fields
      );
      const union = changes.filter(({ club }) => club === "1. FC Union Berlin");
      expect(union.find(({ direction }) => direction === "out")?.datedOn)
        .toBe("2026-06-30");
      expect(union.find(({ direction }) => direction === "in")?.datedOn)
        .toBe("2026-07-01");
    });

  test("is refused under the other four leagues' common layout", async () => {
    // The common columns list is seven long against this article's ten, so
    // the label check refuses it before the field positions are ever read --
    // exactly the shape change the pinning exists to catch.
    const awaited = await article();
    expect(() => parseHeadCoachChanges(SOURCE, awaited, pinned))
      .toThrow(HeadCoachSourceValidationError);
  });

  test("Personnel and kits leads Team, Manager like the common shape",
    async () => {
      // No `personnelColumns` override is registered, so this proves the
      // default -- Team then Manager, with no Chairman between them -- is
      // this article's own shape and not an unread assumption.
      const awaited = await article();
      const inPost = parseHeadCoaches(SOURCE, awaited, pinned);
      expect(inPost).toHaveLength(18);
      expect(inPost.find(({ club }) => club === "FC Augsburg")?.headCoach)
        .toBe("Manuel Baum");
    });

  test("refuses a third header row rather than silently dropping it", () => {
    // `leafColumnLabels` reads only the first two of `headerRows` -- this
    // proves the third is refused rather than the shape change it represents
    // being ignored.
    const page = [
      "==Managerial changes==",
      "{|",
      "!Team", "!Outgoing",
      "|-",
      "!A sub-label row nothing above groups",
      "|-",
      "!Another one",
      "|}"
    ].join("\n");
    expect(() => parseHeadCoachChanges(SOURCE, page, pinned, ["Team", "Outgoing"]))
      .toThrow(HeadCoachSourceValidationError);
  });

  test("refuses a group header short of sub-labels, rather than a raw "
    + "TypeError", () => {
    // A `colspan="2"` group cell with only one label under it in row two --
    // the shape a page edit that widened a group without widening its
    // sub-header would leave behind.
    const page = [
      "==Managerial changes==",
      "{|",
      "!Team", '!colspan="2"|Exit date',
      "|-",
      "!Announced on",
      "|}"
    ].join("\n");
    expect(() => parseHeadCoachChanges(
      SOURCE, page, pinned, ["Team", "Exit date/Announced on", "Exit date/?"]
    )).toThrow(HeadCoachSourceValidationError);
  });
});

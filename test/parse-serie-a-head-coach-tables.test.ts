import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { archivedBody } from "./archived-fixture.js";
import {
  HeadCoachSourceValidationError,
  type PinnedClubs
} from "../src/head-coach/parse-head-coach-changes.js";
import { parseHeadCoaches } from "../src/head-coach/parse-head-coaches.js";
import { headCoachSource } from "../src/head-coach/head-coach-source.js";
import {
  wikipediaClubsOf,
  type WikipediaClub
} from "../src/squad-changes/club-identity.js";

/**
 * The Italian season article as it read on 2026-08-21, pinned like the other
 * three. It exists because Serie A's `Personnel and kits` table leads with
 * `Team, Chairman, Manager` -- the same shape Ligue 1 publishes and not the
 * common pair the registry defaults to, which is what the first live fetch
 * after the `competitions` insert refused.
 * Re-pinning the digest means re-reading every assertion below.
 */
const ARTICLE_SHA256 =
  "759fb8da805d7864111d569c2cf43e668a3c945e477801b5dc03d138df4393bf";

const SOURCE = "wikipedia:head-coach-changes:2026-27-serie-a";

async function article(): Promise<string> {
  const body = await archivedBody("wikipedia-2026-27-serie-a.txt.gz");
  expect(createHash("sha256").update(body).digest("hex"))
    .toBe(ARTICLE_SHA256);
  return body;
}

// Keyed by the roster spelling, as the fetch keys it: `resolveClub` returns
// the key, so a map keyed any other way would prove a shape the fetch never
// sees. The whole map rather than a copied list -- a stale twenty-first entry
// is exactly what a hand-written list hides.
const pinned: PinnedClubs = new Map(
  Object.entries(wikipediaClubsOf("SA") ?? {})
    .map(([club, wikipedia]) => [club, wikipedia as WikipediaClub])
);

const serieA = headCoachSource("SA", "2026-27");

describe("the Serie A season article's Head Coach tables", () => {
  test("the registry carries the article's own personnel labels", () => {
    expect(serieA?.personnelColumns).toEqual(["Team", "Chairman", "Manager"]);
  });

  test("Personnel and kits is refused under the common leading pair", async () => {
    // `Manager` is this article's third column, behind `Chairman`. Read by
    // position against `Team, Manager`, every club's chairman would be stored
    // as its Head Coach and nothing downstream could tell.
    const awaited = await article();
    expect(() => parseHeadCoaches(SOURCE, awaited, pinned))
      .toThrow(HeadCoachSourceValidationError);
  });

  test("and reads all twenty Head Coaches under its own labels", async () => {
    const awaited = await article();
    const inPost = parseHeadCoaches(
      SOURCE, awaited, pinned, serieA?.personnelColumns
    );
    expect(inPost).toHaveLength(20);
    expect(inPost.find(({ club }) => club === "Atalanta BC")?.headCoach)
      .toBe("Maurizio Sarri");
    // The cell beside it, so a read slipped one place would show: Atalanta's
    // chairman is Antonio Percassi and no club's Head Coach is named that.
    expect(inPost.map(({ headCoach }) => headCoach))
      .not.toContain("Antonio Percassi");
  });
});

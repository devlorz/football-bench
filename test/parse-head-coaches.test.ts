import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { archivedBody } from "./archived-fixture.js";
import {
  parseHeadCoaches
} from "../src/head-coach/parse-head-coaches.js";
import {
  HeadCoachSourceValidationError,
  type PinnedClubs
} from "../src/head-coach/parse-head-coach-changes.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "../src/squad-changes/club-identity.js";

const CLUBS = [
  "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea",
  "Coventry City", "Crystal Palace", "Everton", "Fulham", "Hull City",
  "Ipswich Town", "Leeds", "Liverpool", "Man City", "Man Utd", "Newcastle",
  "Nott'm Forest", "Spurs", "Sunderland"
];

const SPANISH_CLUBS = [
  "Athletic Club", "CA Osasuna", "Club Atlético de Madrid", "Deportivo Alavés",
  "Elche CF", "FC Barcelona", "Getafe CF", "Levante UD", "Málaga CF",
  "RC Celta de Vigo", "RC Deportivo La Coruña", "RCD Espanyol de Barcelona",
  "Rayo Vallecano de Madrid", "Real Betis Balompié", "Real Madrid CF",
  "Real Racing Club de Santander", "Real Sociedad de Fútbol", "Sevilla FC",
  "Valencia CF", "Villarreal CF"
];

/** The same two pinned reads `fetch-head-coach-changes` is proved against. */
const ENGLISH_ARTICLE_SHA256 =
  "169b2e9f131b4935850851ad61d5b0d26e92e697ffcc692cb1c24629bac2790f";

const SPANISH_ARTICLE_SHA256 =
  "7f95a762856cf8ae8359dbe0c920441575a174c460965f37ca5df6b762f78b13";

async function pinnedPage(name: string, sha256: string): Promise<string> {
  const body = await archivedBody(name);
  expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(sha256);
  return body;
}

const englishArticle = () => pinnedPage(
  "wikipedia-2026-27-premier-league.txt.gz", ENGLISH_ARTICLE_SHA256
);

const spanishArticle = () => pinnedPage(
  "wikipedia-2026-27-la-liga.txt.gz", SPANISH_ARTICLE_SHA256
);

const ENGLISH_SOURCE = "wikipedia:head-coach-changes:2026-27-premier-league";
const SPANISH_SOURCE = "wikipedia:head-coach-changes:2026-27-la-liga";

function pinnedClubs(
  competition = "PL",
  clubs: string[] = CLUBS
): PinnedClubs {
  return new Map(clubs.map((club) =>
    [club, resolveWikipediaClub(competition, club) as WikipediaClub]));
}

describe("parsing a season article's Head Coaches in post", () => {
  test("names every club of the English article's personnel table",
    async () => {
      const incumbents = parseHeadCoaches(
        ENGLISH_SOURCE, await englishArticle(), pinnedClubs()
      );

      // Every club, because the map was built against the changes table and
      // has only ever been asked about clubs that changed.
      expect(incumbents.map(({ club }) => club).sort())
        .toEqual([...CLUBS].sort());
      expect(incumbents).toContainEqual(
        { club: "Arsenal", headCoach: "Mikel Arteta" }
      );
      // A `data-sort-value` attribute and a `{{#invoke:flag|icon}}` call in
      // one cell.
      expect(incumbents).toContainEqual(
        { club: "Bournemouth", headCoach: "Marco Rose" }
      );
    });

  test("names every club of the Spanish article, which wraps every cell",
    async () => {
      const incumbents = parseHeadCoaches(
        SPANISH_SOURCE, await spanishArticle(), pinnedClubs("PD", SPANISH_CLUBS)
      );

      expect(incumbents.map(({ club }) => club).sort())
        .toEqual([...SPANISH_CLUBS].sort());
      // The Team cell is `{{nobreak|Alavés}}` with no link at all, and the
      // Manager cell wraps a flag inside the same wrapper.
      expect(incumbents).toContainEqual(
        { club: "Deportivo Alavés", headCoach: "Quique Sánchez Flores" }
      );
      expect(incumbents).toContainEqual(
        { club: "Athletic Club", headCoach: "Edin Terzić" }
      );
    });

  test("reads the club and the Head Coach and nothing else in the row",
    async () => {
      const incumbents = parseHeadCoaches(
        ENGLISH_SOURCE, await englishArticle(), pinnedClubs()
      );

      // The captain, the kit manufacturer and the sponsors sit in the same
      // rows; none of them is read, and a row carries no field to hold them.
      expect(Object.keys(incumbents[0] as object).sort())
        .toEqual(["club", "headCoach"]);
      expect(incumbents.map(({ headCoach }) => headCoach))
        .not.toContain("Martin Ødegaard");
    });

  test("refuses a table whose columns moved, naming the source", async () => {
    const reordered = (await englishArticle())
      .replace("!Manager\n!Captain", "!Captain\n!Manager");

    expect(() => parseHeadCoaches(
      ENGLISH_SOURCE, reordered, pinnedClubs()
    )).toThrow(HeadCoachSourceValidationError);
    expect(() => parseHeadCoaches(ENGLISH_SOURCE, reordered, pinnedClubs()))
      .toThrow(
        `${ENGLISH_SOURCE}.Personnel and kits: expected the columns Team, `
        + "Manager, received Team, Captain, Manager, Kit manufacturer, "
        + "Shirt sponsor (chest), Shirt sponsor (sleeve)"
      );
  });

  test("refuses a row that no longer fills its columns", async () => {
    // A cell nothing accounts for, ahead of the Manager column: read
    // positionally this row would file `extra` as Arsenal's Head Coach.
    const wide = (await englishArticle()).replace(
      "|Arsenal\n|{{flagicon|ESP}} [[Mikel Arteta]]",
      "|Arsenal\n|extra\n|{{flagicon|ESP}} [[Mikel Arteta]]"
    );

    expect(() => parseHeadCoaches(ENGLISH_SOURCE, wide, pinnedClubs()))
      .toThrow(/reads as 7 cells of 6 columns/);
  });

  /**
   * Neither article spans a cell in this table today, which is what lets this
   * parser read a row's cells straight across where the changes parser has to
   * carry spans down. Pinned rather than assumed: a cell that starts spanning
   * leaves the row below it short, and short is a refusal, not a row read one
   * column out of step.
   */
  test("refuses a row left short by a cell that started spanning", async () => {
    const spanned = (await englishArticle())
      .replace(
        "|Arsenal\n|{{flagicon|ESP}} [[Mikel Arteta]]",
        "|Arsenal\n|rowspan=\"2\"|{{flagicon|ESP}} [[Mikel Arteta]]"
      )
      .replace("|Aston Villa\n|{{flagicon|ESP}} [[Unai Emery]]", "|Aston Villa");

    expect(() => parseHeadCoaches(ENGLISH_SOURCE, spanned, pinnedClubs()))
      .toThrow(/reads as 5 cells of 6 columns/);
  });

  test("refuses a club the Competition's roster does not carry", async () => {
    const promoted = (await spanishArticle())
      .replace("|{{nobreak|Alavés}}", "|{{nobreak|Wrexham}}");

    expect(() => parseHeadCoaches(
      SPANISH_SOURCE, promoted, pinnedClubs("PD", SPANISH_CLUBS)
    )).toThrow(/unknown club spelling Wrexham/);
  });

  test("refuses a club whose Head Coach cell states nobody", async () => {
    const vacant = (await englishArticle())
      .replace("|{{flagicon|ESP}} [[Mikel Arteta]]", "|");

    expect(() => parseHeadCoaches(ENGLISH_SOURCE, vacant, pinnedClubs()))
      .toThrow(/states no Head Coach/);
  });

  test("refuses an article with no such table at all", () => {
    // Named with the articles' own headings, both of them, because either is
    // the one an operator would go looking for. A pattern of ours in this
    // message is a heading nobody can find on any page.
    expect(() => parseHeadCoaches(
      ENGLISH_SOURCE, "==League table==\nnothing here", pinnedClubs()
    )).toThrow(
      `${ENGLISH_SOURCE}.Personnel and kits or Personnel and sponsorship: `
      + "expected a wikitable under this heading"
    );
  });
});

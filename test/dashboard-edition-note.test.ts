import { describe, expect, test } from "vitest";
import { editionNote, overallEditionNote } from "../dashboard/src/edition-note.js";

/**
 * What an earlier Edition's pages open with (ADR-0061, ticket 0085): a label
 * and a frozen sentence whose bytes are pinned here, with the Gameweek numbers
 * read from the body the page fetched.
 */
describe("an earlier Edition's note", () => {
  const CLOSED = { number: 1, openedBy: "ADR-0062" };

  test("pins the sentence's bytes", () => {
    expect(editionNote({ number: 1, firstGameweek: 1, lastGameweek: 5 }, CLOSED))
      .toEqual({
        label: "Edition 1 · Gameweek 1–5",
        sentence:
          "Edition 1 ends at Gameweek 5. From Gameweek 6 this Competition is "
          + "played by a new roster, which ADR-0061 allows once in a Season and "
          + "ADR-0062 named. Its Gameweeks stay here whole, ranked by the roster "
          + "that played them, and none of them counts in Edition 2."
      });
    expect(overallEditionNote(CLOSED)).toEqual({
      label: "Edition 1",
      sentence:
        "Edition 1 of each league ends at the Gameweek its own page names. From "
        + "the next one each league is played by a new roster, which ADR-0061 "
        + "allows once in a Season and ADR-0062 named. Their Gameweeks stay here "
        + "whole, ranked by the roster that played them, and none of them counts "
        + "in Edition 2."
    });
  });

  test("reads its Gameweeks from the body", () => {
    const note = editionNote({ number: 1, firstGameweek: 1, lastGameweek: 7 }, CLOSED);

    expect(note?.label).toBe("Edition 1 · Gameweek 1–7");
    expect(note?.sentence).toMatch(/^Edition 1 ends at Gameweek 7\. From Gameweek 8 /);
  });

  test("says nothing while the Edition is still the one playing", () => {
    // The constant can be deployed before the operator inserts Edition 2, and
    // `/edition-1/pl` then answers with the current Edition.
    expect(editionNote({ number: 1, firstGameweek: 1, lastGameweek: null }, CLOSED))
      .toBeNull();
  });
});

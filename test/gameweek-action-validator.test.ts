import { describe, expect, test } from "vitest";
import {
  GAMEWEEK_ACTION_SCHEMA_MESSAGE,
  validateGameweekAction
} from "../src/fpl/validate-gameweek-action.js";

/** The shape an Entrant returns, with `chip` left to each test. */
function action(chip: unknown): string {
  return JSON.stringify({
    transfers_in: [],
    transfers_out: [],
    chip,
    team_sheet: {
      starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
      bench: [2, 7, 12, 15],
      captain: 8,
      vice_captain: 13
    }
  });
}

describe("The Chip an Entrant names", () => {
  test.for([
    "wildcard",
    "free_hit",
    "triple_captain",
    "bench_boost"
  ])("carries %s through to the reducer", (chip) => {
    expect(validateGameweekAction(action(chip)))
      .toMatchObject({ ok: true, action: { chip } });
  });

  test("carries a Gameweek with no Chip through as no Chip", () => {
    expect(validateGameweekAction(action(null)))
      .toMatchObject({ ok: true, action: { chip: null } });
  });

  test("refuses a name that is not one of the four", () => {
    // The boundary keeps the reducer's Chip type honest: a misspelling is a
    // schema failure the Entrant is asked to Repair, not a Gameweek that
    // quietly plays no Chip.
    expect(validateGameweekAction(action("triple-captain")))
      .toEqual({ ok: false, message: GAMEWEEK_ACTION_SCHEMA_MESSAGE });
  });
});

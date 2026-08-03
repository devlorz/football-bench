import { describe, expect, test } from "vitest";
import {
  gameweekRepairMessage,
  GAMEWEEK_ACTION_SCHEMA_MESSAGE,
  validateGameweekAction
} from "../src/fpl/validate-gameweek-action.js";
import { ENFORCED_VIOLATIONS } from "../src/fpl/apply-gameweek-action.js";

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
      .toEqual({
        ok: false,
        kind: "schema",
        message: GAMEWEEK_ACTION_SCHEMA_MESSAGE
      });
  });

  test("refuses a Gameweek that reaches for two Chips at once", () => {
    // One Chip per Gameweek is not a rule the reducer enforces, because the
    // shape it is handed cannot carry two. This is where that becomes true: a
    // list where a name belongs is a schema failure the Entrant is asked to
    // Repair, not a Gameweek that quietly plays the first of them.
    expect(validateGameweekAction(action(["triple_captain", "bench_boost"])))
      .toEqual({
        ok: false,
        kind: "schema",
        message: GAMEWEEK_ACTION_SCHEMA_MESSAGE
      });
  });
});

describe("The Repair an Entrant is asked for", () => {
  test("quotes the reason it was given and asks only for a correction", () => {
    // Frozen for the Season with the Violations themselves (ADR-0004): the
    // wrapper is as much of what the Entrant reads as the sentence inside it,
    // and making either more helpful mid-Season changes the difficulty of the
    // task while it is being measured.
    expect(gameweekRepairMessage("A Squad must cost no more than £100.0m."))
      .toBe(
        "Your previous Gameweek action was rejected:\n"
        + "A Squad must cost no more than £100.0m.\n"
        + "Return only a corrected Gameweek action as JSON."
      );
  });

  test.for([
    ...ENFORCED_VIOLATIONS.map(({ message }) => message),
    GAMEWEEK_ACTION_SCHEMA_MESSAGE
  ])("carries the whole of %s back to the Entrant", (reason) => {
    // Every sentence the loop can be handed, from either boundary: the reducer
    // refuses an action the rules reject, and the validator refuses a response
    // that is not an action at all. Both reach the Entrant intact — a Repair
    // asked for without the reason is a Repair asked for blind.
    expect(gameweekRepairMessage(reason)).toContain(reason);
  });
});

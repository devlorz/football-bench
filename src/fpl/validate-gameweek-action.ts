import { z } from "zod";
import { CHIPS, type GameweekAction } from "./apply-gameweek-action.js";

const fplId = z.number().int().positive();

const gameweekActionSchema = z.strictObject({
  transfers_in: z.array(fplId),
  transfers_out: z.array(fplId),
  // The reducer's own inventory, so a Chip it gains is playable here the same
  // day rather than being refused as a name this boundary has never heard.
  chip: z.enum(CHIPS).nullable(),
  team_sheet: z.strictObject({
    starters: z.array(fplId),
    bench: z.array(fplId),
    captain: fplId,
    vice_captain: fplId
  }),
  // The Rationale beside the action (ADR-0041), matching the Match track's
  // Prediction. The reducer never reads it — it is carried alongside the
  // action for storage, not part of the Squad rules.
  rationale: z.string()
});

/**
 * A response that is not a Gameweek action at all. It is not a `ViolationKind`
 * and deliberately not counted as one: the violation profile records how an
 * Entrant manages a Squad, and failing to return JSON is not a rule of the
 * game it broke. The attempt is still recorded, under this kind.
 */
export const GAMEWEEK_ACTION_SCHEMA_KIND = "schema";

export type GameweekActionValidation =
  | { ok: true; action: GameweekAction; rationale: string }
  | {
    ok: false;
    kind: typeof GAMEWEEK_ACTION_SCHEMA_KIND;
    message: string;
  };

/**
 * Frozen for the Season (ADR-0004) alongside the Violation vocabulary: an
 * Entrant that returns the wrong shape is told the same thing every time.
 */
export const GAMEWEEK_ACTION_SCHEMA_MESSAGE =
  "Response must be JSON matching the Gameweek action schema.";

/**
 * What an Entrant is sent when its action is refused. Frozen with the messages
 * it wraps, and for the same reason (ADR-0004): the wrapper is as much of what
 * the Entrant reads as the sentence inside it.
 *
 * It carries the reason and asks for a correction, and does nothing else. It
 * does not restate the rules — the context already lists every one of them, in
 * full, every Gameweek — and it does not say which Repair this is, because an
 * Entrant told it is on its last chance is being measured on a different task
 * from one that is not.
 */
export function gameweekRepairMessage(reason: string): string {
  return [
    "Your previous Gameweek action was rejected:",
    reason,
    "Return only a corrected Gameweek action as JSON."
  ].join("\n");
}

export function validateGameweekAction(
  raw: string
): GameweekActionValidation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      kind: GAMEWEEK_ACTION_SCHEMA_KIND,
      message: GAMEWEEK_ACTION_SCHEMA_MESSAGE
    };
  }

  const parsed = gameweekActionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      kind: GAMEWEEK_ACTION_SCHEMA_KIND,
      message: GAMEWEEK_ACTION_SCHEMA_MESSAGE
    };
  }

  const { transfers_in, transfers_out, chip, team_sheet, rationale } =
    parsed.data;
  return {
    ok: true,
    action: {
      transfersIn: transfers_in,
      transfersOut: transfers_out,
      chip,
      teamSheet: {
        starters: team_sheet.starters,
        bench: team_sheet.bench,
        captain: team_sheet.captain,
        viceCaptain: team_sheet.vice_captain
      }
    },
    rationale
  };
}

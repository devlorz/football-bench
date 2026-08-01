import { z } from "zod";
import type { GameweekAction } from "./apply-gameweek-action.js";

const fplId = z.number().int().positive();

const gameweekActionSchema = z.strictObject({
  transfers_in: z.array(fplId),
  transfers_out: z.array(fplId),
  chip: z.null(),
  team_sheet: z.strictObject({
    starters: z.array(fplId),
    bench: z.array(fplId),
    captain: fplId,
    vice_captain: fplId
  })
});

export type GameweekActionValidation =
  | { ok: true; action: GameweekAction }
  | { ok: false; message: string };

/**
 * Frozen for the Season (ADR-0004) alongside the Violation vocabulary: an
 * Entrant that returns the wrong shape is told the same thing every time.
 */
export const GAMEWEEK_ACTION_SCHEMA_MESSAGE =
  "Response must be JSON matching the Gameweek action schema.";

export function validateGameweekAction(
  raw: string
): GameweekActionValidation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, message: GAMEWEEK_ACTION_SCHEMA_MESSAGE };
  }

  const parsed = gameweekActionSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: GAMEWEEK_ACTION_SCHEMA_MESSAGE };
  }

  const { transfers_in, transfers_out, team_sheet } = parsed.data;
  return {
    ok: true,
    action: {
      transfersIn: transfers_in,
      transfersOut: transfers_out,
      chip: null,
      teamSheet: {
        starters: team_sheet.starters,
        bench: team_sheet.bench,
        captain: team_sheet.captain,
        viceCaptain: team_sheet.vice_captain
      }
    }
  };
}

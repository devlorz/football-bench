import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  MATCH_PROMPT_SHA256,
  matchContext
} from "../src/predictions/openrouter-entrant.js";

describe("the Match Prompt Version", () => {
  test("pins the frozen template and context builder to a reviewed checksum", () => {
    const context = matchContext({
      fpl_id: 1,
      home_team: "Arsenal",
      away_team: "Coventry City",
      kickoff_at: new Date("2026-08-21T19:00:00Z")
    });

    expect(
      createHash("sha256").update(context, "utf8").digest("hex")
    ).toBe(MATCH_PROMPT_SHA256);
  });
});

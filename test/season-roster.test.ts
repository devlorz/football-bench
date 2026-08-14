import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import { MATCH_PROMPT_VERSION } from "../src/predictions/openrouter-entrant.js";
import {
  enterSeasonRoster, SEASON_ROSTER, SEASON_ROSTER_SIZE
} from "../src/season-roster.js";

const { Client } = pg;

const SEASON = "2026-27";

interface ModelRow {
  id: string;
  name: string;
  base_model: string;
  provider: string;
  quantization: string | null;
  prompt_version: string;
  role: string;
  config: Record<string, unknown>;
  created_at: Date;
}

describe("entering the Season Roster", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query("truncate models restart identity cascade");
  });

  const entrants = async (): Promise<ModelRow[]> => (
    await client.query<ModelRow>(
      "select * from models where role = 'entrant' order by id"
    )
  ).rows;

  test("writes the ten seats of ADR-0034 under the Season's Prompt Version",
    async () => {
      await enterSeasonRoster(client, SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE);
      expect(rows.map(({ prompt_version }) => prompt_version))
        .toEqual(Array<string>(SEASON_ROSTER_SIZE).fill(MATCH_PROMPT_VERSION));

      const classes = rows.reduce<Record<string, number>>((counts, row) => {
        const name = String(row.config.baseModelClass);
        return { ...counts, [name]: (counts[name] ?? 0) + 1 };
      }, {});
      expect(classes).toEqual({
        Frontier: 3, "First-party": 2, "Open-weight": 5
      });

      // ADR-0009: an open-weight seat served at another precision is another
      // model, so every one of them is pinned — and nothing else is. Qwen3.8
      // Max is the single exception, for the reason recorded beside it in
      // `src/season-roster.ts` and inherited from its predecessor: one
      // endpoint exists for that Base Model, so the provider pin fixes the
      // precision on its own, and an `fp8` filter matches nothing and 404s
      // the seat.
      const unpinnedOpenWeight = new Set(["match/qwen3.8-max"]);
      for (const row of rows) {
        const pinned = row.config.baseModelClass === "Open-weight"
          && !unpinnedOpenWeight.has(row.id);
        expect([row.id, row.quantization !== null]).toEqual([row.id, pinned]);
      }
    });

  test("names the dated Base Model each seat resolves to, never as the request id",
    async () => {
      await enterSeasonRoster(client, SEASON);

      for (const row of await entrants()) {
        const entrant = SEASON_ROSTER.find(({ id }) => id === row.id);
        expect(entrant?.canonicalSlug).toBe(row.config.canonical_slug);
        // Beside it, when that resolution was last looked at. Per seat, so a
        // refresh that opened three Base Models' pages cannot date the seven
        // it never opened.
        expect(entrant?.catalogCheckedAt).toBe(row.config.catalog_checked_at);
        // The pin is recorded beside a stable request name rather than sent
        // as one, which is what keeps a snapshot swap detectable.
        expect(row.base_model).not.toBe(row.config.canonical_slug);
        expect(entrant?.canonicalSlug.startsWith(`${row.base_model}-`))
          .toBe(true);
      }
    });

  test("re-entering changes nothing and keeps a key it did not write",
    async () => {
      await enterSeasonRoster(client, SEASON);
      const before = await entrants();
      const [first] = before;
      await client.query(
        `update models set config = config || '{"entered_by": "operator"}'
          where id = $1`,
        [first?.id]
      );

      await enterSeasonRoster(client, SEASON);

      const rows = await entrants();
      expect(rows).toHaveLength(SEASON_ROSTER_SIZE);
      expect(rows[0]?.config.entered_by).toBe("operator");
      expect(rows).toEqual(before.map((row) => (
        row.id === first?.id
          ? { ...row, config: { ...row.config, entered_by: "operator" } }
          : row
      )));
    });

  test("leaves the two seats ADR-0034 declined to move exactly as they were",
    async () => {
      await enterSeasonRoster(client, SEASON);

      // The DeepSeek and Gemini rejections are recorded in ADR-0034 as an
      // absence of change, which is invisible in a roster of ten unless
      // something says what the absence was.
      const rows = await entrants();
      expect(rows.find(({ id }) => id === "match/deepseek-v4-pro"))
        .toMatchObject({
          name: "DeepSeek V4 Pro",
          base_model: "deepseek/deepseek-v4-pro",
          provider: "novita",
          quantization: "fp8",
          config: expect.objectContaining({
            canonical_slug: "deepseek/deepseek-v4-pro-20260423"
          })
        });
      expect(rows.find(({ id }) => id === "match/gemini-3.1-pro-preview"))
        .toMatchObject({
          name: "Gemini 3.1 Pro Preview",
          base_model: "google/gemini-3.1-pro-preview",
          provider: "google-ai-studio",
          quantization: null,
          config: expect.objectContaining({
            canonical_slug: "google/gemini-3.1-pro-preview-20260219"
          })
        });
    });

  test("refuses a roster whose length disagrees with the recorded size",
    async () => {
      // A seat dropped from the constant, or one added to it, is a Season
      // entered at a size no decision records — and every number read against
      // the roster would still be produced, meaning something else.
      await expect(enterSeasonRoster(client, SEASON, SEASON_ROSTER.slice(1)))
        .rejects.toThrow(
          `The roster holds ${SEASON_ROSTER_SIZE - 1} Entrants, not `
          + `${SEASON_ROSTER_SIZE} (ADR-0034)`
        );
      await expect(enterSeasonRoster(
        client, SEASON, [...SEASON_ROSTER, SEASON_ROSTER[0]!]
      )).rejects.toThrow(
        `The roster holds ${SEASON_ROSTER_SIZE + 1} Entrants, not `
        + `${SEASON_ROSTER_SIZE} (ADR-0034)`
      );

      // And it refuses before writing anything, not part way through.
      expect(await entrants()).toHaveLength(0);
    });

  test("refuses a Season the frozen Prompt Version does not name", async () => {
    await expect(enterSeasonRoster(client, "2027-28")).rejects
      .toThrow(/does not own Prompt Version/);
    expect(await entrants()).toHaveLength(0);
  });
});

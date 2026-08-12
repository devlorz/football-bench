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

  test("writes the nine seats of ADR-0014 under the Season's Prompt Version",
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
        Frontier: 3, "First-party": 1, "Open-weight": 5
      });

      // ADR-0009: an open-weight seat served at another precision is another
      // model, so every one of them is pinned — and nothing else is.
      for (const row of rows) {
        expect([row.id, row.quantization === null]).toEqual([
          row.id, row.config.baseModelClass !== "Open-weight"
        ]);
      }
    });

  test("names the dated model each seat resolves to, never as the request id",
    async () => {
      await enterSeasonRoster(client, SEASON);

      for (const row of await entrants()) {
        const entrant = SEASON_ROSTER.find(({ id }) => id === row.id);
        expect(entrant?.canonicalSlug).toBe(row.config.canonical_slug);
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

  test("refuses a Season the frozen Prompt Version does not name", async () => {
    await expect(enterSeasonRoster(client, "2027-28")).rejects
      .toThrow(/does not own Prompt Version/);
    expect(await entrants()).toHaveLength(0);
  });
});

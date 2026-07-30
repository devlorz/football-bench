import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  loadDryRunArchive,
  restrictToReadOnly
} from "../src/dry-run/load-archive.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

describe("the dry run archive", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      "truncate raw_snapshots, models restart identity cascade"
    );
  });

  test("a read-only session refuses to write, so a dry run cannot alter real data", async () => {
    await restrictToReadOnly(client);

    await expect(
      client.query(
        "insert into raw_snapshots (source, sha256, body) values ('x', 'y', 'z')"
      )
    ).rejects.toThrow(/read-only/i);

    await client.query("set session characteristics as transaction read write");
  });

  test("loads one archived body per source and every Entrant on the roster", async () => {
    await client.query(
      `insert into raw_snapshots (source, sha256, body) values
         ('fpl_fixtures', 'aaa', '[]'),
         ('football_data:2025-26:E0', 'bbb', 'Div,Date')`
    );
    await client.query(
      `insert into models
         (id, name, role, base_model, provider, quantization, prompt_version)
       values
         ('grok', 'Grok', 'entrant', 'x-ai/grok-4.5', 'xai', null,
          'match/2026-27-v1')`
    );

    const archive = await loadDryRunArchive(client);

    expect(archive.snapshots).toEqual(
      expect.arrayContaining([
        { source: "fpl_fixtures", body: "[]" },
        { source: "football_data:2025-26:E0", body: "Div,Date" }
      ])
    );
    expect(archive.entrants).toEqual([
      {
        id: "grok",
        name: "Grok",
        role: "entrant",
        base_model: "x-ai/grok-4.5",
        provider: "xai",
        quantization: null,
        prompt_version: "match/2026-27-v1",
        config: {}
      }
    ]);
  });

  test("keeps the newest body when a source was archived more than once", async () => {
    await client.query(
      `insert into raw_snapshots (source, sha256, body, first_seen_at) values
         ('fpl_bootstrap', 'old', 'stale', '2026-07-01T00:00:00Z'),
         ('fpl_bootstrap', 'new', 'current', '2026-07-20T00:00:00Z')`
    );

    const archive = await loadDryRunArchive(client);

    expect(archive.snapshots).toEqual([
      { source: "fpl_bootstrap", body: "current" }
    ]);
  });
});

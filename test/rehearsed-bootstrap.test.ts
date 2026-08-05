import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { fetchFplDaily } from "../src/fpl/fetch-gameweek.js";
import { rehearsedBootstrap } from "../src/fpl-rehearsal/rehearsed-bootstrap.js";
import { createRehearsalFetcher } from "../src/fpl-rehearsal/rehearsal-fetcher.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";

describe("the bootstrap a rehearsed Gameweek is loaded from", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let archived: string;
  let fixtures: string;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    archived = await archivedBody("fpl-bootstrap-2026-27.json.gz");
    fixtures = await archivedBody("fpl-fixtures-2026-27.json.gz");

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
  });

  async function load(bootstrap: string) {
    return fetchFplDaily({
      database: client,
      season: SEASON,
      http: createRehearsalFetcher({
        season: SEASON,
        snapshots: [
          { source: "fpl_bootstrap", body: bootstrap },
          { source: "fpl_fixtures", body: fixtures }
        ],
        answer: () => "no Entrant is called here"
      }),
      now: () => new Date("2026-08-20T00:00:00Z")
    });
  }

  test("puts the pool at the Gameweek the rehearsal is playing", async () => {
    // The archive was observed before Gameweek 1, so every rehearsed Gameweek
    // after it needs a bootstrap that says so. `fetchFplDaily` reads the
    // Gameweek from `is_next` and nowhere else.
    await load(rehearsedBootstrap({ archived, gameweek: 4, settled: [] }));

    const pool = await client.query<{ gw: number; n: number }>(
      `select gw, count(*)::int as n
         from fpl_players where season = $1 group by gw`,
      [SEASON]
    );
    expect(pool.rows).toEqual([{ gw: 4, n: 563 }]);
  });

  test("reports the Gameweeks the rehearsal has settled", async () => {
    // Nothing in the archive is checked, so a rehearsal that means to score a
    // Gameweek must say it settled. `data_checked` is what the daily fetch
    // reads, and it is never inferred from the clock.
    const result = await load(
      rehearsedBootstrap({ archived, gameweek: 4, settled: [1, 2, 3] })
    );

    expect(result.settledGameweeks).toEqual([1, 2, 3]);
  });

  test("moves a price so a later Gameweek can be sold into", async () => {
    // Selling Price is what an Entrant receives for a player it already owns,
    // and it only differs from the purchase price when the pool has moved. A
    // rehearsal that never moved one could not exercise the rule at all.
    await load(
      rehearsedBootstrap({
        archived,
        gameweek: 4,
        settled: [],
        prices: { 55: 83 }
      })
    );

    const watkins = await client.query<{ price_tenths: number }>(
      "select price_tenths from fpl_players where season = $1 and fpl_id = 55",
      [SEASON]
    );
    expect(watkins.rows).toEqual([{ price_tenths: 83 }]);
  });
});

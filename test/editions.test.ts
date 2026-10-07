import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { readEdition, readEditionFirstLock } from "../src/editions.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";

describe("Editions", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await resetSchema(client);
  });

  test("every Competition the domain lists opens in Edition 1 at Gameweek 1", async () => {
    // Read off the domain itself, so a seventh code added by `alter domain`
    // without an Edition 1 row fails here rather than in a switcher.
    const domain = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conname = 'competition_code_check'`
    );
    const listed = [...domain.rows[0]!.definition.matchAll(/'([^']+)'/g)]
      .map(([, code]) => code!)
      .sort();

    const editions = await client.query(
      `select competition, season, edition, first_gw from editions
        order by competition`
    );
    expect(editions.rows).toEqual(listed.map((competition) => ({
      competition, season: SEASON, edition: 1, first_gw: 1
    })));
  });

  test("puts every Gameweek of a one-Edition Competition in Edition 1", async () => {
    expect(await readEdition(client, "PL", SEASON, 1))
      .toEqual({ edition: 1, firstGameweek: 1 });
    expect(await readEdition(client, "PL", SEASON, 38))
      .toEqual({ edition: 1, firstGameweek: 1 });
  });

  test("moves to Edition 2 at the Gameweek it begins", async () => {
    await client.query(
      `insert into editions (competition, season, edition, first_gw)
       values ('PD', $1, 2, 20)`,
      [SEASON]
    );

    expect(await readEdition(client, "PD", SEASON, 19))
      .toEqual({ edition: 1, firstGameweek: 1 });
    expect(await readEdition(client, "PD", SEASON, 20))
      .toEqual({ edition: 2, firstGameweek: 20 });
    expect(await readEdition(client, "PD", SEASON, 38))
      .toEqual({ edition: 2, firstGameweek: 20 });
    // Another Competition's boundary is not this one's.
    expect(await readEdition(client, "PL", SEASON, 20))
      .toEqual({ edition: 1, firstGameweek: 1 });
  });

  test("refuses a Competition the record has no Edition for", async () => {
    await expect(readEdition(client, "PL", "2027-28", 1))
      .rejects.toThrow("No PL Edition holds Gameweek 1 of Season 2027-28");
  });

  test("dates an Edition's first Lock from its first Gameweek's deadline", async () => {
    await client.query(
      `insert into editions (competition, season, edition, first_gw)
       values ('PD', $1, 2, 20)`,
      [SEASON]
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PD', $1, 1, '2026-08-14T17:30:00Z'),
              ('PD', $1, 19, '2027-01-09T12:30:00Z'),
              ('PD', $1, 20, '2027-01-16T12:30:00Z')`,
      [SEASON]
    );

    expect(await readEditionFirstLock(client, "PD", SEASON, 1))
      .toEqual(new Date("2026-08-14T17:30:00Z"));
    expect(await readEditionFirstLock(client, "PD", SEASON, 2))
      .toEqual(new Date("2027-01-16T12:30:00Z"));
  });

  test("has no first Lock while its first Gameweek is not fetched yet", async () => {
    await client.query(
      `insert into editions (competition, season, edition, first_gw)
       values ('PD', $1, 2, 20)`,
      [SEASON]
    );
    await client.query(
      `insert into gameweeks (competition, season, gw, deadline_at)
       values ('PD', $1, 19, '2027-01-09T12:30:00Z')`,
      [SEASON]
    );

    expect(await readEditionFirstLock(client, "PD", SEASON, 2)).toBeNull();
  });

  test("refuses an Edition the record does not hold", async () => {
    await expect(readEditionFirstLock(client, "PD", SEASON, 2))
      .rejects.toThrow("The record holds no PD Edition 2 for Season 2026-27");
  });

  test("refuses a first Edition that begins after Gameweek 1", async () => {
    await expect(client.query(
      `insert into editions (competition, season, edition, first_gw)
       values ('PL', '2027-28', 1, 5)`
    )).rejects.toMatchObject({ code: "23514" });
  });
});

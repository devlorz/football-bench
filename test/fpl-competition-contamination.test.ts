import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { loadLockedGameweek } from "../src/fpl/fpl-gameweek-context.js";
import { carriedThroughSilence } from "../src/fpl/open-fpl-gameweek.js";
import { openingManagerState } from "../src/fpl/apply-gameweek-action.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
// Six days apart, and the earlier one belongs to the league the FPL track does
// not play. A Lock read from the wrong row is a deadline already past.
const PL_DEADLINE = "2026-08-21T17:30:00Z";
const PD_DEADLINE = "2026-08-15T17:00:00Z";

/**
 * Two Competitions in `gameweeks` and `fixtures`, the two tables the FPL
 * track's Lock reads and whose rows stopped being unique per Gameweek when
 * ADR-0035 put `competition` in their keys.
 *
 * Every one of these reads passed its own suite before the filters existed,
 * and passed after: the seeded Season carries `PL` alone, so no test in the
 * repository could tell a filtered read from an unfiltered one. The bug
 * surfaced by running the context preview against production, where La Liga
 * had been seated beside the Premier League since spec 0016 — six La Liga
 * Fixtures rendered into an FPL Entrant's own calendar, above clubs its pool
 * does not contain.
 *
 * So the fixture here is deliberately the shape production has and the seed
 * does not: both leagues, same Season, same Gameweek numbers, different
 * deadlines. **The Gameweek numbers must collide** — FPL numbers its own
 * Gameweeks from 1 and so does every other Competition, which is exactly why
 * `season` and `gw` cannot identify a row. Give the two leagues different
 * Gameweek numbers and every assertion below passes without a filter.
 */
describe("the FPL track reads one Competition's calendar", () => {
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
      "truncate competitions, gameweeks, fixtures, fpl_players restart identity cascade"
    );
    for (const [competition, deadline] of [
      ["PL", PL_DEADLINE],
      ["PD", PD_DEADLINE]
    ]) {
      await client.query(
        "insert into competitions (competition, season) values ($1, $2)",
        [competition, SEASON]
      );
      // Three Gameweeks each, numbered the same in both: the collision is the
      // point.
      for (const gw of [1, 2, 3]) {
        await client.query(
          `insert into gameweeks (competition, season, gw, deadline_at)
           values ($1, $2, $3, $4::timestamptz + make_interval(weeks => $3 - 1))`,
          [competition, SEASON, gw, deadline]
        );
      }
    }
    // One Fixture per league in Gameweek 1, named so a leak is unmistakable.
    await client.query(
      `insert into fixtures (
         competition, season, fixture_id, gw, home_team, away_team, kickoff_at
       ) values
         ('PL', $1, 1, 1, 'Arsenal', 'Chelsea', $2),
         ('PD', $1, 2, 1, 'Real Madrid', 'Barcelona', $3)`,
      [SEASON, PL_DEADLINE, PD_DEADLINE]
    );
  });

  test("locks on the Premier League's deadline, not the earlier league's",
    async () => {
      const locked = await loadLockedGameweek(client, SEASON, 1);

      // Unfiltered this took whichever row Postgres returned first, and the
      // Spanish one is six days earlier — a Gameweek that would refuse every
      // action as past its deadline.
      expect(locked.deadline.toISOString()).toBe("2026-08-21T17:30:00.000Z");
    });

  test("shows the Entrant its own league's Fixtures and no others", async () => {
    const locked = await loadLockedGameweek(client, SEASON, 1);
    const clubs = locked.schedule.flatMap(
      ({ homeClub, awayClub }) => [homeClub, awayClub]
    );

    expect(clubs).toEqual(["Arsenal", "Chelsea"]);
    // Stated as its own assertion: the failure this guards is a foreign club
    // reaching a Squad's calendar, and a length check would pass on a schedule
    // holding one Spanish Fixture and no English one.
    expect(clubs).not.toContain("Real Madrid");
  });

  test("counts a silence in its own league's Gameweeks alone", async () => {
    const standing = {
      entrantId: "fpl/tracer",
      season: SEASON,
      gameweek: 1,
      state: openingManagerState()
    };

    // One Gameweek stands between 1 and 3, so one Roll Over is folded. Counted
    // across both leagues it is two, and an Entrant returning after a silence
    // would carry a Manager State aged twice as far as the Season went.
    const carried = await carriedThroughSilence(client, SEASON, standing, 3);

    expect(carried.freeTransfers)
      .toBe(openingManagerState().freeTransfers + 1);
  });
});

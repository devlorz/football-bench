import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  buildMatchContext,
  loadMatchContextData,
  type MatchContextData
} from "../src/predictions/build-match-context.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const DEADLINE = "2026-08-21T17:30:00Z";
const EARLIER = "2026-08-07T19:00:00Z";
const LATER = "2026-08-14T19:00:00Z";

const FPL_SECTION = "FPL-derived player context";
const HISTORICAL_SECTION = "Historical context as of";

/**
 * Two leagues in `historical_matches` and `understat_match_xg`, the two tables
 * whose reads were bounded by date and Season alone until ADR-0037.
 *
 * Both leagues' rows are seeded under one `division`, and both name English
 * clubs. Neither is an oversight. A division belongs to one Competition by
 * convention and would separate these rows on its own, so a test leaning on it
 * would pass against a filter that does not exist; and the Understat identity
 * map holds Premier League clubs until ticket 6 curates the Spanish one, so
 * Spanish spellings would make every xG assertion below pass by failing to
 * join. Only `competition` can be doing the work here.
 */
describe("a context packet holds one Competition's data", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  const xgOf = (
    data: MatchContextData,
    homeTeam: string
  ): number | null | undefined =>
    data.historicalMatches.find((match) => match.home_team === homeTeam)
      ?.home_xg;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      `truncate
         competitions, gameweeks, fixtures, historical_matches,
         understat_match_xg, fpl_players
       restart identity cascade`
    );
    for (const competition of ["PL", "PD"]) {
      await client.query(
        "insert into competitions (competition, season) values ($1, $2)",
        [competition, SEASON]
      );
      await client.query(
        `insert into gameweeks (competition, season, gw, deadline_at)
         values ($1, $2, 1, $3)`,
        [competition, SEASON, DEADLINE]
      );
    }
    // Two results each: the first of a pair is the one whose only xG row
    // belongs to the other Competition, the second is the one whose xG row is
    // its own.
    await client.query(
      `insert into historical_matches (
         competition, season, division, played_on, home_team, away_team,
         home_goals, away_goals
       ) values
         ('PL', $1, 'Premier League', $2, 'Arsenal', 'Chelsea', 2, 1),
         ('PL', $1, 'Premier League', $3, 'Liverpool', 'Everton', 1, 1),
         ('PD', $1, 'Premier League', $2, 'Brighton', 'Burnley', 0, 3),
         ('PD', $1, 'Premier League', $3, 'Fulham', 'Sunderland', 2, 0)`,
      [SEASON, EARLIER, LATER]
    );
    // Each contaminant names the *other* Competition's clubs: an unfiltered
    // read does not merely return a foreign row, it puts a foreign xG on a
    // form line that renders. The two 9.9s can only ever arrive that way.
    await client.query(
      `insert into understat_match_xg (
         competition, season, understat_match_id, kicked_off_at,
         home_team, away_team, home_xg, away_xg
       ) values
         ('PD', $1, 'pd-contaminant', $2, 'Arsenal', 'Chelsea', 9.9, 9.9),
         ('PL', $1, 'pl-own', $3, 'Liverpool', 'Everton', 1.5, 0.5),
         ('PL', $1, 'pl-contaminant', $2, 'Brighton', 'Burnley', 9.9, 9.9),
         ('PD', $1, 'pd-own', $3, 'Fulham', 'Sunderland', 2.5, 1.5)`,
      [SEASON, EARLIER, LATER]
    );
  });

  test("each Competition reads only its own history, both directions",
    async () => {
      const premierLeague = await loadMatchContextData(
        client, "PL", SEASON, 1
      );
      const laLiga = await loadMatchContextData(client, "PD", SEASON, 1);

      expect(premierLeague.historicalMatches.map((match) => match.home_team))
        .toEqual(["Arsenal", "Liverpool"]);
      expect(laLiga.historicalMatches.map((match) => match.home_team))
        .toEqual(["Brighton", "Fulham"]);
    });

  test("xG from another Competition never reaches a form line", async () => {
    const premierLeague = await loadMatchContextData(client, "PL", SEASON, 1);
    const laLiga = await loadMatchContextData(client, "PD", SEASON, 1);

    // The Competition's own xG lands, which is what makes the two absences
    // below mean something: without it this test would also pass against a
    // join that had stopped joining at all.
    expect(xgOf(premierLeague, "Liverpool")).toBe(1.5);
    expect(xgOf(laLiga, "Fulham")).toBe(2.5);

    expect(xgOf(premierLeague, "Arsenal")).toBeUndefined();
    expect(xgOf(laLiga, "Brighton")).toBeUndefined();
  });

  test("a non-PL packet renders its history and no availability section",
    async () => {
      // Absent, not empty (ADR-0037): the empty FPL section reads "no player
      // snapshot loaded for this Gameweek", which in a league that has no
      // availability source at all would apologise for a Gap that is not one.
      // The historical section is the other half of the same claim -- every v2
      // section whose data is present still renders.
      const fixture = {
        fixture_id: 1,
        home_team: "Brighton",
        away_team: "Burnley",
        kickoff_at: new Date("2026-08-21T19:00:00Z")
      };
      const laLiga = buildMatchContext(
        fixture, await loadMatchContextData(client, "PD", SEASON, 1)
      );
      const premierLeague = buildMatchContext(
        fixture, await loadMatchContextData(client, "PL", SEASON, 1)
      );

      expect(laLiga).toContain(HISTORICAL_SECTION);
      expect(laLiga).toContain("Brighton");
      expect(laLiga).not.toContain(FPL_SECTION);
      expect(premierLeague).toContain(FPL_SECTION);

      // The table is the one section that needs division names, and `PD` has
      // none until ticket 6 curates them. It says which it is rather than
      // rendering under the Premier League's -- the failure that would look
      // like a working La Liga packet.
      expect(laLiga).toContain(
        "League table: unavailable; no division history is stored for this "
        + "Competition."
      );
      expect(premierLeague).toContain("Premier League table");
    });
});

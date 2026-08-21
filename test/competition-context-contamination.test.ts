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
 * Four leagues in `historical_matches` and `understat_match_xg`, the two tables
 * whose reads were bounded by date and Season alone until ADR-0037.
 *
 * Every league's rows are seeded under one `division`, which is not an
 * oversight: a division belongs to one Competition by convention and would
 * separate these rows on its own, so a test leaning on it would pass against a
 * filter that does not exist.
 *
 * Each league does now name its own clubs, where every one named English ones
 * until ticket 6. That changed with the Understat alias map, which is keyed by
 * Competition — a Spanish club resolves under `PD` and nowhere else. The
 * construction that keeps `competition` the only thing under test survives it,
 * and is worth stating because it is easy to undo: **each contaminant names the
 * clubs of the Competition it is trying to reach**, in that Competition's own
 * Understat spelling. So a contaminant is resolvable by the very packet it
 * would poison, the alias map cannot be what stops it, and only the
 * `competition` filter can. Give a contaminant its own league's names instead
 * and every assertion below passes for the wrong reason.
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
    for (const competition of ["PL", "PD", "SA", "FL1"]) {
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
         ('PD', $1, 'Premier League', $2, 'Vallecano', 'Espanol', 0, 3),
         ('PD', $1, 'Premier League', $3, 'Betis', 'Getafe', 2, 0),
         ('SA', $1, 'Premier League', $2, 'Roma', 'Lazio', 1, 0),
         ('SA', $1, 'Premier League', $3, 'Milan', 'Inter', 3, 2),
         ('FL1', $1, 'Premier League', $2, 'Paris SG', 'Paris FC', 2, 0),
         ('FL1', $1, 'Premier League', $3, 'Lille', 'Lens', 1, 1)`,
      [SEASON, EARLIER, LATER]
    );
    // Each contaminant is stored under one Competition and names the *other*
    // one's clubs, in that other one's Understat spelling: an unfiltered read
    // does not merely return a foreign row, it resolves under the reading
    // packet's own alias map and puts a foreign xG on a form line that renders.
    // The two 9.9s can only ever arrive that way, and only past `competition`.
    //
    // A contaminant must also carry the *date* of the Match it is aiming at,
    // because the join is keyed by date as well as by both names. This is easy
    // to get wrong and silent when it is: `fl1-contaminant-sa` first named
    // Serie A's `AC Milan`/`Inter`, whose stored result is the LATER of that
    // league's two, while carrying EARLIER. It could not have joined even with
    // the `competition` filter deleted, so the FL1-to-SA direction read as
    // covered and was inert. **Found by review.** Every contaminant therefore
    // aims at its target's EARLIER result -- the one whose only xG belongs to
    // somebody else -- and carries EARLIER to match.
    await client.query(
      `insert into understat_match_xg (
         competition, season, understat_match_id, kicked_off_at,
         home_team, away_team, home_xg, away_xg
       ) values
         ('PD', $1, 'pd-contaminant', $2, 'Arsenal', 'Chelsea', 9.9, 9.9),
         ('PL', $1, 'pl-own', $3, 'Liverpool', 'Everton', 1.5, 0.5),
         ('PL', $1, 'pl-contaminant', $2, 'Rayo Vallecano', 'Espanyol', 9.9, 9.9),
         ('PD', $1, 'pd-own', $3, 'Real Betis', 'Getafe', 2.5, 1.5),
         ('PD', $1, 'pd-contaminant-sa', $2, 'Roma', 'Lazio', 9.9, 9.9),
         ('SA', $1, 'sa-contaminant-pl', $2, 'Arsenal', 'Chelsea', 9.9, 9.9),
         ('SA', $1, 'sa-own', $3, 'AC Milan', 'Inter', 2.2, 1.1),
         ('SA', $1, 'sa-contaminant-fl1', $2, 'Paris Saint Germain', 'Paris FC',
          9.9, 9.9),
         ('FL1', $1, 'fl1-contaminant-sa', $2, 'Roma', 'Lazio', 9.9, 9.9),
         ('FL1', $1, 'fl1-own', $3, 'Lille', 'Lens', 3.3, 0.4)`,
      [SEASON, EARLIER, LATER]
    );
  });

  test("each Competition reads only its own history, both directions",
    async () => {
      const premierLeague = await loadMatchContextData(
        client, "PL", SEASON, 1
      );
      const laLiga = await loadMatchContextData(client, "PD", SEASON, 1);
      const serieA = await loadMatchContextData(client, "SA", SEASON, 1);
      const ligue1 = await loadMatchContextData(client, "FL1", SEASON, 1);

      expect(premierLeague.historicalMatches.map((match) => match.home_team))
        .toEqual(["Arsenal", "Liverpool"]);
      expect(laLiga.historicalMatches.map((match) => match.home_team))
        .toEqual(["Vallecano", "Betis"]);
      expect(serieA.historicalMatches.map((match) => match.home_team))
        .toEqual(["Roma", "Milan"]);
      expect(ligue1.historicalMatches.map((match) => match.home_team))
        .toEqual(["Paris SG", "Lille"]);
    });

  test("xG from another Competition never reaches a form line", async () => {
    const premierLeague = await loadMatchContextData(client, "PL", SEASON, 1);
    const laLiga = await loadMatchContextData(client, "PD", SEASON, 1);
    const serieA = await loadMatchContextData(client, "SA", SEASON, 1);
    const ligue1 = await loadMatchContextData(client, "FL1", SEASON, 1);

    // The Competition's own xG lands, which is what makes the two absences
    // below mean something: without it this test would also pass against a
    // join that had stopped joining at all.
    expect(xgOf(premierLeague, "Liverpool")).toBe(1.5);
    expect(xgOf(laLiga, "Betis")).toBe(2.5);
    expect(xgOf(serieA, "Milan")).toBe(2.2);
    expect(xgOf(ligue1, "Lille")).toBe(3.3);

    expect(xgOf(premierLeague, "Arsenal")).toBeUndefined();
    expect(xgOf(laLiga, "Vallecano")).toBeUndefined();
    // Two Competitions hold a contaminant aimed at this one form line, `PD`'s
    // and `FL1`'s, so the assertion cannot say which it caught. That each is
    // live on its own was mutation-checked by deleting the other and relaxing
    // the `competition` filter, which is red both ways round.
    expect(xgOf(serieA, "Roma")).toBeUndefined();
    // Ligue 1's own contaminant is Serie A's, and Serie A holds one of Ligue
    // 1's: both directions of the pair this ticket adds, not just the new
    // league reading clean.
    expect(xgOf(ligue1, "Paris SG")).toBeUndefined();
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
        home_team: "Vallecano",
        away_team: "Espanol",
        kickoff_at: new Date("2026-08-21T19:00:00Z")
      };
      const laLiga = buildMatchContext(
        fixture, await loadMatchContextData(client, "PD", SEASON, 1)
      );
      const premierLeague = buildMatchContext(
        fixture, await loadMatchContextData(client, "PL", SEASON, 1)
      );
      const serieA = buildMatchContext(
        fixture, await loadMatchContextData(client, "SA", SEASON, 1)
      );
      const ligue1 = buildMatchContext(
        fixture, await loadMatchContextData(client, "FL1", SEASON, 1)
      );

      expect(laLiga).toContain(HISTORICAL_SECTION);
      expect(laLiga).toContain("Vallecano");
      expect(laLiga).not.toContain(FPL_SECTION);
      expect(premierLeague).toContain(FPL_SECTION);

      // The table is the one section that needs division names, and ticket 6
      // curated `PD`'s. It is now headed by La Liga's own top flight, and --
      // because every row in this fixture is seeded under the `division`
      // 'Premier League' on purpose (see the docblock) -- it holds none of
      // them. Both halves matter: a table headed "Premier League" in a
      // Spanish packet, and a Spanish table that had swallowed the English
      // division's rows, are the two failures that would each look like a
      // working La Liga packet.
      expect(laLiga).toContain(
        "La Liga table: no result has been played yet this Season."
      );
      expect(laLiga).not.toContain("Premier League table");
      expect(premierLeague).toContain("Premier League table");

      // The third league says the same thing about the other two: a packet
      // headed by somebody else's division is the failure that would still
      // look like a working Serie A packet.
      expect(serieA).toContain(
        "Serie A table: no result has been played yet this Season."
      );
      expect(serieA).not.toContain("La Liga table");
      expect(serieA).not.toContain("Premier League table");

      // And the fourth about the three before it. Ligue 1's eighteen make no
      // difference here -- what is under test is the `competition` filter, and
      // a table headed `Serie A` in a French packet is the same failure.
      expect(ligue1).toContain(
        "Ligue 1 table: no result has been played yet this Season."
      );
      expect(ligue1).not.toContain("Serie A table");
      expect(ligue1).not.toContain("Premier League table");
    });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  fetchFootballDataOrgCompetition,
  FootballDataOrgHttpError,
  FootballDataOrgValidationError,
  KickoffInsideDeadlineError,
  MissingFootballDataOrgTokenError,
  parseFootballDataOrgMatches,
  StaleCompetitionSourceError
} from "../src/football-data-org/fetch-competition.js";
import type { HttpFetcher } from "../src/http.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const COMPETITION = "PD";
const TOKEN = "a-football-data-org-token";

/**
 * The response football-data.org actually returned for La Liga 2026-27, kept
 * as it arrived: 380 matches over 38 Gameweeks, every envelope field, and not
 * one settled result — it was fetched on the Season's opening day, which is
 * why every status reads `TIMED` or `SCHEDULED`.
 *
 * This is what answers "does the parser accept the format the API really
 * publishes", and nothing constructed can answer it. A hand-made body proves
 * the parser matches what its author believed the shape to be.
 */
const recorded = async (): Promise<string> =>
  archivedBody("football-data-org-2026-27-PD-recorded.json.gz");

/**
 * Serie A's and Ligue 1's, captured the same way and for the same reason. Each
 * entry is the whole day-one audit spec 0024 story 8 asks for, written down as
 * the numbers the response really carried: the counts, the status mix, the
 * Gameweek 1 kickoff slots and where Gameweek 2 starts. The clubs' spellings
 * in these bytes are what this expansion's identity maps are keyed by, so the
 * map tickets read their keys out of the fixture rather than out of a draft.
 *
 * Both are tabled rather than written twice because every assertion below is
 * the same assertion — only the league's published shape differs, and the
 * table is where that shape is legible side by side.
 */
const RECORDED_COMPETITIONS = [
  {
    competition: "SA",
    fixtureFile: "football-data-org-2026-27-SA-recorded.json.gz",
    matches: 380,
    gameweeks: 38,
    statuses: { TIMED: 50, SCHEDULED: 330 },
    firstMatch: {
      id: 558629,
      utcDate: "2026-08-22T16:30:00Z",
      status: "TIMED",
      matchday: 1,
      homeTeam: { name: "Udinese Calcio" },
      awayTeam: { name: "Como 1907" }
    },
    // Sorted, and the source's own spellings — legal forms and all. These are
    // the keys tickets 0036-0038 map from, so the fixture is where they are
    // pinned rather than a list in a ticket that nothing checks.
    clubs: [
      "AC Milan", "AC Monza", "ACF Fiorentina", "AS Roma", "Atalanta BC",
      "Bologna FC 1909", "Cagliari Calcio", "Como 1907",
      "FC Internazionale Milano", "Frosinone Calcio", "Genoa CFC",
      "Juventus FC", "Parma Calcio 1913", "SS Lazio", "SSC Napoli",
      "Torino FC", "US Lecce", "US Sassuolo Calcio", "Udinese Calcio",
      "Venezia FC"
    ],
    openingFixtures: 10,
    // 18:30 and 20:45 in Italy in August, which is Serie A's published pair.
    openingSlotsUtc: ["16:30", "18:45"],
    // Gameweek 1 is its own weekend and every date in it is named, so a
    // Fixture held back to late August fails whether or not it still
    // precedes Gameweek 2.
    openingDates: ["2026-08-22", "2026-08-23", "2026-08-24"],
    secondGameweekOpensAt: "2026-08-28T18:45:00Z"
  },
  {
    competition: "FL1",
    fixtureFile: "football-data-org-2026-27-FL1-recorded.json.gz",
    matches: 306,
    gameweeks: 34,
    statuses: { TIMED: 40, SCHEDULED: 266 },
    firstMatch: {
      id: 559715,
      utcDate: "2026-08-21T18:45:00Z",
      status: "TIMED",
      matchday: 1,
      homeTeam: { name: "Olympique de Marseille" },
      awayTeam: { name: "RC Strasbourg Alsace" }
    },
    clubs: [
      "AJ Auxerre", "AS Monaco FC", "Angers SCO", "ES Troyes AC", "FC Lorient",
      "Le Havre AC", "Le Mans FC", "Lille OSC", "OGC Nice",
      "Olympique Lyonnais", "Olympique de Marseille", "Paris FC",
      "Paris Saint-Germain FC", "RC Strasbourg Alsace", "Racing Club de Lens",
      "Stade Brestois 29", "Stade Rennais FC 1901", "Toulouse FC"
    ],
    openingFixtures: 9,
    // 15:00, 17:15 and 20:45 in France in August — Ligue 1's published three.
    openingSlotsUtc: ["13:00", "15:15", "18:45"],
    openingDates: ["2026-08-21", "2026-08-22", "2026-08-23"],
    secondGameweekOpensAt: "2026-08-28T18:45:00Z"
  }
] as const;

/**
 * A constructed body, and deliberately still here: it holds states the
 * recorded response does not and no recorded response could be relied on to —
 * a settled match, a settled match with its score missing, a postponed one, a
 * league that postponed everything, a kickoff brought forward inside a Lock.
 * Those are the parser's and the fetch's failure paths, and waiting for a live
 * response to happen to contain them is waiting forever.
 *
 * Its twenty clubs are **not** La Liga's twenty — it carries `Girona FC` and
 * `RCD Mallorca`, both relegated, and it names Real Sociedad by a shorter
 * string than the API does. That is harmless in this file, which never
 * resolves a club against a map, and it is why `test/daily-fetch.test.ts` uses
 * the recorded response instead: there the Squad Change club map refuses them,
 * correctly.
 */
const snapshot = async (): Promise<string> =>
  archivedBody("football-data-org-2026-27-PD.json.gz");

const MATCHES_URL =
  "https://api.football-data.org/v4/competitions/PD/matches?season=2026";

function respondingWith(
  body: string,
  status = 200
): { http: HttpFetcher; requests: { url: string; token: string | undefined }[] } {
  const requests: { url: string; token: string | undefined }[] = [];
  const http: HttpFetcher = async (url, options) => {
    requests.push({ url, token: options?.headers?.["X-Auth-Token"] });
    return { status, body };
  };
  return { http, requests };
}

describe("a Competition read from football-data.org", () => {
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
      `truncate fixtures, gameweeks, raw_snapshots, models, contexts
       restart identity cascade`
    );
  });

  /** The documented-shape body with one match's status rewritten. */
  const withStatus = async (
    id: number,
    status: string
  ): Promise<string> => {
    const body = JSON.parse(await snapshot());
    for (const match of body.matches) {
      if (match.id === id) {
        match.status = status;
      }
    }
    return JSON.stringify(body, null, 2);
  };

  const fetchAt = async (
    at: string,
    body?: string,
    status = 200
  ): Promise<{ requests: { url: string; token: string | undefined }[] }> => {
    const { http, requests } = respondingWith(body ?? await snapshot(), status);
    await fetchFootballDataOrgCompetition({
      database: client,
      competition: COMPETITION,
      season: SEASON,
      apiToken: TOKEN,
      http,
      now: () => new Date(at)
    });
    return { requests };
  };

  const gameweeks = async (): Promise<{ gw: number; deadline: string }[]> => {
    const { rows } = await client.query(
      `select gw, deadline_at from gameweeks
        where competition = $1 and season = $2 order by gw`,
      [COMPETITION, SEASON]
    );
    return rows.map(({ gw, deadline_at: deadlineAt }) => ({
      gw: gw as number,
      deadline: (deadlineAt as Date).toISOString()
    }));
  };

  test("parses the response the API really returned, all 380 of it", async () => {
    // The claim a constructed body cannot make: the schema accepts a whole
    // live Season as published, not one row in the shape its author expected.
    const matches = parseFootballDataOrgMatches("test", await recorded());

    expect(matches).toHaveLength(380);
    expect(new Set(matches.map(({ matchday }) => matchday)).size).toBe(38);
    expect(matches[0]).toMatchObject({
      id: 564634,
      utcDate: "2026-08-15T17:30:00Z",
      status: "TIMED",
      matchday: 1,
      homeTeam: { name: "Deportivo Alavés" },
      awayTeam: { name: "Getafe CF" }
    });
    // Fetched on the opening day, so nothing has settled and every score is
    // null — which is the state the Lock guard reads, and worth pinning as the
    // shape a first fetch of a Season really has.
    // Both sides, not just the home one: a response carrying a settled away
    // score beside a null home score would pass a one-sided check and read as
    // an unsettled Season.
    expect(matches.every(
      ({ score }) => score.fullTime.home === null && score.fullTime.away === null
    )).toBe(true);
  });

  test.each(RECORDED_COMPETITIONS)(
    "parses $competition's real response and passes its day-one checks",
    async (competition) => {
      const body = await archivedBody(competition.fixtureFile);
      const matches = parseFootballDataOrgMatches("test", body);

      expect(matches).toHaveLength(competition.matches);
      expect(new Set(matches.map(({ matchday }) => matchday)).size)
        .toBe(competition.gameweeks);
      expect(matches[0]).toMatchObject(competition.firstMatch);

      // No `matchday` is null and no status is withdrawn, so neither the
      // ADR-0024 null path nor `WITHDRAWN_STATUSES` is exercised here — which
      // is the check, not an omission from it.
      const statuses: Record<string, number> = {};
      for (const { status } of matches) {
        statuses[status] = (statuses[status] ?? 0) + 1;
      }
      expect(statuses).toEqual(competition.statuses);
      expect(matches.every(({ matchday }) => matchday !== null)).toBe(true);

      // Captured before either Season opened, so nothing has settled: the
      // state the Lock guard reads on a first fetch. Both sides, because a
      // response carrying one of them would be a shape neither the parser nor
      // `settledResult` has ever seen.
      expect(matches.flatMap(({ score }) =>
        [score.fullTime.home, score.fullTime.away])).toEqual(
        Array.from({ length: competition.matches * 2 }, () => null));
      // The envelope agrees with the matches, which is the source's own
      // statement that this is a Season that has not started.
      const envelope: { resultSet: { count: number; played: number } } =
        JSON.parse(body);
      expect(envelope.resultSet).toMatchObject({
        count: competition.matches,
        played: 0
      });

      // The spellings the identity maps of tickets 0036-0038 are keyed by, in
      // full rather than counted: a count catches a club that vanished and
      // nothing catches one that is misspelt, and a misspelt key is the
      // failure mode those maps have no alarm for.
      expect([...new Set(matches.flatMap(({ homeTeam, awayTeam }) =>
        [homeTeam.name, awayTeam.name]))].sort())
        .toEqual([...competition.clubs]);

      const opening = matches
        .filter(({ matchday }) => matchday === 1)
        .map(({ utcDate }) => utcDate)
        .sort();
      expect(opening).toHaveLength(competition.openingFixtures);
      // Timezone-sound: every opening kickoff lands on one of the league's
      // published slots and no third value appears. A response an hour out
      // would still parse and would fail here.
      expect([...new Set(opening.map((utcDate) => utcDate.slice(11, 16)))].sort())
        .toEqual([...competition.openingSlotsUtc]);

      // No deferred opening Fixture, which La Liga's first response had four
      // of: every Gameweek 1 kickoff precedes Gameweek 2's earliest, so
      // Gameweek 1 is its own weekend and `deriveDeadline` has the ordinary
      // case. A Fixture held back to late August would sort past this.
      expect([...new Set(opening.map((utcDate) => utcDate.slice(0, 10)))].sort())
        .toEqual([...competition.openingDates]);

      const secondGameweekOpensAt = matches
        .filter(({ matchday }) => matchday === 2)
        .map(({ utcDate }) => utcDate)
        .sort()[0];
      expect(secondGameweekOpensAt).toBe(competition.secondGameweekOpensAt);
    }
  );

  test("parses the documented-shape fixture, envelope fields and all", async () => {
    const matches = parseFootballDataOrgMatches("test", await snapshot());

    expect(matches).toHaveLength(9);
    expect(matches[0]).toMatchObject({
      id: 550001,
      utcDate: "2026-08-15T17:00:00Z",
      status: "FINISHED",
      matchday: 1,
      homeTeam: { name: "Girona FC" },
      awayTeam: { name: "Villarreal CF" }
    });
    expect(matches[0]?.score.fullTime).toEqual({ home: 2, away: 1 });
  });

  test("refuses a settled match with no score", async () => {
    const body = (await snapshot())
      .replace(/"home": 2,\n(\s*)"away": 1/, '"home": null,\n$1"away": null');

    expect(() => parseFootballDataOrgMatches("test", body))
      .toThrow(FootballDataOrgValidationError);
    expect(() => parseFootballDataOrgMatches("test", body))
      .toThrow("FINISHED match 550001 has no home score");
  });

  test("refuses a body that is not the documented shape", () => {
    expect(() => parseFootballDataOrgMatches("test", "<html>429</html>"))
      .toThrow("test.$: invalid JSON");
    expect(() => parseFootballDataOrgMatches("test", '{"matches": [{}]}'))
      .toThrow(FootballDataOrgValidationError);
  });

  test("writes the Gameweeks, their derived deadlines and the Fixtures",
    async () => {
      const { requests } = await fetchAt("2026-08-10T06:00:00Z");

      expect(requests).toEqual([{ url: MATCHES_URL, token: TOKEN }]);
      // Ninety minutes before each Gameweek's earliest kickoff — the three
      // Fixtures held back to late August are matchday 1 all the same and do
      // not move it.
      expect(await gameweeks()).toEqual([
        { gw: 1, deadline: "2026-08-15T15:30:00.000Z" },
        { gw: 2, deadline: "2026-08-22T15:30:00.000Z" }
      ]);

      const { rows } = await client.query(
        `select fixture_id, gw, locked_in_gw, home_team, away_team,
                kickoff_at, result, deferred, unscheduled
           from fixtures where competition = $1 and season = $2
          order by fixture_id`,
        [COMPETITION, SEASON]
      );
      // The postponed Fixture is off the calendar entirely: never Locked, so
      // it holds nothing the feed cannot rebuild (ADR-0024).
      expect(rows.map(({ fixture_id: id }) => id))
        .toEqual([
          550001, 550002, 550003, 550004, 550005, 550006, 550011, 550012
        ]);
      expect(rows[0]).toMatchObject({
        gw: 1,
        locked_in_gw: null,
        home_team: "Girona FC",
        away_team: "Villarreal CF",
        deferred: false,
        unscheduled: false,
        result: { home_goals: 2, away_goals: 1, outcome: "H" }
      });
      expect((rows[0]?.kickoff_at as Date).toISOString())
        .toBe("2026-08-15T17:00:00.000Z");
      // A Fixture still to be played carries no result to be scored against.
      expect(rows[3]).toMatchObject({ fixture_id: 550004, result: null });
    });

  test("archives the response under its own source name", async () => {
    await fetchAt("2026-08-10T06:00:00Z");

    const { rows } = await client.query(
      "select source, body from raw_snapshots"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("football_data_org:2026-27:PD");
    expect(rows[0]?.body).toBe(await snapshot());
  });

  test("recomputes an open Gameweek's deadline and freezes a Locked one",
    async () => {
      await fetchAt("2026-08-10T06:00:00Z");

      // Kickoffs move: matchday 1's earliest is brought forward inside a
      // window still open, matchday 2's is pushed back.
      const moved = (await snapshot())
        .replace('"2026-08-15T17:00:00Z"', '"2026-08-15T16:00:00Z"')
        .replace('"2026-08-22T17:00:00Z"', '"2026-08-22T20:00:00Z"');
      await fetchAt("2026-08-12T06:00:00Z", moved);

      expect(await gameweeks()).toEqual([
        { gw: 1, deadline: "2026-08-15T14:30:00.000Z" },
        { gw: 2, deadline: "2026-08-22T18:00:00.000Z" }
      ]);

      // Past matchday 1's deadline, it is a stored fact. Matchday 2 is still
      // following the schedule.
      await fetchAt("2026-08-16T06:00:00Z", await snapshot());
      expect(await gameweeks()).toEqual([
        { gw: 1, deadline: "2026-08-15T14:30:00.000Z" },
        { gw: 2, deadline: "2026-08-22T15:30:00.000Z" }
      ]);
    });

  test("alerts and writes nothing when a kickoff lands inside the Lock",
    async () => {
      await fetchAt("2026-08-10T06:00:00Z");
      const before = await gameweeks();

      // Matchday 2 is Locked, and only then does a Fixture appear inside the
      // deadline the Entrants committed at.
      await fetchAt("2026-08-22T16:00:00Z");
      const broughtForward = (await snapshot())
        .replace('"2026-08-22T17:00:00Z"', '"2026-08-22T14:00:00Z"');

      await expect(fetchAt("2026-08-22T18:00:00Z", broughtForward))
        .rejects.toThrow(KickoffInsideDeadlineError);
      await expect(fetchAt("2026-08-22T18:00:00Z", broughtForward))
        .rejects.toThrow(/Gameweek 2 has a kickoff at 2026-08-22T14:00/);

      expect(await gameweeks()).toEqual(before);
      const { rows } = await client.query(
        "select kickoff_at from fixtures where fixture_id = 550011"
      );
      expect((rows[0]?.kickoff_at as Date).toISOString())
        .toBe("2026-08-22T17:00:00.000Z");
    });

  test("fails loudly when the source produces no Fixture", async () => {
    await expect(fetchAt("2026-08-10T06:00:00Z", '{"matches": []}'))
      .rejects.toThrow(StaleCompetitionSourceError);
    // Still archived: an empty response is the evidence for the alert.
    const { rows } = await client.query("select count(*) from raw_snapshots");
    expect(Number(rows[0]?.count)).toBe(1);
  });

  test("a league that postponed everything is not a stale source", async () => {
    const body = JSON.parse(await snapshot());
    for (const match of body.matches) {
      match.status = "POSTPONED";
    }

    // The source is working perfectly and the league is in chaos. Sending the
    // operator to check their Competition code and their token would send them
    // after a fault that is not theirs.
    await fetchAt("2026-08-10T06:00:00Z", JSON.stringify(body));

    expect(await gameweeks()).toEqual([]);
    const { rows } = await client.query("select count(*)::int from fixtures");
    expect(rows[0]?.count).toBe(0);
  });

  test("fails loudly on an unusable response, archiving it first", async () => {
    await expect(
      fetchAt("2026-08-10T06:00:00Z", "Your API token is invalid.", 403)
    ).rejects.toThrow(FootballDataOrgHttpError);

    const { rows } = await client.query("select body from raw_snapshots");
    expect(rows[0]?.body).toBe("Your API token is invalid.");
    expect(await gameweeks()).toEqual([]);
  });

  test("says so when the token it needs is absent", async () => {
    const { http } = respondingWith(await snapshot());

    await expect(fetchFootballDataOrgCompetition({
      database: client,
      competition: COMPETITION,
      season: SEASON,
      apiToken: null,
      http,
      now: () => new Date("2026-08-10T06:00:00Z")
    })).rejects.toThrow(MissingFootballDataOrgTokenError);
  });

  test("a Locked Fixture withdrawn from the schedule keeps its Prediction",
    async () => {
      await fetchAt("2026-08-10T06:00:00Z");
      // The Lock the predict path performs (`assignCanonicalLock`), and the
      // Prediction it was performed for. This is the state ADR-0013 is about:
      // the Entrants have already committed.
      await client.query(
        `insert into models (
           id, name, base_model, provider, prompt_version, role
         ) values (
           'entrant/v1', 'Entrant', 'provider/model', 'provider',
           'match/2026-27-v1', 'entrant'
         );
         insert into contexts (
           competition, season, gw, track, fixture_id, hash, body
         ) values ('PD', '2026-27', 2, 'match', 550011, 'hash', 'context');
         update fixtures set locked_in_gw = 2
          where competition = 'PD' and season = '2026-27'
            and fixture_id = 550011;
         insert into predictions (
           model_id, competition, season, fixture_id, probs, pred_home,
           pred_away, context_id, attempts_used, predicted_at
         )
         select
           'entrant/v1', 'PD', '2026-27', 550011,
           '{"H":0.5,"D":0.3,"A":0.2}', 2, 1, id, 0, '2026-08-22T15:00:00Z'
         from contexts
         where competition = 'PD' and season = '2026-27' and fixture_id = 550011`
      );

      const withdrawn = await withStatus(550011, "POSTPONED");
      const fixture = async (): Promise<Record<string, unknown>> => {
        const { rows } = await client.query(
          `select gw, locked_in_gw, deferred, unscheduled,
                  (select count(*)::int from predictions p
                    where p.competition = f.competition
                      and p.season = f.season
                      and p.fixture_id = f.fixture_id) as predictions
             from fixtures f
            where competition = 'PD' and season = '2026-27'
              and fixture_id = 550011`
        );
        return rows[0] as Record<string, unknown>;
      };

      await fetchAt("2026-08-23T06:00:00Z", withdrawn);
      // Kept, not deleted: only a never-Locked Fixture is one the feed can
      // rebuild (ADR-0024). It leaves the live calendar and its Prediction
      // stays scoreable in the Gameweek it was Locked in (ADR-0013, ADR-0015).
      expect(await fixture()).toEqual({
        gw: 2,
        locked_in_gw: 2,
        deferred: true,
        unscheduled: true,
        predictions: 1
      });

      // Observing the same withdrawal again touches nothing.
      await fetchAt("2026-08-23T07:00:00Z", withdrawn);
      expect(await fixture()).toEqual({
        gw: 2,
        locked_in_gw: 2,
        deferred: true,
        unscheduled: true,
        predictions: 1
      });

      // Back on the schedule: `unscheduled` reports the live calendar and
      // clears, `deferred` records history and does not.
      await fetchAt("2026-08-23T08:00:00Z");
      expect(await fixture()).toEqual({
        gw: 2,
        locked_in_gw: 2,
        deferred: true,
        unscheduled: false,
        predictions: 1
      });
    });

  test("adopted mid-Season, splits played Fixtures from unplayed ones",
    async () => {
      // The whole schedule arrives for the first time on 18 August, with
      // matchday 1 Locked on sight. Its Fixtures divide in two, and the
      // division is the result rather than the Gameweek: 550001–550003 were
      // played on the 15th and 16th, 550004–550006 are the three held back to
      // the 25th, 26th and 27th and are still to come.
      await fetchAt("2026-08-18T06:00:00Z");

      const { rows } = await client.query(
        `select fixture_id, locked_in_gw, result is not null as played
           from fixtures
          where competition = $1 and season = $2 and gw = 1
          order by fixture_id`,
        [COMPETITION, SEASON]
      );

      expect(rows).toEqual([
        // Played before the record ever saw them. `locked_in_gw` stays null,
        // which leaves them under their own Locked Gameweek 1: history the
        // context can read, and work no prediction run will ever pick up.
        // The predict path selects on `coalesce(locked_in_gw, gw)` and asks
        // nothing about the result, so a `locked_in_gw` of 2 here would have
        // put three Fixtures with published scores in front of the Entrants.
        { fixture_id: 550001, locked_in_gw: null, played: true },
        { fixture_id: 550002, locked_in_gw: null, played: true },
        { fixture_id: 550003, locked_in_gw: null, played: true },
        // Still to be played, and their own Gameweek's Lock has passed, so
        // they join the next open one (ADR-0015).
        { fixture_id: 550004, locked_in_gw: 2, played: false },
        { fixture_id: 550005, locked_in_gw: 2, played: false },
        { fixture_id: 550006, locked_in_gw: 2, played: false }
      ]);
    });

  test("refuses a Gameweek to a Fixture that kicked off before its Lock",
    async () => {
      // The recorded first response, whose matchday 1 the API still called
      // `TIMED` hours after all ten had kicked off — the source posts results
      // when it posts them, and this is what it actually returned. A test that
      // asked only whether a result was stored would let all ten into
      // Gameweek 2, and six of them kicked off before Gameweek 2's Lock.
      //
      // The test is the kick-off, because that is the promise: a Prediction
      // precedes its Fixture. Whether the score has been published yet is the
      // source's business and changes nothing about what may still be asked.
      await fetchAt("2026-08-16T06:00:00Z", await recorded());

      const [open] = (await client.query<{ gw: number; deadline_at: Date }>(
        `select gw, deadline_at from gameweeks
          where competition = $1 and season = $2 and deadline_at > $3
          order by deadline_at limit 1`,
        [COMPETITION, SEASON, new Date("2026-08-16T06:00:00Z")]
      )).rows;
      expect(open?.gw).toBe(2);

      const { rows } = await client.query<{ count: string }>(
        `select count(*) as count from fixtures
          where competition = $1 and season = $2
            and coalesce(locked_in_gw, gw) = $3
            and kickoff_at <= $4`,
        [COMPETITION, SEASON, open?.gw, open?.deadline_at]
      );
      expect(rows[0]?.count).toBe("0");
    });
});
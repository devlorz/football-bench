import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  fetchUnderstatSeasonXg,
  UnderstatSourceHttpError,
  UnderstatSourceValidationError
} from "../src/understat/fetch-season-xg.js";

const { Client } = pg;

const LEAGUE_DATA_URL = "https://understat.com/getLeagueData/EPL/2026";

interface CannedMatch {
  id: string;
  datetime: string;
  home: string;
  away: string;
  xg?: [string, string];
}

/**
 * Understat's internal endpoint returns finished and upcoming matches
 * together, xG as strings, and no timezone on the kick-off.
 */
function leagueBody(matches: CannedMatch[]): string {
  return JSON.stringify({
    dates: matches.map(({ id, datetime, home, away, xg }) => ({
      id,
      datetime,
      h: { id: "1", title: home, short_title: home.slice(0, 3).toUpperCase() },
      a: { id: "2", title: away, short_title: away.slice(0, 3).toUpperCase() },
      ...(xg === undefined
        ? { isResult: false }
        : { xG: { h: xg[0], a: xg[1] }, isResult: true })
    })),
    teams: {},
    players: {}
  });
}

describe("fetching Understat per-match xG", () => {
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
      "truncate understat_match_xg, raw_snapshots restart identity cascade"
    );
  });

  test("stores xG for finished matches and skips those not yet played", async () => {
    const body = leagueBody([
      {
        id: "29001",
        datetime: "2026-08-15 11:30:00",
        home: "Liverpool",
        away: "Bournemouth",
        xg: ["2.31", "0.78"]
      },
      {
        id: "29002",
        datetime: "2026-08-15 14:00:00",
        home: "Manchester City",
        away: "Nottingham Forest",
        xg: ["1.07", "1.40"]
      },
      {
        // Not yet played: Understat sends no xG field at all.
        id: "29003",
        datetime: "2026-08-22 14:00:00",
        home: "Arsenal",
        away: "Coventry"
      }
    ]);

    await fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async (url) => url === LEAGUE_DATA_URL
        ? { status: 200, body }
        : { status: 404, body: "" }
    });

    const stored = await client.query(
      `select season, understat_match_id, kicked_off_at,
              home_team, away_team, home_xg, away_xg
         from understat_match_xg
        order by understat_match_id`
    );
    expect(stored.rows).toEqual([
      {
        season: "2026-27",
        understat_match_id: "29001",
        kicked_off_at: new Date("2026-08-15T11:30:00.000Z"),
        home_team: "Liverpool",
        away_team: "Bournemouth",
        home_xg: "2.31",
        away_xg: "0.78"
      },
      {
        season: "2026-27",
        understat_match_id: "29002",
        kicked_off_at: new Date("2026-08-15T14:00:00.000Z"),
        home_team: "Manchester City",
        away_team: "Nottingham Forest",
        home_xg: "1.07",
        away_xg: "1.40"
      }
    ]);
  });

  test("archives a reshaped body, then names every offending field", async () => {
    // Understat renames a key and starts sending xG as a number: every
    // affected field must surface, not just the first.
    const body = JSON.stringify({
      dates: [
        {
          id: "29001",
          datetime: "2026-08-15 11:30:00",
          h: { title: "Liverpool" },
          a: { title: "Bournemouth" },
          xG: { h: 2.31, a: "0.78" },
          isResult: true
        },
        {
          id: "29002",
          kickoff: "2026-08-15 14:00:00",
          h: { name: "Manchester City" },
          a: { title: "Nottingham Forest" },
          xG: { h: "1.07", a: "1.40" },
          isResult: true
        }
      ]
    });

    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({ status: 200, body })
    })).rejects.toMatchObject({
      name: UnderstatSourceValidationError.name,
      source: "understat:2026-27:EPL",
      // Team names are checked first within each entry, ahead of the
      // not-yet-played skip; every offending field still surfaces.
      issues: [
        { field: "dates.0.xG.h", detail: "expected a non-negative decimal string" },
        { field: "dates.1.h.title", detail: "team name is missing" },
        { field: "dates.1.datetime", detail: "expected YYYY-MM-DD HH:MM:SS" }
      ]
    });

    const stored = await client.query(
      `select
         (select count(*)::int from understat_match_xg) as xg,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows).toEqual([{ xg: 0, snapshots: 1 }]);
  });

  test("asks the league endpoint with the headers Understat requires", async () => {
    const requests: Array<{ url: string; headers?: Record<string, string> }> =
      [];

    await fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async (url, options) => {
        requests.push({ url, ...(options?.headers && { headers: options.headers }) });
        return { status: 200, body: leagueBody([]) };
      }
    });

    expect(requests).toEqual([{
      url: LEAGUE_DATA_URL,
      headers: {
        // Without a User-Agent Understat blocks the request outright, and
        // without the AJAX header it answers with a full HTML page.
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://understat.com/league/EPL/2026",
        Accept: "application/json"
      }
    }]);
  });

  test("re-running keeps one row per match and takes a revised xG", async () => {
    const match: CannedMatch = {
      id: "29001",
      datetime: "2026-08-15 11:30:00",
      home: "Liverpool",
      away: "Bournemouth",
      xg: ["2.31", "0.78"]
    };
    let body = leagueBody([match]);
    const options = {
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({ status: 200, body })
    };

    await fetchUnderstatSeasonXg(options);
    body = leagueBody([{ ...match, xg: ["2.44", "0.78"] }]);
    await fetchUnderstatSeasonXg(options);

    const stored = await client.query(
      "select understat_match_id, home_xg from understat_match_xg"
    );
    expect(stored.rows).toEqual([
      { understat_match_id: "29001", home_xg: "2.44" }
    ]);
  });

  test("archives an outage response and leaves stored xG as it was", async () => {
    await fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({
        status: 200,
        body: leagueBody([{
          id: "29001",
          datetime: "2026-08-15 11:30:00",
          home: "Liverpool",
          away: "Bournemouth",
          xg: ["2.31", "0.78"]
        }])
      })
    });

    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({ status: 503, body: "<html>down for maintenance" })
    })).rejects.toMatchObject({
      name: UnderstatSourceHttpError.name,
      source: "understat:2026-27:EPL",
      status: 503,
      url: LEAGUE_DATA_URL
    });

    const stored = await client.query(
      "select understat_match_id, home_xg from understat_match_xg"
    );
    expect(stored.rows).toEqual([
      { understat_match_id: "29001", home_xg: "2.31" }
    ]);
    const archived = await client.query(
      "select body from raw_snapshots order by first_seen_at"
    );
    expect(archived.rows.map(({ body }) => body)).toContain(
      "<html>down for maintenance"
    );
  });

  test("refuses a team name absent from the alias mapping", async () => {
    // A rename on Understat's side must surface as an error, not as a
    // silently xG-less team.
    const body = leagueBody([
      {
        id: "29001",
        datetime: "2026-08-15 11:30:00",
        home: "Liverpool",
        away: "Bournemouth",
        xg: ["2.31", "0.78"]
      },
      {
        id: "29002",
        datetime: "2026-08-15 14:00:00",
        home: "Man City FC",
        away: "Nottingham Forest",
        xg: ["1.07", "1.40"]
      }
    ]);

    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({ status: 200, body })
    })).rejects.toMatchObject({
      name: UnderstatSourceValidationError.name,
      source: "understat:2026-27:EPL",
      issues: [
        { field: "dates.1.h.title", detail: "unknown Understat team name" }
      ]
    });

    const stored = await client.query(
      `select
         (select count(*)::int from understat_match_xg) as xg,
         (select count(*)::int from raw_snapshots) as snapshots`
    );
    expect(stored.rows).toEqual([{ xg: 0, snapshots: 1 }]);
  });

  test("checks the alias mapping on matches not yet played", async () => {
    // Upcoming matches already carry h.title / a.title, so a pre-season fetch
    // can confirm every spelling in the feed — months before the first xG
    // exists to be lost to a rename.
    const body = leagueBody([
      {
        id: "29003",
        datetime: "2026-08-22 14:00:00",
        home: "Arsenal",
        away: "Coventry City"
      }
    ]);

    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "PL",
      season: "2026-27",
      http: async () => ({ status: 200, body })
    })).rejects.toMatchObject({
      name: UnderstatSourceValidationError.name,
      source: "understat:2026-27:EPL",
      issues: [
        { field: "dates.0.a.title", detail: "unknown Understat team name" }
      ]
    });
  });

  // Ticket 6. The Understat league is Understat's own slug and not the
  // Competition code, so this is the one place the two vocabularies meet: the
  // URL, the Referer, the snapshot's source name and the stored `competition`
  // all have to move together, and a test that only checked the stored rows
  // would pass on a Spanish label over an English feed.
  test("reads La Liga's own feed and stores it under its Competition", async () => {
    const body = leagueBody([
      {
        id: "31001",
        datetime: "2025-08-16 20:00:00",
        home: "Barcelona",
        away: "Rayo Vallecano",
        xg: ["2.88", "0.41"]
      }
    ]);
    const requested: string[] = [];

    await fetchUnderstatSeasonXg({
      database: client,
      competition: "PD",
      season: "2025-26",
      http: async (url, options) => {
        requested.push(url);
        expect(options?.headers?.Referer)
          .toBe("https://understat.com/league/La_liga/2025");
        return { status: 200, body };
      }
    });

    expect(requested)
      .toEqual(["https://understat.com/getLeagueData/La_liga/2025"]);

    const stored = await client.query(
      `select x.competition, x.home_team, x.away_team, s.source
         from understat_match_xg x, raw_snapshots s`
    );
    expect(stored.rows).toEqual([{
      competition: "PD",
      home_team: "Barcelona",
      away_team: "Rayo Vallecano",
      source: "understat:2025-26:La_liga"
    }]);
  });

  // The failure the per-Competition alias map exists for, driven end to end.
  // `UNDERSTAT_LEAGUES` is a slug this codebase picks, so one wrong character
  // fetches the English feed under a Spanish label. Every club name would
  // resolve against a shared map; the upsert keys on `(season,
  // understat_match_id)` with `competition` deliberately outside it, so the
  // rows would not be added but would *collide* with the Premier League's and
  // relabel them `PD` — a Season of another league's xG taken, silently.
  test("refuses another league's feed rather than relabelling its rows",
    async () => {
      const english = leagueBody([{
        id: "29001",
        datetime: "2025-08-16 11:30:00",
        home: "Liverpool",
        away: "Bournemouth",
        xg: ["2.31", "0.78"]
      }]);

      await fetchUnderstatSeasonXg({
        database: client,
        competition: "PL",
        season: "2025-26",
        http: async () => ({ status: 200, body: english })
      });

      // The same bytes, now answered to a La Liga request.
      await expect(fetchUnderstatSeasonXg({
        database: client,
        competition: "PD",
        season: "2025-26",
        http: async () => ({ status: 200, body: english })
      })).rejects.toMatchObject({
        name: UnderstatSourceValidationError.name,
        issues: [
          { field: "dates.0.h.title", detail: "unknown Understat team name" },
          { field: "dates.0.a.title", detail: "unknown Understat team name" }
        ]
      });

      const stored = await client.query(
        `select competition, understat_match_id from understat_match_xg`
      );
      expect(stored.rows).toEqual([
        { competition: "PL", understat_match_id: "29001" }
      ]);
    });

  test("refuses a Competition with no Understat league", async () => {
    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "SA",
      season: "2026-27",
      http: async () => {
        throw new Error("no request should be made");
      }
    })).rejects.toThrow("Competition SA has no Understat league");
  });
});

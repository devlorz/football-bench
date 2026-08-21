import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resetSchema } from "./schema-fixture.js";
import {
  fetchUnderstatSeasonXg,
  UnderstatSourceHttpError,
  UnderstatSourceValidationError
} from "../src/understat/fetch-season-xg.js";
import {
  resolveUnderstatTeamName, understatTeamNamesOf
} from "../src/understat/team-identity.js";
import { archivedBody, archivedHomeTeams } from "./archived-fixture.js";

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
 *
 * An upcoming fixture carries `xG: {h: null, a: null}` rather than omitting
 * the field — read off the live `getLeagueData/La_liga/2026` feed on
 * 2026-08-19, and the shape that broke the 2026-08-18 fetch, which read absent
 * xG as "not yet played" and so raised on all 375 unplayed matches.
 */
function leagueBody(matches: CannedMatch[]): string {
  return JSON.stringify({
    dates: matches.map(({ id, datetime, home, away, xg }) => ({
      id,
      datetime,
      h: { id: "1", title: home, short_title: home.slice(0, 3).toUpperCase() },
      a: { id: "2", title: away, short_title: away.slice(0, 3).toUpperCase() },
      ...(xg === undefined
        ? { xG: { h: null, a: null }, isResult: false }
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
        // Not yet played: Understat sends xG with both sides null.
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

  // The other half of the rule above, and the reason the skip reads `isResult`
  // rather than a wider "xG is null or missing" test. Widening the null check
  // would have cleared the 2026-08-18 failure just as well, and would have
  // bought it back the first time Understat published a result before its xG
  // model had run: the match would slip through the skip and simply never be
  // stored, which is the silent gap this source refuses everywhere else.
  test("refuses a match Understat calls a result but sends no xG for",
    async () => {
      const body = JSON.stringify({
        dates: [
          {
            id: "29001",
            datetime: "2026-08-15 11:30:00",
            h: { title: "Liverpool" },
            a: { title: "Bournemouth" },
            xG: { h: "2.31", a: "0.78" },
            isResult: true
          },
          {
            // Played, per the feed's own flag, but the xG field never arrived.
            id: "29002",
            datetime: "2026-08-15 14:00:00",
            h: { title: "Manchester City" },
            a: { title: "Nottingham Forest" },
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
        issues: [
          {
            field: "dates.1.xG.h",
            detail: "expected a non-negative decimal string"
          },
          {
            field: "dates.1.xG.a",
            detail: "expected a non-negative decimal string"
          }
        ]
      });

      // Nothing stored, including the sound first match: one unusable entry
      // fails the fetch rather than landing a partial Season.
      const stored = await client.query(
        `select
           (select count(*)::int from understat_match_xg) as xg,
           (select count(*)::int from raw_snapshots) as snapshots`
      );
      expect(stored.rows).toEqual([{ xg: 0, snapshots: 1 }]);
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

  // Ticket: the 2026-08-18 daily fetch. La Liga's Season opened and the feed
  // published a fixture list naming three clubs the map had never seen, so
  // every PD run failed on `unknown Understat team name` and no 2026-27 xG
  // landed. The names are pinned in both directions on purpose: the key is
  // what makes the *fetch* pass, and the value is what makes the *join* in
  // build-match-context find a stored result. A plausible-looking value —
  // `La Coruna`, which is how football-data.co.uk spelt the club the last time
  // it was in this division — would pass every fetch test here and still
  // render "xG unavailable" on every Deportivo form line.
  test("stores xG for La Liga's promoted clubs under joinable names",
    async () => {
      const body = leagueBody([
        {
          id: "30772",
          datetime: "2026-08-16 16:00:00",
          home: "Racing Santander",
          away: "Villarreal",
          xg: ["1.42", "1.55"]
        },
        {
          id: "30774",
          datetime: "2026-08-17 18:00:00",
          home: "Deportivo La Coruna",
          away: "Elche",
          xg: ["0.93", "1.21"]
        },
        {
          id: "30775",
          datetime: "2026-08-19 19:00:00",
          home: "Atletico Madrid",
          away: "Malaga",
          xg: ["2.06", "0.44"]
        }
      ]);

      await fetchUnderstatSeasonXg({
        database: client,
        competition: "PD",
        season: "2026-27",
        http: async () => ({ status: 200, body })
      });

      const stored = await client.query(
        `select home_team, away_team from understat_match_xg
          order by understat_match_id`
      );
      expect(stored.rows).toEqual([
        { home_team: "Racing Santander", away_team: "Villarreal" },
        { home_team: "Deportivo La Coruna", away_team: "Elche" },
        { home_team: "Atletico Madrid", away_team: "Malaga" }
      ]);

      // football-data.co.uk's own spellings, read off `mmz4281/2627/SP1.csv`.
      expect([
        "Racing Santander", "Deportivo La Coruna", "Malaga"
      ].map((team) => resolveUnderstatTeamName("PD", team)))
        .toEqual(["Santander", "Dep. A Coruna", "Malaga"]);
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

  // The map read back against the two feeds it was derived from, both
  // committed: a list typed into a test would agree with a map typed from the
  // same draft, and neither would touch the sources. Every key must be a title
  // in the Understat feed, every value a `HomeTeam` in the football-data.co.uk
  // file, and each side exactly twenty with nothing left over — which is the
  // whole of what "derived, not transcribed" claims.
  test("derives Serie A's twenty from the two feeds it was read off",
    async () => {
      const feed = JSON.parse(
        await archivedBody("understat-2025-26-Serie_A.json.gz")
      ) as { dates: Array<{ h: { title: string }; a: { title: string } }> };
      const titles = new Set(feed.dates.flatMap(({ h, a }) => [h.title, a.title]));

      const stored = await archivedHomeTeams("football-data-2526-I1.csv.gz");

      expect(titles.size).toBe(20);
      expect(stored.size).toBe(20);

      // Every key a title and every title a key, compared as sets rather than
      // by resolving the feed's twenty: resolving proves only that nothing in
      // the feed is missing, and a twenty-first key naming a club Understat
      // does not list would survive it.
      expect(Object.keys(understatTeamNamesOf("SA") ?? {}).sort())
        .toEqual([...titles].sort());

      const resolved = [...titles].map(
        (title) => resolveUnderstatTeamName("SA", title)
      );
      expect(resolved.filter((name) => name === undefined)).toEqual([]);
      // Every value a stored name, and the two sets equal — so the map can
      // neither point at a club football-data.co.uk does not hold nor leave
      // one of its twenty unnamed.
      expect(new Set(resolved).size).toBe(20);
      expect([...new Set(resolved)].sort()).toEqual([...stored].sort());

      // The two the review was asked about, named rather than left to the set
      // arithmetic: a rename on either side that kept the sets equal would
      // still have to keep these two pointing where they point.
      expect(resolveUnderstatTeamName("SA", "AC Milan")).toBe("Milan");
      expect(resolveUnderstatTeamName("SA", "Parma Calcio 1913")).toBe("Parma");
      // The club the first can be confused with — both sources call it
      // `Inter`, so a swapped pair is spelt apart on each side.
      expect(resolveUnderstatTeamName("SA", "Inter")).toBe("Inter");
    });

  // Ligue 1's eighteen, read back against its own two feeds. Eighteen on each
  // side, which is the count this league actually has and the one a map
  // copied from Serie A's shape would fail.
  test("derives Ligue 1's eighteen from the two feeds it was read off",
    async () => {
      const feed = JSON.parse(
        await archivedBody("understat-2025-26-Ligue_1.json.gz")
      ) as { dates: Array<{ h: { title: string }; a: { title: string } }> };
      const titles = new Set(feed.dates.flatMap(({ h, a }) => [h.title, a.title]));

      const stored = await archivedHomeTeams("football-data-2526-F1.csv.gz");

      expect(titles.size).toBe(18);
      expect(stored.size).toBe(18);

      expect(Object.keys(understatTeamNamesOf("FL1") ?? {}).sort())
        .toEqual([...titles].sort());

      const resolved = [...titles].map(
        (title) => resolveUnderstatTeamName("FL1", title)
      );
      expect(resolved.filter((name) => name === undefined)).toEqual([]);
      expect(new Set(resolved).size).toBe(18);
      expect([...new Set(resolved)].sort()).toEqual([...stored].sort());

      // The one pair that differs across the two sources, and the club it can
      // be confused with. Both are named because the sets above stay equal
      // under a swap of the two: `Paris FC` and `Paris SG` are both stored
      // names, so exchanging which key points at which passes every count.
      expect(resolveUnderstatTeamName("FL1", "Paris Saint Germain"))
        .toBe("Paris SG");
      expect(resolveUnderstatTeamName("FL1", "Paris FC")).toBe("Paris FC");
    });

  // What the join rate cannot say, said here instead. `FL1`'s rate is 298 of
  // 306 against `PD`'s 379 of 380, and a low rate is exactly the shape a
  // mis-mapped club makes -- so the number on its own leaves the maps under
  // suspicion. Both feeds are committed, so the question can be answered
  // without dates at all: pair every stored result with its Understat match by
  // club pair, and check the two sources agree on the score.
  //
  // They agree on all 306. That exonerates every one of the eighteen names
  // independently of any date, which no join rate could: a swapped pair would
  // put a wrong score on sixty-six of them.
  test("agrees with Understat on every result, so the eight misses are dates",
    async () => {
      const feed = JSON.parse(
        await archivedBody("understat-2025-26-Ligue_1.json.gz")
      ) as {
        dates: Array<{
          datetime: string;
          h: { title: string }; a: { title: string };
          goals: { h: string; a: string };
        }>;
      };
      const rows = (await archivedBody("football-data-2526-F1.csv.gz"))
        .split(/\r?\n/).filter((line) => line.length > 0);
      const column = new Map(
        (rows[0]?.split(",") ?? []).map((name, index) => [name, index])
      );
      const field = (row: string[], name: string): string =>
        row[column.get(name) ?? -1] ?? "";

      const understat = new Map(feed.dates.map((match) => [
        `${resolveUnderstatTeamName("FL1", match.h.title)}`
        + `|${resolveUnderstatTeamName("FL1", match.a.title)}`,
        { date: match.datetime.slice(0, 10), score: `${match.goals.h}-${match.goals.a}` }
      ]));

      const unpaired: string[] = [];
      const disagreed: string[] = [];
      const differentDate: string[] = [];
      for (const row of rows.slice(1).map((line) => line.split(","))) {
        const home = field(row, "HomeTeam");
        const away = field(row, "AwayTeam");
        const match = understat.get(`${home}|${away}`);
        if (match === undefined) {
          unpaired.push(`${home} v ${away}`);
          continue;
        }
        if (match.score !== `${field(row, "FTHG")}-${field(row, "FTAG")}`) {
          disagreed.push(`${home} v ${away}`);
        }
        // `DD/MM/YYYY` to the ISO date Understat sends, which is `joinXg`'s key.
        const [day, month, year] = field(row, "Date").split("/");
        if (match.date !== `${year}-${month}-${day}`) {
          differentDate.push(`${home} v ${away}`);
        }
      }

      expect(rows.slice(1)).toHaveLength(306);
      expect(unpaired).toEqual([]);
      expect(disagreed).toEqual([]);

      // And the eight that do not join, named rather than counted: Understat
      // files each of these two matchdays at a single nominal slot where
      // football-data.co.uk holds the real kick-offs, spread across days. A
      // ninth appearing here is a new disagreement worth reading, not a
      // number to bump.
      expect(differentDate.sort()).toEqual([
        "Brest v Lorient", "Lens v Rennes", "Metz v Lille", "Metz v Monaco",
        "Nantes v Lyon", "Nantes v Marseille", "Nice v Lens",
        "Paris SG v Lorient"
      ]);
    });

  test("refuses a Competition with no Understat league", async () => {
    await expect(fetchUnderstatSeasonXg({
      database: client,
      competition: "BL1",
      season: "2026-27",
      http: async () => {
        throw new Error("no request should be made");
      }
    })).rejects.toThrow("Competition BL1 has no Understat league");
  });
});

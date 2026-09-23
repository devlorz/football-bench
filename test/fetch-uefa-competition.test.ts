import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  fetchUefaCompetition,
  IncompleteUefaSeasonError,
  normaliseUefaMatches,
  parseUefaMatches,
  settledResultOf,
  StaleUefaSourceError,
  UefaValidationError,
  UnknownUefaMatchdayError,
  type UefaMatch
} from "../src/uefa/fetch-competition.js";
import type { HttpFetcher } from "../src/http.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const SEASON = "2026-27";
const COMPETITION = "UNL";

/** The six matchday names the league phase is played under (ADR-0057). */
const LEAGUE_PHASE = new Set(["MD1", "MD2", "MD3", "MD4", "MD5", "MD6"]);

/**
 * UEFA's own pages for the Nations League, recorded on 2026-09-14 and kept as
 * they arrived: 156 matches over two pages of a hundred, every envelope field,
 * and not one result — the Season's first match is ten days away, which is why
 * every status reads `UPCOMING`.
 */
const thisSeasonPages = async (): Promise<string[]> => Promise.all([
  archivedBody("uefa-2026-27-UNL-recorded-offset-0.json.gz"),
  archivedBody("uefa-2026-27-UNL-recorded-offset-100.json.gz")
]);

/** The page UEFA answers past the end of a Season: an empty array. */
const pastTheEnd = async (): Promise<string> =>
  archivedBody("uefa-2026-27-UNL-recorded-offset-200.json.gz");

/**
 * The 2024-25 edition, which is where every shape this Season has not reached
 * yet actually exists: the one `ABANDONED` match, the knockout matchdays, and
 * the three matches whose ninety-minute score differs from their total.
 */
const lastEditionPages = async (): Promise<string[]> => Promise.all([
  archivedBody("uefa-2024-25-UNL-recorded-offset-0.json.gz"),
  archivedBody("uefa-2024-25-UNL-recorded-offset-100.json.gz")
]);

const parsePages = (pages: string[]): UefaMatch[] =>
  pages.flatMap((page) => parseUefaMatches("test", page));

/**
 * What `writeCompetitionSchedule` is handed, and the only thing this fetch
 * decides. Everything after it — the derived deadline, the attachment, the
 * breach alert, the withdrawn path, the upsert — is the same bytes the five
 * leagues run (ticket 0071), so it is proven once, in
 * `test/fetch-football-data-org-competition.test.ts`, and not asserted a
 * second time here. What is asserted here is the handover: that every field
 * arrives already decided, in the type the writer reads it as, because a
 * `"3"` where a `3` belongs would surface downstream as a wrong deadline with
 * nothing pointing at the field that was wrong.
 */
describe("the shape UEFA's feed is normalised into", () => {
  let thisSeason: UefaMatch[];
  let lastEdition: UefaMatch[];

  beforeAll(async () => {
    thisSeason = parsePages(await thisSeasonPages());
    lastEdition = parsePages(await lastEditionPages());
  });

  test("parses both pages UEFA really returned, all 156 of them", () => {
    // The claim a constructed body cannot make: the schema accepts a whole
    // published Season, not one match in the shape its author expected.
    expect(thisSeason).toHaveLength(156);
    expect(new Set(thisSeason.map((match) => match.id)).size).toBe(156);
  });

  test("a matchday name becomes the Gameweek number it stands for", () => {
    const { scheduled } = normaliseUefaMatches(COMPETITION, thisSeason);
    const azerbaijan = scheduled.find((match) => match.fixtureId === 2047955);

    // `MD3`, in the feed, on a match whose raw label this test can point at.
    expect(thisSeason.find((match) => match.id === "2047955")?.matchday.name)
      .toBe("MD3");
    expect(azerbaijan?.matchday).toBe(3);
    expect(typeof azerbaijan?.matchday).toBe("number");
    expect(new Set(scheduled.map((match) => match.matchday)))
      .toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  test("a kickoff becomes a Date at the instant the feed names", () => {
    const { scheduled } = normaliseUefaMatches(COMPETITION, thisSeason);
    const azerbaijan = scheduled.find((match) => match.fixtureId === 2047955);

    expect(azerbaijan?.kickoffAt).toBeInstanceOf(Date);
    expect(azerbaijan?.kickoffAt.toISOString()).toBe("2026-10-01T16:00:00.000Z");
  });

  test("a match id becomes a number", () => {
    const { scheduled } = normaliseUefaMatches(COMPETITION, thisSeason);

    // UEFA writes its ids as strings; `fixtures.fixture_id` is an integer.
    expect(thisSeason.every((match) => typeof match.id === "string")).toBe(true);
    expect(scheduled.every((match) => Number.isInteger(match.fixtureId)))
      .toBe(true);
    expect(scheduled.map((match) => match.fixtureId)).toContain(2047955);
  });

  test("a settled result is the ninety-minute score and never the total", () => {
    // Extra time is played in the knockout rounds and nowhere else, so the
    // only matches whose two scores differ are in matchdays `normaliseUefa
    // Matches` refuses outright (ADR-0057 defers the knockouts). The
    // requirement is therefore proven at the function that reads the field,
    // over the archived matches where the difference is real — the whole
    // point of the requirement is the day a Nations League match goes to
    // extra time and `total` is the wrong number to settle at.
    const portugal = lastEdition.find((match) => match.id === "2043062");
    const spain = lastEdition.find((match) => match.id === "2043060");

    expect(portugal?.score?.regular).toEqual({ home: 3, away: 2 });
    expect(portugal?.score?.total).toEqual({ home: 5, away: 2 });
    expect(settledResultOf(portugal!)).toBe(
      JSON.stringify({ home_goals: 3, away_goals: 2, outcome: "H" })
    );

    // 2–2 after ninety minutes, 3–3 after extra time, won 5–4 on penalties:
    // the ninety-minute reading is a draw and neither other number is stored.
    expect(spain?.score?.penalty).toEqual({ home: 5, away: 4 });
    expect(settledResultOf(spain!)).toBe(
      JSON.stringify({ home_goals: 2, away_goals: 2, outcome: "D" })
    );
  });

  test("an ABANDONED match is withdrawn, not settled", () => {
    // Romania–Kosovo, 2024-11-15: abandoned at 0–0 after Kosovo left the
    // pitch, awarded 3–0 by UEFA later, and left in the feed forever at its
    // ninety-minute 0–0 with no winner. Settling it would score a match that
    // was never played out.
    const leaguePhase = lastEdition.filter(
      (match) => LEAGUE_PHASE.has(match.matchday.name)
    );
    const { scheduled, withdrawnIds } = normaliseUefaMatches(
      COMPETITION,
      leaguePhase
    );

    expect(lastEdition.find((match) => match.id === "2040157")?.status)
      .toBe("ABANDONED");
    expect(withdrawnIds).toContain(2040157);
    expect(scheduled.map((match) => match.fixtureId)).not.toContain(2040157);
    expect(scheduled).toHaveLength(155);
    expect(scheduled.every((match) => match.settled)).toBe(true);
  });

  test("Türki̇ye is stored as Türkiye and the other fifty-three verbatim", () => {
    const { scheduled } = normaliseUefaMatches(COMPETITION, thisSeason);
    const names = new Set(
      scheduled.flatMap((match) => [match.homeTeam, match.awayTeam])
    );
    const asPublished = new Set(
      thisSeason.flatMap((match) => [
        match.homeTeam.internationalName,
        match.awayTeam.internationalName
      ])
    );

    // The feed writes it with a combining dot above the `i` (U+0307), left
    // over from lowercasing Turkish `İ`. Every other source spells it with a
    // plain `i`, and a name that does not match is a side that never joins.
    expect(asPublished).toContain("Türki̇ye");
    expect(names).toContain("Türkiye");
    expect(names).not.toContain("Türki̇ye");
    expect(names.size).toBe(54);
    expect([...asPublished].filter((name) => !names.has(name)))
      .toEqual(["Türki̇ye"]);
  });

  test("a matchday outside the league phase is refused by name", () => {
    // The knockouts are deferred, not handled (ADR-0057). The day November's
    // draw puts `MD7` in this feed, the fetch says so with the name in it
    // rather than inventing a Gameweek 7 nobody decided existed.
    expect(() => normaliseUefaMatches(COMPETITION, lastEdition))
      .toThrow(UnknownUefaMatchdayError);

    const refused = [...new Set(
      lastEdition
        .filter((match) => !LEAGUE_PHASE.has(match.matchday.name))
        .map((match) => match.matchday.name)
    )];
    expect(refused.sort()).toEqual(["3rd place", "Final", "MD7", "MD8", "SF"]);

    for (const name of refused) {
      const one = lastEdition.find((match) => match.matchday.name === name);
      expect(() => normaliseUefaMatches(COMPETITION, [one!]))
        .toThrow(new RegExp(`\\b${name.replace(" ", "\\s")}\\b`));
    }
  });

  test("a FINISHED match with no ninety-minute score is refused by match", async () => {
    // A settled Fixture with nothing to score is the one thing the schema is
    // for. The archived page is real and the hole is cut into it, because a
    // feed that has ever published this has not been observed doing it.
    const page = JSON.parse(
      (await lastEditionPages())[0]!
    ) as { id: string; status: string; score?: { regular?: unknown } }[];
    const holed = page.find((match) => match.status === "FINISHED")!;
    delete holed.score!.regular;

    expect(() => parseUefaMatches("test", JSON.stringify(page)))
      .toThrow(new RegExp(`FINISHED match ${holed.id} has no`));
    expect(() => parseUefaMatches("test", JSON.stringify(page)))
      .toThrow(UefaValidationError);
  });
});

function respondingWith(
  bodyByOffset: Record<number, string>
): { http: HttpFetcher; requests: string[] } {
  const requests: string[] = [];
  const http: HttpFetcher = async (url) => {
    requests.push(url);
    const offset = Number(new URL(url).searchParams.get("offset"));
    const body = bodyByOffset[offset];
    return body === undefined
      ? { status: 404, body: "" }
      : { status: 200, body };
  };
  return { http, requests };
}

describe("the Nations League read from UEFA", () => {
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
      "truncate fixtures, gameweeks, raw_snapshots restart identity cascade"
    );
  });

  const fetchAt = async (
    at: string,
    bodyByOffset: Record<number, string>
  ): Promise<string[]> => {
    const { http, requests } = respondingWith(bodyByOffset);
    await fetchUefaCompetition({
      database: client,
      competition: COMPETITION,
      season: SEASON,
      http,
      now: () => new Date(at)
    });
    return requests;
  };

  test("stops at a short page and archives each one it read", async () => {
    const [first, second] = await thisSeasonPages();
    const requests = await fetchAt(
      "2026-09-14T09:00:00Z",
      { 0: first!, 100: second! }
    );

    // Fifty-six is fewer than the hundred asked for, so the Season is over at
    // that page and `offset=200` is never requested.
    expect(requests).toEqual([
      "https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&limit=100&offset=0",
      "https://match.uefa.com/v5/matches?competitionId=2014&seasonYear=2027&limit=100&offset=100"
    ]);

    const { rows: snapshots } = await client.query<{ source: string }>(
      "select source from raw_snapshots order by source"
    );
    expect(snapshots.map(({ source }) => source)).toEqual([
      "uefa:2026-27:UNL:0",
      "uefa:2026-27:UNL:100"
    ]);

    const { rows } = await client.query<{ count: string }>(
      "select count(*) from fixtures where competition = $1 and season = $2",
      [COMPETITION, SEASON]
    );
    expect(Number(rows[0]!.count)).toBe(156);
    // Every league-phase Fixture names its group, as the feed does: fourteen
    // groups over the fifty-four sides, none missing (migration 0047).
    const { rows: groups } = await client.query<{ n: string; missing: string }>(
      `select count(distinct group_name)::text as n,
              count(*) filter (where group_name is null)::text as missing
         from fixtures where competition = $1 and season = $2`,
      [COMPETITION, SEASON]
    );
    expect(groups[0]).toEqual({ n: "14", missing: "0" });
  });

  test("an empty page ends the paging, and a Season short of a matchday is refused",
    async () => {
      // Two rules in one scenario because the feed makes them one. The empty
      // page stops the loop — nothing observed proves that on its own, since
      // 156 has always stopped it at a short page, and a Season of exactly two
      // hundred would ask for a third.
      //
      // And what the loop stopped on is not a Season. UEFA answers this feed
      // last match first: the first page holds `MD6` down to `MD3`, and only
      // twenty-two of `MD3`'s twenty-six — the other four, `MD2` and `MD1` are
      // all on the second page. A second page that came back empty or short
      // for a moment used to be written as if it were the whole calendar, and
      // Gameweek 3's deadline would have been derived from an 18:45Z kickoff
      // rather than the 16:00Z one it never saw: 17:15Z, an hour and a quarter
      // after a match had already kicked off. Nothing would have raised it.
      // The breach alert cannot: there is no stored deadline to breach on a
      // Season's first fetch, and on a later one the reconciliation would
      // first have withdrawn the fifty-six Fixtures the missing page holds.
      const [first] = await thisSeasonPages();
      const { http, requests } = respondingWith(
        { 0: first!, 100: await pastTheEnd() }
      );

      await expect(fetchUefaCompetition({
        database: client,
        competition: COMPETITION,
        season: SEASON,
        http,
        now: () => new Date("2026-09-14T09:00:00Z")
      })).rejects.toThrow(IncompleteUefaSeasonError);

      expect(requests).toHaveLength(2);
      expect(requests[1]).toContain("offset=100");

      const { rows } = await client.query<{ count: string }>(
        `select
           (select count(*) from fixtures) as fixtures,
           (select count(*) from gameweeks) as gameweeks,
           (select count(*) from raw_snapshots) as snapshots`
      );
      // Both pages are archived — they are the evidence — and nothing else
      // was written at all.
      expect(rows[0]).toEqual({
        fixtures: "0",
        gameweeks: "0",
        snapshots: "2"
      });
    });

  test("every round has to be in the read, not just the first", async () => {
    // Both pages arrive whole and the Season is still not one: `MD4` is
    // absent. Guarding only the earliest round would pass this, and the
    // Gameweek it would then write is one with no Fixtures in it and a
    // deadline nothing justifies.
    const [first, second] = await thisSeasonPages();
    const withoutMd4 = [...JSON.parse(first!), ...JSON.parse(second!)]
      .filter((match: { matchday: { name: string } }) =>
        match.matchday.name !== "MD4");
    expect(withoutMd4).toHaveLength(130);

    await expect(fetchAt("2026-09-14T09:00:00Z", {
      0: JSON.stringify(withoutMd4.slice(0, 100)),
      100: JSON.stringify(withoutMd4.slice(100))
    })).rejects.toThrow(/\bMD4\b/);
  });

  test("a short second read withdraws nothing from a Season already stored",
    async () => {
      // The refusal above is what stands between a flaky page and a third of
      // the calendar: a Fixture gone from the feed is withdrawn (ADR-0024), so
      // without it the fifty-six the missing page carries would be deleted for
      // being absent from a read that never reached them.
      const [first, second] = await thisSeasonPages();
      await fetchAt("2026-09-14T09:00:00Z", { 0: first!, 100: second! });

      await expect(fetchAt(
        "2026-09-15T09:00:00Z",
        { 0: first!, 100: await pastTheEnd() }
      )).rejects.toThrow(IncompleteUefaSeasonError);

      const { rows } = await client.query<{ count: string }>(
        "select count(*) from fixtures where competition = $1 and season = $2",
        [COMPETITION, SEASON]
      );
      expect(Number(rows[0]!.count)).toBe(156);
    });

  test("an empty first page is a dead source, not a finished Season", async () => {
    await expect(fetchAt("2026-09-14T09:00:00Z", { 0: await pastTheEnd() }))
      .rejects.toThrow(StaleUefaSourceError);

    const { rows } = await client.query<{ count: string }>(
      "select count(*) from gameweeks where competition = $1",
      [COMPETITION]
    );
    expect(Number(rows[0]!.count)).toBe(0);
  });

  test("the six Gameweeks carry the deadlines UEFA's kickoffs derive", async () => {
    const [first, second] = await thisSeasonPages();
    await fetchAt("2026-09-14T09:00:00Z", { 0: first!, 100: second! });

    const { rows } = await client.query(
      `select gw, deadline_at from gameweeks
        where competition = $1 and season = $2 order by gw`,
      [COMPETITION, SEASON]
    );
    expect(rows.map(({ gw, deadline_at: deadlineAt }) => [
      gw as number,
      (deadlineAt as Date).toISOString()
    ])).toEqual([
      [1, "2026-09-24T14:30:00.000Z"],
      [2, "2026-09-27T11:30:00.000Z"],
      [3, "2026-10-01T14:30:00.000Z"],
      [4, "2026-10-04T11:30:00.000Z"],
      [5, "2026-11-12T15:30:00.000Z"],
      [6, "2026-11-15T12:30:00.000Z"]
    ]);
  });

  /**
   * The same page with one match taken out of it, which is how this feed says
   * a Fixture is off: UEFA keeps no withdrawn row to read a status from, so a
   * match that is gone is simply absent.
   *
   * Taken from the second page on purpose — dropping one from the first would
   * make it ninety-nine, which this fetch reads as the end of the Season.
   */
  const withoutMatch = (page: string, id: string): string =>
    JSON.stringify(
      (JSON.parse(page) as { id: string }[]).filter((match) => match.id !== id)
    );

  test("a Fixture gone from the feed is withdrawn, not left scheduled",
    async () => {
      const [first, second] = await thisSeasonPages();
      await fetchAt("2026-09-14T09:00:00Z", { 0: first!, 100: second! });

      await fetchAt("2026-09-14T09:00:00Z", {
        0: first!,
        100: withoutMatch(second!, "2047952")
      });

      // Never Locked, so it is deleted: the feed can rebuild it if it returns,
      // and a row left behind is a Fixture Entrants can still be asked to
      // predict (ADR-0024).
      const { rows } = await client.query(
        `select fixture_id from fixtures
          where competition = $1 and season = $2 and fixture_id = 2047952`,
        [COMPETITION, SEASON]
      );
      expect(rows).toEqual([]);
      const { rows: remaining } = await client.query<{ count: string }>(
        "select count(*) from fixtures where competition = $1 and season = $2",
        [COMPETITION, SEASON]
      );
      expect(Number(remaining[0]!.count)).toBe(155);
    });

  test("an ABANDONED Fixture is withdrawn while the feed still carries it",
    async () => {
      // The other half of the withdrawn path, and the half the reconciliation
      // above cannot cover: this match is still in the feed, on every page,
      // every day. Only its status says it is off. Written onto the recorded
      // page because this Season has not abandoned a match — the 2024-25
      // edition's Romania–Kosovo is proven at the normaliser, and what is
      // proven here is that the id reaches the writer at all.
      const [first, second] = await thisSeasonPages();
      await fetchAt("2026-09-14T09:00:00Z", { 0: first!, 100: second! });

      const abandoned = JSON.parse(second!) as { id: string; status: string }[];
      abandoned.find((match) => match.id === "2047952")!.status = "ABANDONED";
      await fetchAt("2026-09-14T09:00:00Z", {
        0: first!,
        100: JSON.stringify(abandoned)
      });

      const { rows } = await client.query(
        `select fixture_id from fixtures
          where competition = $1 and season = $2 and fixture_id = 2047952`,
        [COMPETITION, SEASON]
      );
      expect(rows).toEqual([]);
    });

  test("a Locked Fixture gone from the feed is deferred and keeps its row",
    async () => {
      const [first, second] = await thisSeasonPages();
      await fetchAt("2026-09-14T09:00:00Z", { 0: first!, 100: second! });
      // Israel–Kosovo is in Gameweek 3, whose deadline was 1 October at 14:30Z.
      await client.query(
        `update fixtures set locked_in_gw = gw
          where competition = $1 and season = $2 and fixture_id = 2047952`,
        [COMPETITION, SEASON]
      );

      await fetchAt("2026-10-02T09:00:00Z", {
        0: first!,
        100: withoutMatch(second!, "2047952")
      });

      // Deleting it would take a Locked Fixture's Predictions with it, so the
      // row stays and records what happened (ADR-0013, ADR-0024).
      const { rows } = await client.query<{
        locked_in_gw: number;
        deferred: boolean;
        unscheduled: boolean;
      }>(
        `select locked_in_gw, deferred, unscheduled from fixtures
          where competition = $1 and season = $2 and fixture_id = 2047952`,
        [COMPETITION, SEASON]
      );
      expect(rows[0]).toMatchObject({
        locked_in_gw: 3,
        deferred: true,
        unscheduled: true
      });
    });

  test("the response is archived before it is validated", async () => {
    const unusable = JSON.stringify([{ id: "1", status: "UPCOMING" }]);

    await expect(fetchAt("2026-09-14T09:00:00Z", { 0: unusable }))
      .rejects.toThrow(UefaValidationError);

    const { rows } = await client.query<{ body: string }>(
      "select body from raw_snapshots where source = $1",
      ["uefa:2026-27:UNL:0"]
    );
    expect(rows[0]?.body).toBe(unusable);
  });
});

import pg from "pg";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  ClubInfoboxMissingError,
  clubArticlesOf,
  clubInfoboxesCompetitionOf,
  clubInfoboxesUrl,
  fetchClubHeadCoaches,
  parseClubHeadCoach
} from "../src/head-coach/fetch-club-head-coaches.js";
import { HeadCoachSourceValidationError }
  from "../src/head-coach/parse-head-coach-changes.js";
import { fetchUefaCompetition } from "../src/uefa/fetch-competition.js";
import { archivedBody } from "./archived-fixture.js";
import { resetSchema } from "./schema-fixture.js";

const { Client } = pg;

const CHAMPIONS_LEAGUE = "UCL";
const SEASON = "2026-27";
const CHAMPIONS_LEAGUE_PAGES = [0, 100, 200].map((offset) =>
  `uefa-2026-27-UCL-recorded-offset-${offset}.json.gz`);

/**
 * The MediaWiki API's answers recorded 2026-10-13, keyed by request URL:
 * section 0 of all 36 `UCL` clubs' articles, and of Lech Poznań, Viktoria
 * Plzeň and the redirect `Sabah FK` -- the acceptance cases ADR-0063 read where
 * the three candidate sources disagreed.
 */
const INFOBOXES = "wikipedia-club-infoboxes-recorded-2026-10-13.json.gz";

interface ApiPage {
  title: string;
  missing?: boolean;
  revisions?: { slots: { main: { content: string } } }[];
}

/** Every recorded page's section 0, by title. */
async function recordedArticles(
  name = INFOBOXES
): Promise<Map<string, string>> {
  const bundle = JSON.parse(await archivedBody(name)) as
    Record<string, string>;
  return new Map(Object.values(bundle).flatMap((body) =>
    (JSON.parse(body) as { query: { pages: ApiPage[] } }).query.pages
      .map((page): [string, string] =>
        [page.title, page.revisions?.[0]?.slots.main.content ?? ""])));
}

describe("the head coach read off a club's infobox", () => {
  let articles: Map<string, string>;

  beforeAll(async () => {
    articles = await recordedArticles();
  });

  const read = (title: string): string | null =>
    parseClubHeadCoach(title, articles.get(title)!);

  test("names who the infobox names where the other sources disagreed", () => {
    // ADR-0063's three cases: 365Scores had nobody for Lens or Lech and Hyský
    // for Plzeň, and UEFA's lineup still had Toppmöller at Lens.
    expect(read("RC Lens")).toBe("Yannick Cahuzac");
    expect(read("Lech Poznań")).toBe("Niels Frederiksen");
    expect(read("FC Viktoria Plzeň")).toBe("Radoslav Kováč");
  });

  test("reads the manager and never the chairman beside it", () => {
    // Lech's infobox lists co-chairmen two lines above the manager, and
    // Plzeň's chairman carries a citation running to several hundred
    // characters; both are what a loose pattern would catch.
    expect(read("Lech Poznań")).not.toMatch(/Klimczak|Rutkowski/);
    expect(read("FC Viktoria Plzeň")).not.toMatch(/Šádek/);
  });

  test("reads every Champions League club's infobox to a name", () => {
    const named = [...articles.keys()]
      .filter((title) => !["Lech Poznań", "FC Viktoria Plzeň", "Sabah FK"]
        .includes(title))
      .map(read);
    expect(named).toHaveLength(36);
    expect(named.every((name) => name !== null && !/[[\]{}|<>=]/.test(name)))
      .toBe(true);
  });

  test("reads a field wrapped in markup to the name alone", () => {
    const infobox = (manager: string): string =>
      `{{Infobox football club\n| clubname = X\n| manager = ${manager}\n}}`;
    expect(parseClubHeadCoach("X", infobox(
      "{{flagicon|ESP}} [[Iñigo Pérez (footballer)|Iñigo Pérez]]"
      + "<ref>{{cite web|url=https://example.org|title=t}}</ref>"
    ))).toBe("Iñigo Pérez");
    expect(parseClubHeadCoach("X", infobox(
      "[[Yannick Cahuzac]] <small>(interim)</small>"
    ))).toBe("Yannick Cahuzac (interim)");
    expect(parseClubHeadCoach("X",
      "{{Infobox football club\n| clubname = X\n| head coach = [[A B]]\n}}"
    )).toBe("A B");
    expect(parseClubHeadCoach("X",
      "{{Infobox football club\n| clubname = X\n| coach = [[C D]]\n}}"
    )).toBe("C D");
  });

  test("stores a vacancy or an unreadable field as nobody", () => {
    const infobox = (manager: string): string =>
      `{{Infobox football club\n| clubname = X\n| manager = ${manager}\n}}`;
    expect(parseClubHeadCoach("X", infobox(""))).toBeNull();
    expect(parseClubHeadCoach("X", infobox("Vacant"))).toBeNull();
    expect(parseClubHeadCoach("X", infobox("{{unknown template|[[A]]}}")))
      .toBeNull();
    expect(parseClubHeadCoach("X",
      "{{Infobox football club\n| clubname = X\n}}")).toBeNull();
  });

  test("refuses an article with no club infobox, by its title", () => {
    // `Sabah FK` is a redirect, which the fetch does not follow: a mapped
    // title that has moved is a broken map entry.
    expect(() => read("Sabah FK")).toThrow(ClubInfoboxMissingError);
    expect(() => read("Sabah FK")).toThrow(/Sabah FK/);
  });
});

describe("each Champions League side's head coach read from its infobox", () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let bundle: Record<string, string>;
  /** The one request a day asks, for all 36 titles. */
  let url: string;

  beforeAll(async () => {
    await client.connect();
    await resetSchema(client);
    bundle = JSON.parse(await archivedBody(INFOBOXES)) as
      Record<string, string>;
    const articles = clubArticlesOf(CHAMPIONS_LEAGUE)!;
    url = clubInfoboxesUrl(
      Object.keys(articles).sort().map((side) => articles[side]!));

    return async () => {
      await client.end();
    };
  });

  beforeEach(async () => {
    await client.query(
      "truncate fixtures, gameweeks, raw_snapshots, club_head_coaches "
      + "restart identity cascade"
    );
    // The cup's sides are read off its stored Fixtures (ticket 0100).
    const pages = await Promise.all(CHAMPIONS_LEAGUE_PAGES.map(archivedBody));
    await fetchUefaCompetition({
      database: client,
      competition: CHAMPIONS_LEAGUE,
      season: SEASON,
      http: async (url) => ({
        status: 200,
        body: pages[Number(/offset=(\d+)/.exec(url)![1]) / 100] ?? "[]"
      }),
      now: () => new Date("2026-10-12T09:00:00Z")
    });
  });

  const readAt = async (
    instant: string,
    body: string = bundle[url]!
  ): Promise<string[]> => {
    const requests: string[] = [];
    await fetchClubHeadCoaches({
      database: client,
      competition: CHAMPIONS_LEAGUE,
      season: SEASON,
      http: async (requested) => {
        requests.push(requested);
        return requested === url
          ? { status: 200, body }
          : { status: 404, body: "" };
      },
      now: () => new Date(instant)
    });
    return requests;
  };

  test("stores one snapshot per side for the day, from one request", async () => {
    const requests = await readAt("2026-10-13T05:00:00Z");

    expect(requests).toEqual([url]);
    const { rows } = await client.query<{ sides: number; days: number }>(
      `select count(*)::int as sides, count(distinct observed_on)::int as days
         from club_head_coaches`
    );
    expect(rows[0]).toEqual({ sides: 36, days: 1 });
    const { rows: lens } = await client.query(
      `select team, observed_on::text as observed_on, observed_at, head_coach
         from club_head_coaches where team = 'Lens'`
    );
    expect(lens).toEqual([{
      team: "Lens",
      observed_on: "2026-10-13",
      observed_at: new Date("2026-10-13T05:00:00Z"),
      head_coach: "Yannick Cahuzac"
    }]);
    const { rows: archived } = await client.query<{ source: string }>(
      "select source from raw_snapshots where source like 'wikipedia:%'"
    );
    expect(archived.map(({ source }) => source))
      .toEqual(["wikipedia:club-infoboxes:2026-27:UCL"]);
  });

  test("a second read the same day rewrites that day's snapshot", async () => {
    await readAt("2026-10-13T05:00:00Z");
    await readAt("2026-10-13T11:00:00Z", bundle[url]!
      .replace("[[Yannick Cahuzac]]", "[[Pierre Sage]]"));

    const { rows } = await client.query(
      `select observed_at, head_coach from club_head_coaches
        where team = 'Lens'`
    );
    expect(rows).toEqual([{
      observed_at: new Date("2026-10-13T11:00:00Z"),
      head_coach: "Pierre Sage"
    }]);
  });

  test("a mapped article that is missing fails the day by name, writing nothing",
    async () => {
      const answer = JSON.parse(bundle[url]!) as { query: { pages: ApiPage[] } };
      answer.query.pages = answer.query.pages.map((page) =>
        page.title === "RC Lens" ? { title: "RC Lens", missing: true } : page);

      await expect(readAt("2026-10-13T05:00:00Z", JSON.stringify(answer)))
        .rejects.toMatchObject({
          name: ClubInfoboxMissingError.name,
          competition: CHAMPIONS_LEAGUE,
          titles: ["RC Lens"]
        });
      await expect(readAt("2026-10-13T05:00:00Z", JSON.stringify(answer)))
        .rejects.toThrow(/UCL.*RC Lens/);
      const { rows } = await client.query<{ count: number }>(
        "select count(*)::int as count from club_head_coaches"
      );
      expect(rows[0]!.count).toBe(0);
    });

  test("an answer that is not the API's shape is refused, naming the source",
    async () => {
      await expect(readAt("2026-10-13T05:00:00Z", "<html>maintenance</html>"))
        .rejects.toMatchObject({
          name: HeadCoachSourceValidationError.name,
          source: "wikipedia:club-infoboxes:2026-27:UCL"
        });
      await expect(readAt("2026-10-13T05:00:00Z", "{\"batchcomplete\":true}"))
        .rejects.toBeInstanceOf(HeadCoachSourceValidationError);
    });
});

describe("which Competition a day of infoboxes was read for", () => {
  test("is read back off the request's titles, for the archive replay", () => {
    const articles = clubArticlesOf(CHAMPIONS_LEAGUE)!;
    expect(clubInfoboxesCompetitionOf(clubInfoboxesUrl(
      Object.keys(articles).sort().map((side) => articles[side]!))))
      .toBe(CHAMPIONS_LEAGUE);
    expect(clubInfoboxesCompetitionOf(clubInfoboxesUrl(["Lech Poznań"])))
      .toBe("UEL");
    expect(clubInfoboxesCompetitionOf(clubInfoboxesUrl(["Sabah FK"])))
      .toBeUndefined();
    expect(clubInfoboxesCompetitionOf("https://en.wikipedia.org/w/index.php"))
      .toBeUndefined();
  });
});

describe("the Champions League's article map", () => {
  test("names every side of the league phase once, each title resolving",
    async () => {
      const pages = await Promise.all(CHAMPIONS_LEAGUE_PAGES.map(archivedBody));
      const uefaSides = new Set(pages.flatMap((page) => (JSON.parse(page) as {
        round: { metaData: { name: string } };
        homeTeam: { internationalName: string };
        awayTeam: { internationalName: string };
      }[]).filter((match) => match.round.metaData.name === "League Phase")
        .flatMap((match) => [
          match.homeTeam.internationalName, match.awayTeam.internationalName
        ])));
      const articles = clubArticlesOf(CHAMPIONS_LEAGUE)!;
      const recorded = await recordedArticles();

      expect(Object.keys(articles).sort()).toEqual([...uefaSides].sort());
      expect(new Set(Object.values(articles)).size).toBe(36);
      // Resolving is the recorded answer carrying the title as asked, with an
      // infobox: a redirect or a missing page fails the parse.
      for (const title of Object.values(articles)) {
        expect(recorded.has(title), title).toBe(true);
        expect(() => parseClubHeadCoach(title, recorded.get(title)!))
          .not.toThrow();
      }
    });
});

describe("the Europa League's article map", () => {
  test("names every side of the league phase once, each title resolving",
    async () => {
      const pages = await Promise.all([0, 100, 200].map((offset) =>
        archivedBody(`uefa-2026-27-UEL-recorded-offset-${offset}.json.gz`)));
      const uefaSides = new Set(pages.flatMap((page) => (JSON.parse(page) as {
        round: { metaData: { name: string } };
        homeTeam: { internationalName: string };
        awayTeam: { internationalName: string };
      }[]).filter((match) => match.round.metaData.name === "League Phase")
        .flatMap((match) => [
          match.homeTeam.internationalName, match.awayTeam.internationalName
        ])));
      const articles = clubArticlesOf("UEL")!;
      const recorded = await recordedArticles(
        "wikipedia-UEL-club-infoboxes-recorded-2026-10-13.json.gz"
      );

      expect(Object.keys(articles).sort()).toEqual([...uefaSides].sort());
      expect(new Set(Object.values(articles)).size).toBe(36);
      // Both directions: the recording answered exactly the 36 titles asked.
      expect([...recorded.keys()].sort())
        .toEqual(Object.values(articles).sort());
      for (const title of Object.values(articles)) {
        expect(recorded.has(title), title).toBe(true);
        expect(() => parseClubHeadCoach(title, recorded.get(title)!))
          .not.toThrow();
      }
      // ADR-0063's acceptance cases, and the infobox opened under its other
      // template name.
      expect(parseClubHeadCoach("Lech Poznań", recorded.get("Lech Poznań")!))
        .toBe("Niels Frederiksen");
      expect(parseClubHeadCoach("FC Viktoria Plzeň",
        recorded.get("FC Viktoria Plzeň")!)).toBe("Radoslav Kováč");
      expect(parseClubHeadCoach("S.C.U. Torreense",
        recorded.get("S.C.U. Torreense")!)).toBe("Luís Tralhão");
    });
});

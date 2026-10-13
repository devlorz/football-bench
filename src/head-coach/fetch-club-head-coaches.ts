import type { Client } from "pg";
import { z } from "zod";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  cellText,
  WIKIMEDIA_REQUEST_HEADERS,
  withoutCitations
} from "../wikipedia/wikitext.js";
import { HeadCoachSourceHttpError } from "./fetch-head-coach-changes.js";
import { HeadCoachSourceValidationError } from "./parse-head-coach-changes.js";

type Database = Pick<Client, "query">;

/**
 * What the registry names this source by, and the word the daily fetch and the
 * context loader dispatch on (ADR-0063).
 */
export const CLUB_HEAD_COACHES_SOURCE = "wikipedia-club-infobox";

/**
 * Each cup side's English Wikipedia article, keyed by the side as the record
 * stores it (ADR-0063). Reviewed by hand and never searched: a search picked
 * the wrong article 8 times in 108 on 2026-10-12 (a women's side, a reserve
 * side, a Malaysian club also named Sabah). Titles are the articles' own, not
 * redirects, which the fetch does not follow: a title that has moved fails the
 * day by name rather than reading whatever the redirect now points at.
 * Checked against the API on 2026-10-13 (`test/fetch-club-head-coaches`).
 */
const ARTICLE_BY_SIDE: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  UCL: {
    "AEK Athens": "AEK Athens F.C.",
    Arsenal: "Arsenal F.C.",
    "Aston Villa": "Aston Villa F.C.",
    Atleti: "Atlético Madrid",
    "B. Dortmund": "Borussia Dortmund",
    Barcelona: "FC Barcelona",
    "Bayern München": "FC Bayern Munich",
    "Bodø/Glimt": "FK Bodø/Glimt",
    "Club Brugge": "Club Brugge KV",
    Como: "Como 1907",
    Fenerbahçe: "Fenerbahçe S.K. (football)",
    Feyenoord: "Feyenoord",
    Galatasaray: "Galatasaray S.K. (football)",
    Inter: "Inter Milan",
    LASK: "LASK",
    Leipzig: "RB Leipzig",
    Lens: "RC Lens",
    Lille: "Lille OSC",
    Liverpool: "Liverpool F.C.",
    "Man City": "Manchester City F.C.",
    "Man Utd": "Manchester United F.C.",
    Napoli: "SSC Napoli",
    Paris: "Paris Saint-Germain FC",
    Porto: "FC Porto",
    PSV: "PSV Eindhoven",
    "Real Betis": "Real Betis",
    "Real Madrid": "Real Madrid CF",
    Roma: "AS Roma",
    "S. Bratislava": "ŠK Slovan Bratislava",
    Sabah: "Sabah FK (Azerbaijan)",
    Shakhtar: "FC Shakhtar Donetsk",
    "Slavia Praha": "SK Slavia Prague",
    "Sporting CP": "Sporting CP",
    Stuttgart: "VfB Stuttgart",
    Viking: "Viking FK",
    Villarreal: "Villarreal CF"
  },
  // Checked against the API on 2026-10-13
  // (`wikipedia-UEL-club-infoboxes-recorded-2026-10-13`).
  UEL: {
    Anderlecht: "RSC Anderlecht",
    "Ararat-Armenia": "FC Ararat-Armenia",
    "AZ Alkmaar": "AZ Alkmaar",
    Benfica: "S.L. Benfica",
    "Beşiktaş": "Beşiktaş J.K.",
    Bournemouth: "AFC Bournemouth",
    Celje: "NK Celje",
    Celta: "RC Celta de Vigo",
    Celtic: "Celtic F.C.",
    "Crystal Palace": "Crystal Palace F.C.",
    "Ferencváros": "Ferencvárosi TC",
    "GNK Dinamo": "GNK Dinamo Zagreb",
    "H. Beer-Sheva": "Hapoel Be'er Sheva F.C.",
    Hoffenheim: "TSG 1899 Hoffenheim",
    Jagiellonia: "Jagiellonia Białystok",
    Juventus: "Juventus FC",
    "Lech Poznań": "Lech Poznań",
    Leverkusen: "Bayer 04 Leverkusen",
    "Levski Sofia": "PFC Levski Sofia",
    "Lillestrøm": "Lillestrøm SK",
    Lyon: "Olympique Lyonnais",
    Marseille: "Olympique de Marseille",
    Milan: "AC Milan",
    "N.E.C.": "NEC Nijmegen",
    "OFI Crete": "OFI Crete F.C.",
    Olympiacos: "Olympiacos F.C.",
    Omonia: "AC Omonia",
    "Real Sociedad": "Real Sociedad",
    Rennes: "Stade Rennais FC",
    Salzburg: "FC Red Bull Salzburg",
    "Sparta Praha": "AC Sparta Prague",
    "Sturm Graz": "SK Sturm Graz",
    Sunderland: "Sunderland A.F.C.",
    Torreense: "S.C.U. Torreense",
    "Union SG": "Royale Union Saint-Gilloise",
    "Viktoria Plzeň": "FC Viktoria Plzeň"
  }
};

/** This Competition's article titles, or undefined where it has none. */
export function clubArticlesOf(
  competition: string
): Readonly<Record<string, string>> | undefined {
  return ARTICLE_BY_SIDE[competition];
}

export const CLUB_INFOBOXES_API = "https://en.wikipedia.org/w/api.php";

/**
 * One MediaWiki API request for every title (the API takes up to 50), section
 * 0 only: the infobox sits above the first heading, and the whole articles run
 * to 4.8 MB for 36 clubs where section 0 is a quarter of a megabyte.
 */
export function clubInfoboxesUrl(titles: readonly string[]): string {
  return `${CLUB_INFOBOXES_API}?` + new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    rvsection: "0",
    format: "json",
    formatversion: "2",
    titles: titles.join("|")
  }).toString();
}

/**
 * Mapped articles with no club infobox, or none at all: broken map entries,
 * which fail the Competition's day by name (spec 0028, story 39). The parser,
 * which reads one article for no Competition in particular, leaves
 * `competition` undefined; the fetch names it.
 */
export class ClubInfoboxMissingError extends Error {
  constructor(
    public readonly titles: readonly string[],
    public readonly competition?: string
  ) {
    super(
      (competition === undefined ? "" : `Competition ${competition}: `)
      + `English Wikipedia has no football club infobox at ${titles.join(", ")}; `
      + "fix those entries in src/head-coach/fetch-club-head-coaches.ts "
      + "against the articles' current titles rather than searching for the clubs"
    );
    this.name = "ClubInfoboxMissingError";
  }
}

/** Torreense's article opens the same template under its other name. */
const INFOBOX = /\{\{\s*(?:Infobox football club|Football club infobox)/i;

/**
 * The field naming who picks the team, anchored to a line's own parameter
 * name: Lech's `chrtitle`/`chairman` lines sit two lines above `manager`, and
 * a pattern loose enough to wander catches those.
 */
const HEAD_COACH_FIELD = /^\s*\|\s*(?:manager|head coach|coach)\s*=(.*)$/im;

/**
 * Who a club's infobox names as picking the team, or null where it names
 * nobody: a vacancy, an empty field, or one this reader cannot make a name of
 * (spec 0028, story 38). Only a missing infobox is a refusal.
 *
 * ponytail: the field is the first one after the infobox opens, not matched
 * against the infobox's closing braces; bound it if an infobox without the
 * field ever sits above another template that has one.
 */
export function parseClubHeadCoach(
  title: string,
  wikitext: string
): string | null {
  const page = withoutCitations(wikitext);
  const start = page.search(INFOBOX);
  if (start < 0) {
    throw new ClubInfoboxMissingError([title]);
  }
  const field = HEAD_COACH_FIELD.exec(page.slice(start))?.[1];
  if (field === undefined) {
    return null;
  }
  const name = cellText(field
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, ""));
  return name === "" || /^vacant$/i.test(name) || /[[\]{}|<>=]/.test(name)
    ? null
    : name;
}

/** A cup side the article map does not name, refused before any request. */
export class UnknownClubArticleError extends Error {
  constructor(
    public readonly competition: string,
    public readonly team: string
  ) {
    super(
      `${team} plays in Competition ${competition} and has no English `
      + "Wikipedia article in src/head-coach/fetch-club-head-coaches.ts; add "
      + "its reviewed title rather than searching for the club"
    );
    this.name = "UnknownClubArticleError";
  }
}

/** The archive's name for one Competition's day of infoboxes. */
export function clubInfoboxesSource(
  competition: string,
  season: string
): string {
  return `wikipedia:club-infoboxes:${season}:${competition}`;
}

/**
 * The Competition a day's request was made for, read back off its first
 * title, for the archive replay: the URL names neither the Competition nor
 * the Season the bytes were archived under, the way a season article's title
 * does not (`headCoachSourceByPage`). A title is mapped for one Competition.
 */
export function clubInfoboxesCompetitionOf(url: string): string | undefined {
  if (!url.startsWith(`${CLUB_INFOBOXES_API}?`)) {
    return undefined;
  }
  const first = new URL(url).searchParams.get("titles")?.split("|")[0];
  return Object.keys(ARTICLE_BY_SIDE).find((competition) =>
    Object.values(ARTICLE_BY_SIDE[competition] ?? {}).includes(first ?? ""));
}

/** A Competition whose registry entry names this source and has no map. */
export class UnknownClubCupCompetitionError extends Error {
  constructor(public readonly competition: string) {
    super(
      `Competition ${competition} reads its clubs' infoboxes, which needs a `
      + "reviewed article map in src/head-coach/fetch-club-head-coaches.ts"
    );
    this.name = "UnknownClubCupCompetitionError";
  }
}

const answerSchema = z.looseObject({
  query: z.looseObject({
    pages: z.array(z.looseObject({
      title: z.string(),
      revisions: z.array(z.looseObject({
        slots: z.looseObject({
          main: z.looseObject({ content: z.string() })
        })
      })).optional()
    }))
  })
});

/** The API's answer, or a refusal naming the source it came from. */
function answerOf(
  source: string,
  body: string
): z.infer<typeof answerSchema> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new HeadCoachSourceValidationError(source, [{
      field: "body", detail: "is not JSON"
    }]);
  }
  const answer = answerSchema.safeParse(json);
  if (!answer.success) {
    throw new HeadCoachSourceValidationError(source, answer.error.issues
      .map((issue) => ({
        field: issue.path.join(".") || "body",
        detail: issue.message
      })));
  }
  return answer.data;
}

export interface FetchClubHeadCoachesOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  /** The run's own clock, recorded as the instant the infoboxes were read. */
  now: () => Date;
}

/**
 * Who picks each of a cup's sides, read off each club's infobox and stored as
 * one snapshot per side per day (ADR-0063), on migration 0045's model: a Head
 * Coach Change is the difference between two days.
 *
 * Every side is parsed before anything is written, so a broken map entry costs
 * the Competition its day rather than leaving the day half-stored.
 */
export async function fetchClubHeadCoaches({
  database,
  competition,
  season,
  http,
  now
}: FetchClubHeadCoachesOptions): Promise<void> {
  const { rows } = await database.query<{ team: string }>(
    `select home_team as team from fixtures
      where competition = $1 and season = $2
     union
     select away_team from fixtures
      where competition = $1 and season = $2`,
    [competition, season]
  );
  const articles = clubArticlesOf(competition);
  if (articles === undefined) {
    throw new UnknownClubCupCompetitionError(competition);
  }
  // Sorted here by code point and not by the database's collation, so the
  // request URL -- and the archive replay that finds it -- is the same on
  // every deployment.
  const sides = rows.map(({ team }) => team).sort().map((team) => {
    const title = articles[team];
    if (title === undefined) {
      throw new UnknownClubArticleError(competition, team);
    }
    return { team, title };
  });
  if (sides.length === 0) {
    return;
  }

  const url = clubInfoboxesUrl(sides.map(({ title }) => title));
  const source = clubInfoboxesSource(competition, season);
  const response = await http(url, {
    method: "GET",
    headers: WIKIMEDIA_REQUEST_HEADERS
  });
  // Archived before validation, so a refused answer is still evidence.
  await storeRawSnapshots(database, [{ source, body: response.body }]);
  if (response.status < 200 || response.status >= 300) {
    throw new HeadCoachSourceHttpError(source, response.status, url);
  }
  // Titles are matched exactly: a title the API normalised or reports missing
  // finds no page here and is a broken map entry like any other.
  const content = new Map(answerOf(source, response.body)
    .query.pages.map((page) =>
      [page.title, page.revisions?.[0]?.slots.main.content]));
  const missing: string[] = [];
  const headCoaches = sides.map(({ title }) => {
    try {
      return parseClubHeadCoach(title, content.get(title) ?? "");
    } catch (error) {
      if (!(error instanceof ClubInfoboxMissingError)) {
        throw error;
      }
      missing.push(title);
      return null;
    }
  });
  if (missing.length > 0) {
    throw new ClubInfoboxMissingError(missing, competition);
  }

  const observedAt = now();
  const observedOn = observedAt.toISOString().slice(0, 10);
  await database.query(
    `insert into club_head_coaches (team, observed_on, observed_at, head_coach)
     select * from unnest($1::text[], $2::date[], $3::timestamptz[], $4::text[])
     on conflict (team, observed_on)
     do update set
       observed_at = excluded.observed_at,
       head_coach  = excluded.head_coach`,
    [
      sides.map(({ team }) => team),
      sides.map(() => observedOn),
      sides.map(() => observedAt),
      headCoaches
    ]
  );
}

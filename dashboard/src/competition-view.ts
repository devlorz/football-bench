import {
  MATCH_PROMPT_COMPETITIONS, matchPromptOf
} from "../../src/predictions/openrouter-entrant.js";

/** The Match track's three pages, which are the three links in the chrome. */
export type MatchPage = "leaderboard" | "fixtures" | "entrants";

/**
 * Where one Competition's copy of one page lives, built from that
 * Competition's route path and nothing else.
 *
 * A pure function with a test because it renders perfectly while being wrong:
 * a link that points at another league's Fixtures is a link, and nothing about
 * the page it produces says the reader crossed a league. It is the one place a
 * href is built, so the nav, and the switcher of ticket 4, cannot disagree
 * about where a page of a Competition is.
 *
 * The leaderboard is the Competition's own path rather than a page under it,
 * which is what makes `/` and `/pl` both work while ticket 6 is outstanding.
 */
export const pageHref = (path: string, page: MatchPage): string =>
  page === "leaderboard"
    ? path
    : `${path === "/" ? "" : path}/${page}`;

/**
 * The rest route's segment, under the name of the directory the page lives in.
 *
 * Two named shapes and not one open record: the parameter's name is the whole
 * of the difference between the two nested lists below, and a name this file
 * mistypes builds a page nothing routes to and fails at
 * `NoMatchingStaticPathFound` — the very error the second list exists to
 * avoid, arriving from the other side.
 */
export type CompetitionParams =
  | { competition: string | undefined }
  | { competitionSegment: string };

/** One built page: the path a reader types and everything the page reads by. */
export interface CompetitionRoute {
  params: CompetitionParams;
  props: {
    /** The Competition code the record is keyed by, as `PD` and not `pd`. */
    competition: string;
    /** The page's own path, which is what a link to itself points at. */
    path: string;
    /** The read API's prefix for this Competition; an endpoint hangs off it. */
    api: string;
  };
}

/**
 * The three routes as one thing, before either spelling of the empty segment:
 * the segment a URL is written with, and the props every page reads by. The
 * three exported lists below differ in nothing else, and derive from this
 * rather than from each other so that none of them reads a parameter name off
 * another.
 */
const SEGMENTS: readonly {
  segment: string;
  props: CompetitionRoute["props"];
}[] = [
  { segment: "", props: { competition: "PL", path: "/", api: "/api/pl" } },
  ...MATCH_PROMPT_COMPETITIONS.map((competition) => {
    const segment = competition.toLowerCase();
    return {
      segment,
      props: { competition, path: `/${segment}`, api: `/api/${segment}` }
    };
  })
];

/**
 * Every Match track page the build emits, one per Competition, read from the
 * Competitions with a frozen Prompt Version — the same list the read API serves
 * (ADR-0039), so a route and its endpoint cannot disagree about which leagues
 * exist. A league appears here the deploy after its freeze and needs no edit of
 * its own.
 *
 * Read at build time from this module rather than from the database: ADR-0028
 * makes the build static, and the alternative makes opening a league a rebuild
 * rather than the insert ADR-0035 promised.
 *
 * Both spellings of a Competition are settled here and nowhere else: the code
 * the record is keyed by, and the lower-case segment the URLs are written in.
 * A page derives neither, so no page can disagree with another about how `PD`
 * is spelled in a path — and the pages of tickets 2 and 3 read their endpoints
 * off the same `api` prefix.
 *
 * `/` is still the Premier League's leaderboard, and it is first because the
 * rest route reads `undefined` as the empty segment. It is the one route whose
 * path is not its Competition's: ticket 6 of spec 0017 replaces this entry with
 * a 302, and until then every URL that worked before this change still works.
 */
export const COMPETITION_ROUTES: readonly CompetitionRoute[] =
  SEGMENTS.map(({ segment, props }) => ({
    params: { competition: segment === "" ? undefined : segment },
    props
  }));

/**
 * Every Competition the chrome offers, once each and under the name the packet
 * an Entrant reads uses. The switcher is built from this and the routes from
 * `SEGMENTS`, so no league can be reachable by URL and missing from the header,
 * or offered in the header and served by nothing.
 *
 * The front door is not one of them. `/` is where the Premier League can be
 * reached and not a fourth league, and an entry for it would offer the Premier
 * League twice — once under its own name and once under the same name again. It
 * leaves this list the day it leaves `SEGMENTS`, which is ticket 6.
 */
export const SWITCHER_COMPETITIONS: readonly {
  competition: string;
  path: string;
  competitionName: string;
}[] = SEGMENTS
  .filter(({ segment }) => segment !== "")
  .map(({ props: { competition, path } }) => ({
    competition,
    path,
    competitionName: matchPromptOf(competition).competitionName
  }));

/**
 * The same routes for the **Fixtures** page, which lives *under* the
 * Competition's segment — `/pl/fixtures`, and `/fixtures` for the front door.
 *
 * The one difference is the empty segment's spelling, and it is here because
 * the build says so and not because a document does. Handing this route list
 * `undefined` for the empty segment — the spelling Astro's own examples use,
 * and the one the leaderboard's top-level route needs — fails the build
 * outright: `NoMatchingStaticPathFound` on `/fixtures`, the route pattern
 * matched and no static path found. The empty string is what builds. Astro's
 * routing documentation draws no distinction between a top-level rest route
 * and a nested one, so nothing here is deduced from it; if a later version
 * accepts `undefined` in both places, this list collapses into the one above
 * and the build is what will say so.
 *
 * The props are the same props, so a nested page reads its Competition, its
 * path and its endpoint exactly as the leaderboard does.
 */
export const NESTED_COMPETITION_ROUTES: readonly CompetitionRoute[] =
  SEGMENTS.map(({ segment, props }) => ({
    params: { competition: segment },
    props
  }));

/**
 * The same routes again for the **Entrant record** page, because Astro serves
 * the empty segment to one page per rest parameter and no more.
 *
 * Two pages in `[...competition]/` both generating the front door's copy —
 * `/fixtures` and `/entrants` — build one and fail the other outright with
 * `NoMatchingStaticPathFound` on the URL that worked a page earlier. Found by
 * building, and reproduced by a page of nothing but `<p>zzz</p>` beside the
 * Fixtures page: moving that page under a rest parameter of another name
 * builds every path of both. The parameter's name is the whole of the
 * difference; the paths, the props and the pages are the same.
 *
 * `competitionSegment` because that is what it holds: this Competition, in the
 * lower-case spelling a URL is written in. The second name is Astro's
 * requirement and not a second thing.
 *
 * The obvious alternative is to drop the empty segment from this list alone,
 * which ends the collision in one line — and ends `/entrants` with it, a URL
 * that works today and that nothing yet redirects. Spec 0017 orders the
 * redirects last so that no step before them breaks a working URL, and the
 * page that would break is the one this ticket is building.
 *
 * It goes when the front door does. Ticket 6 redirects `/fixtures` and
 * `/entrants`, at which point no route generates an empty segment, nothing is
 * being claimed twice, and both pages live in one directory again.
 */
export const NESTED_COMPETITION_SEGMENT_ROUTES: readonly CompetitionRoute[] =
  SEGMENTS.map(({ segment, props }) => ({
    params: { competitionSegment: segment },
    props
  }));

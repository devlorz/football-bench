import {
  MATCH_PROMPT_COMPETITIONS
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

/** One built page: the path a reader types and everything the page reads by. */
export interface CompetitionRoute {
  /** The rest route's segment. `undefined` is the empty one, which is `/`. */
  params: { competition: string | undefined };
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
export const COMPETITION_ROUTES: readonly CompetitionRoute[] = [
  {
    params: { competition: undefined },
    props: { competition: "PL", path: "/", api: "/api/pl" }
  },
  ...MATCH_PROMPT_COMPETITIONS.map((competition) => {
    const segment = competition.toLowerCase();
    return {
      params: { competition: segment },
      props: { competition, path: `/${segment}`, api: `/api/${segment}` }
    };
  })
];

/**
 * The same routes, for a page that lives *under* the Competition's segment —
 * `/pl/fixtures`, and `/fixtures` for the front door.
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
  COMPETITION_ROUTES.map((route) => ({
    ...route,
    params: { competition: route.params.competition ?? "" }
  }));

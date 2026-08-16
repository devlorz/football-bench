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
 * The leaderboard is the Competition's own path rather than a page under it.
 */
export const pageHref = (path: string, page: MatchPage): string =>
  page === "leaderboard" ? path : `${path}/${page}`;

/** One built page: the path a reader types and everything the page reads by. */
export interface CompetitionRoute {
  params: { competition: string };
  props: {
    /** The Competition code the record is keyed by, as `PD` and not `pd`. */
    competition: string;
    /**
     * The league under the name the packet an Entrant reads names it — "La
     * Liga" and not `PD`. Read from the Prompt here and nowhere else: it is
     * the same single home the path and the endpoint have, and a page that
     * called `matchPromptOf` for it would be a fourth caller of the one thing
     * every page's comment says has one.
     */
    competitionName: string;
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
 * **A function, and every call builds its own `params`.** This was three lists
 * until ticket 6 of spec 0017, under two spellings of the empty segment and two
 * names for the rest parameter, all of it argued as Astro's handling of the
 * front door's empty segment. It was never the empty segment. Two pages whose
 * `getStaticPaths` return the *same* `params` objects build one page and fail
 * the other outright with `NoMatchingStaticPathFound` on a path the surviving
 * page had just emitted — and which page survives is which one Astro reached
 * first. Handing the second page a copy moves the failure to the first; handing
 * both a copy builds all six. So it is one list of Competitions, exported as
 * the function `getStaticPaths` already is, and no page can hold the objects
 * another page needs.
 *
 * The redirects in `dashboard/public/_redirects` are what `/` is instead, and
 * with no empty segment left the routes are plain `[competition]` segments
 * rather than rest parameters.
 */
export const competitionRoutes = (): CompetitionRoute[] =>
  MATCH_PROMPT_COMPETITIONS.map((competition) => {
    const segment = competition.toLowerCase();
    return {
      params: { competition: segment },
      props: {
        competition,
        competitionName: matchPromptOf(competition).competitionName,
        path: `/${segment}`,
        api: `/api/${segment}`
      }
    };
  });

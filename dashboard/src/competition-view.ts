import {
  MATCH_PROMPT_COMPETITIONS
} from "../../src/predictions/openrouter-entrant.js";

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

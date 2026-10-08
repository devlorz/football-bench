import {
  MATCH_PROMPT_COMPETITIONS, MATCH_PROMPT_VERSION, matchPromptOf,
  retiredGameweekLabel, retiredGameweekOf
} from "../../src/predictions/openrouter-entrant.js";
import { ROSTER_CAVEATS } from "../../src/season-roster.js";
import { CLOSED_LEAGUE_EDITIONS, type ClosedEdition } from "./edition-note.js";

/**
 * The Match track's four pages, which are the four links in the chrome.
 * "overall" is the one page with no Competition of its own — it sums every
 * league rather than reading one (spec 0025).
 */
export type MatchPage = "leaderboard" | "fixtures" | "entrants" | "overall";

/**
 * The combined ranking's one path. Not a Competition's, so it is not built
 * from a route path the way the other three pages are — it is fixed, and this
 * is its one spelling (spec 0025).
 */
export const OVERALL_PATH = "/overall";

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
 * `overall` ignores `path` and is the view's `overallPath`: one page for the
 * leagues of a view, and the cup's own leaderboard for the cup (ADR-0061).
 */
export const pageHref = (
  path: string, page: MatchPage, overallPath: string = OVERALL_PATH
): string =>
  page === "leaderboard" ? path
  : page === "overall" ? overallPath
  : `${path}/${page}`;

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
    /**
     * What the header's switcher calls this Competition: the packet's name,
     * except where that name is too long for one segment of a six-way
     * switcher and the code is what a reader knows it by. Only the switcher
     * reads this; every title and heading keeps `competitionName`.
     */
    switcherLabel: string;
    /** The page's own path, which is what a link to itself points at. */
    path: string;
    /** The read API's prefix for this Competition; an endpoint hangs off it. */
    api: string;
    /**
     * The frozen block's heading, on the Competition that restarted, and null
     * on every Competition that never did — which is what decides whether the
     * page carries a block at all (ADR-0042).
     *
     * The heading and not the retired version: it is built here, at build time,
     * from the one place both of its variables live, so the page holds no
     * second spelling of a version and cannot label a block with one the read
     * does not filter by. The Gameweek and its Fixture count are figures and
     * arrive with the rest of them, from `/api/{code}/retired`.
     */
    retiredLabel: string | null;
    /** `""` for the current Edition, `/edition-N` for an earlier one. */
    prefix: string;
    /** Where this page's Overall link goes, which is `pageHref`'s third. */
    overallPath: string;
    /** The earlier Edition this page reads, null on the current one. */
    closedEdition: ClosedEdition | null;
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
/**
 * The switcher's abbreviations, by code -- data, so that nothing in the
 * chrome tests a Competition's code. A Competition absent here is labelled
 * by the packet's own name.
 */
const SWITCHER_LABELS: Readonly<Record<string, string>> = { UNL: "UNL" };

/**
 * Whether a Competition is one of the leagues an Edition set sums: the ones
 * seating the Season Roster, which is every one without a roster caveat. A cup
 * is its own view and in no set (ADR-0060, ADR-0061).
 */
export const isLeague = (competition: string): boolean =>
  ROSTER_CAVEATS[competition] === undefined;

/** An earlier Edition's URL prefix, the one spelling of it (ADR-0061). */
const editionPrefix = (number: number): string => `/edition-${number}`;

/**
 * One Competition's pages in one Edition: `closed` when that Edition has
 * ended, null for the one playing. A retired Gameweek is in Edition 1
 * (ADR-0042 retired Gameweek 1), so its block is built where `edition` is 1.
 */
const route = (
  competition: string, closed: ClosedEdition | null, edition: number
): CompetitionRoute => {
  const segment = competition.toLowerCase();
  const prefix = closed === null ? "" : editionPrefix(closed.number);
  const retired = edition === 1 ? retiredGameweekOf(competition) : null;
  return {
    params: { competition: `${prefix}/${segment}`.slice(1) },
    props: {
      competition,
      competitionName: matchPromptOf(competition).competitionName,
      switcherLabel: SWITCHER_LABELS[competition]
        ?? matchPromptOf(competition).competitionName,
      path: `${prefix}/${segment}`,
      api: `/api${prefix}/${segment}`,
      retiredLabel: retired === null ? null : retiredGameweekLabel(retired),
      prefix,
      overallPath: isLeague(competition) ? `${prefix}${OVERALL_PATH}` : `/${segment}`,
      closedEdition: closed
    }
  };
};

/**
 * The current Edition's routes under today's URLs, then each closed Edition's
 * five leagues under its prefix (ADR-0061). A cup is in its Edition 1; the
 * leagues play the one after the last closed.
 */
export const competitionRoutes = (
  closed: readonly ClosedEdition[] = CLOSED_LEAGUE_EDITIONS
): CompetitionRoute[] => [
  ...MATCH_PROMPT_COMPETITIONS.map((competition) =>
    route(competition, null, isLeague(competition) ? closed.length + 1 : 1)),
  ...closed.flatMap((edition) => MATCH_PROMPT_COMPETITIONS
    .filter(isLeague)
    .map((competition) => route(competition, edition, edition.number)))
];

/** `/overall` for the current Edition and under each closed one's prefix. */
export const overallRoutes = (
  closed: readonly ClosedEdition[] = CLOSED_LEAGUE_EDITIONS
): { params: { view: string | undefined };
     props: { prefix: string; closedEdition: ClosedEdition | null } }[] => [
  { params: { view: undefined }, props: { prefix: "", closedEdition: null } },
  ...closed.map((edition) => ({
    params: { view: editionPrefix(edition.number).slice(1) },
    props: { prefix: editionPrefix(edition.number), closedEdition: edition }
  }))
];

/** One switcher entry: a link, and whether it is where the reader stands. */
export interface SwitcherLink {
  label: string;
  href: string;
  current: boolean;
}

/** The Season as a reader writes it, `2026-27`, read off the frozen version. */
const SEASON_LABEL = /\/(\d{4}-\d{2})-v/.exec(MATCH_PROMPT_VERSION)![1]!;

/**
 * The header's two switchers for a page: the views (each Edition of the
 * leagues, then each cup) and the Competitions of the reader's own view. Both
 * keep the page the reader is on; a view without the reader's Competition
 * lands on its first, which is the Premier League for the leagues.
 * `competition` is `""` on `/overall`, which belongs to the leagues.
 */
export const switchers = (
  here: { prefix: string; competition: string; page: MatchPage },
  closed: readonly ClosedEdition[] = CLOSED_LEAGUE_EDITIONS
): { views: SwitcherLink[]; competitions: SwitcherLink[] } => {
  const routes = competitionRoutes(closed).map(({ props }) => props);
  const leagues = MATCH_PROMPT_COMPETITIONS.filter(isLeague);
  const current = closed.length + 1;
  const views = [
    ...closed.map(({ number }) => ({
      label: `Edition ${number}`, prefix: editionPrefix(number), set: leagues
    })),
    {
      label: closed.length === 0 ? SEASON_LABEL : `Edition ${current}`,
      prefix: "", set: leagues
    },
    ...MATCH_PROMPT_COMPETITIONS.filter((code) => !isLeague(code)).map((code) => ({
      label: SWITCHER_LABELS[code] ?? matchPromptOf(code).competitionName,
      prefix: "", set: [code]
    }))
  ];
  const inSet = (set: readonly string[]) =>
    here.competition === "" ? isLeague(set[0]!) : set.includes(here.competition);
  const link = (prefix: string, code: string, label: string, isCurrent: boolean) => {
    const props = routes.find((r) => r.prefix === prefix && r.competition === code)!;
    return {
      label,
      href: pageHref(props.path, here.page, props.overallPath),
      current: isCurrent
    };
  };
  const mine = views.find(({ prefix, set }) => prefix === here.prefix && inSet(set))!;
  return {
    views: views.map((view) => link(
      view.prefix,
      inSet(view.set) && here.competition !== "" ? here.competition : view.set[0]!,
      view.label,
      view === mine
    )),
    // Overall has no per-league copy, so a league picked on it lands on that
    // league's leaderboard.
    competitions: mine.set.map((code) => {
      const props = routes.find((r) => r.prefix === mine.prefix && r.competition === code)!;
      return {
        label: props.switcherLabel,
        href: pageHref(props.path, here.page === "overall" ? "leaderboard" : here.page),
        current: code === here.competition
      };
    })
  };
};

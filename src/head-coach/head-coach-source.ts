/**
 * Where a Competition's Head Coach changes are published, per Season
 * (ADR-0044): English Wikipedia's season article, whose managerial-changes
 * table is the events table the packet renders.
 *
 * Keyed by Season as well as by Competition, which is the difference from
 * `squadChangeWindow`: a transfer window is a frozen constant of a Prompt
 * Version, while a season article is a new page every year. An unlisted pair
 * is the gate -- the section is absent rather than empty, exactly as a
 * Gameweek outside the transfer window's gate renders none.
 *
 * Seventh of seven, counting the whole change:
 * `docs/runbooks/opening-a-competition.md` has the list.
 *
 * `page` carries the en dash the article titles are written with. A hyphen
 * there is a different title and a 404, which the fetch would report as a
 * source failure rather than as a typo, so it is worth reading twice.
 */
export interface HeadCoachSource {
  /** Names the archive source, `wikipedia:head-coach-changes:<name>`. */
  name: string;
  /** English Wikipedia's article title for the Season. */
  page: string;
}

const SEASON_ARTICLES: Readonly<
  Record<string, Readonly<Record<string, HeadCoachSource>>>
> = {
  "2026-27": {
    PL: {
      name: "2026-27-premier-league",
      page: "2026–27 Premier League"
    },
    PD: {
      name: "2026-27-la-liga",
      page: "2026–27 La Liga"
    }
  }
};

export function headCoachSource(
  competition: string,
  season: string
): HeadCoachSource | undefined {
  return SEASON_ARTICLES[season]?.[competition];
}

/**
 * The article a Wikipedia page title belongs to, for a reader holding a URL
 * and needing the name its snapshot was archived under. The archive replay is
 * that reader, on the same terms `transferWindowByPage` serves it: a page
 * title is what a request carries and this list's name is what the bytes are
 * filed as.
 */
export function headCoachSourceByPage(
  page: string
): HeadCoachSource | undefined {
  return Object.values(SEASON_ARTICLES)
    .flatMap((byCompetition) => Object.values(byCompetition))
    .find((article) => article.page === page);
}

/**
 * The name the page's bytes are archived under. Carries the Season and the
 * Competition, so no two articles can file a snapshot over each other.
 */
export function headCoachSourceOf({ name }: HeadCoachSource): string {
  return `wikipedia:head-coach-changes:${name}`;
}

/**
 * Where a Competition's Head Coach changes are published, per Season
 * (ADR-0044): English Wikipedia's season article, whose Head Coach changes
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
  /**
   * The Managerial changes table's column labels, where this article does not
   * write them the way the others do. Absent means the common seven, which is
   * what Premier League, La Liga and Serie A all publish; Ligue 1 heads the
   * fifth column `Position in table` and English Wikipedia's season articles
   * are written by different editors, so the wording is the article's fact and
   * belongs beside its title rather than inside the parser.
   *
   * Listed and not matched loosely: the pin exists so a reordered or re-scoped
   * table is a refusal, and a parser that shrugged at one label's wording would
   * accept that wording from every league whose page does not use it.
   */
  columns?: readonly string[];
  /**
   * The Personnel table's leading column labels, up to and including the one
   * holding the Head Coach, where this article does not lead with the common
   * pair. Absent means `Team, Manager`. Ligue 1 and Serie A both put `Chairman`
   * between them, which is the case the pair was pinned to catch -- read by
   * position against the common pair it would have filed every club's chairman
   * as its Head Coach, and nothing downstream could have told.
   *
   * The two leagues sharing a shape is not a rule about them: this list is the
   * article's fact, and Serie A's was read off the page only after its own
   * first fetch refused. A league opened next is unpinned until its page is
   * read, not assumed to match whichever neighbour it resembles.
   */
  personnelColumns?: readonly string[];
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
    },
    SA: {
      name: "2026-27-serie-a",
      page: "2026–27 Serie A",
      personnelColumns: ["Team", "Chairman", "Manager"]
    },
    FL1: {
      name: "2026-27-ligue-1",
      page: "2026–27 Ligue 1",
      columns: [
        "Team",
        "Outgoing manager",
        "Manner of departure",
        "Date of vacancy",
        "Position in table",
        "Incoming manager",
        "Date of appointment"
      ],
      personnelColumns: ["Team", "Chairman", "Manager"]
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

/**
 * A transfer window as the Squad Change pipeline sees it: the Wikipedia page
 * that lists it, and the two dates the render gate is arithmetic on.
 *
 * These are frozen constants. They ship inside `match/2026-27-v2` and cannot
 * move without a v3 (ADR-0026, ADR-0031), which is why winter is decided here
 * in August rather than in January. The winter close is customary and
 * unannounced at freeze; every Gameweek deadline sits three or more days from
 * a boundary, so a day or two of drift changes nothing.
 */
/**
 * The three shapes English Wikipedia publishes a country's transfer list in.
 * England is two wikitables, `Transfers` and `Loans`, with a date column and a
 * fee column; Italy is one wikitable of England's columns whose fee column
 * carries the loans; Spain, France and Germany are one section per club
 * holding two `{{fs player}}` lists and neither column.
 */
export type TransferListFormat =
  | "twoTables"
  | "oneTable"
  | "clubSections";

export interface TransferWindow {
  /** Names the archive source, `wikipedia:squad-changes:<name>`. */
  name: string;
  /** English Wikipedia's article title for the window's transfer list. */
  page: string;
  /**
   * The previous window's close, which is the page's own scope and so the date
   * the section states its membership from. Not `opensOn`: the page lists every
   * move made since the last window shut, including the out-of-window free
   * agents that arrive between the two.
   */
  since: Date;
  opensOn: Date;
  closesOn: Date;
  /**
   * Which shape of page this is. English Wikipedia publishes a country's
   * transfers in two formats that share nothing but a domain, so the parser is
   * chosen per window rather than per Competition -- the window is what names
   * the page, and the page is what has a shape.
   */
  format: TransferListFormat;
}

/** How long after a window closes its movement stays in the context. */
const GATE_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Per Competition, because a window is a country's and not the world's: Spain
 * opened its 2026 summer on 1 July where England opened on 15 June, and one
 * flat list would hand a La Liga Gameweek the English page. That mistake is
 * quiet in the worst way -- the English page lists the whole English pyramid,
 * so every Spanish club would resolve to nothing, and a Competition whose
 * every club moved nobody is a section that reads as calm rather than as
 * broken. The same argument ticket 6 arrived at for the Understat alias map,
 * for the same reason: a map that cannot be wrong about which league it is
 * asked about does not need anybody to check.
 *
 * The Premier League's window names are unchanged and deliberately not
 * regularised into `england-summer-2026`: they name archived snapshots that
 * are already stored under them. Spain's carry their country because the two
 * must not collide in `raw_snapshots`.
 *
 * Sixth of seven, counting the whole change:
 * `docs/runbooks/opening-a-competition.md` has the list.
 */
const TRANSFER_WINDOWS: Readonly<Record<string, readonly TransferWindow[]>> = {
  PL: [
    {
      name: "summer-2026",
      page: "List of English football transfers summer 2026",
      since: new Date("2026-02-02T00:00:00Z"),
      opensOn: new Date("2026-06-15T00:00:00Z"),
      closesOn: new Date("2026-09-01T00:00:00Z"),
      format: "twoTables"
    },
    {
      name: "winter-2026-27",
      page: "List of English football transfers winter 2026–27",
      since: new Date("2026-09-01T00:00:00Z"),
      opensOn: new Date("2027-01-01T00:00:00Z"),
      closesOn: new Date("2027-02-02T00:00:00Z"),
      format: "twoTables"
    }
  ],
  // Read off the page's own lead on 2026-08-15: "The summer transfer window
  // began on 1 July 2026 ... will close at midnight on 1 September 2026." The
  // winter dates are the customary ones and are frozen here in August on the
  // same terms as England's, whose 2026-27 page does not exist yet either.
  // Read off the page's own lead on 2026-08-21: "The 2026 Italian football
  // summer transfer window runs from 1 July to 1 September 2026 (8 p.m.)", and
  // `since` off the previous page's lead the same way -- the winter 2025-26
  // list states its window as 2 January to 2 February 2026. The winter 2026-27
  // dates are the customary ones and are frozen here in August on England's
  // and Spain's terms, the page for them not existing yet.
  SA: [
    {
      name: "italy-summer-2026",
      page: "List of Italian football transfers summer 2026",
      since: new Date("2026-02-02T00:00:00Z"),
      opensOn: new Date("2026-07-01T00:00:00Z"),
      closesOn: new Date("2026-09-01T00:00:00Z"),
      format: "oneTable"
    },
    {
      name: "italy-winter-2026-27",
      page: "List of Italian football transfers winter 2026–27",
      since: new Date("2026-09-01T00:00:00Z"),
      opensOn: new Date("2027-01-02T00:00:00Z"),
      closesOn: new Date("2027-02-02T00:00:00Z"),
      format: "oneTable"
    }
  ],
  // France was the first country whose transfer list states no window dates
  // at all -- neither the summer 2026 page nor the winter one before it says
  // when the window it lists opened or shut (Germany's is the same, below).
  // France's dates come from the LFP's own announcements instead, which are
  // the dates the page is a list of: 15 June to 1 September 2026 for the
  // summer (`lfp.fr/article/les-dates-du-mercato-2026-2027`, read 2026-08-21),
  // and 1 January to 1 February 2027 for the winter, announced in the same
  // article. `since` is the previous window's close, 2 February 2026, from
  // the LFP's 2025-2026 article. France's winter dates are therefore
  // announced rather than customary, which no other country's are -- Germany's
  // page states no dates either, but only its summer window has an archivable
  // announcement behind it; its winter reverts to customary. France's title
  // is not announced: like every other winter title here it is frozen from
  // the naming convention the previous editions used, and both winter 2026-27
  // pages answered 404 on 2026-08-21, so neither is verifiable until it is
  // created.
  FL1: [
    {
      name: "france-summer-2026",
      page: "List of French football transfers summer 2026",
      since: new Date("2026-02-02T00:00:00Z"),
      opensOn: new Date("2026-06-15T00:00:00Z"),
      closesOn: new Date("2026-09-01T00:00:00Z"),
      format: "clubSections"
    },
    {
      name: "france-winter-2026-27",
      page: "List of French football transfers winter 2026–27",
      since: new Date("2026-09-01T00:00:00Z"),
      opensOn: new Date("2027-01-01T00:00:00Z"),
      closesOn: new Date("2027-02-01T00:00:00Z"),
      format: "clubSections"
    }
  ],
  PD: [
    {
      name: "spain-summer-2026",
      page: "List of Spanish football transfers summer 2026",
      since: new Date("2026-02-02T00:00:00Z"),
      opensOn: new Date("2026-07-01T00:00:00Z"),
      closesOn: new Date("2026-09-01T00:00:00Z"),
      format: "clubSections"
    },
    {
      name: "spain-winter-2026-27",
      page: "List of Spanish football transfers winter 2026–27",
      since: new Date("2026-09-01T00:00:00Z"),
      opensOn: new Date("2027-01-01T00:00:00Z"),
      closesOn: new Date("2027-02-02T00:00:00Z"),
      format: "clubSections"
    }
  ],
  // Germany's page states no window dates either, exactly as France's does not
  // -- its lead names only which two divisions are listed. Unlike France, only
  // the summer window's dates are announced; the winter 2026-27 window is
  // customary, on the same terms as England's, Spain's and Italy's, because no
  // announcement for it is archivable yet the way the summer one is.
  //
  // The summer dates are `bundesliga.com`'s own announcement, both pinned as
  // `test/fixtures/bundesliga-transfer-centre-*.html.gz` and checked against
  // in `test/fetch-squad-changes.test.ts`: "The Bundesliga's summer transfer
  // window is open from 1 July to 31 August 2026" (the "Summer 2026" transfer
  // centre article, read 2026-08-27) gives `opensOn`/`closesOn`, and "The
  // Bundesliga's winter transfer window closed at 8pm CET on Monday,
  // 2 February" (the "January 2026" article) gives `since` -- the same
  // 2 February every other country's summer window carries.
  BL1: [
    {
      name: "germany-summer-2026",
      page: "List of German football transfers summer 2026",
      since: new Date("2026-02-02T00:00:00Z"),
      opensOn: new Date("2026-07-01T00:00:00Z"),
      closesOn: new Date("2026-08-31T00:00:00Z"),
      format: "clubSections"
    },
    {
      name: "germany-winter-2026-27",
      page: "List of German football transfers winter 2026–27",
      since: new Date("2026-08-31T00:00:00Z"),
      opensOn: new Date("2027-01-01T00:00:00Z"),
      closesOn: new Date("2027-02-02T00:00:00Z"),
      format: "clubSections"
    }
  ]
};

/**
 * The window a Gameweek's context states the movement of, or undefined for a
 * Gameweek that states none. The gate opens with the window and closes 21 days
 * after it does, so deadline-day deals stay visible for exactly three further
 * Gameweeks and a mid-season Gameweek is never handed a stale list (ADR-0031).
 *
 * A Competition with no windows listed states no movement at all rather than
 * borrowing another country's, which is the same absence a Gameweek outside
 * the gate produces and is rendered the same way.
 *
 * The fetch is its first consumer, which is why it lives beside the fetch: a
 * day whose upcoming deadline is outside the gate pulls nothing at all.
 */
export function squadChangeWindow(
  competition: string,
  deadline: Date
): TransferWindow | undefined {
  return TRANSFER_WINDOWS[competition]?.find((window) =>
    deadline.getTime() >= window.opensOn.getTime()
    && deadline.getTime() <= window.closesOn.getTime() + GATE_DAYS * DAY_MS);
}

/**
 * The window a Wikipedia page title belongs to, for a reader holding a URL and
 * needing the name its snapshot was archived under. The archive replay is that
 * reader: a page title is what a request carries and a window name is what the
 * bytes are filed as, and nothing else in the system needs to walk that
 * direction.
 */
export function transferWindowByPage(page: string): TransferWindow | undefined {
  return Object.values(TRANSFER_WINDOWS)
    .flat()
    .find((window) => window.page === page);
}

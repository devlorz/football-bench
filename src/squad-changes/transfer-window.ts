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
}

/** How long after a window closes its movement stays in the context. */
const GATE_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRANSFER_WINDOWS: readonly TransferWindow[] = [
  {
    name: "summer-2026",
    page: "List of English football transfers summer 2026",
    since: new Date("2026-02-02T00:00:00Z"),
    opensOn: new Date("2026-06-15T00:00:00Z"),
    closesOn: new Date("2026-09-01T00:00:00Z")
  },
  {
    name: "winter-2026-27",
    page: "List of English football transfers winter 2026–27",
    since: new Date("2026-09-01T00:00:00Z"),
    opensOn: new Date("2027-01-01T00:00:00Z"),
    closesOn: new Date("2027-02-02T00:00:00Z")
  }
];

/**
 * The window a Gameweek's context states the movement of, or undefined for a
 * Gameweek that states none. The gate opens with the window and closes 21 days
 * after it does, so deadline-day deals stay visible for exactly three further
 * Gameweeks and a mid-season Gameweek is never handed a stale list (ADR-0031).
 *
 * The fetch is its first consumer, which is why it lives beside the fetch: a
 * day whose upcoming deadline is outside the gate pulls nothing at all.
 */
export function squadChangeWindow(deadline: Date): TransferWindow | undefined {
  return TRANSFER_WINDOWS.find((window) =>
    deadline.getTime() >= window.opensOn.getTime()
    && deadline.getTime() <= window.closesOn.getTime() + GATE_DAYS * DAY_MS);
}

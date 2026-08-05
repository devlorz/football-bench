export interface RehearsedBootstrapOptions {
  /** The archived bootstrap body, exactly as FPL served it. */
  archived: string;
  /** The Gameweek being played, which the pool is snapshotted at. */
  gameweek: number;
  /** The Gameweeks FPL has checked, and so the ones that may be scored. */
  settled: readonly number[];
  /** Listed prices the rehearsal has moved, by player id, in tenths. */
  prices?: Readonly<Record<number, number>>;
}

interface BootstrapBody {
  events: { id: number; is_next: boolean; data_checked: boolean }[];
  elements: { id: number; now_cost: number }[];
}

/**
 * The archived bootstrap as a rehearsed Gameweek would have found it.
 *
 * The archive is one observation taken before the Season began: one Gameweek
 * is next, nothing has been checked and no price has moved. A rehearsal walks
 * forward through Gameweeks it must therefore state — `is_next` is the only
 * thing the daily fetch reads the Gameweek from, `data_checked` the only thing
 * it reads settlement from, and a price that never moves cannot be sold into.
 *
 * Everything else is left exactly as it was archived, which is what keeps the
 * rehearsal a rehearsal against real bytes rather than against a bootstrap of
 * its own invention.
 */
export function rehearsedBootstrap({
  archived,
  gameweek,
  settled,
  prices = {}
}: RehearsedBootstrapOptions): string {
  const bootstrap = JSON.parse(archived) as BootstrapBody;
  const isSettled = new Set(settled);
  if (!bootstrap.events.some(({ id }) => id === gameweek)) {
    throw new Error(`The archive holds no Gameweek ${gameweek} to rehearse`);
  }
  return JSON.stringify({
    ...bootstrap,
    events: bootstrap.events.map((event) => ({
      ...event,
      is_next: event.id === gameweek,
      data_checked: isSettled.has(event.id)
    })),
    elements: bootstrap.elements.map((player) => ({
      ...player,
      now_cost: prices[player.id] ?? player.now_cost
    }))
  });
}

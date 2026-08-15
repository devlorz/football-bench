import type { DryRunArchive } from "../dry-run/load-archive.js";
import type { FplRehearsalArchive } from "./run-fpl-rehearsal.js";

// Two characters or three: `E0` and `E1`, `SP1` and `SP2`. The same widening
// as the replay fetcher's URL pattern, and for the same reason — a Spanish
// snapshot that did not match was re-filed under no Season at all, so the
// rehearsal read it as history from a Season it was not rehearsing.
const FOOTBALL_DATA_SOURCE = /^football_data:\d{4}-\d{2}:([A-Z]{1,2}\d)$/;

/**
 * Reshapes an archive of real upstream bytes into the one a rehearsal replays.
 *
 * Two things move. The bootstrap comes out on its own, because every rehearsed
 * day is derived from it — the Gameweek that is next, the Gameweeks that have
 * checked and the prices that moved are all stated by amending it. And the
 * archived matches are re-filed under the Season being rehearsed: they were
 * archived from the Season before, which is the history a context is built
 * from, but the daily fetch refuses to run past the current Season's first
 * Lock with no matches stored for it. The bytes are untouched; only the Season
 * they are filed under moves, which is the same thing `fetchFootballDataSeason`
 * does with them in production.
 */
export function rehearsalArchive(
  archive: DryRunArchive,
  season: string
): FplRehearsalArchive {
  const bootstrap = archive.snapshots.find(
    ({ source }) => source === "fpl_bootstrap"
  );
  if (bootstrap === undefined) {
    throw new Error(
      "The archive holds no fpl_bootstrap snapshot to rehearse from"
    );
  }
  return {
    bootstrap: bootstrap.body,
    snapshots: archive.snapshots
      .filter(({ source }) => source !== "fpl_bootstrap")
      .map(({ source, body }) => {
        const division = FOOTBALL_DATA_SOURCE.exec(source);
        return division === null
          ? { source, body }
          : { source: `football_data:${season}:${division[1]}`, body };
      })
  };
}

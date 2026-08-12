import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "./club-identity.js";
import {
  parseSquadChanges,
  SquadChangeSourceValidationError
} from "./parse-squad-changes.js";
import { squadChangeWindow, type TransferWindow } from "./transfer-window.js";

type Database = Pick<Client, "query">;

export class SquadChangeSourceHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "SquadChangeSourceHttpError";
  }
}

export function squadChangeSource(window: TransferWindow): string {
  return `wikipedia:squad-changes:${window.name}`;
}

function sourceUrl(window: TransferWindow): string {
  const title = encodeURIComponent(window.page.replace(/ /g, "_"));
  return `https://en.wikipedia.org/w/index.php?title=${title}&action=raw`;
}

/** Wikimedia's user-agent policy asks for a contactable identifier. */
const REQUEST_HEADERS = {
  "User-Agent": "football-bench/1.0 (https://github.com/football-bench)"
};

export interface FetchSquadChangesOptions {
  database: Database;
  season: string;
  http: HttpFetcher;
  now: () => Date;
}

export type FetchSquadChangesResult =
  | { stored: true; gameweek: number; changes: number }
  | { stored: false };

/**
 * The Squad Change half of the daily fetch. On a day the section renders for,
 * this pulls that window's page, archives the bytes before reading them, and
 * replaces exactly the partition of the next Gameweek that renders it. On
 * every other day it touches nothing at all.
 */
export async function fetchSquadChanges({
  database,
  season,
  http,
  now
}: FetchSquadChangesOptions): Promise<FetchSquadChangesResult> {
  const observedAt = now();
  // The day decides the window, and the window decides the Gameweek. Reading
  // it the other way round -- nearest upcoming deadline first -- lets an
  // out-of-gate Gameweek hide the in-gate one behind it, and lets a September
  // fetch pull January's page for a winter deadline that is inside the winter
  // gate but months from rendering.
  const window = squadChangeWindow(observedAt);
  if (window === undefined) {
    return { stored: false };
  }
  const upcoming = await database.query<{ gw: number; deadline_at: Date }>(
    `select gw, deadline_at
       from gameweeks
      where season = $1 and deadline_at > $2
      order by deadline_at, gw`,
    [season, observedAt]
  );
  const gameweek = upcoming.rows.find(({ deadline_at: deadline }) =>
    squadChangeWindow(deadline) === window);
  if (gameweek === undefined) {
    return { stored: false };
  }

  const source = squadChangeSource(window);
  const roster = await database.query<{ club: string }>(
    `select distinct home_team as club
       from fixtures
      where season = $1
      order by club`,
    [season]
  );
  // A Season whose Fixtures have not been fetched yet has no clubs to key a
  // Squad Change on, and every row on the page would be skipped as somebody
  // else's. Nothing to fetch rather than a page fetched for nobody.
  if (roster.rows.length === 0) {
    return { stored: false };
  }
  // Ahead of the request, so a roster spelling the alias table has never seen
  // costs nothing. The other half of the check -- that the page still links
  // each of the twenty to its pinned article -- needs the page and lives in
  // the parser.
  const unknown = roster.rows.flatMap(({ club }) =>
    resolveWikipediaClub(club) === undefined ? [club] : []);
  if (unknown.length > 0) {
    throw new SquadChangeSourceValidationError(
      source,
      unknown.map((club) => ({
        field: "club",
        detail: `unknown Premier League club spelling ${club}`
      }))
    );
  }
  const pinned = new Map(roster.rows.map(({ club }) =>
    [club, resolveWikipediaClub(club) as WikipediaClub]));

  const url = sourceUrl(window);
  const response = await http(url, {
    method: "GET",
    headers: REQUEST_HEADERS
  });

  // Archived before anything is read from it, so an unusable response is
  // still evidence -- and so a community edit stays auditable after the fact.
  await storeRawSnapshots(database, [{ source, body: response.body }]);

  if (response.status < 200 || response.status >= 300) {
    throw new SquadChangeSourceHttpError(source, response.status, url);
  }

  const changes = parseSquadChanges(source, response.body, pinned);

  await database.query("begin");
  try {
    await database.query(
      "delete from squad_changes where season = $1 and gw = $2",
      [season, gameweek.gw]
    );
    for (const change of changes) {
      await database.query(
        `insert into squad_changes (
           season, gw, club, direction, player, counterpart_club,
           fee, loan, dated_on, observed_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          season,
          gameweek.gw,
          change.club,
          change.direction,
          change.player,
          change.counterpartClub,
          change.fee,
          change.loan,
          change.datedOn,
          observedAt
        ]
      );
    }
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
  return { stored: true, gameweek: gameweek.gw, changes: changes.length };
}

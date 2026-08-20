import type { Client } from "pg";
import type { HttpFetcher } from "../http.js";
import { storeRawSnapshots } from "../snapshots/store-raw-snapshots.js";
import {
  resolveWikipediaClub,
  type WikipediaClub
} from "../squad-changes/club-identity.js";
import {
  headCoachSource,
  headCoachSourceOf,
  type HeadCoachSource
} from "./head-coach-source.js";
import {
  parseHeadCoachChanges,
  HeadCoachSourceValidationError
} from "./parse-head-coach-changes.js";
import { parseHeadCoaches } from "./parse-head-coaches.js";

type Database = Pick<Client, "query">;

export class HeadCoachSourceHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(`${source}: HTTP ${status} from ${url}`);
    this.name = "HeadCoachSourceHttpError";
  }
}

function sourceUrl({ page }: HeadCoachSource): string {
  const title = encodeURIComponent(page.replace(/ /g, "_"));
  return `https://en.wikipedia.org/w/index.php?title=${title}&action=raw`;
}

/** Wikimedia's user-agent policy asks for a contactable identifier. */
const REQUEST_HEADERS = {
  "User-Agent": "football-bench/1.0 (https://github.com/football-bench)"
};

export interface FetchHeadCoachChangesOptions {
  database: Database;
  competition: string;
  season: string;
  http: HttpFetcher;
  now: () => Date;
}

export type FetchHeadCoachChangesResult =
  | { stored: true; gameweek: number; changes: number }
  | { stored: false };

/**
 * The Head Coach half of the daily fetch. It pulls the Season's article,
 * archives the bytes before reading them, and replaces the partition of the
 * next Gameweek to render -- the nearest deadline still ahead, and no window
 * arithmetic, because a season article's scope is the Season and every
 * Gameweek in it renders the section.
 *
 * That is the whole difference from `fetchSquadChanges`, which has to decide
 * which of two pages a day belongs to before it can decide which Gameweek. A
 * Season or a Competition the article list does not carry stores nothing at
 * all, which is the same absence the context renders as no section.
 */
export async function fetchHeadCoachChanges({
  database,
  competition,
  season,
  http,
  now
}: FetchHeadCoachChangesOptions): Promise<FetchHeadCoachChangesResult> {
  const observedAt = now();
  const article = headCoachSource(competition, season);
  if (article === undefined) {
    return { stored: false };
  }
  const upcoming = await database.query<{ gw: number }>(
    `select gw
       from gameweeks
      where competition = $1 and season = $2 and deadline_at > $3
      order by deadline_at, gw
      limit 1`,
    [competition, season, observedAt]
  );
  const gameweek = upcoming.rows[0]?.gw;
  if (gameweek === undefined) {
    return { stored: false };
  }

  const source = headCoachSourceOf(article);
  // Scoped to the Competition, or a second one's clubs arrive in this roster
  // and every one of them is reported as a spelling this page never heard of.
  const roster = await database.query<{ club: string }>(
    `select distinct home_team as club
       from fixtures
      where competition = $1 and season = $2
      order by club`,
    [competition, season]
  );
  // A Season whose Fixtures have not been fetched yet has no clubs to key a
  // change on, and every row of the table would be refused as somebody else's.
  if (roster.rows.length === 0) {
    return { stored: false };
  }
  // Ahead of the request, so a roster spelling the identity map has never seen
  // costs nothing.
  const unknown = roster.rows.flatMap(({ club }) =>
    resolveWikipediaClub(competition, club) === undefined ? [club] : []);
  if (unknown.length > 0) {
    throw new HeadCoachSourceValidationError(
      source,
      unknown.map((club) => ({
        field: "club",
        detail: `unknown ${competition} club spelling ${club}`
      }))
    );
  }
  const pinned = new Map(roster.rows.map(({ club }) =>
    [club, resolveWikipediaClub(competition, club) as WikipediaClub]));

  const url = sourceUrl(article);
  const response = await http(url, {
    method: "GET",
    headers: REQUEST_HEADERS
  });

  // Archived before anything is read from it, so an unusable response is still
  // evidence -- and so a community edit stays auditable after the fact.
  await storeRawSnapshots(database, [{ source, body: response.body }]);

  if (response.status < 200 || response.status >= 300) {
    throw new HeadCoachSourceHttpError(source, response.status, url);
  }

  const changes = parseHeadCoachChanges(source, response.body, pinned);
  // The same bytes, read a second time: who is in post is a state the record
  // holds beside the changes that explain it (ADR-0045), and both come off one
  // request.
  const inPost = parseHeadCoaches(source, response.body, pinned);

  await database.query("begin");
  try {
    // Scoped, or a La Liga fetch empties the Premier League's partition of the
    // same Gameweek number on its way past.
    await database.query(
      `delete from head_coach_changes
        where competition = $1 and season = $2 and gw = $3`,
      [competition, season, gameweek]
    );
    await database.query(
      `delete from head_coaches
        where competition = $1 and season = $2 and gw = $3`,
      [competition, season, gameweek]
    );
    for (const { club, headCoach } of inPost) {
      await database.query(
        `insert into head_coaches (
           competition, season, gw, club, head_coach, observed_at
         ) values ($1, $2, $3, $4, $5, $6)`,
        [competition, season, gameweek, club, headCoach, observedAt]
      );
    }
    for (const change of changes) {
      await database.query(
        `insert into head_coach_changes (
           competition, season, gw, club, direction, head_coach, manner,
           dated_on, observed_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          competition,
          season,
          gameweek,
          change.club,
          change.direction,
          change.headCoach,
          change.manner,
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
  return { stored: true, gameweek, changes: changes.length };
}

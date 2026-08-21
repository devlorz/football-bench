import type { HttpFetcher, HttpRequestOptions } from "../http.js";
import { squadChangeSource } from "../squad-changes/fetch-squad-changes.js";
import { transferWindowByPage } from "../squad-changes/transfer-window.js";
import {
  headCoachSourceByPage,
  headCoachSourceOf
} from "../head-coach/head-coach-source.js";

export interface ArchivedSnapshot {
  source: string;
  body: string;
}

export class ArchiveReplayMissError extends Error {
  constructor(
    public readonly url: string,
    public readonly source: string | null
  ) {
    super(
      source === null
        ? `No archived snapshot source is known for ${url}`
        : `No archived snapshot for source ${source} (${url})`
    );
    this.name = "ArchiveReplayMissError";
  }
}

const FPL_SOURCE_BY_URL = new Map([
  ["https://fantasy.premierleague.com/api/bootstrap-static/", "fpl_bootstrap"],
  ["https://fantasy.premierleague.com/api/fixtures/", "fpl_fixtures"]
]);

// `[A-Z]{1,2}\d` and not `[A-Z]\d`: England's codes are two characters and
// Spain's are three (`SP1`, `SP2`). Under the narrower form a Spanish URL
// matched nothing, so the replay reported "no archived snapshot source is
// known" for bytes it was holding — a dry run that could not replay half the
// history it had archived.
const FOOTBALL_DATA_URL =
  /^https:\/\/www\.football-data\.co\.uk\/mmz4281\/(\d{2})(\d{2})\/([A-Z]{1,2}\d)\.csv$/;

/**
 * football-data addresses a Season as `2526` while its snapshot is archived
 * under the `2025-26` form used everywhere else, so the URL is translated
 * rather than matched literally.
 */
function footballDataSource(url: string): string | null {
  const match = FOOTBALL_DATA_URL.exec(url);
  if (match === null) {
    return null;
  }
  const [, startYear, endYear, division] = match;
  return `football_data:20${startYear}-${endYear}:${division}`;
}

// The slug admits a digit because `Ligue_1` is one: the pattern used to read
// letters and underscores only, so every Ligue 1 snapshot the archive held
// replayed as "no archived snapshot source is known". That degrades a dry run
// to "xG unavailable" rather than failing it (ADR-0019), which is why this is
// pinned by a test rather than trusted.
//
// It is the same bug as the three-character division code below, which ticket 6
// fixed for `SP1` and which the football-data pattern was widened for: a source
// name this codebase chooses, and a pattern narrower than the names it chooses.
// Ticket 0033 wrote that it could not recur here, and for `Serie_A` that was
// true. `Ligue_1` ends in a digit.
const UNDERSTAT_URL =
  /^https:\/\/understat\.com\/getLeagueData\/(\w+)\/(\d{4})$/;

/**
 * Understat addresses a Season by its opening year while its snapshot is
 * archived under the `2025-26` form, the same translation the football-data
 * URL needs. Absent until ticket 6: a dry run therefore replayed every source
 * but this one, and because an unreachable Understat is a *reported* outcome
 * rather than a failure (ADR-0019), it degraded quietly to "xG unavailable" on
 * every form line instead of saying so. The rehearsed context and the
 * production context differed, and nothing in the run pointed at it.
 */
function understatSource(url: string): string | null {
  const match = UNDERSTAT_URL.exec(url);
  if (match === null) {
    return null;
  }
  const [, league, startYear] = match;
  const endYear = String((Number(startYear) + 1) % 100).padStart(2, "0");
  return `understat:${startYear}-${endYear}:${league}`;
}

const FOOTBALL_DATA_ORG_URL =
  /^https:\/\/api\.football-data\.org\/v4\/competitions\/([A-Z0-9]+)\/matches\?season=(\d{4})$/;

/**
 * football-data.org names a Season by the calendar year it opens in, the same
 * translation Understat's URL needs. Absent until La Liga's first rehearsal,
 * which is when it mattered: this is the source a non-`PL` Competition gets
 * its whole schedule from, and without it the replay reported no known source
 * for bytes it was holding.
 */
function footballDataOrgSource(url: string): string | null {
  const match = FOOTBALL_DATA_ORG_URL.exec(url);
  if (match === null) {
    return null;
  }
  const [, competition, startYear] = match;
  const endYear = String((Number(startYear) + 1) % 100).padStart(2, "0");
  return `football_data_org:${startYear}-${endYear}:${competition}`;
}

const WIKIPEDIA_PAGE_URL =
  /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?title=([^&]+)&action=raw$/;

/**
 * A transfer list is archived under its window's name and requested by its
 * page title, so the title is translated back through the windows themselves.
 *
 * Missing since Squad Changes joined the context, and quiet the whole time for
 * the reason ADR-0031 makes their absence quiet: an unreachable Wikipedia is a
 * stated absence rather than a failure, so every rehearsal since has replayed
 * a packet whose Squad Changes section read "no Squad Change data stored" over
 * an archive that held the page. The rehearsed context and the production
 * context differed, and nothing in the run pointed at it — the same sentence
 * the Understat gap above earned, one source later.
 */
function squadChangeSourceFor(url: string): string | null {
  const match = WIKIPEDIA_PAGE_URL.exec(url);
  if (match?.[1] === undefined) {
    return null;
  }
  const page = decodeURIComponent(match[1]).replace(/_/g, " ");
  const window = transferWindowByPage(page);
  return window === undefined ? null : squadChangeSource(window);
}

/**
 * A season article is archived under its own name and requested by its page
 * title, exactly as a transfer list is -- and left out, it would go quiet in
 * exactly the same way, because a Head Coach section with no rows reads as a
 * stated absence rather than as a failure (ADR-0044). Two sources have now
 * earned that paragraph; the third one added here does not have to.
 */
function headCoachChangeSourceFor(url: string): string | null {
  const match = WIKIPEDIA_PAGE_URL.exec(url);
  if (match?.[1] === undefined) {
    return null;
  }
  const page = decodeURIComponent(match[1]).replace(/_/g, " ");
  const article = headCoachSourceByPage(page);
  return article === undefined ? null : headCoachSourceOf(article);
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * One archived response exists per Base Model, so the Entrant being called is
 * read from the request body rather than from the URL every Entrant shares.
 */
function openRouterSource(
  url: string,
  options: HttpRequestOptions | undefined
): string | null {
  if (url !== OPENROUTER_URL || options?.body === undefined) {
    return null;
  }
  let baseModel: unknown;
  try {
    baseModel = (JSON.parse(options.body) as { model?: unknown }).model;
  } catch {
    return null;
  }
  return typeof baseModel === "string"
    ? `openrouter-preflight:${baseModel}`
    : null;
}

function archiveSource(
  url: string,
  options: HttpRequestOptions | undefined
): string | null {
  return FPL_SOURCE_BY_URL.get(url)
    ?? footballDataSource(url)
    ?? understatSource(url)
    ?? footballDataOrgSource(url)
    ?? squadChangeSourceFor(url)
    ?? headCoachChangeSourceFor(url)
    ?? openRouterSource(url, options);
}

/**
 * Serves archived upstream bytes through the outbound-HTTP seam so a dry run
 * exercises the real path with no network. A URL no snapshot covers is a
 * failure rather than a silent empty response.
 */
export function createArchiveReplayFetcher(
  snapshots: ArchivedSnapshot[]
): HttpFetcher {
  const bodyBySource = new Map(
    snapshots.map(({ source, body }) => [source, body])
  );
  return async (url, options) => {
    const source = archiveSource(url, options);
    const body = source === null ? undefined : bodyBySource.get(source);
    if (body === undefined) {
      throw new ArchiveReplayMissError(url, source);
    }
    return { status: 200, body };
  };
}

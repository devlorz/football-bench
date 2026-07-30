import type { HttpFetcher, HttpRequestOptions } from "../http.js";

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

const FOOTBALL_DATA_URL =
  /^https:\/\/www\.football-data\.co\.uk\/mmz4281\/(\d{2})(\d{2})\/([A-Z]\d)\.csv$/;

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

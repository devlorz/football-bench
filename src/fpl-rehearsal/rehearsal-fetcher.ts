import {
  ArchiveReplayMissError,
  createArchiveReplayFetcher,
  type ArchivedSnapshot
} from "../dry-run/archive-replay-fetcher.js";
import type { HttpFetcher } from "../http.js";

/**
 * The live-points endpoint, which the dry run never reaches: the archive holds
 * no Gameweek FPL has checked, so a rehearsal fabricates the settled points it
 * scores. The Season is not in the URL but is in the archive's source key, so
 * it is supplied rather than parsed.
 */
const LIVE_URL = /^https:\/\/fantasy\.premierleague\.com\/api\/event\/(\d+)\/live\/$/;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * What a Base Model says on its `attempt`-th turn of this Gameweek, counting
 * from zero. A Repair is the same Entrant's next turn in the same
 * conversation, so the count is per Base Model rather than per run — one
 * counter across the roster would hand an Entrant's Repair to whichever seat
 * the worker pool happened to reach next.
 */
export type RehearsalAnswer = (baseModel: string, attempt: number) => string;

export interface RehearsalFetcherOptions {
  season: string;
  snapshots: ArchivedSnapshot[];
  answer: RehearsalAnswer;
}

/** The envelope an OpenRouter answer arrives in, as the Entrant path reads it. */
function openRouterBody(baseModel: string, content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
    openrouter_metadata: {
      endpoints: {
        available: [
          { provider: baseModel.split("/")[0], model: baseModel, selected: true }
        ]
      }
    },
    usage: { prompt_tokens: 4096, completion_tokens: 256 }
  });
}

/**
 * Serves a rehearsal's archived and fabricated bytes through the outbound-HTTP
 * seam. Anything it does not recognise falls through to the dry run's replay
 * fetcher, which refuses it — a rehearsal that reached the network would prove
 * nothing about the bytes it was given.
 */
export function createRehearsalFetcher({
  season,
  snapshots,
  answer
}: RehearsalFetcherOptions): HttpFetcher {
  const archive = createArchiveReplayFetcher(snapshots);
  const bodyBySource = new Map(
    snapshots.map(({ source, body }) => [source, body])
  );
  const attempts = new Map<string, number>();
  return async (url, options) => {
    if (url === OPENROUTER_URL) {
      const { model } = JSON.parse(options?.body ?? "{}") as {
        model?: string;
      };
      if (model === undefined) {
        throw new Error("A rehearsed OpenRouter call named no Base Model");
      }
      const attempt = attempts.get(model) ?? 0;
      attempts.set(model, attempt + 1);
      return { status: 200, body: openRouterBody(model, answer(model, attempt)) };
    }

    const live = LIVE_URL.exec(url);
    if (live !== null) {
      const source = `fpl_live:${season}:${live[1]}`;
      const body = bodyBySource.get(source);
      // Named rather than left to fall through: the replay fetcher below knows
      // nothing of this URL and would refuse it as an address it cannot place,
      // when what actually happened is a Gameweek the rehearsal never settled.
      if (body === undefined) {
        throw new ArchiveReplayMissError(url, source);
      }
      return { status: 200, body };
    }
    return archive(url, options);
  };
}

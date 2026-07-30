import type { ArchivedSnapshot } from "./archive-replay-fetcher.js";
import type { ArchivedEntrant } from "./load-archive.js";

export interface ExpectedDryRunOutcome {
  predictions: number;
  gaps: number;
}

export interface ExpectedDryRunOutcomeOptions {
  entrants: ArchivedEntrant[];
  snapshots: ArchivedSnapshot[];
  fixtureIds: number[];
  beforeLock: boolean;
}

/**
 * Reads the Fixture an archived response names. Derived straight from the
 * archived bytes rather than through the validator, so the expectation is an
 * independent statement about the archive rather than a restatement of what
 * the prediction path happens to do with it.
 */
function answeredFixtureId(body: string): number | null {
  try {
    const response = JSON.parse(body) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return null;
    }
    const answer = JSON.parse(content) as { fixture_id?: unknown };
    return typeof answer.fixture_id === "number" ? answer.fixture_id : null;
  } catch {
    return null;
  }
}

/**
 * What a dry run should produce, given that archived bytes are replayed
 * exactly. Each Entrant can only answer the one Fixture its archived response
 * names, and only while the Lock still stands — so the counts are knowable in
 * advance and a run that misses them has gone wrong.
 */
export function expectedDryRunOutcome({
  entrants,
  snapshots,
  fixtureIds,
  beforeLock
}: ExpectedDryRunOutcomeOptions): ExpectedDryRunOutcome {
  const bodyBySource = new Map(
    snapshots.map(({ source, body }) => [source, body])
  );
  const fixtures = new Set(fixtureIds);
  const predictions = !beforeLock
    ? 0
    : entrants.filter((entrant) => {
      const body = bodyBySource.get(
        `openrouter-preflight:${entrant.base_model}`
      );
      if (body === undefined) {
        return false;
      }
      const answered = answeredFixtureId(body);
      return answered !== null && fixtures.has(answered);
    }).length;

  return {
    predictions,
    gaps: entrants.length * fixtures.size - predictions
  };
}

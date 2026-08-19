import type { HttpRequest } from "../http.js";
import { z } from "zod";

export const MATCH_PROMPT_VERSION = "match/2026-27-v2";
export const MATCH_PROMPT_SHA256 =
  "dc2ed52eb8fad16c3382d3ebb18f9d859d05305a2147cc9c77d7c21f4d2d2d67";

export interface MatchPrompt {
  /** The Prompt Version a Competition's seats are entered under. */
  version: string;
  /** The sha256 of one fully rendered context at that version. */
  sha256: string;
  /** The template's only variable (ADR-0038). */
  competitionName: string;
  /**
   * The version this Competition restarted away from, on the Competitions that
   * restarted, and absent on the ones that never did. A Competition has one at
   * most: a version is retired by being replaced, and the replacement is
   * `version` above.
   */
  retired?: RetiredGameweek;
}

/**
 * A Prompt Version that was used, is unamendable, and no run will read again,
 * together with the one Gameweek it owns whole (ADR-0042).
 *
 * A field on the Competition rather than a flag anywhere: whether a league has
 * a retired Gameweek to show is answered by whether it has one, and the two
 * values a block needs are the two this holds.
 */
export interface RetiredGameweek {
  version: string;
  gw: number;
}

/**
 * The block's heading, frozen by ADR-0042 and built here because this is where
 * both of its variables live. Nothing else in the repo may spell it: a label
 * that names a version the read does not filter by is the one way this block
 * can lie about which question was asked.
 */
export const retiredGameweekLabel = ({ version, gw }: RetiredGameweek): string =>
  `Gameweek ${gw} — played under ${version}, before the restart`;

/**
 * What the block's RPS may not reach a reader without.
 *
 * The two rankings carry their own stored sentences and this one carries the
 * evidential layer's, which has none to store: ADR-0012 says a claim about one
 * Base Model forecasting better than another rests on Paired Differences and
 * their interval, and ADR-0042 refuses this block both — one Gameweek supports
 * no claim. So the figure is published with the reason it proves nothing,
 * which is the only shape in which it may be published at all.
 *
 * A constant and not a `scores` row: it qualifies no computed number, it is
 * ADR-0042's own sentence, and there is nothing for the scorer to have written
 * it into — the retired version's rows were written before this block existed.
 */
export const RETIRED_GAMEWEEK_CAVEAT =
  "One Gameweek supports no claim. These figures carry no interval and no "
  + "Comparison Anchor, and nothing about whether one Base Model forecasts "
  + "better than another can be read off them.";

/**
 * One template, one frozen Prompt Version per Competition (ADR-0038). The
 * wording is shared; the Competition's name is the only thing that differs, so
 * no two leagues can drift into being asked different questions.
 *
 * The Premier League's two values are the constants above. `match/2026-27-v2`
 * was amended in place rather than frozen by use: ADR-0042 found no stored
 * context under it, and ADR-0026's freeze binds at first use, so it stayed
 * amendable until its first Lock, 2026-08-21T17:30Z, and is unamendable from
 * there. Every other Competition is opened at
 * `match-<code, lowercased>/2026-27-v1`, and opening a league is one entry
 * here. One of seven, though: this file, `DIVISIONS`, the division check
 * constraint, the Understat league and its club map, the transfer windows with
 * their own club map, and the `competition_code` domain if the code is new —
 * gathered in
 * `docs/runbooks/opening-a-competition.md`, because each of these files used to
 * describe its own edit as the single one and none of them was wrong.
 *
 * The sha is over a fully rendered context, not over the template, because
 * that is the mechanism that already exists and what it is worth pinning is
 * the whole prompt's format. Both pins here were re-taken from real renders of
 * the template ADR-0043 amended, read before they were written down — which is
 * what `context:show` is for, and how every earlier move of `PD`'s sha was
 * found.
 *
 * `PD` sits on `match-pd/2026-27-v2`. Its v1 was used — La Liga's Gameweek 1,
 * six contexts and sixty Predictions — and so is unamendable and retired: the
 * scorer selects by the version named here, so from this constant's move the
 * v1 seats are out of every run, and Gameweek 1 is kept whole under its own
 * label instead (ADR-0042). v2 is unused until La Liga's Gameweek 2 Lock and
 * unamendable from it.
 */
const MATCH_PROMPTS: Readonly<Record<string, MatchPrompt>> = {
  PL: {
    version: MATCH_PROMPT_VERSION,
    sha256: MATCH_PROMPT_SHA256,
    competitionName: "Premier League"
  },
  PD: {
    version: "match-pd/2026-27-v2",
    sha256:
      "ba4d797ff28e530f348f6ccb9a1e4ccdba109ccc7520dd0d73385f5ea26d237d",
    competitionName: "La Liga",
    retired: { version: "match-pd/2026-27-v1", gw: 1 }
  }
};

/** Every Competition the match track has frozen a Prompt Version for. */
export const MATCH_PROMPT_COMPETITIONS: readonly string[] =
  Object.keys(MATCH_PROMPTS);

/**
 * Every frozen Match Prompt Version, for the read that means "a Match seat,
 * whichever Competition it sits in".
 */
export const MATCH_PROMPT_VERSIONS: readonly string[] =
  Object.values(MATCH_PROMPTS).map(({ version }) => version);

/**
 * Loudly, because every caller of this is about to write or read a seat: a
 * Competition with no frozen Prompt Version has no Entrants, and falling back
 * to the Premier League's would seat its ten Entrants twice under one id.
 */
export function matchPromptOf(competition: string): MatchPrompt {
  const prompt = MATCH_PROMPTS[competition];
  if (prompt === undefined) {
    throw new Error(`Competition ${competition} has no frozen Prompt Version`);
  }
  return prompt;
}

/**
 * The retired Gameweek of a Competition that has one, and null for a
 * Competition that never restarted — which is every Competition but La Liga,
 * and the reason the block is one league's and not a page shape every league
 * carries empty.
 */
export function retiredGameweekOf(competition: string): RetiredGameweek | null {
  return matchPromptOf(competition).retired ?? null;
}

export interface MatchPromptFixture {
  fixture_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
}

export function matchContext(
  fixture: MatchPromptFixture,
  historicalContext: string,
  competition: string
): string {
  return [
    `Predict this ${matchPromptOf(competition).competitionName} Fixture.`,
    "",
    `Fixture ID: ${fixture.fixture_id}`,
    `Home: ${fixture.home_team}`,
    `Away: ${fixture.away_team}`,
    `Kick-off: ${fixture.kickoff_at.toISOString()}`,
    "",
    historicalContext,
    "",
    "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
    "The first character must be { and the last character must be }.",
    "Do not use Markdown or wrap the JSON in code fences.",
    "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers.",
    // ADR-0043, verbatim. Facts and the game's rule, never advice (ADR-0018):
    // the first settles which of two readings `score` has, the second names
    // the rule the probabilities are judged by. Telling an Entrant what to do
    // with either would be the coaching that ADR rejected.
    "score is the exact final scoreline you judge most likely — not expected goals rounded.",
    "Probabilities are scored with the ranked probability score over the ordered outcomes Home, Draw, Away; lower is better."
  ].join("\n");
}

export interface OpenRouterEntrant {
  baseModel: string;
  provider: string;
  quantization: string | null;
}

export interface OpenRouterMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation as it goes on the wire: the first message's text wrapped in
 * one content block ending with one `cache_control` breakpoint, every later
 * turn left as it stands (spec 0010).
 *
 * The breakpoint is uniform and semantically inert. The two providers that
 * require it stated begin discounting the prefix a Repair chain re-sends, the
 * seven that discount on their own ignore it, and no seat's envelope differs
 * from another's. It lives in the envelope only: the stored context text, its
 * hash and the Prompt Version are untouched by it.
 */
function withCacheBreakpoint(
  messages: readonly OpenRouterMessage[]
): unknown[] {
  const [first, ...rest] = messages;
  if (first === undefined) {
    return [];
  }
  return [
    {
      role: first.role,
      content: [{
        type: "text",
        text: first.content,
        cache_control: { type: "ephemeral" }
      }]
    },
    ...rest
  ];
}

export function openRouterRequest(
  apiKey: string,
  entrant: OpenRouterEntrant,
  messagesOrInitialPrompt: string | OpenRouterMessage[]
): HttpRequest {
  const provider = {
    order: [entrant.provider],
    allow_fallbacks: false,
    ...(entrant.quantization === null
      ? {}
      : { quantizations: [entrant.quantization] })
  };
  return {
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled"
    },
    body: JSON.stringify({
      model: entrant.baseModel,
      messages: withCacheBreakpoint(
        typeof messagesOrInitialPrompt === "string"
          ? [{ role: "user", content: messagesOrInitialPrompt }]
          : messagesOrInitialPrompt
      ),
      provider,
      stream: false
    })
  };
}

const openRouterResponseSchema = z.looseObject({
  choices: z.array(z.looseObject({
    message: z.looseObject({
      content: z.string().nullable(),
      refusal: z.string().min(1).nullable().optional()
    })
  })).min(1),
  openrouter_metadata: z.looseObject({
    endpoints: z.looseObject({
      available: z.array(z.looseObject({
        provider: z.string().min(1),
        model: z.string().min(1).optional(),
        selected: z.boolean()
      }))
    })
  }).optional(),
  usage: z.looseObject({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional()
  }).optional()
});

export interface ParsedOpenRouterResponse {
  content: string | null;
  refusal: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export function parseOpenRouterResponse(
  body: string
): ParsedOpenRouterResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = openRouterResponseSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const [choice] = parsed.data.choices;
  if (choice === undefined) {
    throw new Error("OpenRouter response schema admitted an empty choices array");
  }
  const selectedEndpoint = parsed.data.openrouter_metadata
    ?.endpoints.available.find(({ selected }) => selected);

  return {
    content: choice.message.content,
    refusal: choice.message.refusal ?? null,
    resolvedProvider: selectedEndpoint?.provider ?? null,
    resolvedModel: selectedEndpoint?.model ?? null,
    tokensIn: parsed.data.usage?.prompt_tokens ?? null,
    tokensOut: parsed.data.usage?.completion_tokens ?? null
  };
}

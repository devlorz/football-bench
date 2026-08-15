import type { HttpRequest } from "../http.js";
import { z } from "zod";

export const MATCH_PROMPT_VERSION = "match/2026-27-v2";
export const MATCH_PROMPT_SHA256 =
  "cb518985c6232420cc0a2abf3f4d05a6e988779a1d0871eac05af368e2b6fbbf";

export interface MatchPrompt {
  /** The Prompt Version a Competition's seats are entered under. */
  version: string;
  /** The sha256 of one fully rendered context at that version. */
  sha256: string;
  /** The template's only variable (ADR-0038). */
  competitionName: string;
}

/**
 * One template, one frozen Prompt Version per Competition (ADR-0038). The
 * wording is shared; the Competition's name is the only thing that differs, so
 * no two leagues can drift into being asked different questions.
 *
 * The Premier League's two values are the constants above, unmoved and
 * unmovable: `match/2026-27-v2` has been used, and a used Prompt Version is
 * unamendable (ADR-0026). Every other Competition takes
 * `match-<code, lowercased>/2026-27-v1`, and opening a league is one entry
 * here. One of six, though: this file, `DIVISIONS`, the division check
 * constraint, the Understat league and its club map, the transfer windows with
 * their own club map, and the `competition_code` domain if the code is new —
 * gathered in
 * `docs/runbooks/opening-a-competition.md`, because each of these files used to
 * describe its own edit as the single one and none of them was wrong.
 *
 * The sha is over a fully rendered context, not over the template, because
 * that is the mechanism that already exists and what it is worth pinning is
 * the whole prompt's format. `PD`'s moved once, in ticket 6, when La Liga got
 * its divisions and the league table stopped reading "unavailable" — the move
 * ticket 4 wrote it down expecting, legitimate because the freeze binds at
 * first use (ADR-0038) and nothing predicts under this version until ticket 8.
 * From here it is as unmovable as the Premier League's.
 */
const MATCH_PROMPTS: Readonly<Record<string, MatchPrompt>> = {
  PL: {
    version: MATCH_PROMPT_VERSION,
    sha256: MATCH_PROMPT_SHA256,
    competitionName: "Premier League"
  },
  PD: {
    version: "match-pd/2026-27-v1",
    sha256:
      "b11a86bc791d505367a8db0d14aa7254a3f710349f4be83f5080bca17c3be374",
    competitionName: "La Liga"
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
    "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers."
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

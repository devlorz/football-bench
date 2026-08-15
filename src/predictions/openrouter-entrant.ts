import type { HttpRequest } from "../http.js";
import { z } from "zod";

export const MATCH_PROMPT_VERSION = "match/2026-27-v2";
export const MATCH_PROMPT_SHA256 =
  "cb518985c6232420cc0a2abf3f4d05a6e988779a1d0871eac05af368e2b6fbbf";

export interface MatchPromptFixture {
  fixture_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
}

export function matchContext(
  fixture: MatchPromptFixture,
  historicalContext: string
): string {
  return [
    "Predict this Premier League Fixture.",
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

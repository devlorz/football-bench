import type { HttpRequest } from "../http.js";
import { z } from "zod";

export const MATCH_PROMPT_VERSION = "match/2026-27-v1";
export const MATCH_PROMPT_SHA256 =
  "ff41fc472cb840ccbe126fdd81444dc3ce4c89a38a6461e3232511c508a2fe47";

export interface MatchPromptFixture {
  fpl_id: number;
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
    `Fixture ID: ${fixture.fpl_id}`,
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
      messages: typeof messagesOrInitialPrompt === "string"
        ? [{ role: "user", content: messagesOrInitialPrompt }]
        : messagesOrInitialPrompt,
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

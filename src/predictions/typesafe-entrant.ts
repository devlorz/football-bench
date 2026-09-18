import type { HttpRequest } from "../http.js";
import { z } from "zod";
import {
  parseOpenRouterResponse, type ParsedEntrantResponse
} from "./openrouter-entrant.js";

/**
 * The second wire ADR-0059 opens: TypeSafe's Jev, asked over its own typed
 * endpoint rather than an OpenRouter chat completion. One row,
 * `provider = 'typesafe'`, speaks this; every other row's OpenRouter envelope
 * is untouched (`openrouter-entrant.ts`).
 */
export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
export const TYPESAFE_MODEL = "jev-latest";
const TYPESAFE_PROVIDER = "typesafe";

/** The one test a `MatchCall` or a `models` row is asked: which wire it speaks. */
export function isTypesafeProvider(provider: string): boolean {
  return provider === TYPESAFE_PROVIDER;
}

/** The wire's name for a human reading an error detail, never a storage key. */
export function wireNameOf(provider: string): string {
  return isTypesafeProvider(provider) ? "TypeSafe" : "OpenRouter";
}

/**
 * Chooses the parser by provider, so `attempt-match-calls.ts` and
 * `preflight-base-models.ts` share the one branch rather than each carrying
 * their own copy of it (ADR-0059). Every non-typesafe provider still calls
 * `parseOpenRouterResponse`, byte-for-byte.
 */
export function parseWireResponse(
  provider: string,
  body: string,
  fixtureId: number
): ParsedEntrantResponse | null {
  return isTypesafeProvider(provider)
    ? parseTypesafeResponse(body, fixtureId)
    : parseOpenRouterResponse(body);
}

/**
 * Refuses a call before it is made, rather than letting an absent key reach
 * `typesafeApiKeyOrThrow` at the point a request is actually built: a caller
 * with several rows to check (pre-flight's roster) or several Gameweeks to
 * walk (a replay) wants the one row responsible named, and wants it named
 * before any of its own calls are made — not mid-run on whichever row
 * happens to be typesafe.
 */
export function requireTypesafeApiKey(
  modelId: string,
  provider: string,
  typesafeApiKey: string | null | undefined
): void {
  if (isTypesafeProvider(provider) && (typesafeApiKey ?? null) === null) {
    throw new Error(
      `TYPESAFE_API_KEY is required to call ${modelId}, whose provider is `
      + "'typesafe'"
    );
  }
}

/**
 * The engine's own backstop, at the point a request is built rather than
 * only at the entry points that call `requireTypesafeApiKey` above: a caller
 * that reaches `typesafeRequest` directly, or one that forgot the check,
 * must not have a missing key quietly become an empty `Authorization: Bearer`
 * sent to the real host.
 */
export function typesafeApiKeyOrThrow(
  typesafeApiKey: string | null | undefined
): string {
  if (typesafeApiKey === null || typesafeApiKey === undefined) {
    throw new Error("TYPESAFE_API_KEY is required to call a typesafe row");
  }
  return typesafeApiKey;
}

const OUTCOME_CRITERIA = { H: "Home win", D: "Draw", A: "Away win" };

/** The thirty-six scorelines `0-0` … `5-5`, the whole of the second Choice. */
function scorelineCriteria(): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (let home = 0; home <= 5; home += 1) {
    for (let away = 0; away <= 5; away += 1) {
      criteria[`${home}-${away}`] = `${home}-${away}`;
    }
  }
  return criteria;
}

const SCORELINE_CRITERIA = scorelineCriteria();

/**
 * The whole of ADR-0059's mapping: `state` is the stored context body, sent
 * whole, and the two Choice questions it asks are fixed in code rather than
 * read off `models.config` — "one mapping, in code, under this ADR" (the
 * ADR's own rejection of a config-driven option set).
 */
export function typesafeRequest(apiKey: string, state: string): HttpRequest {
  return {
    url: TYPESAFE_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: TYPESAFE_MODEL,
      state,
      questions: {
        outcome: { type: "choice", criteria: OUTCOME_CRITERIA },
        score: { type: "choice", criteria: SCORELINE_CRITERIA }
      }
    })
  };
}

const typesafeResponseSchema = z.looseObject({
  model: z.string().min(1).optional(),
  usage: z.looseObject({
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional()
  }).optional(),
  answers: z.looseObject({
    outcome: z.looseObject({
      probabilities: z.record(z.string(), z.unknown()).optional()
    }).optional(),
    score: z.looseObject({
      choice: z.unknown().optional()
    }).optional()
  })
});

/** `"2-1"` into `{home: 2, away: 1}`, or null for anything else Jev sent. */
function parseScorelineChoice(
  choice: unknown
): { home: number; away: number } | null {
  if (typeof choice !== "string") {
    return null;
  }
  const match = /^(\d+)-(\d+)$/.exec(choice);
  if (match === null) {
    return null;
  }
  return { home: Number(match[1]), away: Number(match[2]) };
}

/**
 * Parses a Jev reply and renders it straight into the prediction JSON every
 * seat's answer is judged against — `content` here is that JSON, not prose,
 * so the shared `validatePrediction` call downstream in
 * `attempt-match-calls.ts` needs no branch of its own.
 *
 * A field Jev sent in an unexpected shape is left out of the rendered JSON
 * rather than guessed at or refused here: `validatePrediction` already turns
 * a missing or malformed field into a named schema failure, which is where
 * ADR-0059 asks for that failure to be recorded. Only a reply with no
 * `answers` to read at all — the transport-level shape OpenRouter's own
 * parser refuses the same way — returns null.
 */
export function parseTypesafeResponse(
  body: string,
  fixtureId: number
): ParsedEntrantResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = typesafeResponseSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const score = parseScorelineChoice(parsed.data.answers.score?.choice);
  const content = JSON.stringify({
    fixture_id: fixtureId,
    probs: parsed.data.answers.outcome?.probabilities,
    score: score ?? undefined,
    rationale: ""
  });
  return {
    content,
    refusal: null,
    finishReason: null,
    resolvedProvider: "typesafe",
    resolvedModel: parsed.data.model ?? null,
    tokensIn: parsed.data.usage?.input_tokens ?? null,
    tokensOut: parsed.data.usage?.output_tokens ?? null
  };
}

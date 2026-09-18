import { describe, expect, test } from "vitest";
import {
  isTypesafeProvider,
  parseTypesafeResponse,
  parseWireResponse,
  requireTypesafeApiKey,
  typesafeApiKeyOrThrow,
  typesafeRequest,
  wireNameOf,
  TYPESAFE_MODEL,
  TYPESAFE_URL
} from "../src/predictions/typesafe-entrant.js";
import { validatePrediction } from "../src/predictions/validate-prediction.js";

interface TypesafeRequestBody {
  model: string;
  state: string;
  questions: Record<string, { type: string; criteria: Record<string, string> }>;
}

function scorelines(): string[] {
  const lines: string[] = [];
  for (let home = 0; home <= 5; home += 1) {
    for (let away = 0; away <= 5; away += 1) {
      lines.push(`${home}-${away}`);
    }
  }
  return lines;
}

describe("the TypeSafe request (ADR-0059)", () => {
  test("posts the stored context bytes as state, with exactly two Choice "
    + "questions", () => {
    const request = typesafeRequest("secret-key", "Fixture ID: 1\nWho wins?");

    expect(request.url).toBe(TYPESAFE_URL);
    expect(request.method).toBe("POST");
    expect(request.headers?.Authorization).toBe("Bearer secret-key");

    const body = JSON.parse(request.body!) as TypesafeRequestBody;
    expect(body.model).toBe(TYPESAFE_MODEL);
    expect(body.state).toBe("Fixture ID: 1\nWho wins?");
    expect(Object.keys(body.questions)).toHaveLength(2);

    const [outcome, score] = Object.values(body.questions);
    expect(outcome!.type).toBe("Choice");
    expect(Object.keys(outcome!.criteria).sort()).toEqual(["A", "D", "H"]);
    expect(score!.type).toBe("Choice");
    expect(Object.keys(score!.criteria).sort()).toEqual(scorelines().sort());
  });
});

function jevReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: "jev-latest-20260901",
    answers: {
      outcome: {
        choice: "H",
        probabilities: { H: 0.6, D: 0.25, A: 0.15 },
        confidence: 0.7
      },
      score: {
        choice: "2-1",
        probabilities: { "2-1": 0.2 },
        confidence: 0.2
      }
    },
    usage: { input_tokens: 1400, output_tokens: 12 },
    ...overrides
  });
}

describe("rendering a Jev reply into a Prediction (ADR-0059)", () => {
  test("reads probs off the outcome Choice and score off the scoreline "
    + "Choice's argmax, with an empty rationale", () => {
    const parsed = parseTypesafeResponse(jevReply(), 42);
    expect(parsed).not.toBeNull();
    expect(parsed!.resolvedProvider).toBe("typesafe");
    expect(parsed!.resolvedModel).toBe("jev-latest-20260901");
    expect(parsed!.tokensIn).toBe(1400);
    expect(parsed!.tokensOut).toBe(12);

    const prediction = JSON.parse(parsed!.content!);
    expect(prediction).toEqual({
      fixture_id: 42,
      probs: { H: 0.6, D: 0.25, A: 0.15 },
      score: { home: 2, away: 1 },
      rationale: ""
    });

    const validation = validatePrediction(parsed!.content!, 42);
    expect(validation.ok).toBe(true);
  });

  test("is null on a body that carries no answers to render at all", () => {
    expect(parseTypesafeResponse("not json", 42)).toBeNull();
    expect(parseTypesafeResponse(JSON.stringify({ usage: {} }), 42))
      .toBeNull();
  });

  test("still renders when a field is malformed, so validatePrediction — not "
    + "this parser — records the schema failure (ADR-0059)", () => {
    const parsed = parseTypesafeResponse(jevReply({
      answers: {
        outcome: { choice: "H", probabilities: { H: 0.6, D: 0.25, A: 0.15 } },
        score: { choice: "not-a-scoreline" }
      }
    }), 42);
    expect(parsed).not.toBeNull();
    const validation = validatePrediction(parsed!.content!, 42);
    expect(validation).toMatchObject({ ok: false, kind: "schema" });
  });
});

describe("which wire a provider speaks (ADR-0059)", () => {
  test("isTypesafeProvider and wireNameOf agree with each other", () => {
    expect(isTypesafeProvider("typesafe")).toBe(true);
    expect(isTypesafeProvider("anthropic")).toBe(false);
    expect(wireNameOf("typesafe")).toBe("TypeSafe");
    expect(wireNameOf("anthropic")).toBe("OpenRouter");
  });

  test("parseWireResponse dispatches by provider, never by shape", () => {
    const openRouterBody = JSON.stringify({
      choices: [{ message: { content: "hi" } }]
    });
    expect(parseWireResponse("anthropic", openRouterBody, 1)?.content)
      .toBe("hi");
    expect(parseWireResponse("typesafe", jevReply(), 42)?.resolvedProvider)
      .toBe("typesafe");
  });
});

describe("the TYPESAFE_API_KEY guards (ADR-0059)", () => {
  test("requireTypesafeApiKey refuses a typesafe row with no key, and lets "
    + "every other row and every present key through", () => {
    expect(() => requireTypesafeApiKey("exhibition/jev", "typesafe", null))
      .toThrow(
        "TYPESAFE_API_KEY is required to call exhibition/jev, whose "
        + "provider is 'typesafe'"
      );
    expect(() => requireTypesafeApiKey("exhibition/jev", "typesafe", undefined))
      .toThrow("TYPESAFE_API_KEY is required to call exhibition/jev");
    expect(() => requireTypesafeApiKey("exhibition/jev", "typesafe", "secret"))
      .not.toThrow();
    // A real Entrant is never checked, key or no key: the roster entry
    // already refuses this provider from ever seating one.
    expect(() => requireTypesafeApiKey("match/claude-opus-5", "anthropic", null))
      .not.toThrow();
  });

  test("typesafeApiKeyOrThrow is the engine's own backstop: null and "
    + "undefined both refuse rather than becoming an empty bearer token",
    () => {
      expect(() => typesafeApiKeyOrThrow(null)).toThrow(
        "TYPESAFE_API_KEY is required to call a typesafe row"
      );
      expect(() => typesafeApiKeyOrThrow(undefined)).toThrow(
        "TYPESAFE_API_KEY is required to call a typesafe row"
      );
      expect(typesafeApiKeyOrThrow("secret")).toBe("secret");
    });
});

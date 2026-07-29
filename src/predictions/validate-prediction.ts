import { z } from "zod";

const predictionSchema = z.strictObject({
  fixture_id: z.number().int().positive(),
  probs: z.strictObject({
    H: z.number().min(0).max(1),
    D: z.number().min(0).max(1),
    A: z.number().min(0).max(1)
  }),
  score: z.strictObject({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative()
  }),
  rationale: z.string()
});

const validationMessages = {
  invalidJson: "Response must be valid JSON.",
  schema: (expectedFixtureId: number) =>
    `Response must match the Prediction schema for Fixture ${expectedFixtureId}.`,
  probabilitiesRange:
    "Probabilities H, D and A must each be between 0 and 1.",
  score: "Predicted Score goals must be non-negative integers.",
  probabilitiesSum: "Probabilities H, D and A must sum to 1 within ±0.001."
};

export interface ValidPrediction {
  fixtureId: number;
  probs: { H: number; D: number; A: number };
  score: { home: number; away: number };
  rationale: string;
}

export type PredictionValidation =
  | { ok: true; prediction: ValidPrediction }
  | { ok: false; kind: "schema" | "probs_sum"; message: string };

export function predictionRepairMessage(
  validationMessage: string,
  expectedFixtureId: number
): string {
  return [
    "Your previous response was invalid:",
    validationMessage,
    `Return only corrected JSON for Fixture ${expectedFixtureId}.`
  ].join("\n");
}

export function validatePrediction(
  raw: string,
  expectedFixtureId: number
): PredictionValidation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      kind: "schema",
      message: validationMessages.invalidJson
    };
  }

  const parsed = predictionSchema.safeParse(value);
  if (!parsed.success) {
    const probabilityIssues = parsed.error.issues.filter(
      ({ path }) => path[0] === "probs"
    );
    const scoreIssues = parsed.error.issues.filter(
      ({ path }) => path[0] === "score"
    );
    const probabilitiesFailed = probabilityIssues.length > 0
      && probabilityIssues.every(
        (issue) =>
          issue.code === "too_small" || issue.code === "too_big"
      );
    const scoreFailed = scoreIssues.length > 0
      && scoreIssues.every(
        (issue) =>
          (
            issue.code === "too_small"
            || (issue.code === "invalid_type" && issue.expected === "int")
          )
      );
    const everyIssueNamed =
      probabilityIssues.length + scoreIssues.length
      === parsed.error.issues.length
      && (probabilityIssues.length === 0 || probabilitiesFailed)
      && (scoreIssues.length === 0 || scoreFailed);
    const namedProblems = [
      ...(probabilitiesFailed ? [validationMessages.probabilitiesRange] : []),
      ...(scoreFailed ? [validationMessages.score] : [])
    ];
    return {
      ok: false,
      kind: "schema",
      message: everyIssueNamed
        ? namedProblems.join("\n")
        : validationMessages.schema(expectedFixtureId)
    };
  }
  if (parsed.data.fixture_id !== expectedFixtureId) {
    return {
      ok: false,
      kind: "schema",
      message: validationMessages.schema(expectedFixtureId)
    };
  }

  const sum = parsed.data.probs.H + parsed.data.probs.D + parsed.data.probs.A;
  if (Math.abs(sum - 1) > 0.001 + Number.EPSILON) {
    return {
      ok: false,
      kind: "probs_sum",
      message: validationMessages.probabilitiesSum
    };
  }

  return {
    ok: true,
    prediction: {
      fixtureId: parsed.data.fixture_id,
      probs: {
        H: parsed.data.probs.H / sum,
        D: parsed.data.probs.D / sum,
        A: parsed.data.probs.A / sum
      },
      score: parsed.data.score,
      rationale: parsed.data.rationale
    }
  };
}

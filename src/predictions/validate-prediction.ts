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

export interface ValidPrediction {
  fixtureId: number;
  probs: { H: number; D: number; A: number };
  score: { home: number; away: number };
  rationale: string;
}

export type PredictionValidation =
  | { ok: true; prediction: ValidPrediction }
  | { ok: false; kind: "schema" | "probs_sum"; message: string };

export function validatePrediction(
  raw: string,
  expectedFixtureId: number
): PredictionValidation {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, kind: "schema", message: "Response must be valid JSON." };
  }

  const parsed = predictionSchema.safeParse(value);
  if (!parsed.success || parsed.data.fixture_id !== expectedFixtureId) {
    return {
      ok: false,
      kind: "schema",
      message: `Response must match the Prediction schema for Fixture ${expectedFixtureId}.`
    };
  }

  const sum = parsed.data.probs.H + parsed.data.probs.D + parsed.data.probs.A;
  if (Math.abs(sum - 1) > 0.001 + Number.EPSILON) {
    return {
      ok: false,
      kind: "probs_sum",
      message: "Probabilities H, D and A must sum to 1 within ±0.001."
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

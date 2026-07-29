import { describe, expect, test } from "vitest";
import { validatePrediction } from "../src/predictions/validate-prediction.js";

describe("Prediction validation", () => {
  test("accepts a probability distribution and Predicted Score", () => {
    const result = validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: { home: 2, away: 1 },
      rationale: "Arsenal have the stronger side."
    }), 1);

    expect(result).toEqual({
      ok: true,
      prediction: {
        fixtureId: 1,
        probs: { H: 0.6, D: 0.24, A: 0.16 },
        score: { home: 2, away: 1 },
        rationale: "Arsenal have the stronger side."
      }
    });
  });

  test("renormalises probabilities whose sum is within tolerance", () => {
    const result = validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 0.6, D: 0.24, A: 0.1595 },
      score: { home: 2, away: 1 },
      rationale: "Narrow home edge."
    }), 1);

    expect(result).toMatchObject({
      ok: true,
      prediction: {
        fixtureId: 1,
        score: { home: 2, away: 1 },
        rationale: "Narrow home edge."
      }
    });
    if (result.ok) {
      expect(result.prediction.probs.H).toBeCloseTo(0.6003001500750375, 15);
      expect(result.prediction.probs.D).toBeCloseTo(0.240120060030015, 15);
      expect(result.prediction.probs.A).toBeCloseTo(0.15957978989494748, 15);
    }
  });

  test("names an invalid Predicted Score with a fixed message", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: { home: -1, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "Predicted Score goals must be non-negative integers."
    });
  });

  test("names an out-of-range probability with a fixed schema message", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 1.1, D: 0, A: -0.1 },
      score: { home: 2, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "Probabilities H, D and A must each be between 0 and 1."
    });
  });

  test("does not misname a wrong-type field as a range failure", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: "likely", D: 0.24, A: 0.16 },
      score: { home: "two", away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "Response must match the Prediction schema for Fixture 1."
    });
  });

  test("names every independently repairable schema problem", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 1.1, D: 0, A: -0.1 },
      score: { home: -1, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: [
        "Probabilities H, D and A must each be between 0 and 1.",
        "Predicted Score goals must be non-negative integers."
      ].join("\n")
    });
  });

  test.each([
    {
      label: "probabilities outside the sum tolerance",
      output: {
        fixture_id: 1,
        probs: { H: 0.6, D: 0.24, A: 0.15 },
        score: { home: 2, away: 1 },
        rationale: ""
      },
      kind: "probs_sum"
    },
    {
      label: "negative goals",
      output: {
        fixture_id: 1,
        probs: { H: 0.6, D: 0.24, A: 0.16 },
        score: { home: -1, away: 1 },
        rationale: ""
      },
      kind: "schema"
    },
    {
      label: "non-integer goals",
      output: {
        fixture_id: 1,
        probs: { H: 0.6, D: 0.24, A: 0.16 },
        score: { home: 1.5, away: 1 },
        rationale: ""
      },
      kind: "schema"
    }
  ])("rejects $label", ({ output, kind }) => {
    expect(validatePrediction(JSON.stringify(output), 1)).toMatchObject({
      ok: false,
      kind
    });
  });
});

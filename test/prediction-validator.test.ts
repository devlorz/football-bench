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

  test("names probs sent as an array instead of an object", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: [0.43, 0.27, 0.3],
      score: { home: 1, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "probs must be an object with keys H, D and A — received an array."
    });
  });

  test("names score sent as an array instead of an object", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: [1, 1],
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "Predicted Score must be an object with keys home and away — received an array."
    });
  });

  test("names both containers when probs and score are both arrays", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 564637,
      probs: [0.43, 0.27, 0.3],
      score: [1, 1],
      rationale: ""
    }), 564637)).toEqual({
      ok: false,
      kind: "schema",
      message: [
        "probs must be an object with keys H, D and A — received an array.",
        "Predicted Score must be an object with keys home and away — received an array."
      ].join("\n")
    });
  });

  test("names a missing probs field without claiming it was an array", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      score: { home: 1, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "probs must be an object with keys H, D and A — received nothing."
    });
  });

  test("names a null score without claiming it was an array", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: null,
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "Predicted Score must be an object with keys home and away — received null."
    });
  });

  test("names a probs sent as a bare string without claiming it was an array", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 1,
      probs: "nope",
      score: { home: 1, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "probs must be an object with keys H, D and A — received a string."
    });
  });

  test("names a fixture_id sent with the wrong type", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: "564638",
      probs: { H: 0.51, D: 0.26, A: 0.23 },
      score: { home: 2, away: 1 },
      rationale: ""
    }), 564638)).toEqual({
      ok: false,
      kind: "schema",
      message: "fixture_id must be the number 564638 — return exactly that value."
    });
  });

  test("names a fixture_id echoed with the wrong value", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: 2,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: { home: 2, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "fixture_id must be the number 1 — return exactly that value."
    });
  });

  test.each([
    { label: "negative", fixtureId: -5 },
    { label: "zero", fixtureId: 0 }
  ])("names a fixture_id that is $label rather than falling to the general fallback", ({ fixtureId }) => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: fixtureId,
      probs: { H: 0.6, D: 0.24, A: 0.16 },
      score: { home: 2, away: 1 },
      rationale: ""
    }), 1)).toEqual({
      ok: false,
      kind: "schema",
      message: "fixture_id must be the number 1 — return exactly that value."
    });
  });

  test("names every defect when arrays and a wrong fixture_id combine", () => {
    expect(validatePrediction(JSON.stringify({
      fixture_id: "564638",
      probs: [0.51, 0.26, 0.23],
      score: [2, 1],
      rationale: ""
    }), 564638)).toEqual({
      ok: false,
      kind: "schema",
      message: [
        "fixture_id must be the number 564638 — return exactly that value.",
        "probs must be an object with keys H, D and A — received an array.",
        "Predicted Score must be an object with keys home and away — received an array."
      ].join("\n")
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

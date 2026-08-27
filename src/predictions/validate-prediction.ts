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
  probabilitiesSum: "Probabilities H, D and A must sum to 1 within ±0.001.",
  probsContainer: (received: string) =>
    `probs must be an object with keys H, D and A — received ${received}.`,
  scoreContainer: (received: string) =>
    `Predicted Score must be an object with keys home and away — received ${received}.`,
  fixtureId: (expectedFixtureId: number) =>
    `fixture_id must be the number ${expectedFixtureId} — return exactly that value.`
};

/**
 * What was actually sent in place of an object, read off the parsed JSON
 * rather than assumed: the 84-row record this Repair was built for is almost
 * all arrays, but a missing key, `null` or a bare string produce the same
 * zod issue and deserve their own word, not a borrowed one.
 */
function describeReceived(value: unknown): string {
  if (value === undefined) {
    return "nothing";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  return `a ${typeof value}`;
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * A container issue is the whole field mistyped: one `invalid_type` issue
 * sitting at the field's own path, rather than a range or integer issue
 * nested one level down inside it. It says nothing about what stood in the
 * field's place — `describeReceived` reads that back out of the parsed JSON.
 */
function isContainerIssue(
  issues: readonly { path: readonly PropertyKey[]; code: string }[]
): boolean {
  return issues.length > 0
    && issues.every(
      (issue) => issue.path.length === 1 && issue.code === "invalid_type"
    );
}

export interface ValidPrediction {
  fixtureId: number;
  probs: { H: number; D: number; A: number };
  score: { home: number; away: number };
  rationale: string;
}

/**
 * The failures a Repair can address: the ask was answered, just not validly.
 *
 * Every other cause an attempt records — a provider error, a timeout, a rate
 * limit, a refusal, a missed deadline — is where the asking stops, because
 * repeating the same prompt is not what would fix it. Named as a list because
 * a reader of the attempt ledger needs to tell "this ask is still owed a
 * Repair" from "this ask is finished", and that question has one answer.
 */
export const REPAIRABLE_KINDS = ["schema", "probs_sum"] as const;

export type RepairableKind = (typeof REPAIRABLE_KINDS)[number];

export type PredictionValidation =
  | { ok: true; prediction: ValidPrediction }
  | { ok: false; kind: RepairableKind; message: string };

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
    const fixtureIdIssues = parsed.error.issues.filter(
      ({ path }) => path[0] === "fixture_id"
    );
    const probabilityIssues = parsed.error.issues.filter(
      ({ path }) => path[0] === "probs"
    );
    const scoreIssues = parsed.error.issues.filter(
      ({ path }) => path[0] === "score"
    );
    // fixture_id has no sub-fields, so every issue zod can raise on it — a
    // wrong type, a non-integer, zero or negative — sits at this same path
    // and is equally the one defect a Repair here corrects: send back the
    // number you were given.
    const fixtureIdFailed = fixtureIdIssues.length > 0;
    const probabilitiesRangeFailed = probabilityIssues.length > 0
      && probabilityIssues.every(
        (issue) =>
          issue.code === "too_small" || issue.code === "too_big"
      );
    const probabilitiesContainerFailed = isContainerIssue(probabilityIssues);
    const scoreRangeFailed = scoreIssues.length > 0
      && scoreIssues.every(
        (issue) =>
          (
            issue.code === "too_small"
            || (issue.code === "invalid_type" && issue.expected === "int")
          )
      );
    const scoreContainerFailed = isContainerIssue(scoreIssues);
    const namedIssueCount =
      (fixtureIdFailed ? fixtureIdIssues.length : 0)
      + (probabilitiesRangeFailed || probabilitiesContainerFailed
        ? probabilityIssues.length
        : 0)
      + (scoreRangeFailed || scoreContainerFailed ? scoreIssues.length : 0);
    const everyIssueNamed = namedIssueCount === parsed.error.issues.length;
    const namedProblems = [
      ...(fixtureIdFailed
        ? [validationMessages.fixtureId(expectedFixtureId)]
        : []),
      ...(probabilitiesContainerFailed
        ? [validationMessages.probsContainer(
          describeReceived(fieldOf(value, "probs"))
        )]
        : probabilitiesRangeFailed
        ? [validationMessages.probabilitiesRange]
        : []),
      ...(scoreContainerFailed
        ? [validationMessages.scoreContainer(
          describeReceived(fieldOf(value, "score"))
        )]
        : scoreRangeFailed
        ? [validationMessages.score]
        : [])
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
      message: validationMessages.fixtureId(expectedFixtureId)
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

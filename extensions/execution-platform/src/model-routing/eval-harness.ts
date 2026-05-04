import type { ModelTaskContractRegistry } from "../model-tasks/registry.ts";
import type { ModelTaskContractId } from "../model-tasks/types.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ModelRouteCandidate } from "./types.ts";

export type ModelEvalFixture = {
  fixtureId: string;
  contractId: ModelTaskContractId;
  input: JsonValue;
  expectedSchemaValid: boolean;
  expectedFields?: Record<string, JsonValue>;
  notes?: string;
};

export type ModelEvalFieldCheck = {
  path: string;
  expected: JsonValue;
  actual: JsonValue | undefined;
  passed: boolean;
};

export type ModelEvalFixtureValidation = {
  ok: boolean;
  fixtureId: string;
  contractId: ModelTaskContractId;
  issues: string[];
};

export type ModelEvalScorecard = {
  fixtureId: string;
  contractId: ModelTaskContractId;
  candidateModel: {
    provider: string;
    model: string;
    family: string;
  };
  validation: {
    fixture: ModelEvalFixtureValidation;
    output: {
      ok: boolean;
      issues: string[];
    };
  };
  expectedFields: ModelEvalFieldCheck[];
  score: number;
  passed: boolean;
  evidenceNotes: string[];
  providerCallMade: false;
};

export type ModelEvalSummary = {
  total: number;
  passed: number;
  failed: number;
  providerCallMade: false;
  scoreAverage: number;
};

function readPath(value: JsonValue, path: string): JsonValue | undefined {
  const parts = path.split(".").filter(Boolean);
  let current: JsonValue | undefined = value;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateModelEvalFixture(
  registry: ModelTaskContractRegistry,
  fixture: ModelEvalFixture,
): ModelEvalFixtureValidation {
  try {
    const validation = registry.validateInput(fixture.contractId, fixture.input);
    return {
      ok: validation.ok,
      fixtureId: fixture.fixtureId,
      contractId: fixture.contractId,
      issues: validation.issues,
    };
  } catch (error) {
    return {
      ok: false,
      fixtureId: fixture.fixtureId,
      contractId: fixture.contractId,
      issues: [error instanceof Error ? error.message : "unknown fixture validation error"],
    };
  }
}

export function scoreProvidedModelOutput(input: {
  registry: ModelTaskContractRegistry;
  fixture: ModelEvalFixture;
  candidate: ModelRouteCandidate;
  output: JsonValue;
}): ModelEvalScorecard {
  const fixtureValidation = validateModelEvalFixture(input.registry, input.fixture);
  const outputValidation = input.registry.validateOutput(input.fixture.contractId, input.output);
  const expectedFields = Object.entries(input.fixture.expectedFields ?? {}).map(
    ([path, expected]) => {
      const actual = readPath(input.output, path);
      return {
        path,
        expected,
        actual,
        passed: jsonEqual(actual, expected),
      };
    },
  );
  const schemaExpectationMet = outputValidation.ok === input.fixture.expectedSchemaValid;
  const expectedFieldsPassed = expectedFields.every((check) => check.passed);
  const passed = fixtureValidation.ok && schemaExpectationMet && expectedFieldsPassed;
  const score = passed ? 1 : outputValidation.ok && fixtureValidation.ok ? 0.5 : 0;
  return {
    fixtureId: input.fixture.fixtureId,
    contractId: input.fixture.contractId,
    candidateModel: {
      provider: input.candidate.provider,
      model: input.candidate.model,
      family: input.candidate.family,
    },
    validation: {
      fixture: fixtureValidation,
      output: {
        ok: outputValidation.ok,
        issues: outputValidation.issues,
      },
    },
    expectedFields,
    score,
    passed,
    evidenceNotes: [
      input.fixture.notes ?? "deterministic fixture scored without provider execution",
      "providerCallMade=false",
    ],
    providerCallMade: false,
  };
}

export function summarizeModelEvalRun(scorecards: ModelEvalScorecard[]): ModelEvalSummary {
  const total = scorecards.length;
  const scoreTotal = scorecards.reduce((sum, scorecard) => sum + scorecard.score, 0);
  return {
    total,
    passed: scorecards.filter((scorecard) => scorecard.passed).length,
    failed: scorecards.filter((scorecard) => !scorecard.passed).length,
    providerCallMade: false,
    scoreAverage: total > 0 ? scoreTotal / total : 0,
  };
}

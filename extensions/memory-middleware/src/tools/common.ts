import type {
  CandidateReviewOutcome,
  CandidateSubmissionKind,
  JsonValue,
  MemoryObjectSearchScope,
} from "../db/runtime.js";

export type ToolRawParams = Record<string, unknown>;

export class CandidateToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateToolInputError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asJsonToolResult<T>(result: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    details: result,
  };
}

export function readRequiredString(params: ToolRawParams, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CandidateToolInputError(`${key} required`);
  }
  return value.trim();
}

export function readOptionalString(params: ToolRawParams, key: string): string | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CandidateToolInputError(`${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readContextUuid(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function readOptionalStringArray(params: ToolRawParams, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new CandidateToolInputError(`${key} must be an array of strings`);
  }
  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new CandidateToolInputError(`${key} must contain only strings`);
    }
    return entry;
  });
}

export function readOptionalNumber(params: ToolRawParams, key: string): number | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new CandidateToolInputError(`${key} must be a number`);
}

export function readRequiredNumberArray(params: ToolRawParams, key: string): number[] {
  const value = params[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new CandidateToolInputError(`${key} must be a non-empty number array`);
  }

  const numbers = value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new CandidateToolInputError(`${key} must contain only numbers`);
    }
    return entry;
  });

  return numbers;
}

export function readOptionalBoolean(params: ToolRawParams, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new CandidateToolInputError(`${key} must be a boolean`);
}

export function readOptionalObject(
  params: ToolRawParams,
  key: string,
): Record<string, unknown> | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateToolInputError(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function readOptionalJsonValue(params: ToolRawParams, key: string): JsonValue | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  return value as JsonValue;
}

export function readCandidateKind(params: ToolRawParams): CandidateSubmissionKind {
  const kind = readRequiredString(params, "kind");
  if (
    kind !== "learning" &&
    kind !== "correction" &&
    kind !== "procedure" &&
    kind !== "improvement"
  ) {
    throw new CandidateToolInputError(
      "kind must be one of: learning, correction, procedure, improvement",
    );
  }
  return kind;
}

export function readCandidateReviewOutcome(params: ToolRawParams): CandidateReviewOutcome {
  const outcome = readRequiredString(params, "outcome");
  if (outcome !== "accepted" && outcome !== "rejected" && outcome !== "needs_revision") {
    throw new CandidateToolInputError("outcome must be one of: accepted, rejected, needs_revision");
  }
  return outcome;
}

export function readMemoryObjectSearchScope(
  params: ToolRawParams,
  key = "scope",
): MemoryObjectSearchScope {
  const scope = readRequiredString(params, key);
  if (
    scope !== "approved_only" &&
    scope !== "include_candidates" &&
    scope !== "include_validated_procedures" &&
    scope !== "include_candidates_and_validated_procedures"
  ) {
    throw new CandidateToolInputError(
      "scope must be one of: approved_only, include_candidates, include_validated_procedures, include_candidates_and_validated_procedures",
    );
  }
  return scope;
}

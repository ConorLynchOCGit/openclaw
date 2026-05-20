import type { JsonValue } from "../runtime-job-repository.ts";

export type ModelDecisionMissingField = {
  path: string;
  expectedType: string;
  whyRequired: string;
  repairExample?: JsonValue;
};

export type ModelDecisionRepairRequest = {
  artifactKind: "model_decision_repair_request";
  failedDecisionId: string | null;
  missingFields: ModelDecisionMissingField[];
  preserveFields: string[];
  acceptedFields: string[];
  rejectedReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelDecisionCompileDiagnostic = {
  path: string;
  code: string;
  message: string;
  expectedType?: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelDecisionCompileResult<T> = {
  canonical: T | null;
  acceptedAliasFields: string[];
  diagnostics: ModelDecisionCompileDiagnostic[];
  repairRequest: ModelDecisionRepairRequest;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type StructuralAliasGroup = {
  canonicalField: string;
  aliases: string[];
};

function boundedString(value: string, max = 1_200): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function firstStructuralString(
  record: Record<string, unknown>,
  keys: string[],
): { value: string; acceptedAlias: string | null } {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return { value: boundedString(value), acceptedAlias: key };
    }
  }
  return { value: "", acceptedAlias: null };
}

export function firstStructuralStringArray(
  record: Record<string, unknown>,
  keys: string[],
  maxItems = 24,
): { value: string[]; acceptedAlias: string | null } {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const strings = value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => boundedString(item, 260))
      .slice(0, maxItems);
    if (strings.length > 0) {
      return { value: strings, acceptedAlias: key };
    }
  }
  return { value: [], acceptedAlias: null };
}

export function flattenModelDecisionFields(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return {
    ...asRecord(record.metadata),
    ...asRecord(record.taskDetails),
    ...asRecord(record.nodeContract),
    ...record,
  };
}

export function repairRequestForMissingFields(input: {
  failedDecisionId?: string | null;
  missingFields: ModelDecisionMissingField[];
  preserveFields?: string[];
  acceptedFields?: string[];
  rejectedReasonCodes?: string[];
}): ModelDecisionRepairRequest {
  return {
    artifactKind: "model_decision_repair_request",
    failedDecisionId: input.failedDecisionId ?? null,
    missingFields: input.missingFields.slice(0, 30),
    preserveFields: [...new Set(input.preserveFields ?? [])].slice(0, 40),
    acceptedFields: [...new Set(input.acceptedFields ?? [])].slice(0, 40),
    rejectedReasonCodes: [...new Set(input.rejectedReasonCodes ?? [])].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function missingField(
  path: string,
  expectedType: string,
  whyRequired: string,
  repairExample?: JsonValue,
): ModelDecisionMissingField {
  return { path, expectedType, whyRequired, repairExample };
}

export function diagnosticsFromMissingFields(
  missingFields: ModelDecisionMissingField[],
): ModelDecisionCompileDiagnostic[] {
  return missingFields.map((field) => ({
    path: field.path,
    code: "model_decision_required_field_missing",
    message: field.whyRequired,
    expectedType: field.expectedType,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  }));
}

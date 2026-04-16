import { z } from "zod";
import {
  EXCLUDED_LEGACY_RUNTIME_FIELDS,
  type ModelMemoryObject,
  ModelMemoryObjectSchema,
} from "./semantic-schema.ts";

export type SourceWindowValidationContext = {
  availableBlockIds?: string[];
  lineStart?: number;
  lineEnd?: number;
  headingPaths?: string[][];
  headingPathRefs?: Record<string, string[]>;
};

export type ValidationFailure = {
  path: string;
  message: string;
};

export type ValidationResult =
  | { status: "accept"; object: ModelMemoryObject }
  | { status: "reject"; errors: ValidationFailure[] }
  | { status: "reject_repairable"; errors: ValidationFailure[] };

function mapZodIssues(error: z.ZodError): ValidationFailure[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function isRepairableZodError(error: z.ZodError): boolean {
  return error.issues.every((issue) => issue.code !== z.ZodIssueCode.unrecognized_keys);
}

function checkExcludedLegacyFields(raw: unknown): ValidationFailure[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const value = raw as Record<string, unknown>;
  const failures: ValidationFailure[] = [];

  for (const field of EXCLUDED_LEGACY_RUNTIME_FIELDS) {
    if (field in value) {
      failures.push({
        path: field,
        message: `${field} is excluded from v1 runtime truth`,
      });
    }
  }

  if (value.payload && typeof value.payload === "object") {
    const payload = value.payload as Record<string, unknown>;
    for (const field of EXCLUDED_LEGACY_RUNTIME_FIELDS) {
      if (field in payload) {
        failures.push({
          path: `payload.${field}`,
          message: `${field} is excluded from v1 runtime truth`,
        });
      }
    }
  }

  return failures;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeHeadingPathRef(
  raw: unknown,
  context: SourceWindowValidationContext | undefined,
): { normalized: unknown; errors: ValidationFailure[] } {
  if (!isRecord(raw)) {
    return { normalized: raw, errors: [] };
  }

  const provenance = raw.provenance;
  if (!Array.isArray(provenance)) {
    return { normalized: raw, errors: [] };
  }

  const normalized = { ...raw };
  const normalizedProvenance: unknown[] = [];
  const errors: ValidationFailure[] = [];

  for (const [index, span] of provenance.entries()) {
    if (!isRecord(span)) {
      normalizedProvenance.push(span);
      continue;
    }

    const nextSpan: Record<string, unknown> = { ...span };
    const headingPath = Array.isArray(nextSpan.headingPath) ? nextSpan.headingPath : undefined;
    const headingPathRef =
      typeof nextSpan.headingPathRef === "string" && nextSpan.headingPathRef.trim().length > 0
        ? nextSpan.headingPathRef.trim()
        : undefined;

    if ((!headingPath || headingPath.length === 0) && headingPathRef) {
      const resolvedHeadingPath = context?.headingPathRefs?.[headingPathRef];
      if (resolvedHeadingPath) {
        nextSpan.headingPath = resolvedHeadingPath;
      } else {
        errors.push({
          path: `provenance.${index}.headingPathRef`,
          message: `headingPathRef ${headingPathRef} does not exist in source window`,
        });
      }
    }

    delete nextSpan.headingPathRef;
    normalizedProvenance.push(nextSpan);
  }

  normalized.provenance = normalizedProvenance;
  return {
    normalized,
    errors,
  };
}

function validateProvenanceAgainstWindow(
  object: ModelMemoryObject,
  context?: SourceWindowValidationContext,
): ValidationFailure[] {
  if (!context) {
    return [];
  }

  const failures: ValidationFailure[] = [];
  const blockIds = context.availableBlockIds ? new Set(context.availableBlockIds) : null;
  const headingPaths = context.headingPaths
    ? new Set(context.headingPaths.map((path) => JSON.stringify(path)))
    : null;

  for (const [index, span] of object.provenance.entries()) {
    if (blockIds && span.blockId && !blockIds.has(span.blockId)) {
      failures.push({
        path: `provenance.${index}.blockId`,
        message: `blockId ${span.blockId} does not exist in source window`,
      });
    }

    if (
      context.lineStart !== undefined &&
      context.lineEnd !== undefined &&
      span.lineStart !== undefined &&
      span.lineEnd !== undefined &&
      (span.lineStart < context.lineStart || span.lineEnd > context.lineEnd)
    ) {
      failures.push({
        path: `provenance.${index}.lineStart`,
        message: "provenance line range is out of bounds for source window",
      });
    }

    if (
      headingPaths &&
      span.headingPath.length > 0 &&
      !headingPaths.has(JSON.stringify(span.headingPath))
    ) {
      failures.push({
        path: `provenance.${index}.headingPath`,
        message: "headingPath does not exist in source window",
      });
    }
  }

  return failures;
}

export function validateMemoryObject(
  raw: unknown,
  context?: SourceWindowValidationContext,
): ValidationResult {
  const normalized = normalizeHeadingPathRef(raw, context);
  if (normalized.errors.length > 0) {
    return { status: "reject", errors: normalized.errors };
  }

  const excludedFieldFailures = checkExcludedLegacyFields(normalized.normalized);
  if (excludedFieldFailures.length > 0) {
    return { status: "reject", errors: excludedFieldFailures };
  }

  const parsed = ModelMemoryObjectSchema.safeParse(normalized.normalized);
  if (!parsed.success) {
    const errors = mapZodIssues(parsed.error);
    return {
      status: isRepairableZodError(parsed.error) ? "reject_repairable" : "reject",
      errors,
    };
  }

  const provenanceFailures = validateProvenanceAgainstWindow(parsed.data, context);
  if (provenanceFailures.length > 0) {
    return { status: "reject", errors: provenanceFailures };
  }

  return { status: "accept", object: parsed.data };
}

export function validateMemoryObjects(
  rawObjects: unknown[],
  context?: SourceWindowValidationContext,
): ValidationResult[] {
  return rawObjects.map((raw) => validateMemoryObject(raw, context));
}

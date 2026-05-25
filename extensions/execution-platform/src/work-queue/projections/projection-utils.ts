import type { RuntimeJobArtifact, RuntimeJobEvent } from "../../runtime-job-repository.ts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringArrayValue(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, limit)
    : [];
}

export function boundedUniqueStringValues(
  values: Array<string | null | undefined>,
  limit = 10,
): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, limit);
}

export function latestArtifact(
  artifacts: RuntimeJobArtifact[],
  artifactType: string,
): RuntimeJobArtifact | undefined {
  return artifacts.findLast((artifact) => artifact.artifactType === artifactType);
}

export function eventDataRecord(event: RuntimeJobEvent | undefined): Record<string, unknown> {
  return asRecord(event?.data) ?? {};
}

const RAW_BODY_FIELD_NAMES = new Set([
  "body",
  "commandlog",
  "dbrows",
  "hiddenreasoning",
  "messages",
  "prompt",
  "providerlog",
  "rawcommandlog",
  "rawdbrows",
  "rawprompt",
  "rawproviderlog",
  "rawresponse",
  "rawtoollog",
  "response",
  "responsebody",
  "toollog",
  "transcript",
]);

export function boundedDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return null;
  }
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => boundedDiagnosticValue(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record).slice(0, 40)) {
    if (RAW_BODY_FIELD_NAMES.has(key.replace(/[^a-zA-Z]/gu, "").toLowerCase())) {
      output[`${key}Stored`] = false;
      continue;
    }
    output[key] = boundedDiagnosticValue(entry, depth + 1);
  }
  return output;
}

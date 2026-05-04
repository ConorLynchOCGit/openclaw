import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeJobArtifact, RuntimeJobEvent } from "../runtime-job-repository.ts";
import type {
  DiagnosticArtifactSummary,
  DiagnosticLimits,
  RuntimeJobEventSummary,
} from "./types.ts";

export const DEFAULT_DIAGNOSTIC_LIMITS: DiagnosticLimits = {
  maxStringLength: 160,
  maxArrayItems: 10,
  maxObjectKeys: 20,
  maxDepth: 5,
  eventLimit: 20,
  artifactLimit: 20,
};

const SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "token",
]);

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll("-", "_");
  return (
    SECRET_KEYS.has(normalized) || normalized.endsWith("_token") || normalized.endsWith("_key")
  );
}

export function boundDiagnosticJson(
  value: unknown,
  limits: DiagnosticLimits = DEFAULT_DIAGNOSTIC_LIMITS,
  depth = 0,
  keyHint?: string,
): JsonValue {
  if (keyHint && isSecretKey(keyHint)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    return value.length > limits.maxStringLength
      ? `${value.slice(0, limits.maxStringLength)}...[truncated ${value.length - limits.maxStringLength} chars]`
      : value;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === undefined) {
    return null;
  }
  if (depth >= limits.maxDepth) {
    return "[truncated:max-depth]";
  }
  if (Array.isArray(value)) {
    const truncated = value
      .slice(0, limits.maxArrayItems)
      .map((item) => boundDiagnosticJson(item, limits, depth + 1));
    if (value.length > limits.maxArrayItems) {
      truncated.push(`[truncated ${value.length - limits.maxArrayItems} items]`);
    }
    return truncated;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.description ? `Symbol(${value.description})` : "Symbol()";
  }
  if (typeof value === "function") {
    return "[unsupported:function]";
  }
  if (typeof value !== "object") {
    return "[unsupported:value]";
  }
  const entries = Object.entries(value);
  const bounded: Record<string, JsonValue> = {};
  for (const [key, child] of entries.slice(0, limits.maxObjectKeys)) {
    bounded[key] = boundDiagnosticJson(child, limits, depth + 1, key);
  }
  if (entries.length > limits.maxObjectKeys) {
    bounded.__truncatedKeys = entries.length - limits.maxObjectKeys;
  }
  return bounded;
}

export function summarizeRuntimeEvents(
  events: RuntimeJobEvent[],
  limits: DiagnosticLimits = DEFAULT_DIAGNOSTIC_LIMITS,
): RuntimeJobEventSummary[] {
  return events.slice(-limits.eventLimit).map((event) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    eventTime: event.eventTime.toISOString(),
    workerId: event.workerId,
    leaseId: event.leaseId,
    data: boundDiagnosticJson(event.data, limits),
  }));
}

export function summarizeArtifacts(
  artifacts: RuntimeJobArtifact[],
  limits: DiagnosticLimits = DEFAULT_DIAGNOSTIC_LIMITS,
): DiagnosticArtifactSummary[] {
  return artifacts.slice(0, limits.artifactLimit).map((artifact) => ({
    artifactId: artifact.artifactId,
    artifactType: artifact.artifactType,
    storageKind: artifact.storageKind,
    uri: artifact.uri,
    contentType: artifact.contentType,
    sizeBytes: artifact.sizeBytes,
    sha256: artifact.sha256,
    metadata: boundDiagnosticJson(artifact.metadata, limits),
    createdAt: artifact.createdAt.toISOString(),
  }));
}

import { createHash, randomUUID } from "node:crypto";
import type { ClosedLoopConsumer, MemoryOpsSignal } from "./types.ts";

export type MemoryOpsSignalValidationResult = { ok: true } | { ok: false; reason: string };

const SENSITIVE_PAYLOAD_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "full_prompt",
  "full_transcript",
  "log",
  "logs",
  "messages",
  "password",
  "prompt",
  "prompt_body",
  "prompt_text",
  "raw_content",
  "raw_log",
  "raw_logs",
  "raw_prompt",
  "raw_text",
  "raw_tool_log",
  "secret",
  "token",
  "transcript",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sanitizePayloadValue(value: unknown, redactedPaths: string[], path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizePayloadValue(entry, redactedPaths, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const nextPath = path ? `${path}.${key}` : key;
    if (SENSITIVE_PAYLOAD_KEYS.has(normalizedKey)) {
      redactedPaths.push(nextPath);
      sanitized[`${key}_sha256`] = hashValue(nested);
      continue;
    }
    sanitized[key] = sanitizePayloadValue(nested, redactedPaths, nextPath);
  }
  return sanitized;
}

export function validateNoDarkData(signal: MemoryOpsSignal): void {
  if (signal.consumers.length === 0) {
    throw new Error("memory ops signal requires at least one consumer");
  }
  if (signal.usage_contract.used_by.length === 0) {
    throw new Error("memory ops signal requires at least one usage consumer");
  }
  if (signal.usage_contract.action.trim().length === 0) {
    throw new Error("memory ops signal requires a usage action");
  }
  const consumers = new Set<ClosedLoopConsumer>(signal.consumers);
  if (!signal.usage_contract.used_by.every((consumer) => consumers.has(consumer))) {
    throw new Error("memory ops usage consumers must be a subset of signal consumers");
  }
  if (signal.privacy.contains_secret) {
    throw new Error("memory ops signal must not contain secrets");
  }
}

export function validateMemoryOpsSignal(signal: MemoryOpsSignal): MemoryOpsSignalValidationResult {
  try {
    validateNoDarkData(signal);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function prepareSignalForPersistence(signal: MemoryOpsSignal): {
  signal?: MemoryOpsSignal;
  validation: MemoryOpsSignalValidationResult;
  redactedPaths: string[];
} {
  const validation = validateMemoryOpsSignal(signal);
  if (!validation.ok) {
    return { validation, redactedPaths: [] };
  }

  const redactedPaths: string[] = [];
  const sanitizedPayload = sanitizePayloadValue(signal.payload, redactedPaths, "") as Record<
    string,
    unknown
  >;
  if (redactedPaths.length > 0) {
    sanitizedPayload.redacted_payload_paths = redactedPaths;
  }

  return {
    validation,
    redactedPaths,
    signal: {
      ...signal,
      payload: sanitizedPayload,
      privacy: {
        ...signal.privacy,
        redacted: signal.privacy.redacted || redactedPaths.length > 0,
      },
    },
  };
}
export function createMemoryOpsSignal(
  input: Omit<MemoryOpsSignal, "signal_id" | "schema_version" | "created_at"> & {
    signal_id?: string;
    created_at?: string;
  },
): MemoryOpsSignal {
  return {
    ...input,
    signal_id: input.signal_id ?? randomUUID(),
    schema_version: "memory_ops_signal.v1",
    created_at: input.created_at ?? input.observed_at ?? new Date().toISOString(),
  };
}

import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import {
  isJsonRecord,
  readBooleanLike,
  readNestedRecord,
  readTrimmedString,
} from "./model-memory/value-readers.js";

const GLOBAL_ENABLED_ENV = "MODEL_MEMORY_CAPTURE_SEAMS_ENABLED";
const OUTPUT_DIR_ENV = "MODEL_MEMORY_CAPTURE_SEAM_OUTPUT_DIR";
const MAX_KEY_PATHS = 80;
const MAX_HASHES = 80;
const MAX_DEPTH = 4;

export type ModelMemoryCaptureSeamName =
  | "message:received"
  | "message:transcribed"
  | "message:preprocessed"
  | "ContextEngine.ingest"
  | "ContextEngine.ingestBatch"
  | "ContextEngine.assemble"
  | "ContextEngine.afterTurn"
  | "tool_result_persist"
  | "after_tool_call"
  | "agent_end"
  | "agent:bootstrap"
  | "memory_file_import";

export type ModelMemoryCaptureSeamActivationStatus =
  | "active"
  | "verified_pending_activation"
  | "fallback_only"
  | "blocked"
  | "synthetic_only"
  | "registered_not_fired"
  | "future";

export type ModelMemoryCaptureSeamPolicy = {
  seamName: ModelMemoryCaptureSeamName;
  status: ModelMemoryCaptureSeamActivationStatus;
  globalKillSwitch: typeof GLOBAL_ENABLED_ENV;
  seamKillSwitch: string;
  writesThroughMmv2NativePath: boolean;
  noRawDataAllowed: true;
  dedupeRequired: boolean;
  independentRollback: true;
  activationReason: string;
};

export type ModelMemoryCaptureSeamRecord = {
  schema_version: "model_memory_capture_seam.v1";
  seam_name: ModelMemoryCaptureSeamName;
  observed_at: string;
  mode: "bounded_evidence";
  session_id?: string;
  session_key?: string;
  run_id?: string;
  agent_id?: string;
  trigger_surface: string;
  payload_key_paths: string[];
  payload_hashes: Record<string, string>;
  raw_content_persisted: false;
  semantic_memory_write_attempted: boolean;
  durable_memory_write_attempted: boolean;
};

export type ModelMemoryCaptureSeamInput = {
  seamName: ModelMemoryCaptureSeamName;
  triggerSurface: string;
  payload?: unknown;
  context?: unknown;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  outputDir?: string;
  observedAt?: Date;
  semanticMemoryWriteAttempted?: boolean;
  durableMemoryWriteAttempted?: boolean;
};

export type ModelMemoryCaptureSeamSettings = {
  enabled: boolean;
  seamEnabled: boolean;
  outputDir: string;
};

const SEAM_ENV: Record<ModelMemoryCaptureSeamName, string> = {
  "message:received": "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_RECEIVED_ENABLED",
  "message:transcribed": "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_TRANSCRIBED_ENABLED",
  "message:preprocessed": "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED",
  "ContextEngine.ingest": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED",
  "ContextEngine.ingestBatch": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED",
  "ContextEngine.assemble": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_ASSEMBLE_ENABLED",
  "ContextEngine.afterTurn": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_AFTER_TURN_ENABLED",
  tool_result_persist: "MODEL_MEMORY_CAPTURE_SEAM_TOOL_RESULT_PERSIST_ENABLED",
  after_tool_call: "MODEL_MEMORY_CAPTURE_SEAM_AFTER_TOOL_CALL_ENABLED",
  agent_end: "MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED",
  "agent:bootstrap": "MODEL_MEMORY_CAPTURE_SEAM_AGENT_BOOTSTRAP_ENABLED",
  memory_file_import: "MODEL_MEMORY_CAPTURE_SEAM_MEMORY_FILE_IMPORT_ENABLED",
};

const ACTIVE_SEAMS = new Set<ModelMemoryCaptureSeamName>([
  "message:preprocessed",
  "ContextEngine.ingest",
  "ContextEngine.ingestBatch",
  "ContextEngine.afterTurn",
  "tool_result_persist",
  "after_tool_call",
  "agent_end",
  "agent:bootstrap",
  "memory_file_import",
]);

const FALLBACK_ONLY_SEAMS = new Set<ModelMemoryCaptureSeamName>([
  "message:received",
  "message:transcribed",
]);

export const MODEL_MEMORY_CAPTURE_SEAM_POLICIES: readonly ModelMemoryCaptureSeamPolicy[] = (
  Object.keys(SEAM_ENV) as ModelMemoryCaptureSeamName[]
).map((seamName) => ({
  seamName,
  status: ACTIVE_SEAMS.has(seamName)
    ? "active"
    : FALLBACK_ONLY_SEAMS.has(seamName)
      ? "fallback_only"
      : "future",
  globalKillSwitch: GLOBAL_ENABLED_ENV,
  seamKillSwitch: SEAM_ENV[seamName],
  writesThroughMmv2NativePath:
    seamName !== "ContextEngine.assemble" &&
    seamName !== "message:received" &&
    seamName !== "message:transcribed",
  noRawDataAllowed: true,
  dedupeRequired: true,
  independentRollback: true,
  activationReason:
    seamName === "message:received" || seamName === "message:transcribed"
      ? "fallback-only ingress retained for primary seam failure or media path gaps"
      : seamName === "ContextEngine.assemble"
        ? "retrieval/injection telemetry only; no semantic write"
        : "eligible production-verified seam, gated by global and seam-specific kill switches",
}));

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readCaptureSeamConfig(config: unknown): Record<string, unknown> {
  return (
    readNestedRecord(config, ["modelMemory", "captureSeams"]) ??
    readNestedRecord(config, ["plugins", "entries", "model-memory", "config", "captureSeams"]) ??
    {}
  );
}

function readSeamSpecificConfig(
  config: Record<string, unknown>,
  seamName: ModelMemoryCaptureSeamName,
): unknown {
  const direct = config[seamName];
  if (direct !== undefined) {
    return direct;
  }
  const camel = seamName
    .replace(/^ContextEngine\./u, "contextEngine.")
    .replace(/[:_.]([a-z])/gu, (_, char: string) => char.toUpperCase())
    .replace(/^([A-Z])/u, (_, char: string) => char.toLowerCase());
  return config[camel];
}

export function resolveModelMemoryCaptureSeamSettings(input: {
  seamName: ModelMemoryCaptureSeamName;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  outputDir?: string;
}): ModelMemoryCaptureSeamSettings {
  const env = input.env ?? process.env;
  const config = readCaptureSeamConfig(input.config);
  const enabled =
    readBooleanLike(env[GLOBAL_ENABLED_ENV]) ?? readBooleanLike(config.enabled) ?? false;
  const policy = getModelMemoryCaptureSeamPolicy(input.seamName);
  const seamEnabled =
    readBooleanLike(env[SEAM_ENV[input.seamName]]) ??
    readBooleanLike(readSeamSpecificConfig(config, input.seamName)) ??
    policy.status === "active";
  const outputDir =
    input.outputDir ??
    readTrimmedString(env[OUTPUT_DIR_ENV]) ??
    readTrimmedString(config.outputDir) ??
    path.join(process.cwd(), ".openclaw-memory-ops", "capture-seam-runtime");
  return { enabled, seamEnabled, outputDir };
}

export function getModelMemoryCaptureSeamPolicy(
  seamName: ModelMemoryCaptureSeamName,
): ModelMemoryCaptureSeamPolicy {
  const policy = MODEL_MEMORY_CAPTURE_SEAM_POLICIES.find((entry) => entry.seamName === seamName);
  if (!policy) {
    throw new Error(`unknown model-memory capture seam: ${seamName}`);
  }
  return policy;
}

export function buildModelMemoryCaptureSeamDedupeKey(input: {
  seamName: ModelMemoryCaptureSeamName;
  sourceHash?: string;
  sessionId?: string;
  sessionKey?: string;
  sourceId?: string;
  eventId?: string;
}): string {
  const policy = getModelMemoryCaptureSeamPolicy(input.seamName);
  const authorityKey = [
    input.sourceHash,
    input.sourceId,
    input.eventId,
    input.sessionId,
    input.sessionKey,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("|");
  return sha256(`${policy.seamName}|${authorityKey || "unknown"}`);
}

function valueKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function sanitizeKeySegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return key;
  }
  return `key#${sha256(key).slice(0, 12)}`;
}

function boundedHashInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }
  if (isJsonRecord(value)) {
    return {
      type: "object",
      keys: Object.keys(value).toSorted().slice(0, 40).map(sanitizeKeySegment),
    };
  }
  return { type: valueKind(value), value };
}

function summarizeValue(
  value: unknown,
  prefix: string,
  state: { keyPaths: string[]; hashes: Record<string, string> },
  depth = 0,
): void {
  if (state.keyPaths.length >= MAX_KEY_PATHS || depth > MAX_DEPTH) {
    return;
  }
  if (!isJsonRecord(value) && !Array.isArray(value)) {
    state.keyPaths.push(prefix);
    if (Object.keys(state.hashes).length < MAX_HASHES) {
      state.hashes[prefix] = sha256(JSON.stringify(boundedHashInput(value)));
    }
    return;
  }
  if (Array.isArray(value)) {
    state.keyPaths.push(`${prefix}[]`);
    if (Object.keys(state.hashes).length < MAX_HASHES) {
      state.hashes[`${prefix}[]`] = sha256(JSON.stringify(boundedHashInput(value)));
    }
    value
      .slice(0, 5)
      .forEach((entry, index) => summarizeValue(entry, `${prefix}[${index}]`, state, depth + 1));
    return;
  }
  for (const key of Object.keys(value).toSorted().slice(0, 40)) {
    const safeKey = sanitizeKeySegment(key);
    const nextPath = prefix ? `${prefix}.${safeKey}` : safeKey;
    state.keyPaths.push(`${nextPath}:${valueKind(value[key])}`);
    if (Object.keys(state.hashes).length < MAX_HASHES) {
      state.hashes[nextPath] = sha256(JSON.stringify(boundedHashInput(value[key])));
    }
    summarizeValue(value[key], nextPath, state, depth + 1);
  }
}

function summarizePayload(payload: unknown) {
  const state = { keyPaths: [] as string[], hashes: {} as Record<string, string> };
  summarizeValue(payload, "payload", state);
  return {
    payload_key_paths: [...new Set(state.keyPaths)].slice(0, MAX_KEY_PATHS).toSorted(),
    payload_hashes: Object.fromEntries(Object.entries(state.hashes).slice(0, MAX_HASHES)),
  };
}

function findFirstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current.slice(0, 10));
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    for (const next of Object.values(record).slice(0, 20)) {
      if (next && typeof next === "object") {
        stack.push(next);
      }
    }
  }
  return undefined;
}

export function buildModelMemoryCaptureSeamRecord(
  input: Omit<ModelMemoryCaptureSeamInput, "config" | "env" | "outputDir">,
): ModelMemoryCaptureSeamRecord {
  const observedAt = input.observedAt ?? new Date();
  const payload = { payload: input.payload ?? {}, context: input.context ?? {} };
  const summarized = summarizePayload(payload);
  return {
    schema_version: "model_memory_capture_seam.v1",
    seam_name: input.seamName,
    observed_at: observedAt.toISOString(),
    mode: "bounded_evidence",
    session_id: findFirstString(payload, ["sessionId", "session_id"]),
    session_key: findFirstString(payload, ["sessionKey", "session_key"]),
    run_id: findFirstString(payload, ["runId", "run_id"]),
    agent_id: findFirstString(payload, ["agentId", "agent_id"]),
    trigger_surface: input.triggerSurface,
    payload_key_paths: summarized.payload_key_paths,
    payload_hashes: summarized.payload_hashes,
    raw_content_persisted: false,
    semantic_memory_write_attempted: input.semanticMemoryWriteAttempted ?? false,
    durable_memory_write_attempted: input.durableMemoryWriteAttempted ?? false,
  };
}

export async function recordModelMemoryCaptureSeamEvidence(
  input: ModelMemoryCaptureSeamInput,
): Promise<ModelMemoryCaptureSeamRecord | undefined> {
  const settings = resolveModelMemoryCaptureSeamSettings(input);
  if (!settings.enabled || !settings.seamEnabled) {
    return undefined;
  }
  const record = buildModelMemoryCaptureSeamRecord(input);
  const day = record.observed_at.slice(0, 10);
  await mkdir(settings.outputDir, { recursive: true });
  await appendFile(
    path.join(settings.outputDir, `${day}.jsonl`),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
  return record;
}

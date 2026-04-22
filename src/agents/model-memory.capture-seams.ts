import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";

const GLOBAL_ENABLED_ENV = "MODEL_MEMORY_CAPTURE_SEAMS_ENABLED";
const OUTPUT_DIR_ENV = "MODEL_MEMORY_CAPTURE_SEAM_OUTPUT_DIR";
const MAX_KEY_PATHS = 80;
const MAX_HASHES = 80;
const MAX_DEPTH = 4;

export type ModelMemoryCaptureSeamName =
  | "message:preprocessed"
  | "ContextEngine.ingest"
  | "ContextEngine.ingestBatch"
  | "ContextEngine.assemble"
  | "ContextEngine.afterTurn"
  | "tool_result_persist"
  | "after_tool_call"
  | "agent_end";

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
  "message:preprocessed": "MODEL_MEMORY_CAPTURE_SEAM_MESSAGE_PREPROCESSED_ENABLED",
  "ContextEngine.ingest": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_ENABLED",
  "ContextEngine.ingestBatch": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_INGEST_BATCH_ENABLED",
  "ContextEngine.assemble": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_ASSEMBLE_ENABLED",
  "ContextEngine.afterTurn": "MODEL_MEMORY_CAPTURE_SEAM_CONTEXT_AFTER_TURN_ENABLED",
  tool_result_persist: "MODEL_MEMORY_CAPTURE_SEAM_TOOL_RESULT_PERSIST_ENABLED",
  after_tool_call: "MODEL_MEMORY_CAPTURE_SEAM_AFTER_TOOL_CALL_ENABLED",
  agent_end: "MODEL_MEMORY_CAPTURE_SEAM_AGENT_END_ENABLED",
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readNestedRecord(
  value: unknown,
  pathParts: string[],
): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
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
  const enabled = readBoolean(env[GLOBAL_ENABLED_ENV]) ?? readBoolean(config.enabled) ?? false;
  const seamEnabled =
    readBoolean(env[SEAM_ENV[input.seamName]]) ??
    readBoolean(readSeamSpecificConfig(config, input.seamName)) ??
    false;
  const outputDir =
    input.outputDir ??
    readString(env[OUTPUT_DIR_ENV]) ??
    readString(config.outputDir) ??
    path.join(process.cwd(), ".openclaw-memory-ops", "capture-seam-runtime");
  return { enabled, seamEnabled, outputDir };
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
  if (isRecord(value)) {
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
  if (!isRecord(value) && !Array.isArray(value)) {
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

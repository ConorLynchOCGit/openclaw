import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const PROBE_ENABLED_ENV = "MODEL_MEMORY_HOOK_PROBE_ENABLED";
const PROBE_OUTPUT_DIR_ENV = "MODEL_MEMORY_HOOK_PROBE_OUTPUT_DIR";
const MAX_KEY_PATHS = 80;
const MAX_HASHES = 80;
const MAX_DEPTH = 4;

let orderingCounter = 0;

export type ProductionHookProbeVerificationLevel = "production_runtime";

export type ProductionHookProbeRecord = {
  schema_version: "model_memory_hook_probe.v1";
  hook_name: string;
  observed_at: string;
  verification_level: ProductionHookProbeVerificationLevel;
  session_id?: string;
  session_key?: string;
  run_id?: string;
  agent_id?: string;
  payload_key_paths: string[];
  payload_hashes: Record<string, string>;
  ordering_marker: string;
  trigger_surface: string;
  raw_content_persisted: false;
  contains_prompt_text: false;
  contains_transcript: false;
  contains_raw_tool_log: false;
};

export type ProductionHookProbeInput = {
  hookName: string;
  triggerSurface: string;
  payload?: unknown;
  context?: unknown;
  config?: unknown;
  env?: NodeJS.ProcessEnv;
  outputDir?: string;
  observedAt?: Date;
};

export type ProductionHookProbeSettings = {
  enabled: boolean;
  outputDir: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

function readHookProbeConfig(config: unknown): Record<string, unknown> {
  return (
    readNestedRecord(config, ["modelMemory", "hookProbe"]) ??
    readNestedRecord(config, ["plugins", "entries", "model-memory", "config", "hookProbe"]) ??
    {}
  );
}

export function resolveProductionHookProbeSettings(
  input: {
    config?: unknown;
    env?: NodeJS.ProcessEnv;
    outputDir?: string;
  } = {},
): ProductionHookProbeSettings {
  const env = input.env ?? process.env;
  const hookProbeConfig = readHookProbeConfig(input.config);
  const envEnabled = readBoolean(env[PROBE_ENABLED_ENV]);
  const configEnabled = readBoolean(hookProbeConfig.enabled);
  const enabled = envEnabled ?? configEnabled ?? false;
  const outputDir =
    input.outputDir ??
    readString(env[PROBE_OUTPUT_DIR_ENV]) ??
    readString(hookProbeConfig.outputDir) ??
    path.join(process.cwd(), ".openclaw-memory-ops", "hook-runtime-canaries");
  return { enabled, outputDir };
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

function sanitizeKeySegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return key;
  }
  return `key#${sha256(key).slice(0, 12)}`;
}

function summarizePayloadValue(
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
      .forEach((entry, index) =>
        summarizePayloadValue(entry, `${prefix}[${index}]`, state, depth + 1),
      );
    return;
  }

  const keys = Object.keys(value).toSorted().slice(0, 40);
  for (const key of keys) {
    const safeKey = sanitizeKeySegment(key);
    const nextPath = prefix ? `${prefix}.${safeKey}` : safeKey;
    state.keyPaths.push(`${nextPath}:${valueKind(value[key])}`);
    if (Object.keys(state.hashes).length < MAX_HASHES) {
      state.hashes[nextPath] = sha256(JSON.stringify(boundedHashInput(value[key])));
    }
    summarizePayloadValue(value[key], nextPath, state, depth + 1);
  }
}

function summarizePayload(payload: unknown): {
  payload_key_paths: string[];
  payload_hashes: Record<string, string>;
} {
  const state = { keyPaths: [] as string[], hashes: {} as Record<string, string> };
  summarizePayloadValue(payload, "payload", state);
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

export function buildProductionHookProbeRecord(
  input: Omit<ProductionHookProbeInput, "config" | "env" | "outputDir">,
): ProductionHookProbeRecord {
  const observedAt = input.observedAt ?? new Date();
  const payload = { payload: input.payload ?? {}, context: input.context ?? {} };
  const summarized = summarizePayload(payload);
  orderingCounter += 1;
  return {
    schema_version: "model_memory_hook_probe.v1",
    hook_name: input.hookName,
    observed_at: observedAt.toISOString(),
    verification_level: "production_runtime",
    session_id: findFirstString(payload, ["sessionId", "session_id"]),
    session_key: findFirstString(payload, ["sessionKey", "session_key"]),
    run_id: findFirstString(payload, ["runId", "run_id"]),
    agent_id: findFirstString(payload, ["agentId", "agent_id"]),
    payload_key_paths: summarized.payload_key_paths,
    payload_hashes: summarized.payload_hashes,
    ordering_marker: `${observedAt.getTime()}:${process.pid}:${orderingCounter}`,
    trigger_surface: input.triggerSurface,
    raw_content_persisted: false,
    contains_prompt_text: false,
    contains_transcript: false,
    contains_raw_tool_log: false,
  };
}

async function appendJsonl(filePath: string, line: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${line}\n`, "utf8");
}

export async function recordProductionHookProbe(
  input: ProductionHookProbeInput,
): Promise<ProductionHookProbeRecord | undefined> {
  const settings = resolveProductionHookProbeSettings(input);
  if (!settings.enabled) {
    return undefined;
  }
  const record = buildProductionHookProbeRecord(input);
  const day = record.observed_at.slice(0, 10);
  const filePath = path.join(settings.outputDir, `${day}.jsonl`);
  await appendJsonl(filePath, JSON.stringify(record));
  return record;
}

export async function readProductionHookProbeRecords(input: {
  baseDir: string;
}): Promise<ProductionHookProbeRecord[]> {
  let files: string[] = [];
  try {
    files = await readdir(input.baseDir);
  } catch {
    return [];
  }
  const records: ProductionHookProbeRecord[] = [];
  for (const file of files.filter((entry) => entry.endsWith(".jsonl")).toSorted()) {
    const filePath = path.join(input.baseDir, file);
    const fileStat = await stat(filePath).catch(() => undefined);
    if (!fileStat?.isFile()) {
      continue;
    }
    const text = await readFile(filePath, "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/u)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as ProductionHookProbeRecord;
        if (parsed.schema_version === "model_memory_hook_probe.v1") {
          records.push(parsed);
        }
      } catch {
        continue;
      }
    }
  }
  return records;
}

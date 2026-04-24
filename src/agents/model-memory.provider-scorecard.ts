import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import type { MemoryIngestionFailureClass } from "../plugin-sdk/model-memory.js";
import { readRecoveredJsonLines } from "./model-memory.recovery-files.js";

const SCORECARD_SCHEMA_VERSION = 1;

export type ModelMemoryProviderScorecardEventStatus = "success" | "failed";

export type ModelMemoryProviderScorecardEvent = {
  schemaVersion: typeof SCORECARD_SCHEMA_VERSION;
  observedAt: string;
  status: ModelMemoryProviderScorecardEventStatus;
  requestedModelId: string;
  provider: string;
  providerModel: string;
  resolvedModelId?: string;
  contractName?: string;
  contractVersion?: string;
  schemaName?: string;
  schemaHash?: string;
  strictSchema?: boolean;
  httpStatus?: number;
  failureClass?: MemoryIngestionFailureClass;
  failureStage?: string;
  latencyMs?: number;
  promptTokenCount?: number;
  outputTokenCount?: number;
  cachedInputTokenCount?: number;
  promptCacheKey?: string;
  cacheHit?: boolean;
  rawContentPersisted: false;
  containsPromptText: false;
  containsTranscript: false;
  containsRawToolLog: false;
};

export type ModelMemoryProviderScorecardSummary = {
  schemaVersion: typeof SCORECARD_SCHEMA_VERSION;
  generatedAt: string;
  totalCalls: number;
  byProviderModelContract: Array<{
    provider: string;
    providerModel: string;
    contractName?: string;
    contractVersion?: string;
    schemaName?: string;
    calls: number;
    successes: number;
    failures: number;
    schemaSuccessRate: number;
    emptyResponseRate: number;
    jsonSyntaxFailureRate: number;
    schemaFailureRate: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    promptTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheHitRate: number;
  }>;
};

export type ModelMemoryProviderScorecardStore = {
  baseDir: string;
  record(event: ModelMemoryProviderScorecardEvent): Promise<void>;
  readEvents(): Promise<ModelMemoryProviderScorecardEvent[]>;
  buildSummary(): Promise<ModelMemoryProviderScorecardSummary>;
};

function nowIso() {
  return new Date().toISOString();
}

function scorecardBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "model-memory", "provider-scorecards");
}

export function resolveDefaultModelMemoryProviderScorecardStoreDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return scorecardBaseDir(env);
}

function eventsPath(baseDir: string) {
  return path.join(baseDir, "events.jsonl");
}

function summaryPath(baseDir: string) {
  return path.join(baseDir, "summary.json");
}

function sanitizeSafeString(value: string | undefined, maxLength = 160): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/[^A-Za-z0-9_.:@/-]/gu, "_").slice(0, maxLength);
}

function normalizeEvent(
  event: ModelMemoryProviderScorecardEvent,
): ModelMemoryProviderScorecardEvent {
  return {
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    observedAt: event.observedAt,
    status: event.status,
    requestedModelId: sanitizeSafeString(event.requestedModelId) ?? "unknown",
    provider: sanitizeSafeString(event.provider) ?? "unknown",
    providerModel: sanitizeSafeString(event.providerModel) ?? "unknown",
    resolvedModelId: sanitizeSafeString(event.resolvedModelId),
    contractName: sanitizeSafeString(event.contractName),
    contractVersion: sanitizeSafeString(event.contractVersion),
    schemaName: sanitizeSafeString(event.schemaName),
    schemaHash: sanitizeSafeString(event.schemaHash, 128),
    strictSchema: event.strictSchema,
    httpStatus: event.httpStatus,
    failureClass: event.failureClass,
    failureStage: sanitizeSafeString(event.failureStage),
    latencyMs: event.latencyMs === undefined ? undefined : Math.max(0, Math.trunc(event.latencyMs)),
    promptTokenCount:
      event.promptTokenCount === undefined
        ? undefined
        : Math.max(0, Math.trunc(event.promptTokenCount)),
    outputTokenCount:
      event.outputTokenCount === undefined
        ? undefined
        : Math.max(0, Math.trunc(event.outputTokenCount)),
    cachedInputTokenCount:
      event.cachedInputTokenCount === undefined
        ? undefined
        : Math.max(0, Math.trunc(event.cachedInputTokenCount)),
    promptCacheKey: sanitizeSafeString(event.promptCacheKey),
    cacheHit: event.cacheHit,
    rawContentPersisted: false,
    containsPromptText: false,
    containsTranscript: false,
    containsRawToolLog: false,
  };
}

function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function groupKey(event: ModelMemoryProviderScorecardEvent): string {
  return JSON.stringify([
    event.provider,
    event.providerModel,
    event.contractName ?? null,
    event.contractVersion ?? null,
    event.schemaName ?? null,
  ]);
}

export function buildModelMemoryProviderScorecardSummary(
  events: ModelMemoryProviderScorecardEvent[],
): ModelMemoryProviderScorecardSummary {
  const groups = new Map<string, ModelMemoryProviderScorecardEvent[]>();
  for (const event of events) {
    const normalized = normalizeEvent(event);
    groups.set(groupKey(normalized), [...(groups.get(groupKey(normalized)) ?? []), normalized]);
  }
  return {
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    generatedAt: nowIso(),
    totalCalls: events.length,
    byProviderModelContract: [...groups.values()].map((group) => {
      const first = group[0];
      const calls = group.length;
      const successes = group.filter((event) => event.status === "success").length;
      const failures = calls - successes;
      const latencies = group
        .map((event) => event.latencyMs)
        .filter((value): value is number => value !== undefined);
      const promptTokens = group.reduce((sum, event) => sum + (event.promptTokenCount ?? 0), 0);
      const outputTokens = group.reduce((sum, event) => sum + (event.outputTokenCount ?? 0), 0);
      const cachedTokens = group.reduce(
        (sum, event) => sum + (event.cachedInputTokenCount ?? 0),
        0,
      );
      const cacheableCalls = group.filter((event) => event.promptCacheKey).length;
      return {
        provider: first.provider,
        providerModel: first.providerModel,
        contractName: first.contractName,
        contractVersion: first.contractVersion,
        schemaName: first.schemaName,
        calls,
        successes,
        failures,
        schemaSuccessRate: calls > 0 ? successes / calls : 0,
        emptyResponseRate:
          calls > 0
            ? group.filter((event) => event.failureClass === "provider_empty_response").length /
              calls
            : 0,
        jsonSyntaxFailureRate:
          calls > 0
            ? group.filter((event) => event.failureClass === "provider_json_boundary").length /
              calls
            : 0,
        schemaFailureRate:
          calls > 0
            ? group.filter(
                (event) =>
                  event.failureClass === "provider_json_boundary" && event.strictSchema === true,
              ).length / calls
            : 0,
        p50LatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
        promptTokens,
        outputTokens,
        cachedTokens,
        cacheHitRate:
          cacheableCalls > 0
            ? group.filter((event) => event.cacheHit === true).length / cacheableCalls
            : 0,
      };
    }),
  };
}

export function createModelMemoryProviderScorecardStore(
  input: {
    env?: NodeJS.ProcessEnv;
    baseDir?: string;
  } = {},
): ModelMemoryProviderScorecardStore {
  const baseDir = input.baseDir ?? scorecardBaseDir(input.env);
  return {
    baseDir,
    async record(event) {
      await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
      await fs.appendFile(eventsPath(baseDir), `${JSON.stringify(normalizeEvent(event))}\n`, {
        mode: 0o600,
      });
      const summary = await this.buildSummary();
      await fs.writeFile(summaryPath(baseDir), `${JSON.stringify(summary, null, 2)}\n`, {
        mode: 0o600,
      });
    },
    async readEvents() {
      const result = await readRecoveredJsonLines<ModelMemoryProviderScorecardEvent>({
        filePath: eventsPath(baseDir),
        parse: (value) => normalizeEvent(value as ModelMemoryProviderScorecardEvent),
        quarantineDir: path.join(baseDir, "quarantine", "events"),
      });
      return result.entries;
    },
    async buildSummary() {
      return buildModelMemoryProviderScorecardSummary(await this.readEvents());
    },
  };
}

export function shouldRecordModelMemoryProviderScorecard(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.MODEL_MEMORY_PROVIDER_SCORECARD_ENABLED?.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }
  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  return env.NODE_ENV !== "test";
}

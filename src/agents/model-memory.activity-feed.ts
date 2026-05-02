import { createHash } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import { appendExactAssistantMessageToSessionTranscript } from "../config/sessions/transcript.js";
import { isJsonRecord, readBooleanLike, type JsonRecord } from "./model-memory/value-readers.js";

const ACTIVITY_FEED_ENABLED_ENV = "MODEL_MEMORY_ACTIVITY_FEED_ENABLED";
const ACTIVITY_FEED_LEVEL_ENV = "MODEL_MEMORY_ACTIVITY_FEED_LEVEL";
const ACTIVITY_FEED_MAX_IDS = 8;

export type ModelMemoryActivityFeedLevel = "summary" | "maximal";

export type ModelMemoryActivityEventType =
  | "retrieval_started"
  | "memory_retrieval_checked"
  | "retrieval_unavailable"
  | "memory_pack_injected"
  | "memory_capture_skipped"
  | "memory_written"
  | "projection_digest_used"
  | "capture_seam_observed"
  | "retrieval_empty"
  | "retrieval_miss_diagnostic"
  | "capture_queued"
  | "capture_started"
  | "capture_skipped"
  | "capture_failed"
  | "capture_written"
  | "capture_retry_scheduled"
  | "capture_replay_requested"
  | "runtime_dirty_marked"
  | "runtime_rebuild_deferred"
  | "runtime_rebuild_scheduled"
  | "runtime_rebuild_started"
  | "runtime_rebuild_completed"
  | "runtime_rebuild_failed"
  | "runtime_rebuild_skipped_lock_busy"
  | "runtime_rebuild_coalesced"
  | "runtime_dirty_cleared"
  | "runtime_rebuild_admin_requested";

export type ModelMemoryActivityKind =
  | "retrieval"
  | "ordinary_turn_capture"
  | "tool_result_capture"
  | "projection"
  | "hook_probe";

export type ModelMemoryActivityStatus =
  | "queued"
  | "started"
  | "completed"
  | "skipped"
  | "failed"
  | "deferred"
  | "scheduled"
  | "rebuilding"
  | "retry_scheduled"
  | "replay_requested";

export type ModelMemoryActivityFeedSettings = {
  enabled: boolean;
  level: ModelMemoryActivityFeedLevel;
};

export type ModelMemoryActivityEvent = {
  kind: ModelMemoryActivityKind;
  status: ModelMemoryActivityStatus;
  eventType?: ModelMemoryActivityEventType;
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  agentId?: string;
  stableId?: string;
  safeLabels?: Record<string, string | number | boolean | undefined>;
  ids?: Record<string, string | string[] | undefined>;
  metrics?: Record<string, number | boolean | undefined>;
};

type TranscriptAppender = typeof appendExactAssistantMessageToSessionTranscript;

function readActivityFeedConfig(config?: OpenClawConfig): JsonRecord {
  const pluginConfig = config?.plugins?.entries?.["model-memory"]?.config;
  if (isJsonRecord(pluginConfig) && isJsonRecord(pluginConfig.activityFeed)) {
    return pluginConfig.activityFeed;
  }
  const modelMemory = (config as unknown as { modelMemory?: unknown })?.modelMemory;
  if (isJsonRecord(modelMemory) && isJsonRecord(modelMemory.activityFeed)) {
    return modelMemory.activityFeed;
  }
  return {};
}

function readLevel(value: unknown): ModelMemoryActivityFeedLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "summary" || normalized === "maximal" ? normalized : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeSegment(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_.:@/-]+$/u.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function sanitizeLabelKey(value: string): string | undefined {
  const key = sanitizeSegment(value);
  if (!key) {
    return undefined;
  }
  const normalized = key.toLowerCase();
  if (
    [
      "prompt",
      "raw_prompt",
      "transcript",
      "raw_transcript",
      "tool_log",
      "raw_tool_log",
      "content",
      "text",
      "message",
      "private_phrase",
      "secret",
      "token",
    ].includes(normalized)
  ) {
    return undefined;
  }
  return key;
}

function boundedIdList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((entry) => sanitizeSegment(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, ACTIVITY_FEED_MAX_IDS);
}

function formatKind(kind: ModelMemoryActivityKind): string {
  return kind.replaceAll("_", " ");
}

function resolveActivityEventType(event: ModelMemoryActivityEvent): ModelMemoryActivityEventType {
  if (event.eventType) {
    return event.eventType;
  }
  if (event.kind === "projection") {
    return "projection_digest_used";
  }
  if (event.kind === "hook_probe") {
    return "capture_seam_observed";
  }
  if (event.kind === "retrieval") {
    if (event.status === "skipped") {
      return "retrieval_empty";
    }
    if (event.safeLabels?.diagnostic === "memory_existed_but_excluded") {
      return "retrieval_miss_diagnostic";
    }
    if (Number(event.metrics?.packs ?? 0) > 0 || Number(event.metrics?.packInjected ?? 0) > 0) {
      return "memory_pack_injected";
    }
    return "memory_retrieval_checked";
  }
  if (event.status === "skipped") {
    return "memory_capture_skipped";
  }
  return "memory_written";
}

function formatLabels(labels: ModelMemoryActivityEvent["safeLabels"]): string[] {
  if (!labels) {
    return [];
  }
  return Object.entries(labels)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const safeKey = sanitizeLabelKey(key);
      const safeValue =
        typeof value === "string"
          ? sanitizeSegment(value)
          : value === undefined
            ? undefined
            : value;
      return safeKey && safeValue !== undefined ? [`${safeKey}=${safeValue}`] : [];
    });
}

function buildSafeLabels(labels: ModelMemoryActivityEvent["safeLabels"]): JsonRecord {
  const safe: JsonRecord = {};
  if (!labels) {
    return safe;
  }
  for (const [key, value] of Object.entries(labels).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const safeKey = sanitizeLabelKey(key);
    if (!safeKey || value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      const safeValue = sanitizeSegment(value);
      if (safeValue !== undefined) {
        safe[safeKey] = safeValue;
      }
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      safe[safeKey] = value;
    }
  }
  return safe;
}

function buildSafeIds(
  ids: ModelMemoryActivityEvent["ids"],
  level: ModelMemoryActivityFeedLevel,
): JsonRecord {
  const safe: JsonRecord = {};
  if (!ids) {
    return safe;
  }
  for (const [key, value] of Object.entries(ids).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const safeKey = sanitizeSegment(key);
    const safeIds = boundedIdList(value);
    if (!safeKey || safeIds.length === 0) {
      continue;
    }
    safe[safeKey] = level === "summary" ? { count: safeIds.length } : safeIds;
  }
  return safe;
}

function buildSafeMetrics(metrics: ModelMemoryActivityEvent["metrics"]): JsonRecord {
  const safe: JsonRecord = {};
  if (!metrics) {
    return safe;
  }
  for (const [key, value] of Object.entries(metrics).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const safeKey = sanitizeSegment(key);
    if (!safeKey || value === undefined || !Number.isFinite(Number(value))) {
      continue;
    }
    safe[safeKey] = value;
  }
  return safe;
}

function formatIds(ids: ModelMemoryActivityEvent["ids"], level: ModelMemoryActivityFeedLevel) {
  if (!ids) {
    return [];
  }
  return Object.entries(ids)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const safeKey = sanitizeSegment(key);
      const safeIds = boundedIdList(value);
      if (!safeKey || safeIds.length === 0) {
        return [];
      }
      return level === "summary"
        ? [`${safeKey}_count=${safeIds.length}`]
        : [`${safeKey}=${safeIds.join(",")}`];
    });
}

function formatMetrics(metrics: ModelMemoryActivityEvent["metrics"]): string[] {
  if (!metrics) {
    return [];
  }
  return Object.entries(metrics)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const safeKey = sanitizeSegment(key);
      return safeKey && value !== undefined && Number.isFinite(Number(value))
        ? [`${safeKey}=${value}`]
        : [];
    });
}

function isRoutineToolResultSkip(event: ModelMemoryActivityEvent): boolean {
  if (event.kind !== "tool_result_capture" || event.status !== "skipped") {
    return false;
  }
  const reason = event.safeLabels?.reason;
  return reason === "disabled" || reason === "no_bounded_fact";
}

export function resolveModelMemoryActivityFeedSettings(input: {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): ModelMemoryActivityFeedSettings {
  const env = input.env ?? process.env;
  const config = readActivityFeedConfig(input.config);
  const enabled =
    readBooleanLike(env[ACTIVITY_FEED_ENABLED_ENV]) ?? readBooleanLike(config.enabled) ?? false;
  const level = readLevel(env[ACTIVITY_FEED_LEVEL_ENV]) ?? readLevel(config.level) ?? "maximal";
  return { enabled, level };
}

export function buildModelMemoryActivityFeedText(
  event: ModelMemoryActivityEvent,
  settings: ModelMemoryActivityFeedSettings = { enabled: true, level: "maximal" },
): string {
  const pieces = [
    `[Memory Activity] ${formatKind(event.kind)} ${event.status}`,
    ...formatLabels(event.safeLabels),
    ...formatMetrics(event.metrics),
    ...formatIds(event.ids, settings.level),
  ];
  return pieces.join(" | ");
}

export function buildModelMemoryActivityTranscriptMessage(
  event: ModelMemoryActivityEvent,
  settings: ModelMemoryActivityFeedSettings = { enabled: true, level: "maximal" },
) {
  const eventType = resolveActivityEventType(event);
  const label = `${formatKind(event.kind)} ${event.status}`;
  const timestamp = Date.now();
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: buildModelMemoryActivityFeedText(event, settings) }],
    api: "openai-responses",
    provider: "openclaw",
    model: "memory-activity",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop" as const,
    timestamp,
    __openclaw: {
      kind: "model_memory_activity",
      schemaVersion: 1,
      eventType,
      activityKind: event.kind,
      status: event.status,
      label,
      observedAt: timestamp,
      ids: buildSafeIds(event.ids, settings.level),
      metrics: buildSafeMetrics(event.metrics),
      labels: buildSafeLabels(event.safeLabels),
      rawContentPersisted: false,
      containsPromptText: false,
      containsTranscript: false,
      containsRawToolLog: false,
    },
  };
}

export async function emitModelMemoryActivityFeedEvent(
  event: ModelMemoryActivityEvent,
  deps: { appendTranscript?: TranscriptAppender } = {},
): Promise<{ emitted: true; messageId: string } | { emitted: false; reason: string }> {
  const settings = resolveModelMemoryActivityFeedSettings({
    config: event.config,
    env: event.env,
  });
  if (!settings.enabled) {
    return { emitted: false, reason: "disabled" };
  }
  if (!event.sessionKey?.trim()) {
    return { emitted: false, reason: "missing_session_key" };
  }
  if (isRoutineToolResultSkip(event)) {
    return { emitted: false, reason: "routine_tool_result_skip" };
  }
  const idempotencyKey = `model-memory-activity:${sha256(
    JSON.stringify({
      kind: event.kind,
      status: event.status,
      eventType: event.eventType,
      sessionKey: event.sessionKey,
      sessionId: event.sessionId,
      runId: event.runId,
      stableId: event.stableId,
      ids: event.ids,
      metrics: event.metrics,
      labels: event.safeLabels,
    }),
  )}`;
  const appendTranscript = deps.appendTranscript ?? appendExactAssistantMessageToSessionTranscript;
  const message = buildModelMemoryActivityTranscriptMessage(event, settings);
  const appended = await appendTranscript({
    agentId: event.agentId,
    sessionKey: event.sessionKey,
    message,
    idempotencyKey,
  });
  return appended.ok
    ? { emitted: true, messageId: appended.messageId }
    : { emitted: false, reason: appended.reason };
}

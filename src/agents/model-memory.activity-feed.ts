import { createHash } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import { appendAssistantMessageToSessionTranscript } from "../config/sessions/transcript.js";

const ACTIVITY_FEED_ENABLED_ENV = "MODEL_MEMORY_ACTIVITY_FEED_ENABLED";
const ACTIVITY_FEED_LEVEL_ENV = "MODEL_MEMORY_ACTIVITY_FEED_LEVEL";
const ACTIVITY_FEED_MAX_IDS = 8;

type JsonRecord = Record<string, unknown>;

export type ModelMemoryActivityFeedLevel = "summary" | "maximal";

export type ModelMemoryActivityKind =
  | "retrieval"
  | "ordinary_turn_capture"
  | "tool_result_capture"
  | "projection"
  | "hook_probe";

export type ModelMemoryActivityStatus = "started" | "completed" | "skipped" | "failed";

export type ModelMemoryActivityFeedSettings = {
  enabled: boolean;
  level: ModelMemoryActivityFeedLevel;
};

export type ModelMemoryActivityEvent = {
  kind: ModelMemoryActivityKind;
  status: ModelMemoryActivityStatus;
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

type TranscriptAppender = typeof appendAssistantMessageToSessionTranscript;

function isRecord(value: unknown): value is JsonRecord {
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

function readActivityFeedConfig(config?: OpenClawConfig): JsonRecord {
  const pluginConfig = config?.plugins?.entries?.["model-memory"]?.config;
  if (isRecord(pluginConfig) && isRecord(pluginConfig.activityFeed)) {
    return pluginConfig.activityFeed;
  }
  const modelMemory = (config as unknown as { modelMemory?: unknown })?.modelMemory;
  if (isRecord(modelMemory) && isRecord(modelMemory.activityFeed)) {
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

function formatLabels(labels: ModelMemoryActivityEvent["safeLabels"]): string[] {
  if (!labels) {
    return [];
  }
  return Object.entries(labels)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => {
      const safeKey = sanitizeSegment(key);
      const safeValue =
        typeof value === "string"
          ? sanitizeSegment(value)
          : value === undefined
            ? undefined
            : value;
      return safeKey && safeValue !== undefined ? [`${safeKey}=${safeValue}`] : [];
    });
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

export function resolveModelMemoryActivityFeedSettings(input: {
  config?: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): ModelMemoryActivityFeedSettings {
  const env = input.env ?? process.env;
  const config = readActivityFeedConfig(input.config);
  const enabled =
    readBoolean(env[ACTIVITY_FEED_ENABLED_ENV]) ?? readBoolean(config.enabled) ?? false;
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
  const text = buildModelMemoryActivityFeedText(event, settings);
  const idempotencyKey = `model-memory-activity:${sha256(
    JSON.stringify({
      kind: event.kind,
      status: event.status,
      sessionKey: event.sessionKey,
      sessionId: event.sessionId,
      runId: event.runId,
      stableId: event.stableId,
      ids: event.ids,
      metrics: event.metrics,
      labels: event.safeLabels,
    }),
  )}`;
  const appendTranscript = deps.appendTranscript ?? appendAssistantMessageToSessionTranscript;
  const appended = await appendTranscript({
    agentId: event.agentId,
    sessionKey: event.sessionKey,
    text,
    idempotencyKey,
  });
  return appended.ok
    ? { emitted: true, messageId: appended.messageId }
    : { emitted: false, reason: appended.reason };
}

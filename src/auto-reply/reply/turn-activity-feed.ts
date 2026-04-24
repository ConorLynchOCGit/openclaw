import { createHash } from "node:crypto";
import { appendExactAssistantMessageToSessionTranscript } from "../../config/sessions/transcript.js";

type JsonRecord = Record<string, unknown>;

export type TurnActivityEventType =
  | "prompt_accepted"
  | "prompt_blocked"
  | "model_started"
  | "tool_started"
  | "tool_completed";

export type TurnActivityStatus = "accepted" | "blocked" | "started" | "completed";

export type TurnActivityEvent = {
  eventType: TurnActivityEventType;
  sessionKey?: string;
  agentId?: string;
  runId?: string;
  stableId?: string;
  safeLabels?: Record<string, string | number | boolean | undefined>;
  ids?: Record<string, string | string[] | undefined>;
};

type TranscriptAppender = typeof appendExactAssistantMessageToSessionTranscript;

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
    .slice(0, 8);
}

function resolveStatus(eventType: TurnActivityEventType): TurnActivityStatus {
  switch (eventType) {
    case "prompt_accepted":
      return "accepted";
    case "prompt_blocked":
      return "blocked";
    case "tool_completed":
      return "completed";
    case "model_started":
    case "tool_started":
      return "started";
  }
  return "started";
}

function formatLabels(labels: TurnActivityEvent["safeLabels"]): string[] {
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

function formatIds(ids: TurnActivityEvent["ids"]): string[] {
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
      return [`${safeKey}=${safeIds.join(",")}`];
    });
}

function buildSafeLabels(labels: TurnActivityEvent["safeLabels"]): JsonRecord {
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

function buildSafeIds(ids: TurnActivityEvent["ids"]): JsonRecord {
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
    safe[safeKey] = safeIds;
  }
  return safe;
}

function resolveLabel(event: TurnActivityEvent): string {
  const safeTool =
    typeof event.safeLabels?.tool === "string" ? sanitizeSegment(event.safeLabels.tool) : undefined;
  switch (event.eventType) {
    case "prompt_accepted":
      return "prompt accepted";
    case "prompt_blocked":
      return "prompt blocked";
    case "model_started":
      return "model started";
    case "tool_started":
      return safeTool ? `tool started: ${safeTool}` : "tool started";
    case "tool_completed":
      return safeTool ? `tool completed: ${safeTool}` : "tool completed";
  }
  return "turn activity";
}

export function buildTurnActivityFeedText(event: TurnActivityEvent): string {
  const label = resolveLabel(event);
  return ["[Turn Activity]", label, ...formatLabels(event.safeLabels), ...formatIds(event.ids)]
    .join(" | ")
    .replace("| |", "|");
}

export function buildTurnActivityTranscriptMessage(event: TurnActivityEvent) {
  const timestamp = Date.now();
  const label = resolveLabel(event);
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: `Turn activity: ${label}` }],
    api: "openai-responses",
    provider: "openclaw",
    model: "turn-activity",
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
      kind: "turn_activity",
      schemaVersion: 1,
      eventType: event.eventType,
      status: resolveStatus(event.eventType),
      label,
      observedAt: timestamp,
      ids: buildSafeIds(event.ids),
      labels: buildSafeLabels(event.safeLabels),
      rawContentPersisted: false,
      containsPromptText: false,
      containsTranscript: false,
      containsRawToolLog: false,
    },
  };
}

export async function emitTurnActivityFeedEvent(
  event: TurnActivityEvent,
  deps: { appendTranscript?: TranscriptAppender } = {},
): Promise<{ emitted: true; messageId: string } | { emitted: false; reason: string }> {
  if (!event.sessionKey?.trim()) {
    return { emitted: false, reason: "missing_session_key" };
  }
  const idempotencyKey = `turn-activity:${sha256(
    JSON.stringify({
      eventType: event.eventType,
      sessionKey: event.sessionKey,
      runId: event.runId,
      stableId: event.stableId,
      ids: event.ids,
      labels: event.safeLabels,
    }),
  )}`;
  const appendTranscript = deps.appendTranscript ?? appendExactAssistantMessageToSessionTranscript;
  const message = buildTurnActivityTranscriptMessage(event);
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

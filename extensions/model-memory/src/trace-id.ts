import { createHash } from "node:crypto";

const MAX_SAFE_TRACE_ID_LENGTH = 96;
const MAX_TRACE_ID_LIST = 16;

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTurnText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function sanitizeMemoryTraceId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > MAX_SAFE_TRACE_ID_LENGTH) {
    return undefined;
  }
  return /^memory_trace_[A-Za-z0-9_.:@/-]+$/u.test(trimmed) ? trimmed : undefined;
}

function buildMemoryTraceId(kind: string, payload: Record<string, unknown>): string {
  const digest = sha256Text(JSON.stringify(payload)).slice(0, 24);
  return `memory_trace_${kind}_${digest}`;
}

export function buildOrdinaryTurnMemoryTraceId(input: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText: string;
}): string {
  const normalizedTurnText = normalizeTurnText(input.currentTurnText);
  return buildMemoryTraceId("turn", {
    sessionId: input.sessionId ?? null,
    sessionKey: input.sessionKey ?? null,
    agentId: input.agentId ?? null,
    currentTurnSha256: sha256Text(normalizedTurnText),
  });
}

export function buildToolResultMemoryTraceId(input: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  runId?: string;
  toolCallId?: string;
  hookName: string;
  toolName: string;
}): string {
  return buildMemoryTraceId("tool", {
    sessionId: input.sessionId ?? null,
    sessionKey: input.sessionKey ?? null,
    agentId: input.agentId ?? null,
    runId: input.runId ?? null,
    toolCallId: input.toolCallId ?? null,
    hookName: input.hookName,
    toolName: input.toolName,
  });
}

export function readMemoryTraceIdFromScope(
  scope: Record<string, unknown> | undefined,
): string | undefined {
  const candidate = scope?.memoryTraceId;
  return typeof candidate === "string" ? sanitizeMemoryTraceId(candidate) : undefined;
}

export function mergeMemoryTraceIds(
  left: string[] | undefined,
  right: string[] | undefined,
): string[] | undefined {
  const merged = [...new Set([...(left ?? []), ...(right ?? [])])]
    .map((entry) => sanitizeMemoryTraceId(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_TRACE_ID_LIST);
  return merged.length > 0 ? merged : undefined;
}

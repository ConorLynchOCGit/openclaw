import { isJsonObject, type JsonObject } from "./protocol.js";
import {
  sanitizeCodexAgentEventRecord,
  sanitizeCodexToolArguments,
} from "./tool-progress-normalization.js";

const TOOL_ITEM_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "webSearch",
  "collabToolCall",
  "collabAgentToolCall",
]);

export type NormalizedCodexItemToolEvent = {
  type: "tool.call" | "tool.result";
  data: Record<string, unknown>;
};

function readString(record: JsonObject | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: JsonObject | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function normalizeStatus(item: JsonObject): "completed" | "failed" | "running" | "blocked" {
  const status = readString(item, "status");
  if (status === "failed") {
    return "failed";
  }
  if (status === "declined" || status === "blocked") {
    return "blocked";
  }
  if (status === "inProgress" || status === "running") {
    return "running";
  }
  return "completed";
}

function normalizeName(item: JsonObject, itemType: string): string | undefined {
  if (itemType === "commandExecution") {
    return "bash";
  }
  if (itemType === "fileChange") {
    return "apply_patch";
  }
  if (itemType === "webSearch") {
    return "web_search";
  }
  const tool = readString(item, "tool");
  if (!tool) {
    return undefined;
  }
  if (itemType === "mcpToolCall") {
    const server = readString(item, "server");
    return server ? `${server}.${tool}` : tool;
  }
  return tool;
}

function normalizeFileChanges(item: JsonObject): Array<{ path: string; kind: string }> {
  return Array.isArray(item.changes)
    ? item.changes.flatMap((change) => {
        if (!isJsonObject(change)) {
          return [];
        }
        const filePath = readString(change, "path");
        const kind = readString(change, "kind");
        return filePath && kind ? [{ path: filePath, kind }] : [];
      })
    : [];
}

function normalizeArguments(item: JsonObject, itemType: string): Record<string, unknown> {
  if (itemType === "commandExecution") {
    return sanitizeCodexAgentEventRecord({
      command: readString(item, "command"),
      cwd: readString(item, "cwd"),
    });
  }
  if (itemType === "fileChange") {
    return sanitizeCodexAgentEventRecord({ changes: normalizeFileChanges(item) });
  }
  if (itemType === "webSearch") {
    return sanitizeCodexAgentEventRecord({
      query: readString(item, "query"),
      action: isJsonObject(item.action) ? item.action : undefined,
    });
  }
  if (itemType === "mcpToolCall") {
    return sanitizeCodexToolArguments(item.arguments) ?? {};
  }
  return sanitizeCodexAgentEventRecord({
    prompt: readString(item, "prompt"),
    receiverThreadIds: readStringArray(item.receiverThreadIds),
    agentThreadIds: isJsonObject(item.agentsStates) ? Object.keys(item.agentsStates) : [],
  });
}

function boundedMcpStructuredContent(item: JsonObject): Record<string, unknown> | undefined {
  const result = isJsonObject(item.result) ? item.result : undefined;
  const structured = isJsonObject(result?.structuredContent)
    ? result.structuredContent
    : isJsonObject(item.structuredContent)
      ? item.structuredContent
      : undefined;
  if (!structured) {
    return undefined;
  }
  const bounded = sanitizeCodexAgentEventRecord({
    root: readString(structured, "root"),
    file: readString(structured, "file"),
    projectMode: readString(structured, "projectMode"),
    lspPartial: typeof structured.lspPartial === "boolean" ? structured.lspPartial : undefined,
  });
  return Object.keys(bounded).length > 0 ? bounded : undefined;
}

function normalizeResult(item: JsonObject, itemType: string): Record<string, unknown> {
  if (itemType === "commandExecution") {
    return sanitizeCodexAgentEventRecord({
      exitCode: readNumber(item, "exitCode"),
      durationMs: readNumber(item, "durationMs"),
    });
  }
  if (itemType === "fileChange") {
    return sanitizeCodexAgentEventRecord({ changes: normalizeFileChanges(item) });
  }
  if (itemType === "mcpToolCall") {
    return sanitizeCodexAgentEventRecord({
      durationMs: readNumber(item, "durationMs"),
      error: isJsonObject(item.error) ? item.error : readString(item, "error"),
      structuredContent: boundedMcpStructuredContent(item),
    });
  }
  if (itemType === "webSearch") {
    return sanitizeCodexAgentEventRecord({ query: readString(item, "query") });
  }
  return sanitizeCodexAgentEventRecord({
    receiverThreadIds: readStringArray(item.receiverThreadIds),
    agentThreadIds: isJsonObject(item.agentsStates) ? Object.keys(item.agentsStates) : [],
  });
}

/** Projects one Codex item lifecycle notification into bounded trajectory evidence. */
export function normalizeCodexItemToolEvent(params: {
  method: string;
  notificationParams: JsonObject;
  threadId?: string;
  turnId?: string;
  role?: string;
  objective?: string;
}): NormalizedCodexItemToolEvent | undefined {
  if (params.method !== "item/started" && params.method !== "item/completed") {
    return undefined;
  }
  const item = isJsonObject(params.notificationParams.item)
    ? params.notificationParams.item
    : undefined;
  const itemType = readString(item, "type");
  if (!item || !itemType || !TOOL_ITEM_TYPES.has(itemType)) {
    return undefined;
  }
  const name = normalizeName(item, itemType);
  if (!name) {
    return undefined;
  }
  const threadId =
    params.threadId ??
    readString(item, "senderThreadId") ??
    readString(params.notificationParams, "threadId");
  const turnId = params.turnId ?? readString(params.notificationParams, "turnId");
  const itemId =
    readString(item, "id") ??
    readString(params.notificationParams, "itemId") ??
    `${itemType}:${name}:${turnId ?? threadId ?? "unscoped"}`;
  const common = {
    source: "codex-native",
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
    itemId,
    toolCallId: itemId,
    name,
    ...(params.role ? { role: params.role } : {}),
    ...(params.objective ? { objective: params.objective } : {}),
  };
  if (params.method === "item/started") {
    return {
      type: "tool.call",
      data: {
        ...common,
        arguments: normalizeArguments(item, itemType),
      },
    };
  }
  const status = normalizeStatus(item);
  return {
    type: "tool.result",
    data: {
      ...common,
      status,
      isError: status === "failed" || status === "blocked",
      result: normalizeResult(item, itemType),
    },
  };
}

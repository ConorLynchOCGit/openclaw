import { isJsonObject, type JsonObject } from "./protocol.js";
import {
  sanitizeCodexAgentEventRecord,
  sanitizeCodexToolArguments,
} from "./tool-progress-normalization.js";

const TOOL_ITEM_TYPES = new Set([
  "commandExecution",
  "dynamicToolCall",
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

/**
 * Projects image content returned by Codex Code Mode into bounded execution
 * evidence. The image bytes stay in Codex; OpenClaw records only that pixels
 * were actually presented to the model.
 */
export function normalizeCodexRawImageToolEvents(params: {
  method: string;
  notificationParams: JsonObject;
  threadId?: string;
  turnId?: string;
  role?: string;
  objective?: string;
}): NormalizedCodexItemToolEvent[] {
  if (params.method !== "rawResponseItem/completed") {
    return [];
  }
  const item = isJsonObject(params.notificationParams.item)
    ? params.notificationParams.item
    : undefined;
  if (!item || readString(item, "type") !== "custom_tool_call_output") {
    return [];
  }
  const output = Array.isArray(item.output) ? item.output : [];
  const imageCount = output.filter(
    (entry) => isJsonObject(entry) && readString(entry, "type") === "input_image",
  ).length;
  if (imageCount === 0) {
    return [];
  }
  const rawCallId =
    readString(item, "call_id") ?? readString(item, "callId") ?? readString(item, "id");
  if (!rawCallId) {
    return [];
  }
  const toolCallId = `image-input:${rawCallId}`;
  const threadId = params.threadId ?? readString(params.notificationParams, "threadId");
  const turnId = params.turnId ?? readString(params.notificationParams, "turnId");
  const common = {
    source: "codex-native",
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
    itemId: toolCallId,
    toolCallId,
    name: "image_input",
    ...(params.role ? { role: params.role } : {}),
    ...(params.objective ? { objective: params.objective } : {}),
  };
  return [
    {
      type: "tool.call",
      data: {
        ...common,
        arguments: { imageCount },
      },
    },
    {
      type: "tool.result",
      data: {
        ...common,
        status: "completed",
        isError: false,
        result: { imageCount },
      },
    },
  ];
}

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
  if (
    itemType === "collabAgentToolCall" ||
    (itemType === "dynamicToolCall" && readString(item, "namespace") === "agents")
  ) {
    return normalizeCollaborationToolName(tool);
  }
  if (itemType === "mcpToolCall") {
    const server = readString(item, "server");
    return server ? `${server}.${tool}` : tool;
  }
  return tool;
}

export function normalizeCollaborationToolName(tool: string): string {
  const normalized = tool.replace(/[^a-z0-9]/giu, "").toLowerCase();
  switch (normalized) {
    case "spawnagent":
      return "spawn_agent";
    case "sendinput":
      return "send_input";
    case "followuptask":
      return "followup_task";
    case "resumeagent":
      return "resume_agent";
    case "wait":
    case "waitagent":
      return "wait_agent";
    case "closeagent":
      return "close_agent";
    default:
      return tool;
  }
}

export type NormalizedCodexRawCollaborationToolEvent = NormalizedCodexItemToolEvent & {
  toolCallId: string;
  aliases: string[];
  name: string;
};

const RAW_COLLABORATION_ARGUMENT_KEYS = [
  "agent_type",
  "task_name",
  "target",
  "fork_turns",
  "thread_id",
  "threadId",
  "ids",
] as const;

function readJsonObject(value: unknown): JsonObject | undefined {
  if (isJsonObject(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRawCollaborationArguments(value: unknown, name: string): Record<string, unknown> {
  if (name === "spawn_agent") {
    return {};
  }
  const raw = readJsonObject(value);
  if (!raw) {
    return {};
  }
  const safe: Record<string, unknown> = {};
  for (const key of RAW_COLLABORATION_ARGUMENT_KEYS) {
    const candidate = raw[key];
    if (
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean"
    ) {
      safe[key] = candidate;
      continue;
    }
    if (Array.isArray(candidate)) {
      safe[key] = candidate.filter(
        (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
      );
    }
  }
  return sanitizeCodexAgentEventRecord(safe);
}

function rawCollaborationAccepted(outputValue: unknown, name: string): boolean {
  const output = readJsonObject(outputValue);
  if (name === "spawn_agent") {
    return Boolean(output && readString(output, "task_name"));
  }
  if (!output) {
    return true;
  }
  const status = readString(output, "status")?.toLowerCase();
  return !(
    output.error !== undefined ||
    output.success === false ||
    status === "failed" ||
    status === "blocked" ||
    status === "declined"
  );
}

/**
 * Projects the raw Codex V2 collaboration envelope when app-server omits the
 * canonical item lifecycle event. Prompt/message bodies and encrypted payloads
 * are intentionally never mirrored into OpenClaw trajectory evidence.
 */
export function normalizeCodexRawCollaborationToolEvent(params: {
  item: JsonObject;
  knownName?: string;
  threadId?: string;
  turnId?: string;
}): NormalizedCodexRawCollaborationToolEvent | undefined {
  const itemType = readString(params.item, "type");
  const toolCallId = readString(params.item, "call_id") ?? readString(params.item, "callId");
  if (!toolCallId) {
    return undefined;
  }

  if (itemType === "function_call") {
    if (readString(params.item, "namespace") !== "agents") {
      return undefined;
    }
    const rawName = readString(params.item, "name");
    if (!rawName) {
      return undefined;
    }
    const name = normalizeCollaborationToolName(rawName);
    return {
      type: "tool.call",
      toolCallId,
      aliases: readString(params.item, "id") ? [readString(params.item, "id") as string] : [],
      name,
      data: {
        source: "codex-native",
        ...(params.threadId ? { threadId: params.threadId } : {}),
        ...(params.turnId ? { turnId: params.turnId } : {}),
        itemId: toolCallId,
        toolCallId,
        name,
        namespace: "agents",
        arguments: normalizeRawCollaborationArguments(params.item.arguments, name),
      },
    };
  }

  if (itemType !== "function_call_output" || !params.knownName) {
    return undefined;
  }
  const accepted = rawCollaborationAccepted(params.item.output, params.knownName);
  return {
    type: "tool.result",
    toolCallId,
    aliases: [],
    name: params.knownName,
    data: {
      source: "codex-native",
      ...(params.threadId ? { threadId: params.threadId } : {}),
      ...(params.turnId ? { turnId: params.turnId } : {}),
      itemId: toolCallId,
      toolCallId,
      name: params.knownName,
      namespace: "agents",
      status: accepted ? "completed" : "failed",
      isError: !accepted,
      result: { accepted },
    },
  };
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
  if (itemType === "dynamicToolCall") {
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
      status: normalizeStatus(item),
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
  if (itemType === "dynamicToolCall") {
    return sanitizeCodexAgentEventRecord({
      durationMs: readNumber(item, "durationMs"),
      success: typeof item.success === "boolean" ? item.success : undefined,
      error: isJsonObject(item.error) ? item.error : readString(item, "error"),
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
    ...(itemType === "dynamicToolCall" && readString(item, "namespace")
      ? { namespace: readString(item, "namespace") }
      : {}),
    ...(params.role ? { role: params.role } : {}),
    ...(params.objective ? { objective: params.objective } : {}),
  };
  if (params.method === "item/started") {
    return {
      type: "tool.call",
      data: {
        ...common,
        arguments: name === "spawn_agent" ? {} : normalizeArguments(item, itemType),
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
      result:
        name === "spawn_agent"
          ? { accepted: status === "completed" }
          : normalizeResult(item, itemType),
    },
  };
}

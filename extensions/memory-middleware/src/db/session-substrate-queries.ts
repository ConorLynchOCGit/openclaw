import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import type {
  CompactionPlanInput,
  CompactionPlanResult,
  CompactionPlanSessionMemoryStatus,
  FullCompactionFallbackExecuteInput,
  FullCompactionFallbackExecuteResult,
  FullCompactionFallbackPayload,
  JsonValue,
  SessionMemoryCompactionPayload,
  SessionMemoryCompactExecuteInput,
  SessionMemoryCompactExecuteResult,
  SessionMemoryGetInput,
  SessionMemoryGetResult,
  SessionMemoryState,
  SessionMemoryUpdateInput,
  SessionMemoryUpdateResult,
  ToolResultGetInput,
  ToolResultGetResult,
  ToolResultMicrocompactCandidate,
  ToolResultMicrocompactExecuteInput,
  ToolResultMicrocompactExecuteResult,
  ToolResultMicrocompactPlanInput,
  ToolResultMicrocompactPlanResult,
  ToolResultMicrocompactTrigger,
  ToolResultPersistInput,
  ToolResultPersistResult,
  ToolResultPreview,
  ToolResultRecord,
} from "./runtime.js";
import { quoteQualifiedTable, toClientConfig, withConfiguredClient } from "./shared.js";

const DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES = 4_096;
const MAX_TOOL_RESULT_PERSIST_THRESHOLD_BYTES = 200_000;
const DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT = 280;
const MAX_TOOL_RESULT_PREVIEW_CHAR_LIMIT = 1_000;
const DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS = 900;
const MAX_TOOL_RESULT_IDLE_GAP_SECONDS = 86_400;
const DEFAULT_TOOL_RESULT_COUNT_THRESHOLD = 6;
const MAX_TOOL_RESULT_COUNT_THRESHOLD = 100;
const DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT = 2;
const MAX_TOOL_RESULT_RECENT_FLOOR_COUNT = 20;
const DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT = 10;
const MAX_TOOL_RESULT_MAX_CLEAR_COUNT = 50;
const DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD = 12_000;
const MAX_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD = 200_000;
const SESSION_MEMORY_LIST_MAX_ITEMS = 20;
const SESSION_MEMORY_WORKLOG_MAX_ITEMS = 40;
const SESSION_MEMORY_TITLE_MAX_CHARS = 160;
const SESSION_MEMORY_STATE_MAX_CHARS = 600;
const SESSION_MEMORY_TASK_SPEC_MAX_CHARS = 1_500;
const SESSION_MEMORY_ENTRY_MAX_CHARS = 300;
const DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS = 1_800;
const MAX_SESSION_MEMORY_STALE_AFTER_SECONDS = 86_400;

type ToolResultRow = {
  id: string;
  session_id: string;
  memory_event_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  tool_name: string;
  status: "persisted" | "rehydrated" | "compacted" | "deleted";
  content_type: string | null;
  preview_text: string | null;
  payload_text: string | null;
  payload_json: JsonValue | null;
  size_bytes: string | number | null;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ToolResultMicrocompactRow = ToolResultRow;

type SessionMemoryRow = {
  id: string;
  agent_id: string;
  session_id: string | null;
  state_key: string;
  lifecycle: "active" | "paused" | "completed" | "superseded";
  state_json: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type PgErrorLike = Error & {
  code?: string;
};

type ToolResultPayloadSelection =
  | {
      contentType: string;
      serializedPayload: string;
      payloadText: null;
      payloadJson: JsonValue;
    }
  | {
      contentType: string;
      serializedPayload: string;
      payloadText: string;
      payloadJson: null;
    };

function normalizeToolResultThreshold(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PERSIST_THRESHOLD_BYTES;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PERSIST_THRESHOLD_BYTES);
}

function normalizeToolResultPreviewCharLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PREVIEW_CHAR_LIMIT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PREVIEW_CHAR_LIMIT);
}

function normalizeToolResultIdleGapSeconds(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_IDLE_GAP_SECONDS;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_IDLE_GAP_SECONDS);
}

function normalizeToolResultCountThreshold(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_COUNT_THRESHOLD;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_COUNT_THRESHOLD;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_COUNT_THRESHOLD);
}

function normalizeToolResultRecentFloorCount(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated < 0) {
    return DEFAULT_TOOL_RESULT_RECENT_FLOOR_COUNT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_RECENT_FLOOR_COUNT);
}

function normalizeToolResultMaxClearCount(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_MAX_CLEAR_COUNT;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_MAX_CLEAR_COUNT);
}

export function normalizeToolResultPromptTokenThreshold(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD;
  }
  return Math.min(truncated, MAX_TOOL_RESULT_PROMPT_TOKEN_THRESHOLD);
}

function normalizeSessionMemoryStaleAfterSeconds(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS;
  }
  const truncated = Math.trunc(limit);
  if (!Number.isFinite(truncated) || truncated <= 0) {
    return DEFAULT_SESSION_MEMORY_STALE_AFTER_SECONDS;
  }
  return Math.min(truncated, MAX_SESSION_MEMORY_STALE_AFTER_SECONDS);
}

function normalizeSessionMemoryString(
  value: string | undefined,
  maxChars: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxChars);
}

function normalizeSessionMemoryList(
  values: readonly string[] | undefined,
  maxItems: number,
): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = normalizeSessionMemoryString(rawValue, SESSION_MEMORY_ENTRY_MAX_CHARS);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= maxItems) {
      break;
    }
  }
  return normalized;
}

function createEmptySessionMemoryState(): SessionMemoryState {
  return {
    relevantFiles: [],
    commandsUsed: [],
    errorsAndCorrections: [],
    decisionsMade: [],
    importantFactsLearned: [],
    keyResults: [],
    pendingTasks: [],
    worklog: [],
  };
}

function normalizeSessionMemoryState(
  raw: Record<string, unknown> | null | undefined,
): SessionMemoryState {
  const title = normalizeSessionMemoryString(
    typeof raw?.title === "string" ? raw.title : undefined,
    SESSION_MEMORY_TITLE_MAX_CHARS,
  );
  const currentState = normalizeSessionMemoryString(
    typeof raw?.currentState === "string" ? raw.currentState : undefined,
    SESSION_MEMORY_STATE_MAX_CHARS,
  );
  const taskSpecification = normalizeSessionMemoryString(
    typeof raw?.taskSpecification === "string" ? raw.taskSpecification : undefined,
    SESSION_MEMORY_TASK_SPEC_MAX_CHARS,
  );

  return {
    ...createEmptySessionMemoryState(),
    ...(title ? { title } : {}),
    ...(currentState ? { currentState } : {}),
    ...(taskSpecification ? { taskSpecification } : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.relevantFiles)
        ? raw.relevantFiles.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          relevantFiles:
            normalizeSessionMemoryList(
              Array.isArray(raw?.relevantFiles)
                ? raw.relevantFiles.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.commandsUsed)
        ? raw.commandsUsed.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          commandsUsed:
            normalizeSessionMemoryList(
              Array.isArray(raw?.commandsUsed)
                ? raw.commandsUsed.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.errorsAndCorrections)
        ? raw.errorsAndCorrections.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          errorsAndCorrections:
            normalizeSessionMemoryList(
              Array.isArray(raw?.errorsAndCorrections)
                ? raw.errorsAndCorrections.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.decisionsMade)
        ? raw.decisionsMade.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          decisionsMade:
            normalizeSessionMemoryList(
              Array.isArray(raw?.decisionsMade)
                ? raw.decisionsMade.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.importantFactsLearned)
        ? raw.importantFactsLearned.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          importantFactsLearned:
            normalizeSessionMemoryList(
              Array.isArray(raw?.importantFactsLearned)
                ? raw.importantFactsLearned.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.keyResults)
        ? raw.keyResults.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          keyResults:
            normalizeSessionMemoryList(
              Array.isArray(raw?.keyResults)
                ? raw.keyResults.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.pendingTasks)
        ? raw.pendingTasks.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_LIST_MAX_ITEMS,
    )
      ? {
          pendingTasks:
            normalizeSessionMemoryList(
              Array.isArray(raw?.pendingTasks)
                ? raw.pendingTasks.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_LIST_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
    ...(normalizeSessionMemoryList(
      Array.isArray(raw?.worklog)
        ? raw.worklog.filter((v): v is string => typeof v === "string")
        : undefined,
      SESSION_MEMORY_WORKLOG_MAX_ITEMS,
    )
      ? {
          worklog:
            normalizeSessionMemoryList(
              Array.isArray(raw?.worklog)
                ? raw.worklog.filter((v): v is string => typeof v === "string")
                : undefined,
              SESSION_MEMORY_WORKLOG_MAX_ITEMS,
            ) ?? [],
        }
      : {}),
  };
}

function applySessionMemoryUpdate(
  existing: SessionMemoryState,
  input: SessionMemoryUpdateInput,
): SessionMemoryState {
  const nextState: SessionMemoryState = {
    ...existing,
  };

  if (input.title !== undefined) {
    const title = normalizeSessionMemoryString(input.title, SESSION_MEMORY_TITLE_MAX_CHARS);
    if (title) {
      nextState.title = title;
    } else {
      delete nextState.title;
    }
  }
  if (input.currentState !== undefined) {
    const currentState = normalizeSessionMemoryString(
      input.currentState,
      SESSION_MEMORY_STATE_MAX_CHARS,
    );
    if (currentState) {
      nextState.currentState = currentState;
    } else {
      delete nextState.currentState;
    }
  }
  if (input.taskSpecification !== undefined) {
    const taskSpecification = normalizeSessionMemoryString(
      input.taskSpecification,
      SESSION_MEMORY_TASK_SPEC_MAX_CHARS,
    );
    if (taskSpecification) {
      nextState.taskSpecification = taskSpecification;
    } else {
      delete nextState.taskSpecification;
    }
  }

  const listUpdates: Array<
    [
      (
        | "relevantFiles"
        | "commandsUsed"
        | "errorsAndCorrections"
        | "decisionsMade"
        | "importantFactsLearned"
        | "keyResults"
        | "pendingTasks"
        | "worklog"
      ),
      string[] | undefined,
      number,
    ]
  > = [
    ["relevantFiles", input.relevantFiles, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["commandsUsed", input.commandsUsed, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["errorsAndCorrections", input.errorsAndCorrections, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["decisionsMade", input.decisionsMade, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["importantFactsLearned", input.importantFactsLearned, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["keyResults", input.keyResults, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["pendingTasks", input.pendingTasks, SESSION_MEMORY_LIST_MAX_ITEMS],
    ["worklog", input.worklog, SESSION_MEMORY_WORKLOG_MAX_ITEMS],
  ];

  for (const [key, values, maxItems] of listUpdates) {
    if (values !== undefined) {
      nextState[key] = normalizeSessionMemoryList(values, maxItems) ?? [];
    }
  }

  return nextState;
}

function selectToolResultPayload(input: ToolResultPersistInput): ToolResultPayloadSelection {
  const hasText = typeof input.payloadText === "string";
  const hasJson = input.payloadJson !== undefined;

  if (hasText === hasJson) {
    throw new Error("tool result persistence requires exactly one of payloadText or payloadJson");
  }

  if (hasText) {
    return {
      contentType: input.contentType?.trim() || "text/plain",
      payloadText: input.payloadText ?? "",
      payloadJson: null,
      serializedPayload: input.payloadText ?? "",
    };
  }

  return {
    contentType: input.contentType?.trim() || "application/json",
    payloadText: null,
    payloadJson: input.payloadJson as JsonValue,
    serializedPayload: JSON.stringify(input.payloadJson),
  };
}

function summarizePreviewText(
  value: string,
  charLimit: number,
): {
  previewText: string;
  truncated: boolean;
  omittedBytes: number;
} {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= charLimit) {
    return {
      previewText: normalized,
      truncated: false,
      omittedBytes: 0,
    };
  }

  const previewBase = normalized.slice(0, Math.max(1, charLimit - 1)).trimEnd();
  const previewText = `${previewBase}…`;
  const omittedBytes = Math.max(
    0,
    Buffer.byteLength(normalized, "utf8") - Buffer.byteLength(previewText, "utf8"),
  );

  return {
    previewText,
    truncated: true,
    omittedBytes,
  };
}

function createToolResultPreview(params: {
  toolResultId?: string;
  contentType: string;
  serializedPayload: string;
  sizeBytes: number;
  previewCharLimit: number;
}): ToolResultPreview {
  const summarized = summarizePreviewText(params.serializedPayload, params.previewCharLimit);
  const referenceToken = params.toolResultId ? `tool_result:${params.toolResultId}` : undefined;
  const shouldSubstitute = Boolean(params.toolResultId);

  return {
    kind: "tool_result_preview",
    shouldSubstitute,
    previewText: summarized.previewText,
    substitutionText: shouldSubstitute
      ? `[tool-result:${params.toolResultId}] ${summarized.previewText}`
      : summarized.previewText,
    retrievalToolName: "memory_tool_result_get",
    ...(params.toolResultId ? { retrievalArgs: { toolResultId: params.toolResultId } } : {}),
    ...(referenceToken ? { referenceToken } : {}),
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
    truncated: summarized.truncated,
    omittedBytes: summarized.omittedBytes,
  };
}

function parseBigIntLikeToNumber(value: string | number | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeToolResultRecord(row: ToolResultRow): ToolResultRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    storageStatus: row.status,
    ...(row.content_type ? { contentType: row.content_type } : {}),
    ...(row.preview_text ? { previewText: row.preview_text } : {}),
    ...(row.payload_text ? { payloadText: row.payload_text } : {}),
    ...(row.payload_json !== null ? { payloadJson: row.payload_json } : {}),
    ...(parseBigIntLikeToNumber(row.size_bytes) !== undefined
      ? { sizeBytes: parseBigIntLikeToNumber(row.size_bytes) as number }
      : {}),
    ...(row.checksum_sha256 ? { checksumSha256: row.checksum_sha256 } : {}),
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.memory_event_id ? { memoryEventId: row.memory_event_id } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function estimatePreviewTokens(row: ToolResultMicrocompactRow): number {
  const previewText = row.preview_text ?? "";
  const previewSource = previewText.length > 0 ? previewText : (row.payload_text ?? "");
  const previewChars = previewSource.length;
  const previewTokenEstimate = Math.ceil(previewChars / 4);
  const sizeEstimate = Math.ceil((parseBigIntLikeToNumber(row.size_bytes) ?? 0) / 4);
  return Math.max(1, previewTokenEstimate, sizeEstimate);
}

function normalizeToolResultMicrocompactCandidate(
  row: ToolResultMicrocompactRow,
): ToolResultMicrocompactCandidate {
  return {
    toolResultId: row.id,
    toolName: row.tool_name,
    ...(row.preview_text ? { previewText: row.preview_text } : {}),
    referenceToken: `tool_result:${row.id}`,
    ...(parseBigIntLikeToNumber(row.size_bytes) !== undefined
      ? { sizeBytes: parseBigIntLikeToNumber(row.size_bytes) }
      : {}),
    estimatedPreviewTokens: estimatePreviewTokens(row),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

function normalizeSessionMemoryUpdateCount(metadata: Record<string, unknown> | null): number {
  const rawValue = metadata?.updateCount;
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0) {
    return Math.trunc(rawValue);
  }
  if (typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function isSessionMemorySufficient(memory: SessionMemoryState): boolean {
  return Boolean(
    memory.title ||
    memory.currentState ||
    memory.taskSpecification ||
    memory.decisionsMade.length > 0 ||
    memory.importantFactsLearned.length > 0 ||
    memory.keyResults.length > 0 ||
    memory.pendingTasks.length > 0 ||
    memory.worklog.length > 0 ||
    memory.relevantFiles.length > 0,
  );
}

function collectSessionMemoryCompactionEntries(
  memory: SessionMemoryState,
): Array<[string, string | undefined]> {
  return [
    ["title", memory.title],
    ["current_state", memory.currentState],
    ["task_specification", memory.taskSpecification],
    [
      "relevant_files",
      memory.relevantFiles.length > 0 ? memory.relevantFiles.join("; ") : undefined,
    ],
    ["commands_used", memory.commandsUsed.length > 0 ? memory.commandsUsed.join("; ") : undefined],
    [
      "errors_and_corrections",
      memory.errorsAndCorrections.length > 0 ? memory.errorsAndCorrections.join("; ") : undefined,
    ],
    [
      "decisions_made",
      memory.decisionsMade.length > 0 ? memory.decisionsMade.join("; ") : undefined,
    ],
    [
      "important_facts_learned",
      memory.importantFactsLearned.length > 0 ? memory.importantFactsLearned.join("; ") : undefined,
    ],
    ["key_results", memory.keyResults.length > 0 ? memory.keyResults.join("; ") : undefined],
    ["pending_tasks", memory.pendingTasks.length > 0 ? memory.pendingTasks.join("; ") : undefined],
    ["worklog", memory.worklog.length > 0 ? memory.worklog.join("; ") : undefined],
  ];
}

function buildSessionMemoryCompactionPayload(params: {
  stateId: string;
  memory: SessionMemoryState;
}): SessionMemoryCompactionPayload {
  const includedEntries = collectSessionMemoryCompactionEntries(params.memory).filter(
    (entry) => entry[1],
  );
  const compactedText = includedEntries.map(([key, value]) => `${key}: ${value}`).join("\n");

  return {
    kind: "session_memory_compaction",
    shouldSubstitute: true,
    substitutionText: `[session-memory:${params.stateId}] ${params.memory.title ?? params.memory.currentState ?? "session memory available"}`,
    compactedText,
    fieldsIncluded: includedEntries.map(([key]) => key),
    structuredMemory: params.memory,
  };
}

function buildFullCompactionFallbackPayload(params: {
  sessionId: string;
  planResult: Extract<CompactionPlanResult, { accepted: true }>;
  sessionMemoryStateId?: string;
  sessionMemoryUpdatedAt?: string;
  sessionMemory?: SessionMemoryState;
}): FullCompactionFallbackPayload {
  const sessionMemoryEntries = params.sessionMemory
    ? collectSessionMemoryCompactionEntries(params.sessionMemory).filter((entry) => entry[1])
    : [];
  const compactedLines: string[] = [
    "planner_outcome: propose_full_compaction_fallback",
    `session_memory_status: ${params.planResult.sessionMemoryStatus}`,
    `microcompaction_recommended: ${params.planResult.microcompactionRecommended ? "true" : "false"}`,
  ];
  if (params.sessionMemoryStateId) {
    compactedLines.push(`session_memory_state_id: ${params.sessionMemoryStateId}`);
  }
  if (params.sessionMemoryUpdatedAt) {
    compactedLines.push(`session_memory_updated_at: ${params.sessionMemoryUpdatedAt}`);
  }
  if (params.planResult.clearCandidates.length > 0) {
    compactedLines.push(
      `clear_candidate_ids: ${params.planResult.clearCandidates.map((item) => item.toolResultId).join("; ")}`,
    );
  }
  if (sessionMemoryEntries.length > 0) {
    compactedLines.push(
      ...sessionMemoryEntries.map(([field, value]) => `session_memory_${field}: ${value}`),
    );
  }
  compactedLines.push(`rationale: ${params.planResult.rationale.join("; ")}`);
  if (params.planResult.requiredInputs.length > 0) {
    compactedLines.push(`required_inputs: ${params.planResult.requiredInputs.join("; ")}`);
  }
  const compactedText = compactedLines.join("\n");
  const payloadSignature = createHash("sha256")
    .update(
      JSON.stringify({
        sessionId: params.sessionId,
        sessionMemoryStatus: params.planResult.sessionMemoryStatus,
        sessionMemoryStateId: params.sessionMemoryStateId,
        sessionMemoryUpdatedAt: params.sessionMemoryUpdatedAt,
        rationale: params.planResult.rationale,
        requiredInputs: params.planResult.requiredInputs,
        clearCandidateIds: params.planResult.clearCandidates.map((item) => item.toolResultId),
        compactedText,
      }),
    )
    .digest("hex")
    .slice(0, 12);

  return {
    kind: "full_compaction_fallback",
    shouldSubstitute: true,
    substitutionText: `[full-fallback:${payloadSignature}] bounded fallback artifact available`,
    compactedText,
    substrate: {
      plannerOutcome: "propose_full_compaction_fallback",
      sessionMemoryStatus: params.planResult.sessionMemoryStatus,
      ...(params.sessionMemoryStateId ? { sessionMemoryStateId: params.sessionMemoryStateId } : {}),
      ...(params.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: params.sessionMemoryUpdatedAt }
        : {}),
      microcompactionRecommended: params.planResult.microcompactionRecommended,
      clearCandidateIds: params.planResult.clearCandidates.map((item) => item.toolResultId),
    },
    rationale: params.planResult.rationale,
    ...(params.sessionMemory ? { structuredSessionMemory: params.sessionMemory } : {}),
  };
}

function summarizeToolResultPersistenceError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "tool-result persistence references a missing session, project, or agent";
    case "23514":
      return "tool-result persistence violated a memory middleware constraint";
    case "22P02":
      return "tool-result persistence used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result persistence failed: ${pgError.message}`;
}

function summarizeToolResultQueryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result query failed: ${pgError.message}`;
}

function summarizeToolResultMicrocompactionError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `tool-result microcompaction planning failed: ${pgError.message}`;
}

function summarizeSessionMemoryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "session-memory write references a missing session or agent";
    case "23514":
      return "session-memory write violated a memory middleware constraint";
    case "22P02":
      return "session-memory write used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `session-memory operation failed: ${pgError.message}`;
}

export async function persistToolResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultPersistInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultPersistResult> {
  const payload = selectToolResultPayload(params.input);
  const sizeBytes = Buffer.byteLength(payload.serializedPayload, "utf8");
  const thresholdBytes = normalizeToolResultThreshold(params.input.persistThresholdBytes);
  const previewCharLimit = normalizeToolResultPreviewCharLimit(params.input.previewCharLimit);

  if (!params.input.forcePersist && sizeBytes <= thresholdBytes) {
    return {
      accepted: true,
      status: "inline",
      persisted: false,
      sessionId: params.input.sessionId,
      toolName: params.input.toolName,
      contentType: payload.contentType,
      sizeBytes,
      thresholdBytes,
      preview: createToolResultPreview({
        contentType: payload.contentType,
        serializedPayload: payload.serializedPayload,
        sizeBytes,
        previewCharLimit,
      }),
    };
  }

  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const checksumSha256 = createHash("sha256").update(payload.serializedPayload).digest("hex");
    const preview = createToolResultPreview({
      contentType: payload.contentType,
      serializedPayload: payload.serializedPayload,
      sizeBytes,
      previewCharLimit,
    });

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          session_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, $3::uuid, 'tool_result', 'tool_result.persisted', $4::jsonb, $5::jsonb)
        returning id
      `,
      [
        params.input.projectId ?? null,
        params.input.agentId ?? null,
        params.input.sessionId,
        JSON.stringify({
          source: "tool-result-persist-tool",
          toolName: params.input.toolName,
          contentType: payload.contentType,
          sizeBytes,
          previewText: preview.previewText,
          referenceToken: preview.referenceToken,
          checksumSha256,
        }),
        JSON.stringify({
          source: "tool-result-persist-tool",
          ...(params.input.metadata ? { persistMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const memoryEventId = eventInsert.rows[0]?.id;
    if (!memoryEventId) {
      throw new Error("tool-result persistence did not return a memory event id");
    }

    const toolResultInsert = await client.query<{ id: string }>(
      `
        insert into ${toolResultsTable} (
          session_id,
          memory_event_id,
          tool_name,
          status,
          content_type,
          preview_text,
          payload_text,
          payload_json,
          size_bytes,
          checksum_sha256,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          $3,
          'persisted',
          $4,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9,
          $10::jsonb
        )
        returning id
      `,
      [
        params.input.sessionId,
        memoryEventId,
        params.input.toolName,
        payload.contentType,
        preview.previewText,
        payload.payloadText,
        payload.payloadJson === null ? null : JSON.stringify(payload.payloadJson),
        sizeBytes,
        checksumSha256,
        JSON.stringify({
          source: "tool-result-persist-tool",
          thresholdBytes,
          previewCharLimit,
          ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
          ...(params.input.agentId ? { agentId: params.input.agentId } : {}),
          ...(params.input.metadata ? { toolMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const toolResultId = toolResultInsert.rows[0]?.id;
    if (!toolResultId) {
      throw new Error("tool-result persistence did not return a tool result id");
    }

    await client.query(
      `
        update ${memoryEventsTable}
        set payload = payload || $2::jsonb
        where id = $1::uuid
      `,
      [
        memoryEventId,
        JSON.stringify({
          toolResultId,
          referenceToken: `tool_result:${toolResultId}`,
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware tool result persisted",
        `toolName=${params.input.toolName}`,
        `toolResultId=${toolResultId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "persisted",
      persisted: true,
      toolResultId,
      memoryEventId,
      sessionId: params.input.sessionId,
      toolName: params.input.toolName,
      contentType: payload.contentType,
      storageStatus: "persisted",
      sizeBytes,
      checksumSha256,
      thresholdBytes,
      preview: createToolResultPreview({
        toolResultId,
        contentType: payload.contentType,
        serializedPayload: payload.serializedPayload,
        sizeBytes,
        previewCharLimit,
      }),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeToolResultPersistenceError(error);
    params.logger.error(
      `memory-middleware tool result persistence failed tool=${params.input.toolName}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function getToolResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultGetResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  try {
    const row = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<ToolResultRow>(
          `
            select
              tr.id,
              tr.session_id,
              tr.memory_event_id,
              me.project_id,
              me.agent_id,
              tr.tool_name,
              tr.status,
              tr.content_type,
              tr.preview_text,
              tr.payload_text,
              tr.payload_json,
              tr.size_bytes,
              tr.checksum_sha256,
              tr.metadata,
              tr.created_at,
              tr.updated_at
            from ${toolResultsTable} tr
            left join ${memoryEventsTable} me
              on me.id = tr.memory_event_id
            where tr.id = $1::uuid
          `,
          [params.input.toolResultId],
        );
        return result.rows[0];
      },
    });

    if (!row) {
      return {
        accepted: false,
        status: "not_found",
        reason: "tool result not found",
      };
    }

    return {
      accepted: true,
      status: "ok",
      toolResult: normalizeToolResultRecord(row),
    };
  } catch (error) {
    const reason = summarizeToolResultQueryError(error);
    params.logger.error(
      `memory-middleware tool result query failed toolResultId=${params.input.toolResultId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function planToolResultMicrocompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultMicrocompactPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultMicrocompactPlanResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });

  const idleGapSeconds = normalizeToolResultIdleGapSeconds(params.input.idleGapSeconds);
  const persistedCountThreshold = normalizeToolResultCountThreshold(
    params.input.persistedCountThreshold,
  );
  const recentFloorCount = normalizeToolResultRecentFloorCount(params.input.recentFloorCount);
  const maxClearCount = normalizeToolResultMaxClearCount(params.input.maxClearCount);
  const estimatedPromptTokenThreshold = normalizeToolResultPromptTokenThreshold(
    params.input.estimatedPromptTokenThreshold,
  );

  try {
    const rows = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<ToolResultMicrocompactRow>(
          `
            select
              id,
              session_id,
              memory_event_id,
              null::text as project_id,
              null::text as agent_id,
              tool_name,
              status,
              content_type,
              preview_text,
              payload_text,
              payload_json,
              size_bytes,
              checksum_sha256,
              metadata,
              created_at,
              updated_at
            from ${toolResultsTable}
            where session_id = $1::uuid
              and status = 'persisted'
            order by updated_at desc, created_at desc, id desc
          `,
          [params.input.sessionId],
        );
        return result.rows;
      },
    });

    const preservedRows = rows.slice(0, recentFloorCount);
    const candidateRows = rows.slice(recentFloorCount);
    const idleCutoff = Date.now() - idleGapSeconds * 1000;
    const selectedById = new Map<string, ToolResultMicrocompactCandidate>();
    const triggers = new Set<ToolResultMicrocompactTrigger>();
    const rationale: string[] = [];

    const candidateRowsOldestFirst = [...candidateRows].sort((left, right) => {
      const leftUpdated = new Date(normalizeTimestamp(left.updated_at)).getTime();
      const rightUpdated = new Date(normalizeTimestamp(right.updated_at)).getTime();
      if (leftUpdated !== rightUpdated) {
        return leftUpdated - rightUpdated;
      }
      const leftCreated = new Date(normalizeTimestamp(left.created_at)).getTime();
      const rightCreated = new Date(normalizeTimestamp(right.created_at)).getTime();
      if (leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }
      return left.id.localeCompare(right.id);
    });

    const idleRows = candidateRowsOldestFirst.filter(
      (row) => new Date(normalizeTimestamp(row.updated_at)).getTime() <= idleCutoff,
    );
    if (idleRows.length > 0) {
      triggers.add("idle_gap_threshold");
      rationale.push(
        `${idleRows.length} persisted tool-result previews are older than the idle-gap threshold`,
      );
      for (const row of idleRows) {
        selectedById.set(row.id, normalizeToolResultMicrocompactCandidate(row));
      }
    }

    const overflowCount = Math.max(0, rows.length - persistedCountThreshold);
    if (overflowCount > 0) {
      triggers.add("persisted_count_threshold");
      rationale.push(
        `persisted tool-result count ${rows.length} exceeds threshold ${persistedCountThreshold}`,
      );
      for (const row of candidateRowsOldestFirst.slice(0, overflowCount)) {
        selectedById.set(row.id, normalizeToolResultMicrocompactCandidate(row));
      }
    }

    if (
      typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens) &&
      params.input.estimatedPromptTokens > estimatedPromptTokenThreshold
    ) {
      triggers.add("estimated_token_pressure");
      rationale.push(
        `estimated prompt tokens ${Math.trunc(params.input.estimatedPromptTokens)} exceed threshold ${estimatedPromptTokenThreshold}`,
      );
      let remainingPressure =
        Math.trunc(params.input.estimatedPromptTokens) - estimatedPromptTokenThreshold;
      for (const row of candidateRowsOldestFirst) {
        if (remainingPressure <= 0) {
          break;
        }
        const candidate = normalizeToolResultMicrocompactCandidate(row);
        selectedById.set(row.id, candidate);
        remainingPressure -= candidate.estimatedPreviewTokens;
      }
    }

    const clearCandidates = candidateRowsOldestFirst
      .filter((row) => selectedById.has(row.id))
      .slice(0, maxClearCount)
      .map((row) => selectedById.get(row.id) as ToolResultMicrocompactCandidate);

    if (clearCandidates.length === 0) {
      return {
        accepted: true,
        status: "ok",
        sessionId: params.input.sessionId,
        shouldCompact: false,
        recommendedAction: "none",
        triggers: [],
        rationale:
          rows.length === 0
            ? ["no persisted tool results exist for this session"]
            : ["persisted tool-result previews remain within bounded microcompaction thresholds"],
        persistedResultCount: rows.length,
        recentFloorCount: Math.min(recentFloorCount, rows.length),
        preservedToolResultIds: preservedRows.map((row) => row.id),
        clearCandidates: [],
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold,
      };
    }

    return {
      accepted: true,
      status: "ok",
      sessionId: params.input.sessionId,
      shouldCompact: true,
      recommendedAction: "clear_persisted_previews",
      triggers: [...triggers],
      rationale,
      persistedResultCount: rows.length,
      recentFloorCount: Math.min(recentFloorCount, rows.length),
      preservedToolResultIds: preservedRows.map((row) => row.id),
      clearCandidates,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold,
    };
  } catch (error) {
    const reason = summarizeToolResultMicrocompactionError(error);
    params.logger.error(
      `memory-middleware tool result microcompaction planning failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function executeToolResultMicrocompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ToolResultMicrocompactExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ToolResultMicrocompactExecuteResult> {
  const toolResultsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "tool_results",
  });
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planToolResultMicrocompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  const requestedToolResultIds = params.input.clearToolResultIds;
  const requestedSet = new Set(requestedToolResultIds ?? []);
  const eligibleCandidates =
    requestedSet.size === 0
      ? planResult.clearCandidates
      : planResult.clearCandidates.filter((candidate) => requestedSet.has(candidate.toolResultId));
  const skippedRequestedToolResultIds =
    requestedSet.size === 0
      ? []
      : [...requestedSet].filter(
          (toolResultId) =>
            !planResult.clearCandidates.some(
              (candidate) => candidate.toolResultId === toolResultId,
            ),
        );

  if (eligibleCandidates.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      clearedToolResultIds: [],
      preservedToolResultIds: planResult.preservedToolResultIds,
      ...(requestedToolResultIds ? { requestedToolResultIds } : {}),
      clearCandidates: [],
      skippedRequestedToolResultIds,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  }

  const candidateIds = eligibleCandidates.map((candidate) => candidate.toolResultId);
  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const updateResult = await client.query<{ id: string }>(
      `
        update ${toolResultsTable}
        set
          status = 'compacted',
          preview_text = null,
          metadata = metadata || $2::jsonb
        where session_id = $1::uuid
          and id = any($3::uuid[])
          and status = 'persisted'
        returning id::text as id
      `,
      [
        params.input.sessionId,
        JSON.stringify({
          microcompaction: {
            clearedAt: new Date().toISOString(),
            source: "tool-result-microcompact-execute-tool",
          },
        }),
        candidateIds,
      ],
    );

    const clearedToolResultIds = updateResult.rows.map((row) => row.id);
    const executedCandidates = eligibleCandidates.filter((candidate) =>
      clearedToolResultIds.includes(candidate.toolResultId),
    );

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'micro',
          $3::memory_middleware.compaction_status,
          $4,
          $5::jsonb,
          $6::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId ?? null,
        clearedToolResultIds.length > 0 ? "completed" : "skipped",
        clearedToolResultIds.length > 0
          ? `Cleared ${clearedToolResultIds.length} persisted tool-result previews`
          : "No persisted tool-result previews required clearing",
        JSON.stringify({
          requestedToolResultIds: requestedToolResultIds ?? null,
          plannerClearCandidateIds: planResult.clearCandidates.map(
            (candidate) => candidate.toolResultId,
          ),
          clearedToolResultIds,
          skippedRequestedToolResultIds,
          preservedToolResultIds: planResult.preservedToolResultIds,
        }),
        JSON.stringify({
          source: "tool-result-microcompact-execute-tool",
        }),
      ],
    );

    const compactionEventId = compactionInsert.rows[0]?.id;
    if (!compactionEventId) {
      throw new Error("microcompaction execution did not return a compaction event id");
    }

    await client.query("commit");

    return {
      accepted: true,
      status: clearedToolResultIds.length > 0 ? "executed" : "no_op",
      sessionId: params.input.sessionId,
      compactionEventId,
      clearedToolResultIds,
      preservedToolResultIds: planResult.preservedToolResultIds,
      ...(requestedToolResultIds ? { requestedToolResultIds } : {}),
      clearCandidates: executedCandidates,
      skippedRequestedToolResultIds,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeToolResultMicrocompactionError(error);
    params.logger.error(
      `memory-middleware tool result microcompaction execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function getSessionMemoryInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryGetResult> {
  const agentStateTable = quoteQualifiedTable({
    schema: params.schema,
    table: "agent_state",
  });

  try {
    const row = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const result = await client.query<SessionMemoryRow>(
          `
            select
              id,
              agent_id,
              session_id,
              state_key,
              lifecycle::text as lifecycle,
              state_json,
              metadata,
              created_at,
              updated_at
            from ${agentStateTable}
            where agent_id = $1::uuid
              and session_id = $2::uuid
              and state_key = 'session_memory'
            limit 1
          `,
          [params.input.agentId, params.input.sessionId],
        );
        return result.rows[0];
      },
    });

    if (!row) {
      return {
        accepted: true,
        status: "ok",
        exists: false,
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        memory: createEmptySessionMemoryState(),
        stateKey: "session_memory",
      };
    }

    return {
      accepted: true,
      status: "ok",
      exists: true,
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      memory: normalizeSessionMemoryState(row.state_json),
      stateKey: "session_memory",
      stateId: row.id,
      lifecycle: row.lifecycle,
      updateCount: normalizeSessionMemoryUpdateCount(row.metadata),
      ...(typeof row.metadata?.updateReason === "string"
        ? { updateReason: row.metadata.updateReason }
        : {}),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
    };
  } catch (error) {
    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory get failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function updateSessionMemoryInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryUpdateInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryUpdateResult> {
  const agentStateTable = quoteQualifiedTable({
    schema: params.schema,
    table: "agent_state",
  });
  const sessionsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "sessions",
  });
  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const existingResult = await client.query<SessionMemoryRow>(
      `
        select
          id,
          agent_id,
          session_id,
          state_key,
          lifecycle::text as lifecycle,
          state_json,
          metadata,
          created_at,
          updated_at
        from ${agentStateTable}
        where agent_id = $1::uuid
          and session_id = $2::uuid
          and state_key = 'session_memory'
        for update
      `,
      [params.input.agentId, params.input.sessionId],
    );

    const existingRow = existingResult.rows[0];
    const nextState = applySessionMemoryUpdate(
      normalizeSessionMemoryState(existingRow?.state_json),
      params.input,
    );
    const nextUpdateCount = normalizeSessionMemoryUpdateCount(existingRow?.metadata ?? null) + 1;
    const nextMetadata = {
      source: "session-memory-tool",
      updateCount: nextUpdateCount,
      ...(params.input.updateReason ? { updateReason: params.input.updateReason } : {}),
      ...(params.input.metadata ? { sessionMemoryMetadata: params.input.metadata } : {}),
    };

    let persistedRow: SessionMemoryRow | undefined;
    let status: "created" | "updated" = "updated";

    if (existingRow) {
      const updateResult = await client.query<SessionMemoryRow>(
        `
          update ${agentStateTable}
          set
            lifecycle = 'active',
            state_json = $2::jsonb,
            metadata = $3::jsonb
          where id = $1::uuid
          returning
            id,
            agent_id,
            session_id,
            state_key,
            lifecycle::text as lifecycle,
            state_json,
            metadata,
            created_at,
            updated_at
        `,
        [existingRow.id, JSON.stringify(nextState), JSON.stringify(nextMetadata)],
      );
      persistedRow = updateResult.rows[0];
    } else {
      status = "created";
      const insertResult = await client.query<SessionMemoryRow>(
        `
          insert into ${agentStateTable} (
            project_id,
            agent_id,
            session_id,
            state_key,
            lifecycle,
            state_json,
            metadata
          )
          values (
            (select project_id from ${sessionsTable} where id = $2::uuid),
            $1::uuid,
            $2::uuid,
            'session_memory',
            'active',
            $3::jsonb,
            $4::jsonb
          )
          returning
            id,
            agent_id,
            session_id,
            state_key,
            lifecycle::text as lifecycle,
            state_json,
            metadata,
            created_at,
            updated_at
        `,
        [
          params.input.agentId,
          params.input.sessionId,
          JSON.stringify(nextState),
          JSON.stringify(nextMetadata),
        ],
      );
      persistedRow = insertResult.rows[0];
    }

    if (!persistedRow) {
      throw new Error("session-memory write did not return an agent_state row");
    }

    await client.query("commit");

    return {
      accepted: true,
      status,
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      stateKey: "session_memory",
      stateId: persistedRow.id,
      lifecycle: "active",
      memory: normalizeSessionMemoryState(persistedRow.state_json),
      updateCount: normalizeSessionMemoryUpdateCount(persistedRow.metadata),
      ...(typeof persistedRow.metadata?.updateReason === "string"
        ? { updateReason: persistedRow.metadata.updateReason }
        : {}),
      createdAt: normalizeTimestamp(persistedRow.created_at),
      updatedAt: normalizeTimestamp(persistedRow.updated_at),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory update failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function planCompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: CompactionPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<CompactionPlanResult> {
  const estimatedPromptTokenThreshold = normalizeToolResultPromptTokenThreshold(
    params.input.estimatedPromptTokenThreshold,
  );
  const sessionMemoryStaleAfterSeconds = normalizeSessionMemoryStaleAfterSeconds(
    params.input.sessionMemoryStaleAfterSeconds,
  );

  const microcompactResult = await planToolResultMicrocompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!microcompactResult.accepted) {
    return microcompactResult;
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  const rationale: string[] = [];
  const requiredInputs: string[] = [];
  const sessionMemoryExists = sessionMemoryResult.exists;
  const sessionMemoryUpdatedAt = sessionMemoryResult.updatedAt;
  const sessionMemorySufficient = sessionMemoryExists
    ? isSessionMemorySufficient(sessionMemoryResult.memory)
    : false;
  const sessionMemoryFresh = Boolean(
    sessionMemoryUpdatedAt &&
    Date.now() - new Date(sessionMemoryUpdatedAt).getTime() <=
      sessionMemoryStaleAfterSeconds * 1000,
  );

  let sessionMemoryStatus: CompactionPlanSessionMemoryStatus = "missing";
  if (!sessionMemoryExists) {
    sessionMemoryStatus = "missing";
    rationale.push("session memory does not exist for this session");
  } else if (!sessionMemoryFresh) {
    sessionMemoryStatus = "stale";
    rationale.push("session memory exists but is older than the bounded freshness window");
  } else if (!sessionMemorySufficient) {
    sessionMemoryStatus = "fresh_but_insufficient";
    rationale.push("session memory is fresh but does not yet capture enough structured work state");
  } else {
    sessionMemoryStatus = "fresh_and_sufficient";
    rationale.push("session memory is fresh and sufficient for bounded context recovery");
  }

  const promptPressureExceeded = Boolean(
    typeof params.input.estimatedPromptTokens === "number" &&
    Number.isFinite(params.input.estimatedPromptTokens) &&
    Math.trunc(params.input.estimatedPromptTokens) > estimatedPromptTokenThreshold,
  );

  let outcome:
    | "none"
    | "use_microcompaction"
    | "use_session_memory"
    | "propose_full_compaction_fallback" = "none";

  if (microcompactResult.shouldCompact) {
    outcome = "use_microcompaction";
    rationale.unshift("persisted tool-result pressure exceeds bounded microcompaction thresholds");
    if (!sessionMemoryExists) {
      requiredInputs.push(
        "create or update session memory after preview clearing if more context relief is needed",
      );
    }
  } else if (promptPressureExceeded && sessionMemoryStatus === "fresh_and_sufficient") {
    outcome = "use_session_memory";
    rationale.unshift(
      "prompt pressure exceeds the bounded threshold and fresh session memory is available",
    );
  } else if (promptPressureExceeded) {
    outcome = "propose_full_compaction_fallback";
    rationale.unshift(
      "prompt pressure exceeds the bounded threshold and session memory is missing, stale, or insufficient",
    );
    requiredInputs.push(
      "fresh sufficient session memory or a future full compaction implementation",
    );
  } else {
    outcome = "none";
    rationale.unshift("bounded context pressure remains within the current compaction thresholds");
  }

  return {
    accepted: true,
    status: "ok",
    sessionId: params.input.sessionId,
    agentId: params.input.agentId,
    outcome,
    rationale,
    requiredInputs,
    clearCandidates: microcompactResult.clearCandidates,
    microcompactionRecommended: microcompactResult.shouldCompact,
    sessionMemoryStatus,
    sessionMemoryExists,
    sessionMemorySufficient,
    sessionMemoryFresh,
    ...(sessionMemoryUpdatedAt ? { sessionMemoryUpdatedAt } : {}),
    ...(typeof params.input.estimatedPromptTokens === "number" &&
    Number.isFinite(params.input.estimatedPromptTokens)
      ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
      : {}),
    estimatedPromptTokenThreshold,
  };
}

export async function executeSessionMemoryCompactionInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SessionMemoryCompactExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SessionMemoryCompactExecuteResult> {
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planCompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
      ...(params.input.sessionMemoryStaleAfterSeconds !== undefined
        ? { sessionMemoryStaleAfterSeconds: params.input.sessionMemoryStaleAfterSeconds }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  if (planResult.outcome !== "use_session_memory") {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      rationale: planResult.rationale,
      requiredInputs: planResult.requiredInputs,
      ...(planResult.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: planResult.sessionMemoryUpdatedAt }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  if (
    !sessionMemoryResult.exists ||
    !sessionMemoryResult.stateId ||
    !sessionMemoryResult.updatedAt
  ) {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: "missing",
      rationale: ["session memory is missing so session-memory-backed compaction cannot execute"],
      requiredInputs: ["bounded session memory must exist before this execution path can run"],
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const payload = buildSessionMemoryCompactionPayload({
    stateId: sessionMemoryResult.stateId,
    memory: sessionMemoryResult.memory,
  });

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const existingEvent = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${compactionEventsTable}
        where session_id = $1::uuid
          and compaction_kind = 'micro'
          and status = 'completed'
          and details ->> 'compactionSubstrate' = 'session_memory'
          and details ->> 'sessionMemoryStateId' = $2
          and details ->> 'sessionMemoryUpdatedAt' = $3
        order by created_at desc
        limit 1
      `,
      [params.input.sessionId, sessionMemoryResult.stateId, sessionMemoryResult.updatedAt],
    );
    const existingCompactionEventId = existingEvent.rows[0]?.id;
    if (existingCompactionEventId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_executed",
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        plannerOutcome: planResult.outcome,
        sessionMemoryStatus: planResult.sessionMemoryStatus,
        sessionMemoryStateId: sessionMemoryResult.stateId,
        sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
        compactionEventId: existingCompactionEventId,
        payload,
        rationale: [
          "session-memory-backed compaction already exists for the current session-memory state",
        ],
        requiredInputs: [],
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      };
    }

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'micro',
          'completed',
          $3,
          $4::jsonb,
          $5::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId,
        "Reused bounded session memory as the compaction substrate",
        JSON.stringify({
          compactionSubstrate: "session_memory",
          plannerOutcome: planResult.outcome,
          sessionMemoryStateId: sessionMemoryResult.stateId,
          sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
          sessionMemoryStatus: planResult.sessionMemoryStatus,
          fieldsIncluded: payload.fieldsIncluded,
          compactedText: payload.compactedText,
        }),
        JSON.stringify({
          source: "session-memory-compact-execute-tool",
        }),
      ],
    );
    const compactionEventId = compactionInsert.rows[0]?.id;
    if (!compactionEventId) {
      throw new Error("session-memory compaction did not return a compaction event id");
    }

    await client.query("commit");
    return {
      accepted: true,
      status: "executed",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      sessionMemoryStateId: sessionMemoryResult.stateId,
      sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt,
      compactionEventId,
      payload,
      rationale: ["session memory was reused as the bounded compaction substrate"],
      requiredInputs: [],
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware session-memory compaction execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function executeFullCompactionFallbackInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: FullCompactionFallbackExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<FullCompactionFallbackExecuteResult> {
  const compactionEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "compaction_events",
  });

  const planResult = await planCompactionInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      ...(params.input.idleGapSeconds !== undefined
        ? { idleGapSeconds: params.input.idleGapSeconds }
        : {}),
      ...(params.input.persistedCountThreshold !== undefined
        ? { persistedCountThreshold: params.input.persistedCountThreshold }
        : {}),
      ...(params.input.estimatedPromptTokens !== undefined
        ? { estimatedPromptTokens: params.input.estimatedPromptTokens }
        : {}),
      ...(params.input.estimatedPromptTokenThreshold !== undefined
        ? { estimatedPromptTokenThreshold: params.input.estimatedPromptTokenThreshold }
        : {}),
      ...(params.input.recentFloorCount !== undefined
        ? { recentFloorCount: params.input.recentFloorCount }
        : {}),
      ...(params.input.maxClearCount !== undefined
        ? { maxClearCount: params.input.maxClearCount }
        : {}),
      ...(params.input.sessionMemoryStaleAfterSeconds !== undefined
        ? { sessionMemoryStaleAfterSeconds: params.input.sessionMemoryStaleAfterSeconds }
        : {}),
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!planResult.accepted) {
    return planResult;
  }

  if (planResult.outcome !== "propose_full_compaction_fallback") {
    return {
      accepted: true,
      status: "no_op",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      rationale: planResult.rationale,
      requiredInputs: planResult.requiredInputs,
      ...(planResult.sessionMemoryUpdatedAt
        ? { sessionMemoryUpdatedAt: planResult.sessionMemoryUpdatedAt }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
    };
  }

  const sessionMemoryResult = await getSessionMemoryInConfiguredDatabase({
    config: params.config,
    input: {
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
    },
    logger: params.logger,
    schema: params.schema,
  });
  if (!sessionMemoryResult.accepted) {
    return sessionMemoryResult;
  }

  const payload = buildFullCompactionFallbackPayload({
    sessionId: params.input.sessionId,
    planResult,
    ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
      ? { sessionMemoryStateId: sessionMemoryResult.stateId }
      : {}),
    ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
      ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
      : {}),
    ...(sessionMemoryResult.exists ? { sessionMemory: sessionMemoryResult.memory } : {}),
  });
  const payloadSignature = createHash("sha256")
    .update(payload.compactedText)
    .update(payload.substitutionText)
    .digest("hex");

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const existingEvent = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${compactionEventsTable}
        where session_id = $1::uuid
          and compaction_kind = 'full'
          and status = 'completed'
          and details ->> 'compactionSubstrate' = 'full_fallback'
          and details ->> 'payloadSignature' = $2
        order by created_at desc
        limit 1
      `,
      [params.input.sessionId, payloadSignature],
    );
    const existingCompactionEventId = existingEvent.rows[0]?.id;
    if (existingCompactionEventId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_executed",
        sessionId: params.input.sessionId,
        agentId: params.input.agentId,
        plannerOutcome: planResult.outcome,
        sessionMemoryStatus: planResult.sessionMemoryStatus,
        ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
          ? { sessionMemoryStateId: sessionMemoryResult.stateId }
          : {}),
        ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
          ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
          : {}),
        compactionEventId: existingCompactionEventId,
        payload,
        rationale: ["full fallback compaction already exists for the current bounded substrate"],
        requiredInputs: planResult.requiredInputs,
        ...(typeof params.input.estimatedPromptTokens === "number" &&
        Number.isFinite(params.input.estimatedPromptTokens)
          ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
          : {}),
        estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
      };
    }

    const compactionInsert = await client.query<{ id: string }>(
      `
        insert into ${compactionEventsTable} (
          session_id,
          agent_id,
          compaction_kind,
          status,
          summary,
          details,
          metadata
        )
        values (
          $1::uuid,
          $2::uuid,
          'full',
          'completed',
          $3,
          $4::jsonb,
          $5::jsonb
        )
        returning id::text as id
      `,
      [
        params.input.sessionId,
        params.input.agentId,
        "Produced a bounded full fallback compaction artifact from existing structured state",
        JSON.stringify({
          compactionSubstrate: "full_fallback",
          payloadSignature,
          plannerOutcome: planResult.outcome,
          sessionMemoryStatus: planResult.sessionMemoryStatus,
          ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
            ? { sessionMemoryStateId: sessionMemoryResult.stateId }
            : {}),
          ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
            ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
            : {}),
          clearCandidateIds: planResult.clearCandidates.map((item) => item.toolResultId),
          compactedText: payload.compactedText,
        }),
        JSON.stringify({
          source: "full-compaction-fallback-execute-tool",
        }),
      ],
    );

    await client.query("commit");

    return {
      accepted: true,
      status: "executed",
      sessionId: params.input.sessionId,
      agentId: params.input.agentId,
      plannerOutcome: planResult.outcome,
      sessionMemoryStatus: planResult.sessionMemoryStatus,
      ...(sessionMemoryResult.exists && sessionMemoryResult.stateId
        ? { sessionMemoryStateId: sessionMemoryResult.stateId }
        : {}),
      ...(sessionMemoryResult.exists && sessionMemoryResult.updatedAt
        ? { sessionMemoryUpdatedAt: sessionMemoryResult.updatedAt }
        : {}),
      compactionEventId: compactionInsert.rows[0]?.id,
      payload,
      rationale: [
        "bounded existing state was packaged into a deterministic full-fallback compaction artifact",
      ],
      requiredInputs: planResult.requiredInputs,
      ...(typeof params.input.estimatedPromptTokens === "number" &&
      Number.isFinite(params.input.estimatedPromptTokens)
        ? { estimatedPromptTokens: Math.trunc(params.input.estimatedPromptTokens) }
        : {}),
      estimatedPromptTokenThreshold: planResult.estimatedPromptTokenThreshold,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSessionMemoryError(error);
    params.logger.error(
      `memory-middleware full compaction fallback execution failed sessionId=${params.input.sessionId}: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

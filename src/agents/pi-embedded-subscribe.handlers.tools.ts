import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { resolveStorePath } from "../config/sessions/paths.js";
import type { SessionWorkingContextEntryKind } from "../config/sessions/types.js";
import { updateSessionWorkingContext } from "../config/sessions/working-context.js";
import type {
  AgentApprovalEventData,
  AgentCommandOutputEventData,
  AgentItemEventData,
  AgentPatchSummaryEventData,
} from "../infra/agent-events.js";
import {
  emitAgentApprovalEvent,
  emitAgentCommandOutputEvent,
  emitAgentEvent,
  emitAgentItemEvent,
  emitAgentPatchSummaryEvent,
} from "../infra/agent-events.js";
import type { ExecApprovalDecision } from "../infra/exec-approvals.js";
import type { PluginHookAfterToolCallEvent } from "../plugins/types.js";
import { normalizeOptionalLowercaseString, readStringValue } from "../shared/string-coerce.js";
import type { ApplyPatchSummary } from "./apply-patch.js";
import type { ExecToolDetails } from "./bash-tools.exec-types.js";
import { parseExecApprovalResultText } from "./exec-approval-result.js";
import { normalizeTextForComparison } from "./pi-embedded-helpers.js";
import { isMessagingTool, isMessagingToolSendAction } from "./pi-embedded-messaging.js";
import { mergeEmbeddedRunReplayState } from "./pi-embedded-runner/replay-state.js";
import type {
  ToolCallSummary,
  ToolHandlerContext,
} from "./pi-embedded-subscribe.handlers.types.js";
import { isPromiseLike } from "./pi-embedded-subscribe.promise.js";
import {
  extractToolResultMediaArtifact,
  extractMessagingToolSend,
  extractToolErrorMessage,
  extractToolResultText,
  filterToolResultMediaUrls,
  isToolResultError,
  isToolResultTimedOut,
  sanitizeToolResult,
} from "./pi-embedded-subscribe.tools.js";
import { inferToolMetaFromArgs } from "./pi-embedded-utils.js";
import { buildToolMutationState, isSameToolMutationAction } from "./tool-mutation.js";
import { normalizeToolName } from "./tool-policy.js";

type ExecApprovalReplyModule = typeof import("../infra/exec-approval-reply.js");
type HookRunnerGlobalModule = typeof import("../plugins/hook-runner-global.js");
type MediaParseModule = typeof import("../media/parse.js");
type BeforeToolCallModule = typeof import("./pi-tools.before-tool-call.js");

let execApprovalReplyModulePromise: Promise<ExecApprovalReplyModule> | undefined;
let hookRunnerGlobalModulePromise: Promise<HookRunnerGlobalModule> | undefined;
let mediaParseModulePromise: Promise<MediaParseModule> | undefined;
let beforeToolCallModulePromise: Promise<BeforeToolCallModule> | undefined;

function loadExecApprovalReply(): Promise<ExecApprovalReplyModule> {
  execApprovalReplyModulePromise ??= import("../infra/exec-approval-reply.js");
  return execApprovalReplyModulePromise;
}

function loadHookRunnerGlobal(): Promise<HookRunnerGlobalModule> {
  hookRunnerGlobalModulePromise ??= import("../plugins/hook-runner-global.js");
  return hookRunnerGlobalModulePromise;
}

function loadMediaParse(): Promise<MediaParseModule> {
  mediaParseModulePromise ??= import("../media/parse.js");
  return mediaParseModulePromise;
}

function loadBeforeToolCall(): Promise<BeforeToolCallModule> {
  beforeToolCallModulePromise ??= import("./pi-tools.before-tool-call.js");
  return beforeToolCallModulePromise;
}

type ToolStartRecord = {
  startTime: number;
  args: unknown;
};

/** Track tool execution start data for after_tool_call hook. */
const toolStartData = new Map<string, ToolStartRecord>();

function buildToolStartKey(runId: string, toolCallId: string): string {
  return `${runId}:${toolCallId}`;
}

function isCronAddAction(args: unknown): boolean {
  if (!args || typeof args !== "object") {
    return false;
  }
  const action = (args as Record<string, unknown>).action;
  return normalizeOptionalLowercaseString(action) === "add";
}

function buildToolCallSummary(toolName: string, args: unknown, meta?: string): ToolCallSummary {
  const mutation = buildToolMutationState(toolName, args, meta);
  return {
    meta,
    mutatingAction: mutation.mutatingAction,
    actionFingerprint: mutation.actionFingerprint,
  };
}

function buildToolItemId(toolCallId: string): string {
  return `tool:${toolCallId}`;
}

function buildToolItemTitle(toolName: string, meta?: string): string {
  return meta ? `${toolName} ${meta}` : toolName;
}

function isExecToolName(toolName: string): boolean {
  return toolName === "exec" || toolName === "bash";
}

function isPatchToolName(toolName: string): boolean {
  return toolName === "apply_patch";
}

function buildCommandItemId(toolCallId: string): string {
  return `command:${toolCallId}`;
}

function buildPatchItemId(toolCallId: string): string {
  return `patch:${toolCallId}`;
}

function buildCommandItemTitle(toolName: string, meta?: string): string {
  return meta ? `command ${meta}` : `${toolName} command`;
}

function buildPatchItemTitle(meta?: string): string {
  return meta ? `patch ${meta}` : "apply patch";
}

function emitTrackedItemEvent(ctx: ToolHandlerContext, itemData: AgentItemEventData): void {
  if (itemData.phase === "start") {
    ctx.state.itemActiveIds.add(itemData.itemId);
    ctx.state.itemStartedCount += 1;
  } else if (itemData.phase === "end") {
    ctx.state.itemActiveIds.delete(itemData.itemId);
    ctx.state.itemCompletedCount += 1;
  }
  emitAgentItemEvent({
    runId: ctx.params.runId,
    ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
    data: itemData,
  });
  void ctx.params.onAgentEvent?.({
    stream: "item",
    data: itemData,
  });
}

function readToolResultDetailsRecord(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readStringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBooleanField(
  record: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function readNumberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArrayField(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function readDiagnosticSummaries(
  record: Record<string, unknown> | undefined,
  key: string,
  fallbackPath?: string,
): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .flatMap((entry) => {
      const diagnostic = readRecord(entry);
      if (!diagnostic) {
        return [];
      }
      const message = compactDiagnosticText(diagnostic.message);
      if (!message) {
        return [];
      }
      const path = readStringField(diagnostic, "path") ?? fallbackPath;
      const severity = readStringField(diagnostic, "severity");
      const line = readNumberField(diagnostic, "line");
      const column =
        readNumberField(diagnostic, "column") ?? readNumberField(diagnostic, "character");
      const location =
        path && line !== undefined
          ? `${path}:${line}${column !== undefined ? `:${column}` : ""}`
          : line !== undefined
            ? `line ${line}${column !== undefined ? `:${column}` : ""}`
            : undefined;
      return [
        [severity, location, message]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" "),
      ];
    })
    .slice(0, 12);
}

function compactDiagnosticText(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function readTodoActiveItemContent(
  todoDetails: Record<string, unknown> | undefined,
): string | undefined {
  const items = todoDetails?.items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  for (const item of items) {
    const record = readRecord(item);
    if (readStringField(record, "status") !== "in_progress") {
      continue;
    }
    return compactDiagnosticText(record?.content);
  }
  return undefined;
}

function compactChildBootstrapAdmission(value: unknown): Record<string, unknown> | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  return {
    providerReportObserved: readBooleanField(record, "providerReportObserved") === true,
    childAgentId: readStringField(record, "childAgentId") ?? "unknown",
    canonicalDocsAdmitted: readBooleanField(record, "canonicalDocsAdmitted") === true,
    requiredSkillAdmitted: readBooleanField(record, "requiredSkillAdmitted") === true,
    childToolCatalogAdmitted: readBooleanField(record, "childToolCatalogAdmitted") === true,
    providerToolNames: readStringArrayField(record, "providerToolNames").slice(0, 30),
    requiredToolNames: readStringArrayField(record, "requiredToolNames").slice(0, 30),
    missingRequiredToolNames: readStringArrayField(record, "missingRequiredToolNames").slice(0, 30),
    forbiddenToolNames: readStringArrayField(record, "forbiddenToolNames").slice(0, 30),
    missingRequiredSources: readStringArrayField(record, "missingRequiredSources").slice(0, 20),
    truncatedRequiredSources: readStringArrayField(record, "truncatedRequiredSources").slice(0, 20),
    ...(readStringField(record, "reportRef")
      ? { reportRef: readStringField(record, "reportRef") }
      : {}),
    reasonCodes: readStringArrayField(record, "reasonCodes").slice(0, 20),
  };
}

function buildNativeTaskResultEvent(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
}): Record<string, unknown> | null {
  if (params.toolName !== "task") {
    return null;
  }
  const details = readToolResultDetailsRecord(params.result) ?? readRecord(params.result);
  if (!details) {
    return null;
  }
  const childRunId = readStringField(details, "runId");
  const childSessionKey = readStringField(details, "childSessionKey");
  const requestedAgentId = readStringField(details, "requestedAgentId");
  const parentDecisionFooterKind = parentDecisionFooterKindForNativeTaskAgent(requestedAgentId);
  const resultDelivered = readBooleanField(details, "resultDeliveredToParentContext") === true;
  const childResultRef =
    resultDelivered && childSessionKey && childRunId
      ? `openclaw-child-result://${encodeURIComponent(childSessionKey)}/${encodeURIComponent(childRunId)}`
      : undefined;
  return {
    eventType: "node_agent_native_task_result",
    taskRef: `openclaw-native-task-result://${encodeURIComponent(params.runId)}/${encodeURIComponent(
      params.toolCallId,
    )}`,
    requestedAgentId,
    childSessionKey,
    childRunId,
    childProvider: readStringField(details, "childProvider"),
    childModel: readStringField(details, "childModel"),
    status: readStringField(details, "status"),
    foreground: readBooleanField(details, "foreground") === true,
    resultDeliveredToParentContext: resultDelivered,
    resultDeliveryStatus: readStringField(details, "resultDeliveryStatus"),
    childProgressOutcome: readStringField(details, "childProgressOutcome"),
    criticDecision: readStringField(details, "criticDecision"),
    criticDecisionValid: readBooleanField(details, "criticDecisionValid") === true,
    criticDecisionExpectedFirstLine: readStringField(details, "criticDecisionExpectedFirstLine"),
    resultTruncated: readBooleanField(details, "resultTruncated") === true,
    childIdentityVerified: readBooleanField(details, "childIdentityVerified") === true,
    childStartFailureKind: readStringField(details, "childStartFailureKind"),
    ...(childResultRef ? { childResultRef } : {}),
    ...(parentDecisionFooterKind
      ? {
          parentDecisionFooterIncluded: true,
          parentDecisionFooterKind,
        }
      : {}),
    childBootstrapAdmission: compactChildBootstrapAdmission(details.childBootstrapAdmission),
  };
}

function buildToolResultRef(params: { runId: string; toolCallId: string }): string {
  return `openclaw-tool-result://${encodeURIComponent(params.runId)}/${encodeURIComponent(
    params.toolCallId,
  )}`;
}

function isScoutAgent(agentId: string | undefined): boolean {
  return agentId === "execution-context-scout" || agentId === "execution-validation-scout";
}

function isScoutDiagnosticTool(toolName: string): boolean {
  return (
    toolName === "read" ||
    toolName === "grep" ||
    toolName === "glob" ||
    toolName === "list" ||
    toolName === "exec" ||
    toolName === "process"
  );
}

function isScoutSearchContextTool(toolName: string): boolean {
  return toolName === "read" || toolName === "grep" || toolName === "glob" || toolName === "list";
}

function isParentEditorNavigationTool(input: {
  agentId: string | undefined;
  toolName: string;
}): boolean {
  return (
    input.agentId === "execution-coding" &&
    (input.toolName === "read" || input.toolName === "grep" || input.toolName === "glob")
  );
}

function compactToolArgs(toolName: string, args: unknown): Record<string, unknown> {
  const record = readRecord(args);
  if (!record) {
    return {};
  }
  const replayCompacted = readBooleanField(record, "replayCompacted");
  const replayCompactionFields =
    replayCompacted === true
      ? {
          replayCompacted: true,
        }
      : {};
  if (toolName === "read") {
    return {
      readPath: readStringField(record, "path") ?? readStringField(record, "file_path"),
      readOffset: readNumberField(record, "offset"),
      readLimit: readNumberField(record, "limit"),
      ...replayCompactionFields,
    };
  }
  if (toolName === "grep") {
    return {
      grepQuery: readStringField(record, "query"),
      grepPath: readStringField(record, "path"),
      grepGlob: readStringField(record, "glob"),
      grepRegex: readBooleanField(record, "regex"),
      grepMaxMatches: readNumberField(record, "maxMatches"),
      ...replayCompactionFields,
    };
  }
  if (toolName === "glob") {
    return {
      globPattern: readStringField(record, "pattern"),
      globPath: readStringField(record, "path"),
      globMaxResults: readNumberField(record, "maxResults"),
      ...replayCompactionFields,
    };
  }
  if (toolName === "list") {
    return {
      listPath: readStringField(record, "path"),
      listOffset: readNumberField(record, "offset"),
      listMaxResults: readNumberField(record, "maxResults"),
      ...replayCompactionFields,
    };
  }
  if (isExecToolName(toolName)) {
    return {
      command: readStringField(record, "cmd") ?? readStringField(record, "command"),
      ...replayCompactionFields,
    };
  }
  return replayCompactionFields;
}

function hasScoutOutputSection(text: string | undefined, names: readonly string[]): boolean {
  const normalized = text?.toLowerCase() ?? "";
  return names.some((name) => normalized.includes(name));
}

function readNestedRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  return readRecord(record?.[key]);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim()).filter(Boolean)));
}

function readChangedFilePathsFromArgs(args: unknown): string[] {
  const record = readRecord(args);
  if (!record) {
    return [];
  }
  const aliases = [
    "path",
    "file_path",
    "filePath",
    "file",
    "filename",
    "targetPath",
    "target_path",
    "oldPath",
    "old_path",
    "newPath",
    "new_path",
  ];
  return uniqueStrings(
    aliases
      .map((key) => record[key])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
}

function changedFilePathsFromPatchSummary(summary: ApplyPatchSummary | null): string[] {
  if (!summary) {
    return [];
  }
  return uniqueStrings([...summary.added, ...summary.modified, ...summary.deleted]);
}

function readDiffMetadata(details: Record<string, unknown> | undefined) {
  const diff = readStringField(details, "diff");
  return {
    diffAvailable: diff !== undefined,
    diffByteCount: diff ? Buffer.byteLength(diff, "utf8") : undefined,
    firstChangedLine: readNumberField(details, "firstChangedLine"),
  };
}

function buildNodeAgentToolResultEvent(params: {
  runId: string;
  agentId?: string;
  sessionKey?: string;
  toolCallId: string;
  toolName: string;
  isToolError: boolean;
  completedMutatingAction: boolean;
  result: unknown;
  args?: unknown;
}): Record<string, unknown> | null {
  if (params.toolName === "task") {
    return null;
  }
  const details = readToolResultDetailsRecord(params.result) ?? readRecord(params.result);
  const todoDetails = readNestedRecord(details, "todo");
  const patchSummary =
    params.toolName === "apply_patch" ? readApplyPatchSummary(params.result) : null;
  const diffMetadata = readDiffMetadata(details);
  const isMutationTool =
    params.completedMutatingAction ||
    params.toolName === "edit" ||
    params.toolName === "write" ||
    params.toolName === "apply_patch";
  const changedFilePaths = isMutationTool
    ? uniqueStrings([
        ...readChangedFilePathsFromArgs(params.args),
        ...readStringArrayField(details, "changedFilePaths"),
        ...changedFilePathsFromPatchSummary(patchSummary),
      ])
    : [];
  const diagnosticSummaries = isMutationTool
    ? [
        ...readDiagnosticSummaries(details, "syntaxDiagnostics", changedFilePaths[0]),
        ...readDiagnosticSummaries(details, "lspDiagnostics", changedFilePaths[0]),
      ].slice(0, 12)
    : [];
  const addedFilePaths = isMutationTool
    ? uniqueStrings([
        ...readStringArrayField(details, "addedFilePaths"),
        ...(patchSummary?.added ?? []),
      ])
    : [];
  const modifiedFilePaths = isMutationTool
    ? uniqueStrings([
        ...readStringArrayField(details, "modifiedFilePaths"),
        ...(patchSummary?.modified ?? []),
      ])
    : [];
  const deletedFilePaths = isMutationTool
    ? uniqueStrings([
        ...readStringArrayField(details, "deletedFilePaths"),
        ...(patchSummary?.deleted ?? []),
      ])
    : [];
  const managedOutputRef = readStringField(details, "managedOutputRef");
  const managedOutputPath = readStringField(details, "managedOutputPath");
  const isRelevantNodeTool =
    params.toolName === "update_plan" ||
    params.toolName === "read_todo" ||
    params.toolName === "node_finish" ||
    params.toolName === "openclaw_resource_read" ||
    managedOutputRef !== undefined ||
    isMutationTool ||
    isParentEditorNavigationTool({ agentId: params.agentId, toolName: params.toolName }) ||
    (isScoutAgent(params.agentId) && isScoutDiagnosticTool(params.toolName));
  if (!isRelevantNodeTool) {
    return null;
  }
  const toolResultRef = buildToolResultRef(params);
  return {
    eventType: "node_agent_tool_result",
    toolResultRef,
    runId: params.runId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    toolCallId: params.toolCallId,
    completedAtMs: Date.now(),
    status: params.isToolError ? "error" : "completed",
    isError: params.isToolError,
    mutatingAction: isMutationTool,
    changedFilePaths,
    ...(diagnosticSummaries.length > 0 ? { diagnosticSummaries } : {}),
    ...(addedFilePaths.length > 0 || modifiedFilePaths.length > 0 || deletedFilePaths.length > 0
      ? {
          addedFilePaths,
          modifiedFilePaths,
          deletedFilePaths,
        }
      : {}),
    ...(diffMetadata.diffAvailable ? { diffAvailable: true } : {}),
    ...(diffMetadata.diffByteCount !== undefined
      ? { diffByteCount: diffMetadata.diffByteCount }
      : {}),
    ...(diffMetadata.firstChangedLine !== undefined
      ? { firstChangedLine: diffMetadata.firstChangedLine }
      : {}),
    todoRef: readStringField(todoDetails, "todoRef"),
    managedOutputRef,
    managedOutputPath,
    managedOutputBytes: readNumberField(details, "managedOutputBytes"),
    managedOutputHash: readStringField(details, "managedOutputHash"),
    truncated: readBooleanField(details, "truncated"),
    totalOutputChars: readNumberField(details, "totalOutputChars"),
    readNextOffset:
      params.toolName === "read"
        ? (readNumberField(details, "nextOffset") ?? readNumberField(details, "suggestedOffset"))
        : undefined,
    todoItemCount: readNumberField(todoDetails, "itemCount"),
    todoCompletedCount: readNumberField(todoDetails, "completedCount"),
    todoInProgressCount: readNumberField(todoDetails, "inProgressCount"),
    todoActiveItem: readTodoActiveItemContent(todoDetails),
    sourceNavigationReminderShown: readBooleanField(details, "sourceNavigationReminderShown"),
    sourceNavigationCountSinceEdit: readNumberField(details, "sourceNavigationCountSinceEdit"),
    ...compactToolArgs(params.toolName, params.args),
    finishAccepted:
      params.toolName === "node_finish"
        ? readBooleanField(details, "accepted") === true
        : undefined,
  };
}

function workingContextKindForNativeTaskAgent(
  requestedAgentId: string | undefined,
): SessionWorkingContextEntryKind | null {
  if (requestedAgentId === "execution-context-scout") {
    return "context_window";
  }
  if (requestedAgentId === "execution-validation-scout") {
    return "validation_state";
  }
  return null;
}

function parentDecisionFooterKindForNativeTaskAgent(
  requestedAgentId: string | undefined,
): string | null {
  if (requestedAgentId === "execution-context-scout") {
    return "minimal_edit_readiness";
  }
  if (requestedAgentId === "execution-validation-scout") {
    return "validation_sufficiency";
  }
  return null;
}

function buildChangeSetWorkingContextText(event: Record<string, unknown>): string | undefined {
  const toolName = readStringField(event, "toolName") ?? "unknown";
  const changedFilePaths = readStringArrayField(event, "changedFilePaths");
  const addedFilePaths = readStringArrayField(event, "addedFilePaths");
  const modifiedFilePaths = readStringArrayField(event, "modifiedFilePaths");
  const deletedFilePaths = readStringArrayField(event, "deletedFilePaths");
  const isFileMutationTool =
    toolName === "edit" || toolName === "write" || toolName === "apply_patch";
  if (!isFileMutationTool) {
    return undefined;
  }
  const toolResultRef = readStringField(event, "toolResultRef");
  const status = readStringField(event, "status") ?? "unknown";
  const firstChangedLine = readNumberField(event, "firstChangedLine");
  const diffByteCount = readNumberField(event, "diffByteCount");
  const diagnosticSummaries = readStringArrayField(event, "diagnosticSummaries");
  return [
    "Change set:",
    `tool=${toolName}`,
    toolResultRef ? `toolResultRef=${toolResultRef}` : undefined,
    `status=${status}`,
    `succeeded=${readBooleanField(event, "isError") === true ? "false" : "true"}`,
    changedFilePaths.length > 0 ? "changed_files:" : undefined,
    ...changedFilePaths.map((path) => `- ${path}`),
    addedFilePaths.length > 0 ? `added=${addedFilePaths.join(", ")}` : undefined,
    modifiedFilePaths.length > 0 ? `modified=${modifiedFilePaths.join(", ")}` : undefined,
    deletedFilePaths.length > 0 ? `deleted=${deletedFilePaths.join(", ")}` : undefined,
    firstChangedLine !== undefined ? `firstChangedLine=${firstChangedLine}` : undefined,
    readBooleanField(event, "diffAvailable") === true ? "diffAvailable=true" : undefined,
    diffByteCount !== undefined ? `diffByteCount=${diffByteCount}` : undefined,
    diagnosticSummaries.length > 0 ? "diagnostics:" : undefined,
    ...diagnosticSummaries.map((diagnostic) => `- ${diagnostic}`),
    readBooleanField(event, "isError") === true
      ? "stale_edit_or_regrounding_required=true"
      : undefined,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

function buildManagedOutputWorkingContextText(event: Record<string, unknown>): string | undefined {
  const managedOutputRef = readStringField(event, "managedOutputRef");
  if (!managedOutputRef) {
    return undefined;
  }
  const toolName = readStringField(event, "toolName") ?? "unknown";
  const toolResultRef = readStringField(event, "toolResultRef");
  const status = readStringField(event, "status") ?? "unknown";
  const managedOutputBytes = readNumberField(event, "managedOutputBytes");
  const managedOutputPath = readStringField(event, "managedOutputPath");
  const totalOutputChars = readNumberField(event, "totalOutputChars");
  return [
    "Managed tool output:",
    `tool=${toolName}`,
    toolResultRef ? `toolResultRef=${toolResultRef}` : undefined,
    `status=${status}`,
    managedOutputPath ? `Full output saved to: ${managedOutputPath}` : undefined,
    managedOutputBytes !== undefined ? `managedOutputBytes=${managedOutputBytes}` : undefined,
    readStringField(event, "managedOutputHash")
      ? `managedOutputHash=${readStringField(event, "managedOutputHash")}`
      : undefined,
    totalOutputChars !== undefined ? `totalOutputChars=${totalOutputChars}` : undefined,
    readBooleanField(event, "truncated") === true ? "truncated=true" : undefined,
    managedOutputPath
      ? "Use Grep to search the full content or Read with offset/limit to view specific sections."
      : "Full output was persisted, but no saved output path was recorded in this event.",
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

function buildSearchResultWorkingContextText(event: Record<string, unknown>): string | undefined {
  const toolName = readStringField(event, "toolName") ?? "unknown";
  if (!isScoutSearchContextTool(toolName)) {
    return undefined;
  }
  const toolResultRef = readStringField(event, "toolResultRef");
  const status = readStringField(event, "status") ?? "unknown";
  const lines = [
    "Native search/read context:",
    `tool=${toolName}`,
    toolResultRef ? `toolResultRef=${toolResultRef}` : undefined,
    `status=${status}`,
    readStringField(event, "readPath")
      ? `readPath=${readStringField(event, "readPath")}`
      : undefined,
    readNumberField(event, "readOffset") !== undefined
      ? `readOffset=${readNumberField(event, "readOffset")}`
      : undefined,
    readNumberField(event, "readLimit") !== undefined
      ? `readLimit=${readNumberField(event, "readLimit")}`
      : undefined,
    readStringField(event, "grepQuery")
      ? `grepQuery=${readStringField(event, "grepQuery")}`
      : undefined,
    readStringField(event, "grepPath")
      ? `grepPath=${readStringField(event, "grepPath")}`
      : undefined,
    readStringField(event, "grepGlob")
      ? `grepGlob=${readStringField(event, "grepGlob")}`
      : undefined,
    readBooleanField(event, "grepRegex") !== undefined
      ? `grepRegex=${readBooleanField(event, "grepRegex")}`
      : undefined,
    readNumberField(event, "grepMaxMatches") !== undefined
      ? `grepMaxMatches=${readNumberField(event, "grepMaxMatches")}`
      : undefined,
    readStringField(event, "globPattern")
      ? `globPattern=${readStringField(event, "globPattern")}`
      : undefined,
    readStringField(event, "globPath")
      ? `globPath=${readStringField(event, "globPath")}`
      : undefined,
    readNumberField(event, "globMaxResults") !== undefined
      ? `globMaxResults=${readNumberField(event, "globMaxResults")}`
      : undefined,
    readNumberField(event, "batchReadCount") !== undefined
      ? `batchReadCount=${readNumberField(event, "batchReadCount")}`
      : undefined,
    readNumberField(event, "batchGrepCount") !== undefined
      ? `batchGrepCount=${readNumberField(event, "batchGrepCount")}`
      : undefined,
    readNumberField(event, "batchGlobCount") !== undefined
      ? `batchGlobCount=${readNumberField(event, "batchGlobCount")}`
      : undefined,
    readNumberField(event, "batchItemCount") !== undefined
      ? `batchItemCount=${readNumberField(event, "batchItemCount")}`
      : undefined,
    readStringField(event, "listPath")
      ? `listPath=${readStringField(event, "listPath")}`
      : undefined,
    readNumberField(event, "listOffset") !== undefined
      ? `listOffset=${readNumberField(event, "listOffset")}`
      : undefined,
    readNumberField(event, "listMaxResults") !== undefined
      ? `listMaxResults=${readNumberField(event, "listMaxResults")}`
      : undefined,
    readBooleanField(event, "truncated") === true ? "truncated=true" : undefined,
    readNumberField(event, "totalOutputChars") !== undefined
      ? `totalOutputChars=${readNumberField(event, "totalOutputChars")}`
      : undefined,
    "This entry is search/read orientation only; it is not a file mutation or change_set.",
  ];
  return lines
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n");
}

async function admitNativeToolWorkingContext(params: {
  ctx: ToolHandlerContext;
  event: Record<string, unknown>;
  toolCallId: string;
}): Promise<Record<string, unknown>> {
  if (params.ctx.params.agentId === "execution-coding") {
    return params.event;
  }
  const sessionKey = params.ctx.params.sessionKey?.trim();
  if (!sessionKey) {
    return params.event;
  }
  let event = params.event;
  try {
    const storePath = resolveStorePath(params.ctx.params.config?.session?.store, {
      agentId: params.ctx.params.agentId,
    });
    const changeSetText = buildChangeSetWorkingContextText(event);
    if (changeSetText) {
      const updateResult = await updateSessionWorkingContext({
        storePath,
        sessionKey,
        entry: {
          kind: "change_set",
          source: "native_tool",
          text: changeSetText,
          sourceToolCallId: params.toolCallId,
          toolResultRef: readStringField(event, "toolResultRef"),
          status: readStringField(event, "status"),
          changedFilePaths: readStringArrayField(event, "changedFilePaths"),
          addedFilePaths: readStringArrayField(event, "addedFilePaths"),
          modifiedFilePaths: readStringArrayField(event, "modifiedFilePaths"),
          deletedFilePaths: readStringArrayField(event, "deletedFilePaths"),
        },
      });
      if (!updateResult.persisted) {
        return {
          ...event,
          changeSetWorkingContextPersisted: false,
          changeSetWorkingContextPersistFailureReason: updateResult.reason,
          changeSetWorkingContextRef: updateResult.workingContextRef,
        };
      }
      event = {
        ...event,
        changeSetWorkingContextPersisted: true,
        changeSetWorkingContextRef: updateResult.workingContextRef,
        changeSetWorkingContextEntryRef: updateResult.workingContextEntryRef,
        changeSetWorkingContextEntryId: updateResult.entry.entryId,
        changeSetTextHash: updateResult.entry.textHash,
        changeSetTextByteCount: updateResult.entry.textByteCount,
      };
    }
    const shouldPersistSearchResult =
      isScoutAgent(params.ctx.params.agentId) ||
      isParentEditorNavigationTool({
        agentId: params.ctx.params.agentId,
        toolName: readStringField(event, "toolName") ?? "",
      });
    const searchResultText = shouldPersistSearchResult
      ? buildSearchResultWorkingContextText(event)
      : undefined;
    if (searchResultText) {
      const updateResult = await updateSessionWorkingContext({
        storePath,
        sessionKey,
        entry: {
          kind: "search_result",
          source: "native_tool",
          text: searchResultText,
          sourceToolCallId: params.toolCallId,
          toolResultRef: readStringField(event, "toolResultRef"),
          status: readStringField(event, "status"),
        },
      });
      if (!updateResult.persisted) {
        return {
          ...event,
          searchWorkingContextPersisted: false,
          searchWorkingContextPersistFailureReason: updateResult.reason,
          searchWorkingContextRef: updateResult.workingContextRef,
        };
      }
      event = {
        ...event,
        searchWorkingContextPersisted: true,
        searchWorkingContextRef: updateResult.workingContextRef,
        searchWorkingContextEntryRef: updateResult.workingContextEntryRef,
        searchWorkingContextEntryId: updateResult.entry.entryId,
        searchWorkingContextTextHash: updateResult.entry.textHash,
        searchWorkingContextTextByteCount: updateResult.entry.textByteCount,
      };
    }
    const managedOutputText = buildManagedOutputWorkingContextText(event);
    if (!managedOutputText) {
      return event;
    }
    const updateResult = await updateSessionWorkingContext({
      storePath,
      sessionKey,
      entry: {
        kind: "managed_output_ref",
        source: "native_tool",
        text: managedOutputText,
        sourceToolCallId: params.toolCallId,
        toolResultRef: readStringField(event, "toolResultRef"),
        status: readStringField(event, "status"),
      },
    });
    if (!updateResult.persisted) {
      return {
        ...event,
        managedOutputWorkingContextPersisted: false,
        managedOutputWorkingContextPersistFailureReason: updateResult.reason,
        managedOutputWorkingContextRef: updateResult.workingContextRef,
      };
    }
    return {
      ...event,
      managedOutputWorkingContextPersisted: true,
      managedOutputWorkingContextRef: updateResult.workingContextRef,
      managedOutputWorkingContextEntryRef: updateResult.workingContextEntryRef,
      managedOutputWorkingContextEntryId: updateResult.entry.entryId,
      managedOutputTextHash: updateResult.entry.textHash,
      managedOutputTextByteCount: updateResult.entry.textByteCount,
    };
  } catch (err) {
    return {
      ...event,
      toolWorkingContextPersisted: false,
      toolWorkingContextPersistFailureReason: "persist_error",
      toolWorkingContextPersistError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function admitNativeTaskWorkingContext(params: {
  ctx: ToolHandlerContext;
  event: Record<string, unknown>;
  result: unknown;
  toolCallId: string;
}): Promise<Record<string, unknown>> {
  if (params.ctx.params.agentId === "execution-coding") {
    return params.event;
  }
  const requestedAgentId = readStringField(params.event, "requestedAgentId");
  const kind = workingContextKindForNativeTaskAgent(requestedAgentId);
  if (!kind || readBooleanField(params.event, "resultDeliveredToParentContext") !== true) {
    return params.event;
  }
  const sessionKey = params.ctx.params.sessionKey?.trim();
  const text = extractToolResultText(params.result);
  if (!sessionKey || !text?.trim()) {
    return params.event;
  }
  try {
    const storePath = resolveStorePath(params.ctx.params.config?.session?.store, {
      agentId: params.ctx.params.agentId,
    });
    const updateResult = await updateSessionWorkingContext({
      storePath,
      sessionKey,
      entry: {
        kind,
        text,
        sourceToolCallId: params.toolCallId,
        taskRef: readStringField(params.event, "taskRef"),
        childResultRef: readStringField(params.event, "childResultRef"),
        requestedAgentId,
        childSessionKey: readStringField(params.event, "childSessionKey"),
        childRunId: readStringField(params.event, "childRunId"),
        status: readStringField(params.event, "status"),
        validationStatus:
          kind === "validation_state" ? readStringField(params.event, "status") : undefined,
      },
    });
    if (!updateResult.persisted) {
      return {
        ...params.event,
        workingContextPersisted: false,
        workingContextPersistFailureReason: updateResult.reason,
        workingContextRef: updateResult.workingContextRef,
      };
    }
    return {
      ...params.event,
      workingContextPersisted: true,
      workingContextRef: updateResult.workingContextRef,
      workingContextEntryRef: updateResult.workingContextEntryRef,
      workingContextEntryId: updateResult.entry.entryId,
      workingContextKind: updateResult.entry.kind,
      workingContextHasInlineContextWindows: updateResult.entry.hasInlineContextWindows,
      workingContextHasFileGraph: updateResult.entry.hasFileGraph,
      workingContextHasSymbolWindows: hasScoutOutputSection(text, [
        "symbol_windows",
        "symbol windows",
      ]),
      workingContextHasMissingWindows: hasScoutOutputSection(text, [
        "missing_windows",
        "missing windows",
      ]),
      workingContextFileGraphTextHash: updateResult.entry.fileGraphTextHash,
      workingContextFileGraphTextByteCount: updateResult.entry.fileGraphTextByteCount,
      workingContextFileGraphVerifiedEdgeCount: updateResult.entry.fileGraphVerifiedEdgeCount,
      workingContextFileGraphUncertainAnnotationCount:
        updateResult.entry.fileGraphUncertainAnnotationCount,
      workingContextTextHash: updateResult.entry.textHash,
      workingContextTextByteCount: updateResult.entry.textByteCount,
      ...(kind === "validation_state"
        ? {
            validationEvidenceRef: updateResult.workingContextEntryRef,
            validationEvidenceAgentId: requestedAgentId,
            validationEvidenceChildSessionKey: readStringField(params.event, "childSessionKey"),
            validationEvidenceChildResultRef: readStringField(params.event, "childResultRef"),
            validationEvidenceTaskRef: readStringField(params.event, "taskRef"),
            validationEvidenceStatus: readStringField(params.event, "status"),
            validationEvidenceReasonCodes: ["validation_scout_result_persisted_as_native_evidence"],
          }
        : {}),
    };
  } catch (err) {
    return {
      ...params.event,
      workingContextPersisted: false,
      workingContextPersistFailureReason: "persist_error",
      workingContextPersistError: err instanceof Error ? err.message : String(err),
    };
  }
}

function readExecToolDetails(result: unknown): ExecToolDetails | null {
  const details = readToolResultDetailsRecord(result);
  if (!details || typeof details.status !== "string") {
    return null;
  }
  return details as ExecToolDetails;
}

function readApplyPatchSummary(result: unknown): ApplyPatchSummary | null {
  const details = readToolResultDetailsRecord(result);
  const summary =
    details?.summary && typeof details.summary === "object" && !Array.isArray(details.summary)
      ? (details.summary as Record<string, unknown>)
      : null;
  if (!summary) {
    return null;
  }
  const added = Array.isArray(summary.added)
    ? summary.added.filter((entry): entry is string => typeof entry === "string")
    : [];
  const modified = Array.isArray(summary.modified)
    ? summary.modified.filter((entry): entry is string => typeof entry === "string")
    : [];
  const deleted = Array.isArray(summary.deleted)
    ? summary.deleted.filter((entry): entry is string => typeof entry === "string")
    : [];
  return { added, modified, deleted };
}

function buildPatchSummaryText(summary: ApplyPatchSummary): string {
  const parts: string[] = [];
  if (summary.added.length > 0) {
    parts.push(`${summary.added.length} added`);
  }
  if (summary.modified.length > 0) {
    parts.push(`${summary.modified.length} modified`);
  }
  if (summary.deleted.length > 0) {
    parts.push(`${summary.deleted.length} deleted`);
  }
  return parts.length > 0 ? parts.join(", ") : "no file changes recorded";
}

function extendExecMeta(toolName: string, args: unknown, meta?: string): string | undefined {
  const normalized = normalizeOptionalLowercaseString(toolName);
  if (normalized !== "exec" && normalized !== "bash") {
    return meta;
  }
  if (!args || typeof args !== "object") {
    return meta;
  }
  const record = args as Record<string, unknown>;
  const flags: string[] = [];
  if (record.pty === true) {
    flags.push("pty");
  }
  if (record.elevated === true) {
    flags.push("elevated");
  }
  if (flags.length === 0) {
    return meta;
  }
  const suffix = flags.join(" · ");
  return meta ? `${meta} · ${suffix}` : suffix;
}

function pushUniqueMediaUrl(urls: string[], seen: Set<string>, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const normalized = value.trim();
  if (!normalized || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  urls.push(normalized);
}

function collectMessagingMediaUrlsFromRecord(record: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  pushUniqueMediaUrl(urls, seen, record.media);
  pushUniqueMediaUrl(urls, seen, record.mediaUrl);
  pushUniqueMediaUrl(urls, seen, record.path);
  pushUniqueMediaUrl(urls, seen, record.filePath);

  const mediaUrls = record.mediaUrls;
  if (Array.isArray(mediaUrls)) {
    for (const mediaUrl of mediaUrls) {
      pushUniqueMediaUrl(urls, seen, mediaUrl);
    }
  }

  return urls;
}

function collectMessagingMediaUrlsFromToolResult(result: unknown): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const appendFromRecord = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }
    const extracted = collectMessagingMediaUrlsFromRecord(value as Record<string, unknown>);
    for (const url of extracted) {
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      urls.push(url);
    }
  };

  appendFromRecord(result);
  if (result && typeof result === "object") {
    appendFromRecord((result as Record<string, unknown>).details);
  }

  const outputText = extractToolResultText(result);
  if (outputText) {
    try {
      appendFromRecord(JSON.parse(outputText));
    } catch {
      // Ignore non-JSON tool output.
    }
  }

  return urls;
}

function queuePendingToolMedia(
  ctx: ToolHandlerContext,
  mediaReply: { mediaUrls: string[]; audioAsVoice?: boolean },
) {
  const seen = new Set(ctx.state.pendingToolMediaUrls);
  for (const mediaUrl of mediaReply.mediaUrls) {
    if (seen.has(mediaUrl)) {
      continue;
    }
    seen.add(mediaUrl);
    ctx.state.pendingToolMediaUrls.push(mediaUrl);
  }
  if (mediaReply.audioAsVoice) {
    ctx.state.pendingToolAudioAsVoice = true;
  }
}

async function collectEmittedToolOutputMediaUrls(
  toolName: string,
  outputText: string,
  result: unknown,
): Promise<string[]> {
  const { splitMediaFromOutput } = await loadMediaParse();
  const mediaUrls = splitMediaFromOutput(outputText).mediaUrls ?? [];
  if (mediaUrls.length === 0) {
    return [];
  }
  return filterToolResultMediaUrls(toolName, mediaUrls, result);
}

const COMPACT_PROVIDER_INVENTORY_TOOLS = new Set(["image_generate", "video_generate"]);

function hasProviderInventoryDetails(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }
  const details = readToolResultDetailsRecord(result);
  return Array.isArray(details?.providers);
}

function shouldEmitCompactToolOutput(params: {
  toolName: string;
  result: unknown;
  outputText?: string;
}): boolean {
  if (!COMPACT_PROVIDER_INVENTORY_TOOLS.has(params.toolName)) {
    return false;
  }
  if (!hasProviderInventoryDetails(params.result)) {
    return false;
  }
  return Boolean(params.outputText?.trim());
}

function readExecApprovalPendingDetails(result: unknown): {
  approvalId: string;
  approvalSlug: string;
  expiresAtMs?: number;
  allowedDecisions?: readonly ExecApprovalDecision[];
  host: "gateway" | "node";
  command: string;
  cwd?: string;
  nodeId?: string;
  warningText?: string;
} | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const outer = result as Record<string, unknown>;
  const details =
    outer.details && typeof outer.details === "object" && !Array.isArray(outer.details)
      ? (outer.details as Record<string, unknown>)
      : outer;
  if (details.status !== "approval-pending") {
    return null;
  }
  const approvalId = readStringValue(details.approvalId) ?? "";
  const approvalSlug = readStringValue(details.approvalSlug) ?? "";
  const command = typeof details.command === "string" ? details.command : "";
  const host = details.host === "node" ? "node" : details.host === "gateway" ? "gateway" : null;
  if (!approvalId || !approvalSlug || !command || !host) {
    return null;
  }
  return {
    approvalId,
    approvalSlug,
    expiresAtMs: typeof details.expiresAtMs === "number" ? details.expiresAtMs : undefined,
    allowedDecisions: Array.isArray(details.allowedDecisions)
      ? details.allowedDecisions.filter(
          (decision): decision is ExecApprovalDecision =>
            decision === "allow-once" || decision === "allow-always" || decision === "deny",
        )
      : undefined,
    host,
    command,
    cwd: readStringValue(details.cwd),
    nodeId: readStringValue(details.nodeId),
    warningText: readStringValue(details.warningText),
  };
}

function readExecApprovalUnavailableDetails(result: unknown): {
  reason: "initiating-platform-disabled" | "initiating-platform-unsupported" | "no-approval-route";
  warningText?: string;
  channel?: string;
  channelLabel?: string;
  accountId?: string;
  sentApproverDms?: boolean;
} | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const outer = result as Record<string, unknown>;
  const details =
    outer.details && typeof outer.details === "object" && !Array.isArray(outer.details)
      ? (outer.details as Record<string, unknown>)
      : outer;
  if (details.status !== "approval-unavailable") {
    return null;
  }
  const reason =
    details.reason === "initiating-platform-disabled" ||
    details.reason === "initiating-platform-unsupported" ||
    details.reason === "no-approval-route"
      ? details.reason
      : null;
  if (!reason) {
    return null;
  }
  return {
    reason,
    warningText: readStringValue(details.warningText),
    channel: readStringValue(details.channel),
    channelLabel: readStringValue(details.channelLabel),
    accountId: readStringValue(details.accountId),
    sentApproverDms: details.sentApproverDms === true,
  };
}

async function emitToolResultOutput(params: {
  ctx: ToolHandlerContext;
  toolName: string;
  rawToolName: string;
  meta?: string;
  isToolError: boolean;
  result: unknown;
  sanitizedResult: unknown;
}) {
  const { ctx, toolName, rawToolName, meta, isToolError, result, sanitizedResult } = params;
  const hasStructuredMedia =
    result &&
    typeof result === "object" &&
    (result as { details?: unknown }).details &&
    typeof (result as { details?: unknown }).details === "object" &&
    !Array.isArray((result as { details?: unknown }).details) &&
    typeof ((result as { details?: { media?: unknown } }).details?.media ?? undefined) ===
      "object" &&
    !Array.isArray((result as { details?: { media?: unknown } }).details?.media);
  const approvalPending = readExecApprovalPendingDetails(result);
  let emittedToolOutputMediaUrls: string[] = [];
  if (!isToolError && approvalPending) {
    if (!ctx.params.onToolResult) {
      return;
    }
    ctx.state.deterministicApprovalPromptPending = true;
    try {
      const { buildExecApprovalPendingReplyPayload } = await loadExecApprovalReply();
      await ctx.params.onToolResult(
        buildExecApprovalPendingReplyPayload({
          approvalId: approvalPending.approvalId,
          approvalSlug: approvalPending.approvalSlug,
          allowedDecisions: approvalPending.allowedDecisions,
          command: approvalPending.command,
          cwd: approvalPending.cwd,
          host: approvalPending.host,
          nodeId: approvalPending.nodeId,
          expiresAtMs: approvalPending.expiresAtMs,
          warningText: approvalPending.warningText,
        }),
      );
      ctx.state.deterministicApprovalPromptSent = true;
    } catch {
      ctx.state.deterministicApprovalPromptSent = false;
    } finally {
      ctx.state.deterministicApprovalPromptPending = false;
    }
    return;
  }

  const approvalUnavailable = readExecApprovalUnavailableDetails(result);
  if (!isToolError && approvalUnavailable) {
    if (!ctx.params.onToolResult) {
      return;
    }
    ctx.state.deterministicApprovalPromptPending = true;
    try {
      const { buildExecApprovalUnavailableReplyPayload } = await loadExecApprovalReply();
      await ctx.params.onToolResult?.(
        buildExecApprovalUnavailableReplyPayload({
          reason: approvalUnavailable.reason,
          warningText: approvalUnavailable.warningText,
          channel: approvalUnavailable.channel,
          channelLabel: approvalUnavailable.channelLabel,
          accountId: approvalUnavailable.accountId,
          sentApproverDms: approvalUnavailable.sentApproverDms,
        }),
      );
      ctx.state.deterministicApprovalPromptSent = true;
    } catch {
      ctx.state.deterministicApprovalPromptSent = false;
    } finally {
      ctx.state.deterministicApprovalPromptPending = false;
    }
    return;
  }

  const outputText = extractToolResultText(sanitizedResult);
  const shouldEmitOutput =
    ctx.shouldEmitToolOutput() || shouldEmitCompactToolOutput({ toolName, result, outputText });
  if (shouldEmitOutput) {
    if (outputText) {
      ctx.emitToolOutput(rawToolName, meta, outputText, result);
      if (ctx.params.toolResultFormat === "plain") {
        emittedToolOutputMediaUrls = await collectEmittedToolOutputMediaUrls(
          rawToolName,
          outputText,
          result,
        );
      }
    }
    if (!hasStructuredMedia) {
      return;
    }
  }

  if (isToolError) {
    return;
  }

  const mediaReply = extractToolResultMediaArtifact(result);
  if (!mediaReply) {
    return;
  }
  const mediaUrls = filterToolResultMediaUrls(
    rawToolName,
    mediaReply.mediaUrls,
    result,
    ctx.builtinToolNames,
  );
  const pendingMediaUrls =
    mediaReply.audioAsVoice || emittedToolOutputMediaUrls.length === 0
      ? mediaUrls
      : mediaUrls.filter((url) => !emittedToolOutputMediaUrls.includes(url));
  if (pendingMediaUrls.length === 0) {
    return;
  }
  queuePendingToolMedia(ctx, {
    mediaUrls: pendingMediaUrls,
    ...(mediaReply.audioAsVoice ? { audioAsVoice: true } : {}),
  });
}

export function handleToolExecutionStart(
  ctx: ToolHandlerContext,
  evt: AgentEvent & { toolName: string; toolCallId: string; args: unknown },
): void | Promise<void> {
  const continueAfterBlockReplyFlush = (): void | Promise<void> => {
    const onBlockReplyFlushResult = ctx.params.onBlockReplyFlush?.();
    if (isPromiseLike<void>(onBlockReplyFlushResult)) {
      return onBlockReplyFlushResult.then(() => {
        continueToolExecutionStart();
      });
    }
    continueToolExecutionStart();
    return undefined;
  };

  const continueToolExecutionStart = () => {
    const rawToolName = evt.toolName;
    const toolName = normalizeToolName(rawToolName);
    const toolCallId = evt.toolCallId;
    const args = evt.args;
    const runId = ctx.params.runId;
    const argsRecord = readRecord(args);
    const requestedAgentId =
      toolName === "task"
        ? (readStringField(argsRecord, "agentId") ??
          readStringField(argsRecord, "subagent_type") ??
          readStringField(argsRecord, "subagentType"))
        : undefined;

    // Track start time and args for after_tool_call hook.
    const startedAt = Date.now();
    toolStartData.set(buildToolStartKey(runId, toolCallId), { startTime: startedAt, args });

    if (toolName === "read") {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const filePathValue =
        typeof record.path === "string"
          ? record.path
          : typeof record.file_path === "string"
            ? record.file_path
            : "";
      const filePath = filePathValue.trim();
      if (!filePath) {
        const argsPreview = readStringValue(args)?.slice(0, 200);
        ctx.log.warn(
          `read tool called without path: toolCallId=${toolCallId} argsType=${typeof args}${argsPreview ? ` argsPreview=${argsPreview}` : ""}`,
        );
      }
    }

    const meta = extendExecMeta(toolName, args, inferToolMetaFromArgs(toolName, args));
    ctx.state.toolMetaById.set(toolCallId, buildToolCallSummary(toolName, args, meta));
    ctx.log.debug(
      `embedded run tool start: runId=${ctx.params.runId} tool=${toolName} toolCallId=${toolCallId}`,
    );

    const shouldEmitToolEvents = ctx.shouldEmitToolResult();
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "tool",
      data: {
        phase: "start",
        name: toolName,
        toolCallId,
        args: args as Record<string, unknown>,
      },
    });
    const itemData: AgentItemEventData = {
      itemId: buildToolItemId(toolCallId),
      phase: "start",
      kind: "tool",
      title: buildToolItemTitle(toolName, meta),
      status: "running",
      name: toolName,
      meta,
      toolCallId,
      startedAt,
    };
    emitTrackedItemEvent(ctx, itemData);
    // Best-effort typing signal; do not block tool summaries on slow emitters.
    void ctx.params.onAgentEvent?.({
      stream: "tool",
      data: {
        phase: "start",
        name: toolName,
        toolCallId,
        ...(requestedAgentId ? { requestedAgentId } : {}),
      },
    });

    if (isExecToolName(toolName)) {
      emitTrackedItemEvent(ctx, {
        itemId: buildCommandItemId(toolCallId),
        phase: "start",
        kind: "command",
        title: buildCommandItemTitle(toolName, meta),
        status: "running",
        name: toolName,
        meta,
        toolCallId,
        startedAt,
      });
    } else if (isPatchToolName(toolName)) {
      emitTrackedItemEvent(ctx, {
        itemId: buildPatchItemId(toolCallId),
        phase: "start",
        kind: "patch",
        title: buildPatchItemTitle(meta),
        status: "running",
        name: toolName,
        meta,
        toolCallId,
        startedAt,
      });
    }

    if (
      ctx.params.onToolResult &&
      shouldEmitToolEvents &&
      !ctx.state.toolSummaryById.has(toolCallId)
    ) {
      ctx.state.toolSummaryById.add(toolCallId);
      ctx.emitToolSummary(toolName, meta);
    }

    // Track messaging tool sends (pending until confirmed in tool_execution_end).
    if (isMessagingTool(toolName)) {
      const argsRecord = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const isMessagingSend = isMessagingToolSendAction(toolName, argsRecord);
      if (isMessagingSend) {
        const sendTarget = extractMessagingToolSend(toolName, argsRecord);
        if (sendTarget) {
          ctx.state.pendingMessagingTargets.set(toolCallId, sendTarget);
        }
        // Field names vary by tool: Discord/Slack use "content", sessions_send uses "message"
        const text = (argsRecord.content as string) ?? (argsRecord.message as string);
        if (text && typeof text === "string") {
          ctx.state.pendingMessagingTexts.set(toolCallId, text);
          ctx.log.debug(`Tracking pending messaging text: tool=${toolName} len=${text.length}`);
        }
        // Track media URLs from messaging tool args (pending until tool_execution_end).
        const mediaUrls = collectMessagingMediaUrlsFromRecord(argsRecord);
        if (mediaUrls.length > 0) {
          ctx.state.pendingMessagingMediaUrls.set(toolCallId, mediaUrls);
        }
      }
    }
  };

  // Flush pending block replies to preserve message boundaries before tool execution.
  const flushBlockReplyBufferResult = ctx.flushBlockReplyBuffer();
  if (isPromiseLike<void>(flushBlockReplyBufferResult)) {
    return flushBlockReplyBufferResult.then(() => continueAfterBlockReplyFlush());
  }
  return continueAfterBlockReplyFlush();
}

export function handleToolExecutionUpdate(
  ctx: ToolHandlerContext,
  evt: AgentEvent & {
    toolName: string;
    toolCallId: string;
    partialResult?: unknown;
  },
) {
  const toolName = normalizeToolName(evt.toolName);
  const toolCallId = evt.toolCallId;
  const partial = evt.partialResult;
  const sanitized = sanitizeToolResult(partial);
  const progressText = extractToolResultText(sanitized);
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "tool",
    data: {
      phase: "update",
      name: toolName,
      toolCallId,
      partialResult: sanitized,
    },
  });
  const itemData: AgentItemEventData = {
    itemId: buildToolItemId(toolCallId),
    phase: "update",
    kind: "tool",
    title: buildToolItemTitle(toolName, ctx.state.toolMetaById.get(toolCallId)?.meta),
    status: "running",
    name: toolName,
    meta: ctx.state.toolMetaById.get(toolCallId)?.meta,
    toolCallId,
    ...(progressText ? { progressText } : {}),
  };
  emitTrackedItemEvent(ctx, itemData);
  void ctx.params.onAgentEvent?.({
    stream: "tool",
    data: {
      phase: "update",
      name: toolName,
      toolCallId,
    },
  });
  if (isExecToolName(toolName)) {
    const output = progressText;
    const commandData: AgentItemEventData = {
      itemId: buildCommandItemId(toolCallId),
      phase: "update",
      kind: "command",
      title: buildCommandItemTitle(toolName, ctx.state.toolMetaById.get(toolCallId)?.meta),
      status: "running",
      name: toolName,
      meta: ctx.state.toolMetaById.get(toolCallId)?.meta,
      toolCallId,
      ...(output ? { progressText: output } : {}),
    };
    emitTrackedItemEvent(ctx, commandData);
    if (output) {
      const outputData: AgentCommandOutputEventData = {
        itemId: commandData.itemId,
        phase: "delta",
        title: commandData.title,
        toolCallId,
        name: toolName,
        output,
        status: "running",
      };
      emitAgentCommandOutputEvent({
        runId: ctx.params.runId,
        ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
        data: outputData,
      });
      void ctx.params.onAgentEvent?.({
        stream: "command_output",
        data: outputData,
      });
    }
  }
}

export async function handleToolExecutionEnd(
  ctx: ToolHandlerContext,
  evt: AgentEvent & {
    toolName: string;
    toolCallId: string;
    isError: boolean;
    result?: unknown;
  },
) {
  const rawToolName = evt.toolName;
  const toolName = normalizeToolName(rawToolName);
  const toolCallId = evt.toolCallId;
  const runId = ctx.params.runId;
  const isError = evt.isError;
  const result = evt.result;
  const isToolError = isError || isToolResultError(result);
  const sanitizedResult = sanitizeToolResult(result);
  const toolStartKey = buildToolStartKey(runId, toolCallId);
  const startData = toolStartData.get(toolStartKey);
  toolStartData.delete(toolStartKey);
  const callSummary = ctx.state.toolMetaById.get(toolCallId);
  const completedMutatingAction = !isToolError && Boolean(callSummary?.mutatingAction);
  const meta = callSummary?.meta;
  ctx.state.toolMetas.push({ toolName, meta });
  ctx.state.toolMetaById.delete(toolCallId);
  ctx.state.toolSummaryById.delete(toolCallId);
  const nativeTaskEvent = buildNativeTaskResultEvent({
    runId,
    toolCallId,
    toolName,
    result,
  });
  if (nativeTaskEvent) {
    try {
      const enrichedNativeTaskEvent = await admitNativeTaskWorkingContext({
        ctx,
        event: nativeTaskEvent,
        result,
        toolCallId,
      });
      await ctx.params.onAgentEvent?.({ stream: "node-agent", data: enrichedNativeTaskEvent });
    } catch {
      // Native task trace emission is diagnostic only; it must not alter tool semantics.
    }
  }
  const nodeAgentToolResultEvent = buildNodeAgentToolResultEvent({
    runId,
    agentId: ctx.params.agentId,
    sessionKey: ctx.params.sessionKey,
    toolCallId,
    toolName,
    isToolError,
    completedMutatingAction,
    result,
    args: startData?.args,
  });
  if (nodeAgentToolResultEvent) {
    try {
      const enrichedNodeAgentToolResultEvent = await admitNativeToolWorkingContext({
        ctx,
        event: nodeAgentToolResultEvent,
        toolCallId,
      });
      await ctx.params.onAgentEvent?.({
        stream: "node-agent",
        data: enrichedNodeAgentToolResultEvent,
      });
    } catch {
      // Compact node-agent trace emission is diagnostic only; it must not alter tool semantics.
    }
  }
  if (isToolError) {
    const errorMessage = extractToolErrorMessage(sanitizedResult);
    ctx.state.lastToolError = {
      toolName,
      meta,
      error: errorMessage,
      timedOut: isToolResultTimedOut(sanitizedResult) || undefined,
      mutatingAction: callSummary?.mutatingAction,
      actionFingerprint: callSummary?.actionFingerprint,
    };
  } else if (ctx.state.lastToolError) {
    // Keep unresolved mutating failures until the same action succeeds.
    if (ctx.state.lastToolError.mutatingAction) {
      if (
        isSameToolMutationAction(ctx.state.lastToolError, {
          toolName,
          meta,
          actionFingerprint: callSummary?.actionFingerprint,
        })
      ) {
        ctx.state.lastToolError = undefined;
      }
    } else {
      ctx.state.lastToolError = undefined;
    }
  }
  if (completedMutatingAction) {
    ctx.state.replayState = mergeEmbeddedRunReplayState(ctx.state.replayState, {
      replayInvalid: true,
      hadPotentialSideEffects: true,
    });
  }

  // Commit messaging tool text on success, discard on error.
  const pendingText = ctx.state.pendingMessagingTexts.get(toolCallId);
  const pendingTarget = ctx.state.pendingMessagingTargets.get(toolCallId);
  if (pendingText) {
    ctx.state.pendingMessagingTexts.delete(toolCallId);
    if (!isToolError) {
      ctx.state.messagingToolSentTexts.push(pendingText);
      ctx.state.messagingToolSentTextsNormalized.push(normalizeTextForComparison(pendingText));
      ctx.log.debug(`Committed messaging text: tool=${toolName} len=${pendingText.length}`);
      ctx.trimMessagingToolSent();
    }
  }
  if (pendingTarget) {
    ctx.state.pendingMessagingTargets.delete(toolCallId);
    if (!isToolError) {
      ctx.state.messagingToolSentTargets.push(pendingTarget);
      ctx.trimMessagingToolSent();
    }
  }
  const pendingMediaUrls = ctx.state.pendingMessagingMediaUrls.get(toolCallId) ?? [];
  ctx.state.pendingMessagingMediaUrls.delete(toolCallId);
  const startArgs =
    startData?.args && typeof startData.args === "object"
      ? (startData.args as Record<string, unknown>)
      : {};
  const isMessagingSend =
    pendingMediaUrls.length > 0 ||
    (isMessagingTool(toolName) && isMessagingToolSendAction(toolName, startArgs));
  if (!isToolError && isMessagingSend) {
    const committedMediaUrls = [
      ...pendingMediaUrls,
      ...collectMessagingMediaUrlsFromToolResult(result),
    ];
    if (committedMediaUrls.length > 0) {
      ctx.state.messagingToolSentMediaUrls.push(...committedMediaUrls);
      ctx.trimMessagingToolSent();
    }
  }

  // Track committed reminders only when cron.add completed successfully.
  if (!isToolError && toolName === "cron" && isCronAddAction(startData?.args)) {
    ctx.state.successfulCronAdds += 1;
  }

  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "tool",
    data: {
      phase: "result",
      name: toolName,
      toolCallId,
      meta,
      isError: isToolError,
      result: sanitizedResult,
    },
  });
  const endedAt = Date.now();
  const itemId = buildToolItemId(toolCallId);
  const itemData: AgentItemEventData = {
    itemId,
    phase: "end",
    kind: "tool",
    title: buildToolItemTitle(toolName, meta),
    status: isToolError ? "failed" : "completed",
    name: toolName,
    meta,
    toolCallId,
    startedAt: startData?.startTime,
    endedAt,
    ...(isToolError && extractToolErrorMessage(sanitizedResult)
      ? { error: extractToolErrorMessage(sanitizedResult) }
      : {}),
  };
  emitTrackedItemEvent(ctx, itemData);
  void ctx.params.onAgentEvent?.({
    stream: "tool",
    data: {
      phase: "result",
      name: toolName,
      toolCallId,
      meta,
      isError: isToolError,
    },
  });

  if (isExecToolName(toolName)) {
    const execDetails = readExecToolDetails(result);
    const commandItemId = buildCommandItemId(toolCallId);
    if (
      execDetails?.status === "approval-pending" ||
      execDetails?.status === "approval-unavailable"
    ) {
      const approvalStatus = execDetails.status === "approval-pending" ? "pending" : "unavailable";
      const approvalData: AgentApprovalEventData = {
        phase: "requested",
        kind: "exec",
        status: approvalStatus,
        title:
          approvalStatus === "pending"
            ? "Command approval requested"
            : "Command approval unavailable",
        itemId: commandItemId,
        toolCallId,
        ...(execDetails.status === "approval-pending"
          ? {
              approvalId: execDetails.approvalId,
              approvalSlug: execDetails.approvalSlug,
            }
          : {}),
        command: execDetails.command,
        host: execDetails.host,
        ...(execDetails.status === "approval-unavailable" ? { reason: execDetails.reason } : {}),
        message: execDetails.warningText,
      };
      emitAgentApprovalEvent({
        runId: ctx.params.runId,
        ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
        data: approvalData,
      });
      void ctx.params.onAgentEvent?.({
        stream: "approval",
        data: approvalData,
      });
      emitTrackedItemEvent(ctx, {
        itemId: commandItemId,
        phase: "end",
        kind: "command",
        title: buildCommandItemTitle(toolName, meta),
        status: "blocked",
        name: toolName,
        meta,
        toolCallId,
        startedAt: startData?.startTime,
        endedAt,
        ...(execDetails.status === "approval-pending"
          ? {
              approvalId: execDetails.approvalId,
              approvalSlug: execDetails.approvalSlug,
              summary: "Awaiting approval before command can run.",
            }
          : {
              summary: "Command is blocked because no interactive approval route is available.",
            }),
      });
    } else {
      const output =
        execDetails && "aggregated" in execDetails
          ? execDetails.aggregated
          : extractToolResultText(sanitizedResult);
      const commandStatus =
        execDetails?.status === "failed" || isToolError ? "failed" : "completed";
      emitTrackedItemEvent(ctx, {
        itemId: commandItemId,
        phase: "end",
        kind: "command",
        title: buildCommandItemTitle(toolName, meta),
        status: commandStatus,
        name: toolName,
        meta,
        toolCallId,
        startedAt: startData?.startTime,
        endedAt,
        ...(output ? { summary: output } : {}),
        ...(isToolError && extractToolErrorMessage(sanitizedResult)
          ? { error: extractToolErrorMessage(sanitizedResult) }
          : {}),
      });
      const outputData: AgentCommandOutputEventData = {
        itemId: commandItemId,
        phase: "end",
        title: buildCommandItemTitle(toolName, meta),
        toolCallId,
        name: toolName,
        ...(output ? { output } : {}),
        status: commandStatus,
        ...(execDetails && "exitCode" in execDetails ? { exitCode: execDetails.exitCode } : {}),
        ...(execDetails && "durationMs" in execDetails
          ? { durationMs: execDetails.durationMs }
          : {}),
        ...(execDetails && "cwd" in execDetails && typeof execDetails.cwd === "string"
          ? { cwd: execDetails.cwd }
          : {}),
      };
      emitAgentCommandOutputEvent({
        runId: ctx.params.runId,
        ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
        data: outputData,
      });
      void ctx.params.onAgentEvent?.({
        stream: "command_output",
        data: outputData,
      });

      if (typeof output === "string") {
        const parsedApprovalResult = parseExecApprovalResultText(output);
        if (parsedApprovalResult.kind === "denied") {
          const approvalData: AgentApprovalEventData = {
            phase: "resolved",
            kind: "exec",
            status: normalizeOptionalLowercaseString(parsedApprovalResult.metadata)?.includes(
              "approval-request-failed",
            )
              ? "failed"
              : "denied",
            title: "Command approval resolved",
            itemId: commandItemId,
            toolCallId,
            message: parsedApprovalResult.body || parsedApprovalResult.raw,
          };
          emitAgentApprovalEvent({
            runId: ctx.params.runId,
            ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
            data: approvalData,
          });
          void ctx.params.onAgentEvent?.({
            stream: "approval",
            data: approvalData,
          });
        }
      }
    }
  }

  if (isPatchToolName(toolName)) {
    const patchSummary = readApplyPatchSummary(result);
    const patchItemId = buildPatchItemId(toolCallId);
    const summaryText = patchSummary ? buildPatchSummaryText(patchSummary) : undefined;
    emitTrackedItemEvent(ctx, {
      itemId: patchItemId,
      phase: "end",
      kind: "patch",
      title: buildPatchItemTitle(meta),
      status: isToolError ? "failed" : "completed",
      name: toolName,
      meta,
      toolCallId,
      startedAt: startData?.startTime,
      endedAt,
      ...(summaryText ? { summary: summaryText } : {}),
      ...(isToolError && extractToolErrorMessage(sanitizedResult)
        ? { error: extractToolErrorMessage(sanitizedResult) }
        : {}),
    });
    if (patchSummary) {
      const patchData: AgentPatchSummaryEventData = {
        itemId: patchItemId,
        phase: "end",
        title: buildPatchItemTitle(meta),
        toolCallId,
        name: toolName,
        added: patchSummary.added,
        modified: patchSummary.modified,
        deleted: patchSummary.deleted,
        summary: summaryText ?? buildPatchSummaryText(patchSummary),
      };
      emitAgentPatchSummaryEvent({
        runId: ctx.params.runId,
        ...(ctx.params.sessionKey ? { sessionKey: ctx.params.sessionKey } : {}),
        data: patchData,
      });
      void ctx.params.onAgentEvent?.({
        stream: "patch",
        data: patchData,
      });
    }
  }

  ctx.log.debug(
    `embedded run tool end: runId=${ctx.params.runId} tool=${toolName} toolCallId=${toolCallId}`,
  );

  await emitToolResultOutput({
    ctx,
    toolName,
    rawToolName,
    meta,
    isToolError,
    result,
    sanitizedResult,
  });

  const { recordModelMemoryProductionHookProbe } = await import("./model-memory.hook-probe.js");
  void recordModelMemoryProductionHookProbe({
    hookName: "after_tool_call",
    triggerSurface: "pi_embedded_tool_result.after_tool_call",
    payload: {
      toolName,
      runId,
      toolCallId,
      isToolError,
      result: sanitizedResult,
    },
    context: {
      toolName,
      agentId: ctx.params.agentId,
      sessionKey: ctx.params.sessionKey,
      sessionId: ctx.params.sessionId,
      runId,
      toolCallId,
    },
  }).catch(() => undefined);
  const { recordModelMemoryCaptureSeamEvidence } = await import("./model-memory.capture-seams.js");
  void recordModelMemoryCaptureSeamEvidence({
    seamName: "after_tool_call",
    triggerSurface: "pi_embedded_tool_result.after_tool_call",
    payload: {
      toolName,
      runId,
      toolCallId,
      isToolError,
      resultKind: Array.isArray(sanitizedResult) ? "array" : typeof sanitizedResult,
    },
    context: {
      toolName,
      agentId: ctx.params.agentId,
      sessionKey: ctx.params.sessionKey,
      sessionId: ctx.params.sessionId,
      runId,
      toolCallId,
    },
  }).catch(() => undefined);
  const { captureModelMemoryToolResultProof } = await import("./model-memory.live-runtime.js");
  try {
    const captureResult = await captureModelMemoryToolResultProof({
      hookName: "after_tool_call",
      toolName,
      toolCallId,
      runId,
      sessionId: ctx.params.sessionId,
      sessionKey: ctx.params.sessionKey,
      agentId: ctx.params.agentId,
      result: sanitizedResult,
      isError: isToolError,
    });
    void recordModelMemoryCaptureSeamEvidence({
      seamName: "after_tool_call",
      triggerSurface: "pi_embedded_tool_result.after_tool_call.capture_result",
      payload: {
        toolName,
        toolCallId,
        runId,
        captured: captureResult.captured,
        reason: captureResult.captured ? "captured" : captureResult.reason,
        sourceId: captureResult.captured ? captureResult.sourceId : undefined,
        segmentCount: captureResult.captured ? captureResult.segmentIds.length : 0,
        memoryCount: captureResult.captured ? captureResult.memoryIds.length : 0,
        eventCount: captureResult.captured ? captureResult.eventIds.length : 0,
      },
      context: {
        toolName,
        agentId: ctx.params.agentId,
        sessionKey: ctx.params.sessionKey,
        sessionId: ctx.params.sessionId,
        runId,
        toolCallId,
      },
      semanticMemoryWriteAttempted: captureResult.captured,
      durableMemoryWriteAttempted: captureResult.captured,
    }).catch(() => undefined);
  } catch (err) {
    ctx.log.warn(
      `model-memory tool-result proof capture failed: tool=${toolName} error=${String(err)}`,
    );
  }

  // Run after_tool_call plugin hook (fire-and-forget)
  const hookRunnerAfter = ctx.hookRunner ?? (await loadHookRunnerGlobal()).getGlobalHookRunner();
  if (hookRunnerAfter?.hasHooks("after_tool_call")) {
    const { consumeAdjustedParamsForToolCall } = await loadBeforeToolCall();
    const adjustedArgs = consumeAdjustedParamsForToolCall(toolCallId, runId);
    const afterToolCallArgs =
      adjustedArgs && typeof adjustedArgs === "object"
        ? (adjustedArgs as Record<string, unknown>)
        : startArgs;
    const durationMs = startData?.startTime != null ? Date.now() - startData.startTime : undefined;
    const hookEvent: PluginHookAfterToolCallEvent = {
      toolName,
      params: afterToolCallArgs,
      runId,
      toolCallId,
      result: sanitizedResult,
      error: isToolError ? extractToolErrorMessage(sanitizedResult) : undefined,
      durationMs,
    };
    void hookRunnerAfter
      .runAfterToolCall(hookEvent, {
        toolName,
        agentId: ctx.params.agentId,
        sessionKey: ctx.params.sessionKey,
        sessionId: ctx.params.sessionId,
        runId,
        toolCallId,
      })
      .catch((err) => {
        ctx.log.warn(`after_tool_call hook failed: tool=${toolName} error=${String(err)}`);
      });
  }
}

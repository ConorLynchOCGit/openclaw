import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import type { AgentMessage, StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { filterHeartbeatPairs } from "../../../auto-reply/heartbeat-filter.js";
import type { ThinkLevel } from "../../../auto-reply/thinking.js";
import { resolveChannelCapabilities } from "../../../config/channel-capabilities.js";
import { resolveStateDir } from "../../../config/paths.js";
import { updateSessionLaunch } from "../../../config/sessions/launch.js";
import { buildSessionLaunchLocation } from "../../../config/sessions/location.js";
import { resolveStorePath } from "../../../config/sessions/paths.js";
import type { SessionSystemPromptReport } from "../../../config/sessions/types.js";
import {
  createContextPressureController,
  shouldPreferActualUsageCompaction,
  type ContextBreakdownSnapshot,
  PREEMPTIVE_OVERFLOW_ERROR_TEXT,
} from "../../../context-engine/pressure/index.js";
import { formatErrorMessage } from "../../../infra/errors.js";
import { resolveHeartbeatSummaryForAgent } from "../../../infra/heartbeat-summary.js";
import { getMachineDisplayName } from "../../../infra/machine-name.js";
import {
  ensureGlobalUndiciEnvProxyDispatcher,
  ensureGlobalUndiciStreamTimeouts,
} from "../../../infra/net/undici-global-dispatcher.js";
import { MAX_IMAGE_BYTES } from "../../../media/constants.js";
import {
  isOllamaCompatProvider,
  resolveOllamaCompatNumCtxEnabled,
  shouldInjectOllamaCompatNumCtx,
  wrapOllamaCompatNumCtx,
} from "../../../plugin-sdk/ollama-runtime.js";
import { getGlobalHookRunner } from "../../../plugins/hook-runner-global.js";
import { resolveToolCallArgumentsEncoding } from "../../../plugins/provider-model-compat.js";
import {
  resolveProviderSystemPromptContribution,
  resolveProviderTextTransforms,
  transformProviderSystemPrompt,
} from "../../../plugins/provider-runtime.js";
import { getPluginToolMeta } from "../../../plugins/tools.js";
import { isSubagentSessionKey } from "../../../routing/session-key.js";
import { normalizeOptionalLowercaseString } from "../../../shared/string-coerce.js";
import { normalizeOptionalString } from "../../../shared/string-coerce.js";
import { buildTtsSystemPromptHint } from "../../../tts/tts.js";
import { resolveUserPath } from "../../../utils.js";
import { normalizeMessageChannel } from "../../../utils/message-channel.js";
import { isReasoningTagProvider } from "../../../utils/provider-utils.js";
import {
  findAgentPackRegistryEntry,
  loadAgentPackRegistryEntriesSync,
} from "../../agent-pack-registry.js";
import { resolveOpenClawAgentDir } from "../../agent-paths.js";
import { resolveSessionAgentIds } from "../../agent-scope.js";
import { createAnthropicPayloadLogger } from "../../anthropic-payload-log.js";
import {
  analyzeBootstrapBudget,
  buildBootstrapPromptWarning,
  buildBootstrapTruncationReportMeta,
  buildBootstrapInjectionStats,
  prependBootstrapPromptWarning,
} from "../../bootstrap-budget.js";
import {
  FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
  hasCompletedBootstrapTurn,
  makeBootstrapWarn,
  resolveBootstrapContextForRun,
  resolveContextInjectionMode,
} from "../../bootstrap-files.js";
import { resolveBootstrapRepoRoot } from "../../bootstrap-repo-paths.js";
import { createCacheTrace } from "../../cache-trace.js";
import {
  listChannelSupportedActions,
  resolveChannelMessageToolCapabilities,
  resolveChannelMessageToolHints,
  resolveChannelReactionGuidance,
} from "../../channel-tools.js";
import { DEFAULT_CONTEXT_TOKENS } from "../../defaults.js";
import { resolveOpenClawDocsPath } from "../../docs-path.js";
import { isTimeoutError } from "../../failover-error.js";
import { resolveHeartbeatPromptForSystemPrompt } from "../../heartbeat-system-prompt.js";
import { resolveImageSanitizationLimits } from "../../image-sanitization.js";
import { AGENT_LANE_SUBAGENT } from "../../lanes.js";
import { buildModelAliasLines } from "../../model-alias-lines.js";
import { resolveModelAuthMode } from "../../model-auth.js";
import { recordModelMemoryCaptureSeamEvidence } from "../../model-memory.capture-seams.js";
import { recordModelMemoryProductionHookProbe } from "../../model-memory.hook-probe.js";
import { resolveDefaultModelForAgent } from "../../model-selection.js";
import { supportsModelTools } from "../../model-tool-support.js";
import { releaseWsSession } from "../../openai-ws-stream.js";
import { createOpenClawLspService } from "../../openclaw-lsp-service.js";
import { resolveOwnerDisplaySetting } from "../../owner-display.js";
import { createBundleLspToolRuntime } from "../../pi-bundle-lsp-runtime.js";
import {
  getOrCreateSessionMcpRuntime,
  materializeBundleMcpToolsForRun,
} from "../../pi-bundle-mcp-tools.js";
import {
  downgradeOpenAIFunctionCallReasoningPairs,
  isCloudCodeAssistFormatError,
  resolveBootstrapMaxChars,
  resolveBootstrapPromptTruncationWarningMode,
  resolveBootstrapTotalMaxChars,
} from "../../pi-embedded-helpers.js";
import { subscribeEmbeddedPiSession } from "../../pi-embedded-subscribe.js";
import { createPreparedEmbeddedPiSettingsManager } from "../../pi-project-settings.js";
import { applyPiAutoCompactionGuard } from "../../pi-settings.js";
import {
  createClientToolNameConflictError,
  findClientToolNameConflicts,
  toClientToolDefinitions,
} from "../../pi-tool-definition-adapter.js";
import {
  createOpenClawCodingTools,
  filterToolsForExecutionScoutMode,
  isNodeAgentNativeTaskParentToolAllowed,
  resolveToolLoopDetectionConfig,
} from "../../pi-tools.js";
import { wrapStreamFnTextTransforms } from "../../plugin-text-transforms.js";
import { describeProviderRequestRoutingSummary } from "../../provider-attribution.js";
import { registerProviderStreamForModel } from "../../provider-stream.js";
import { resolveSandboxContext } from "../../sandbox.js";
import { resolveSandboxRuntimeStatus } from "../../sandbox/runtime-status.js";
import { repairSessionFileIfNeeded } from "../../session-file-repair.js";
import { bindRunChildTaskToParentSessionLockHandoff } from "../../session-runtime/parent-lock-handoff.js";
import { guardSessionManager } from "../../session-tool-result-guard-wrapper.js";
import { sanitizeToolUseResultPairing } from "../../session-transcript-repair.js";
import {
  acquireSessionWriteLock,
  resolveSessionLockMaxHoldFromTimeout,
} from "../../session-write-lock.js";
import { detectRuntimeShell } from "../../shell-utils.js";
import {
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
  resolveSkillsPromptForRun,
} from "../../skills.js";
import {
  buildProviderSystemPromptContributionReceipt,
  type ProviderSystemPromptContributionReceipt,
} from "../../system-prompt-contribution.js";
import { resolveSystemPromptOverride } from "../../system-prompt-override.js";
import { buildSystemPromptParams } from "../../system-prompt-params.js";
import {
  buildSystemPromptReport,
  evaluateRequiredProviderContextAdmission,
} from "../../system-prompt-report.js";
import type { PromptProfile } from "../../system-prompt.types.js";
import { resolveAgentTimeoutMs } from "../../timeout.js";
import { UNKNOWN_TOOL_THRESHOLD } from "../../tool-loop-detection.js";
import {
  resolveTranscriptPolicy,
  shouldAllowProviderOwnedThinkingReplay,
} from "../../transcript-policy.js";
import { derivePromptTokens, normalizeUsage, type NormalizedUsage } from "../../usage.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../../workspace.js";
import { isRunnerAbortError } from "../abort.js";
import { isCacheTtlEligibleProvider, readLastCacheTtlTimestamp } from "../cache-ttl.js";
import { resolveCompactionTimeoutMs } from "../compaction-safety-timeout.js";
import { runContextEngineMaintenance } from "../context-engine-maintenance.js";
import { buildEmbeddedExtensionFactories } from "../extensions.js";
import { applyExtraParamsToAgent, resolveAgentTransportOverride } from "../extra-params.js";
import { prepareGooglePromptCacheStreamFn } from "../google-prompt-cache.js";
import { getDmHistoryLimitFromSessionKey, limitHistoryTurns } from "../history.js";
import { log } from "../logger.js";
import { buildEmbeddedMessageActionDiscoveryInput } from "../message-action-discovery-input.js";
import {
  collectPromptCacheToolNames,
  beginPromptCacheObservation,
  completePromptCacheObservation,
  type PromptCacheChange,
} from "../prompt-cache-observability.js";
import { resolveCacheRetention } from "../prompt-cache-retention.js";
import { sanitizeSessionHistory, validateReplayTurns } from "../replay-history.js";
import { observeReplayMetadata, replayMetadataFromState } from "../replay-state.js";
import {
  clearActiveEmbeddedRun,
  type EmbeddedPiQueueHandle,
  setActiveEmbeddedRun,
  updateActiveEmbeddedRunSnapshot,
} from "../runs.js";
import { buildEmbeddedSandboxInfo } from "../sandbox-info.js";
import { prewarmSessionFile, trackSessionManagerAccess } from "../session-manager-cache.js";
import { prepareSessionManagerForRun } from "../session-manager-init.js";
import { resolveEmbeddedRunSkillEntries } from "../skills-runtime.js";
import { streamWithPayloadPatch } from "../stream-payload-utils.js";
import {
  describeEmbeddedAgentStreamStrategy,
  resetEmbeddedAgentBaseStreamFnCacheForTest,
  resolveEmbeddedAgentApiKey,
  resolveEmbeddedAgentBaseStreamFn,
  resolveEmbeddedAgentStreamFn,
} from "../stream-resolution.js";
import {
  applySystemPromptOverrideToSession,
  buildEmbeddedSystemPrompt,
  createSystemPromptOverride,
} from "../system-prompt.js";
import { dropThinkingBlocks } from "../thinking.js";
import { collectAllowedToolNames } from "../tool-name-allowlist.js";
import { estimateProviderVisibleContextBreakdown } from "../tool-result-char-estimator.js";
import {
  installContextEngineLoopHook,
  installToolResultContextGuard,
} from "../tool-result-context-guard.js";
import {
  estimateToolResultReductionPotential,
  resolveLiveToolResultMaxChars,
  truncateOversizedToolResultsInSessionManager,
} from "../tool-result-truncation.js";
import {
  logProviderToolSchemaDiagnostics,
  normalizeProviderToolSchemas,
} from "../tool-schema-runtime.js";
import { splitSdkTools } from "../tool-split.js";
import { mapThinkingLevel } from "../utils.js";
import { flushPendingToolResultsAfterIdle } from "../wait-for-idle-before-flush.js";
import {
  assembleAttemptContextEngine,
  buildContextEnginePromptCacheInfo,
  findCurrentAttemptAssistantMessage,
  finalizeAttemptContextEngineTurn,
  resolveAttemptBootstrapContext,
  runAttemptContextEngineBootstrap,
} from "./attempt.context-engine-helpers.js";
import {
  buildAfterTurnRuntimeContext,
  mergeOrphanedTrailingUserPrompt,
  prependSystemPromptAddition,
  resolveAttemptFsWorkspaceOnly,
  resolveAttemptPrependSystemContext,
  resolvePromptBuildHookResult,
  resolvePromptModeForSession,
  shouldWarnOnOrphanedUserRepair,
  shouldInjectHeartbeatPrompt,
} from "./attempt.prompt-helpers.js";
import {
  createYieldAbortedResponse,
  persistSessionsYieldContextMessage,
  queueSessionsYieldInterruptMessage,
  stripSessionsYieldArtifacts,
  waitForSessionsYieldAbortSettle,
} from "./attempt.sessions-yield.js";
import { wrapStreamFnHandleSensitiveStopReason } from "./attempt.stop-reason-recovery.js";
import {
  buildEmbeddedSubscriptionParams,
  cleanupEmbeddedAttemptResources,
} from "./attempt.subscription-cleanup.js";
import {
  appendAttemptCacheTtlIfNeeded,
  composeSystemPromptWithHookContext,
  resolveAttemptSpawnWorkspaceDir,
  shouldPersistCompletedBootstrapTurn,
  shouldUseOpenAIWebSocketTransport,
} from "./attempt.thread-helpers.js";
import {
  shouldRepairMalformedAnthropicToolCallArguments,
  wrapStreamFnDecodeXaiToolCallArguments,
  wrapStreamFnRepairMalformedToolCallArguments,
} from "./attempt.tool-call-argument-repair.js";
import {
  sanitizeReplayToolCallIdsForStream,
  wrapStreamFnSanitizeMalformedToolCalls,
  wrapStreamFnTrimToolCallNames,
} from "./attempt.tool-call-normalization.js";
import { buildEmbeddedAttemptToolRunContext } from "./attempt.tool-run-context.js";
import { waitForCompactionRetryWithAggregateTimeout } from "./compaction-retry-aggregate-timeout.js";
import {
  resolveRunTimeoutDuringCompaction,
  resolveRunTimeoutWithCompactionGraceMs,
  selectCompactionTimeoutSnapshot,
  shouldFlagCompactionTimeout,
} from "./compaction-timeout.js";
import { pruneProcessedHistoryImages } from "./history-image-prune.js";
import { detectAndLoadPromptImages } from "./images.js";
import { buildAttemptReplayMetadata } from "./incomplete-turn.js";
import { resolveLlmIdleTimeoutMs, streamWithIdleTimeout } from "./llm-idle-timeout.js";
import { createProgressLeaseTimeout } from "./progress-lease-timeout.js";
import type {
  EmbeddedRunAttemptParams,
  EmbeddedRunAttemptResult,
  EmbeddedRunProgressTimeoutKind,
} from "./types.js";

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringFromRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFromRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function numberFromRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayFromRecord(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export const NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_REASON =
  "native_task_result_awaiting_parent_context";

const NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_ERROR_TEXT =
  "Context overflow: native task child result is waiting for parent synthesis and cannot be compacted without losing delivered task context. Reduce active context before retrying.";

export function isDeliveredNativeTaskToolResult(message: AgentMessage): boolean {
  if ((message as { role?: unknown }).role !== "toolResult") {
    return false;
  }
  const toolName = normalizeOptionalLowercaseString((message as { toolName?: unknown }).toolName);
  if (toolName !== "task") {
    return false;
  }
  const details = recordFromUnknown((message as { details?: unknown }).details);
  const resultDeliveryStatus = stringFromRecord(details, "resultDeliveryStatus");
  return (
    stringFromRecord(details, "status") === "completed" &&
    booleanFromRecord(details, "resultDeliveredToParentContext") === true &&
    (resultDeliveryStatus
      ? resultDeliveryStatus !== "rejected"
      : booleanFromRecord(details, "resultOversized") !== true)
  );
}

export function hasDeliveredNativeTaskResultAwaitingParentTurn(
  messages: readonly AgentMessage[],
): boolean {
  let latestDeliveredTaskResultIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if (isDeliveredNativeTaskToolResult(message)) {
      latestDeliveredTaskResultIndex = i;
      break;
    }
    if ((message as { role?: unknown }).role === "assistant") {
      return false;
    }
  }
  if (latestDeliveredTaskResultIndex < 0) {
    return false;
  }
  for (let i = latestDeliveredTaskResultIndex + 1; i < messages.length; i += 1) {
    if ((messages[i] as { role?: unknown }).role === "assistant") {
      return false;
    }
  }
  return true;
}

export function filterEffectiveToolsForNodeAgentNativeTaskMode<
  TTool extends { name?: string | null },
>(input: {
  tools: readonly TTool[];
  mode?: {
    enabled?: boolean;
    mutationToolName?: string;
  };
}): TTool[] {
  if (input.mode?.enabled !== true) {
    return [...input.tools];
  }
  return input.tools.filter((tool) => {
    return isNodeAgentNativeTaskParentToolAllowed({
      toolName: tool.name,
      mutationToolName: input.mode?.mutationToolName,
    });
  });
}

const PROVIDER_TURN_OPTICS_EVENT_TYPE = "node_agent_provider_turn_optics";
const PROVIDER_TURN_OPTICS_CUSTOM_TYPE = "openclaw:provider-turn-optics";
const PROVIDER_RESPONSE_NORMALIZATION_EVENT_TYPE =
  "node_agent_provider_response_normalization_receipt";
const PROVIDER_RESPONSE_NORMALIZATION_CUSTOM_TYPE =
  "openclaw:provider-response-normalization-receipt";
const PROVIDER_TURN_OPTICS_MUTATING_TOOL_NAMES = new Set(["edit", "write", "apply_patch"]);
const PROVIDER_REQUEST_DIAGNOSTICS_EVENT_TYPE = "node_agent_provider_request_diagnostics";
const PROVIDER_REQUEST_DIAGNOSTICS_CUSTOM_TYPE = "openclaw:provider-request-diagnostics";
const PROVIDER_WAIT_LOCK_HANDOFF_EVENT_TYPE = "node_agent_provider_wait_lock_handoff";
const PROVIDER_WAIT_LOCK_HANDOFF_CUSTOM_TYPE = "openclaw:provider-wait-lock-handoff";
const PREEMPTIVE_CHECKPOINT_EVENT_TYPE = "node_agent_preemptive_compaction_checkpoint";
const PREEMPTIVE_CHECKPOINT_CUSTOM_TYPE = "openclaw:node-agent-preemptive-checkpoint";
const PROVIDER_TURN_OPTICS_ACQUISITION_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "list",
  "openclaw_resource_read",
]);

type NodeAgentPreemptiveCheckpointReason =
  | "after_first_successful_edit_batch"
  | "before_validation_scout"
  | "after_validation_result"
  | "before_node_finish";

type NodeAgentPreemptiveCheckpointTracker = Record<NodeAgentPreemptiveCheckpointReason, boolean>;

type DeferredProviderCustomEntry = {
  customType: string;
  event: Record<string, unknown>;
};

function createNodeAgentPreemptiveCheckpointTracker(): NodeAgentPreemptiveCheckpointTracker {
  return {
    after_first_successful_edit_batch: false,
    before_validation_scout: false,
    after_validation_result: false,
    before_node_finish: false,
  };
}

function stableToolCatalogValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function buildSessionLaunchToolCatalogSummary(
  tools: readonly {
    name?: string | null;
    description?: string | null;
    parameters?: unknown;
  }[],
) {
  return tools
    .map((tool, catalogIndex) => {
      const name = tool.name?.trim();
      if (!name) {
        return null;
      }
      const description = tool.description ?? "";
      const parameters = stableToolCatalogValue(tool.parameters);
      return {
        name,
        catalogIndex,
        descriptionHash: stableAttemptTextHash(description),
        descriptionBytes: Buffer.byteLength(description, "utf8"),
        parametersHash: stableAttemptTextHash(parameters),
        parametersBytes: Buffer.byteLength(parameters, "utf8"),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

function toolResultIdsFromMessages(messages: readonly AgentMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if ((message as { role?: unknown }).role !== "toolResult") {
      continue;
    }
    const id = (message as { toolCallId?: unknown; toolUseId?: unknown }).toolCallId;
    const legacyId = (message as { toolCallId?: unknown; toolUseId?: unknown }).toolUseId;
    if (typeof id === "string" && id.trim()) {
      ids.add(id.trim());
    }
    if (typeof legacyId === "string" && legacyId.trim()) {
      ids.add(legacyId.trim());
    }
  }
  return ids;
}

function extractAssistantToolCallBlocks(
  message: AgentMessage,
): Array<{ id: string; name: string }> {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return [];
  }
  const calls: Array<{ id: string; name: string }> = [];
  for (const block of content) {
    const record = recordFromUnknown(block);
    const blockType = stringFromRecord(record, "type");
    if (blockType !== "toolCall" && blockType !== "toolUse" && blockType !== "tool_call") {
      continue;
    }
    const id = stringFromRecord(record, "id");
    const name = stringFromRecord(record, "name");
    if (id && name) {
      calls.push({ id, name });
    }
  }
  return calls;
}

function sanitizeProviderDiagnosticValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const allowedKeys = [
      "effort",
      "exclude",
      "summary",
      "type",
      "enabled",
      "budget_tokens",
      "budgetTokens",
    ];
    const compact: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (Object.hasOwn(record, key)) {
        compact[key] = sanitizeProviderDiagnosticValue(record[key]);
      }
    }
    return compact;
  }
  return value === undefined ? undefined : typeof value;
}

function readProviderRequestDiagnosticField(
  payload: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (Object.hasOwn(payload, key)) {
      return sanitizeProviderDiagnosticValue(payload[key]);
    }
  }
  return null;
}

function providerToolNameFromUnknown(value: unknown): string | null {
  const record = recordFromUnknown(value);
  const directName = stringFromRecord(record, "name");
  if (directName) {
    return directName;
  }
  const functionRecord = recordFromUnknown(record?.function);
  return stringFromRecord(functionRecord, "name") ?? null;
}

function providerToolDescriptionFromUnknown(value: unknown): string {
  const record = recordFromUnknown(value);
  const directDescription = stringFromRecord(record, "description");
  if (directDescription !== undefined) {
    return directDescription;
  }
  const functionRecord = recordFromUnknown(record?.function);
  return stringFromRecord(functionRecord, "description") ?? "";
}

function providerToolParametersFromUnknown(value: unknown): unknown {
  const record = recordFromUnknown(value);
  if (Object.hasOwn(record ?? {}, "parameters")) {
    return record?.parameters;
  }
  if (Object.hasOwn(record ?? {}, "input_schema")) {
    return record?.input_schema;
  }
  const functionRecord = recordFromUnknown(record?.function);
  if (Object.hasOwn(functionRecord ?? {}, "parameters")) {
    return functionRecord?.parameters;
  }
  return undefined;
}

function buildProviderToolCatalogReceipt(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawTools = Array.isArray(payload.tools) ? payload.tools : [];
  const tools = rawTools.flatMap((tool, providerIndex) => {
    const name = providerToolNameFromUnknown(tool)?.trim();
    if (!name) {
      return [];
    }
    const description = providerToolDescriptionFromUnknown(tool);
    const parameters = stableToolCatalogValue(providerToolParametersFromUnknown(tool));
    return [
      {
        name,
        providerIndex,
        descriptionHash: stableAttemptTextHash(description),
        descriptionBytes: Buffer.byteLength(description, "utf8"),
        parametersHash: stableAttemptTextHash(parameters),
        parametersBytes: Buffer.byteLength(parameters, "utf8"),
      },
    ];
  });
  const orderedToolNames = tools.map((tool) => tool.name);
  const mutatingTools = orderedToolNames.filter((name) =>
    PROVIDER_TURN_OPTICS_MUTATING_TOOL_NAMES.has(normalizeOptionalLowercaseString(name) ?? ""),
  );
  const lspIndex = orderedToolNames.findIndex(
    (name) => normalizeOptionalLowercaseString(name) === "lsp",
  );
  return {
    orderedToolNames,
    toolCount: tools.length,
    tools,
    mutatingTools,
    lspVisible: lspIndex >= 0,
    lspIndex: lspIndex >= 0 ? lspIndex : null,
  };
}

export function buildProviderRequestDiagnostics(params: {
  payload: Record<string, unknown>;
  provider?: string;
  model?: string;
  api?: string;
  attempt: number;
  agentId: string;
  nodeRunId?: string | null;
  sessionKey: string;
  runId: string;
  systemPromptReceipt?: ProviderSystemPromptContributionReceipt;
}): Record<string, unknown> {
  return {
    eventType: PROVIDER_REQUEST_DIAGNOSTICS_EVENT_TYPE,
    provider: params.provider ?? null,
    model: params.model ?? null,
    api: params.api ?? null,
    reasoning: readProviderRequestDiagnosticField(params.payload, "reasoning"),
    reasoning_effort: readProviderRequestDiagnosticField(
      params.payload,
      "reasoning_effort",
      "reasoningEffort",
    ),
    include_reasoning: readProviderRequestDiagnosticField(
      params.payload,
      "include_reasoning",
      "includeReasoning",
    ),
    parallel_tool_calls: readProviderRequestDiagnosticField(
      params.payload,
      "parallel_tool_calls",
      "parallelToolCalls",
    ),
    tool_choice: readProviderRequestDiagnosticField(params.payload, "tool_choice", "toolChoice"),
    max_tokens: readProviderRequestDiagnosticField(params.payload, "max_tokens", "maxTokens"),
    temperature: readProviderRequestDiagnosticField(params.payload, "temperature"),
    top_p: readProviderRequestDiagnosticField(params.payload, "top_p", "topP"),
    stream: readProviderRequestDiagnosticField(params.payload, "stream"),
    providerToolCatalogReceipt: buildProviderToolCatalogReceipt(params.payload),
    ...(params.systemPromptReceipt ? { systemPromptReceipt: params.systemPromptReceipt } : {}),
    attempt: params.attempt,
    agentId: params.agentId,
    nodeRunId: params.nodeRunId ?? null,
    sessionKey: params.sessionKey,
    runId: params.runId,
    recordedAtMs: Date.now(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function wrapStreamFnWithProviderRequestDiagnostics(params: {
  streamFn: StreamFn;
  sessionManager: ReturnType<typeof guardSessionManager>;
  deferredCustomEntries?: DeferredProviderCustomEntry[];
  nodeAgentSessionTraceEvents: Record<string, unknown>[];
  provider?: string;
  modelId?: string;
  api?: string;
  agentId: string;
  nodeRunId?: string | null;
  sessionKey: string;
  runId: string;
  getSystemPromptReceipt?: (request: {
    provider?: string;
    model?: string;
    api?: string;
  }) => ProviderSystemPromptContributionReceipt | undefined;
}): StreamFn {
  let attempt = 0;
  return (model, context, options) => {
    return streamWithPayloadPatch(params.streamFn, model, context, options, (payload) => {
      attempt += 1;
      const event = buildProviderRequestDiagnostics({
        payload,
        provider:
          typeof (model as { provider?: unknown })?.provider === "string"
            ? (model as { provider: string }).provider
            : params.provider,
        model:
          typeof (model as { id?: unknown })?.id === "string"
            ? (model as { id: string }).id
            : params.modelId,
        api:
          typeof (model as { api?: unknown })?.api === "string"
            ? (model as { api: string }).api
            : params.api,
        attempt,
        agentId: params.agentId,
        nodeRunId: params.nodeRunId,
        sessionKey: params.sessionKey,
        runId: params.runId,
        systemPromptReceipt: params.getSystemPromptReceipt?.({
          provider:
            typeof (model as { provider?: unknown })?.provider === "string"
              ? (model as { provider: string }).provider
              : params.provider,
          model:
            typeof (model as { id?: unknown })?.id === "string"
              ? (model as { id: string }).id
              : params.modelId,
          api:
            typeof (model as { api?: unknown })?.api === "string"
              ? (model as { api: string }).api
              : params.api,
        }),
      });
      if (params.deferredCustomEntries) {
        params.deferredCustomEntries.push({
          customType: PROVIDER_REQUEST_DIAGNOSTICS_CUSTOM_TYPE,
          event,
        });
      } else {
        try {
          params.sessionManager.appendCustomEntry(PROVIDER_REQUEST_DIAGNOSTICS_CUSTOM_TYPE, event);
        } catch (error) {
          log.warn(`provider request diagnostics append failed: ${String(error)}`);
        }
      }
      params.nodeAgentSessionTraceEvents.push(event);
    });
  };
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof value === "object" && "then" in value);
}

function appendProviderWaitLockHandoffEvent(params: {
  sessionManager: ReturnType<typeof guardSessionManager>;
  nodeAgentSessionTraceEvents: Record<string, unknown>[];
  sessionKey: string;
  runId: string;
  agentId: string;
  phase: "suspended" | "resumed";
  method?: string;
  persist?: boolean;
}) {
  const event = {
    eventType: PROVIDER_WAIT_LOCK_HANDOFF_EVENT_TYPE,
    sessionKey: params.sessionKey,
    runId: params.runId,
    agentId: params.agentId,
    phase: params.phase,
    method: params.method ?? null,
    recordedAtMs: Date.now(),
  };
  if (params.persist !== false) {
    try {
      params.sessionManager.appendCustomEntry(PROVIDER_WAIT_LOCK_HANDOFF_CUSTOM_TYPE, event);
    } catch (error) {
      log.warn(`provider wait lock handoff append failed: ${String(error)}`);
    }
  }
  params.nodeAgentSessionTraceEvents.push(event);
}

function flushDeferredProviderCustomEntries(params: {
  sessionManager: ReturnType<typeof guardSessionManager>;
  entries?: DeferredProviderCustomEntry[];
}) {
  if (!params.entries || params.entries.length === 0) {
    return;
  }
  const entries = params.entries.splice(0, params.entries.length);
  for (const entry of entries) {
    try {
      params.sessionManager.appendCustomEntry(entry.customType, entry.event);
    } catch (error) {
      log.warn(`deferred provider custom entry append failed: ${String(error)}`);
    }
  }
}

function wrapStreamResultWithProviderWaitLockResume<T>(
  stream: T,
  resumeOnce: (method: string) => Promise<void>,
): T {
  if (!stream || typeof stream !== "object") {
    return stream;
  }
  const record = stream as Record<PropertyKey, unknown>;
  const originalResult = record.result;
  if (typeof originalResult === "function") {
    record.result = async function resultWithProviderWaitLockResume(...args: unknown[]) {
      try {
        return await originalResult.apply(stream, args);
      } finally {
        await resumeOnce("result");
      }
    };
  }
  const originalAsyncIterator = record[Symbol.asyncIterator];
  if (typeof originalAsyncIterator === "function") {
    record[Symbol.asyncIterator] = function providerWaitLockResumeIterator() {
      const iterator = originalAsyncIterator.call(stream) as AsyncIterator<unknown>;
      let iteratorDone = false;
      const settle = async (method: string) => {
        if (!iteratorDone) {
          iteratorDone = true;
          await resumeOnce(method);
        }
      };
      return {
        async next() {
          try {
            const result = await iterator.next();
            if (result.done) {
              await settle("iterator_done");
            }
            return result;
          } catch (error) {
            await settle("iterator_error");
            throw error;
          }
        },
        async return(value?: unknown) {
          try {
            return (
              (await iterator.return?.(value)) ??
              ({ done: true, value: undefined } as IteratorReturnResult<unknown>)
            );
          } finally {
            await settle("iterator_return");
          }
        },
        async throw(error?: unknown) {
          try {
            if (iterator.throw) {
              return await iterator.throw(error);
            }
            throw error;
          } finally {
            await settle("iterator_throw");
          }
        },
      };
    };
  }
  return stream;
}

function wrapStreamFnWithProviderWaitLockHandoff(params: {
  streamFn: StreamFn;
  sessionManager: ReturnType<typeof guardSessionManager>;
  deferredCustomEntries?: DeferredProviderCustomEntry[];
  nodeAgentSessionTraceEvents: Record<string, unknown>[];
  suspendParentLockForProviderWait: () => Promise<() => Promise<void>>;
  sessionKey: string;
  runId: string;
  agentId: string;
}): StreamFn {
  return (model, context, options) =>
    (async () => {
      const resume = await params.suspendParentLockForProviderWait();
      let resumed = false;
      appendProviderWaitLockHandoffEvent({
        sessionManager: params.sessionManager,
        nodeAgentSessionTraceEvents: params.nodeAgentSessionTraceEvents,
        sessionKey: params.sessionKey,
        runId: params.runId,
        agentId: params.agentId,
        phase: "suspended",
        persist: false,
      });
      const resumeOnce = async (method: string) => {
        if (resumed) {
          return;
        }
        resumed = true;
        await resume();
        flushDeferredProviderCustomEntries({
          sessionManager: params.sessionManager,
          entries: params.deferredCustomEntries,
        });
        appendProviderWaitLockHandoffEvent({
          sessionManager: params.sessionManager,
          nodeAgentSessionTraceEvents: params.nodeAgentSessionTraceEvents,
          sessionKey: params.sessionKey,
          runId: params.runId,
          agentId: params.agentId,
          phase: "resumed",
          method,
        });
      };
      try {
        const maybeStream = params.streamFn(model, context, options);
        const stream = isPromiseLike(maybeStream) ? await maybeStream : maybeStream;
        return wrapStreamResultWithProviderWaitLockResume(stream, resumeOnce);
      } catch (error) {
        await resumeOnce("stream_error");
        throw error;
      }
    })() as ReturnType<StreamFn>;
}

function nodeAgentPreemptiveCheckpointReasonForEvent(params: {
  stream: string;
  data: Record<string, unknown>;
  tracker: NodeAgentPreemptiveCheckpointTracker;
}): NodeAgentPreemptiveCheckpointReason | null {
  const { stream, data, tracker } = params;
  if (
    stream === "node-agent" &&
    data.eventType === "node_agent_tool_result" &&
    booleanFromRecord(data, "mutatingAction") === true &&
    stringFromRecord(data, "status") === "completed" &&
    !tracker.after_first_successful_edit_batch
  ) {
    return "after_first_successful_edit_batch";
  }
  if (
    stream === "tool" &&
    stringFromRecord(data, "phase") === "start" &&
    stringFromRecord(data, "name") === "task" &&
    stringFromRecord(data, "requestedAgentId") === "execution-validation-scout" &&
    !tracker.before_validation_scout
  ) {
    return "before_validation_scout";
  }
  if (
    stream === "node-agent" &&
    data.eventType === "node_agent_native_task_result" &&
    stringFromRecord(data, "requestedAgentId") === "execution-validation-scout" &&
    !tracker.after_validation_result
  ) {
    return "after_validation_result";
  }
  if (
    stream === "tool" &&
    stringFromRecord(data, "phase") === "start" &&
    stringFromRecord(data, "name") === "node_finish" &&
    !tracker.before_node_finish
  ) {
    return "before_node_finish";
  }
  return null;
}

function appendNodeAgentPreemptiveCheckpoint(params: {
  stream: string;
  data: Record<string, unknown>;
  reason: NodeAgentPreemptiveCheckpointReason;
  tracker: NodeAgentPreemptiveCheckpointTracker;
  sessionManager: ReturnType<typeof guardSessionManager>;
  nodeAgentSessionTraceEvents: Record<string, unknown>[];
  sessionKey: string;
  sessionId: string;
  sessionFile: string;
  runId: string;
  agentId: string;
  contextTokenBudget: number;
  config: EmbeddedRunAttemptParams["config"];
}) {
  if (params.tracker[params.reason]) {
    return;
  }
  params.tracker[params.reason] = true;
  const toolResultMaxChars = resolveLiveToolResultMaxChars({
    contextWindowTokens: params.contextTokenBudget,
    cfg: params.config,
    agentId: params.agentId,
  });
  const truncationResult = truncateOversizedToolResultsInSessionManager({
    sessionManager: params.sessionManager,
    contextWindowTokens: params.contextTokenBudget,
    maxCharsOverride: toolResultMaxChars,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    stateRoot: resolveStateDir(process.env),
  });
  const event = {
    eventType: PREEMPTIVE_CHECKPOINT_EVENT_TYPE,
    reason: params.reason,
    sessionKey: params.sessionKey,
    runId: params.runId,
    agentId: params.agentId,
    boundaryStream: params.stream,
    toolName: stringFromRecord(params.data, "toolName") ?? stringFromRecord(params.data, "name"),
    requestedAgentId: stringFromRecord(params.data, "requestedAgentId") ?? null,
    toolCallId: stringFromRecord(params.data, "toolCallId") ?? null,
    toolResultRef: stringFromRecord(params.data, "toolResultRef") ?? null,
    taskRef: stringFromRecord(params.data, "taskRef") ?? null,
    validationEvidenceRef: stringFromRecord(params.data, "validationEvidenceRef") ?? null,
    workingContextEntryRef: stringFromRecord(params.data, "workingContextEntryRef") ?? null,
    changeSetWorkingContextEntryRef:
      stringFromRecord(params.data, "changeSetWorkingContextEntryRef") ?? null,
    managedOutputRef: stringFromRecord(params.data, "managedOutputRef") ?? null,
    checkpointPreserves: [
      "node_objective",
      "changed_files",
      "validation_refs",
      "working_context_refs",
      "managed_output_refs",
      "latest_todo_state",
      "source_windows",
    ],
    truncationAttempted: true,
    truncated: truncationResult.truncated,
    truncatedCount: truncationResult.truncatedCount ?? 0,
    truncationReason: truncationResult.reason ?? null,
    recordedAtMs: Date.now(),
  };
  try {
    params.sessionManager.appendCustomEntry(PREEMPTIVE_CHECKPOINT_CUSTOM_TYPE, event);
  } catch (error) {
    log.warn(`node-agent preemptive checkpoint append failed: ${String(error)}`);
  }
  params.nodeAgentSessionTraceEvents.push(event);
}

function toContextPressureBreakdown(
  breakdown: ReturnType<typeof estimateProviderVisibleContextBreakdown>,
): ContextBreakdownSnapshot {
  return {
    sourceOrLocatorChars: breakdown.likelySourceOrLocatorChars,
    nonSourceVisibleChars: breakdown.nonSourceVisibleChars,
    strippedDetailsChars: breakdown.strippedToolDetailsChars,
  };
}

function buildProviderTurnOptics(params: {
  messages: readonly AgentMessage[];
  tools: readonly { name?: string | null; description?: string | null; parameters?: unknown }[];
  agentId: string;
  sessionKey: string;
  runId: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}): Record<string, unknown> {
  const providerVisibleTools = params.tools
    .map((tool) => tool.name?.trim())
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  const mutatingTools = providerVisibleTools.filter((toolName) =>
    PROVIDER_TURN_OPTICS_MUTATING_TOOL_NAMES.has(toolName),
  );
  const toolResultIds = toolResultIdsFromMessages(params.messages);
  const turns = params.messages.flatMap((message, index) => {
    if ((message as { role?: unknown }).role !== "assistant") {
      return [];
    }
    const toolCalls = extractAssistantToolCallBlocks(message);
    const matchingToolResultIds = toolCalls
      .map((call) => call.id)
      .filter((id) => toolResultIds.has(id));
    const missingToolResultIds = toolCalls
      .map((call) => call.id)
      .filter((id) => !toolResultIds.has(id));
    return [
      {
        messageIndex: index,
        stopReason:
          typeof (message as { stopReason?: unknown }).stopReason === "string"
            ? (message as { stopReason: string }).stopReason
            : null,
        hasNewToolCalls: toolCalls.length > 0,
        toolCalls,
        matchingToolResultIds,
        missingToolResultIds,
      },
    ];
  });
  const toolCallCounts = turns.map((turn) =>
    Array.isArray(turn.toolCalls) ? turn.toolCalls.length : 0,
  );
  const assistantTextTurns = params.messages.flatMap((message, index) => {
    if ((message as { role?: unknown }).role !== "assistant") {
      return [];
    }
    const text = extractAssistantTextBlocks(message).join("\n");
    if (!text.trim()) {
      return [];
    }
    const looksLikePatchHypothesis =
      /\bpatch hypothesis\b/iu.test(text) ||
      (/\btarget files?\b/iu.test(text) &&
        /\bpatch shape\b/iu.test(text) &&
        /\bvalidation signal\b/iu.test(text));
    return [
      {
        messageIndex: index,
        textByteCount: Buffer.byteLength(text, "utf8"),
        looksLikePatchHypothesis,
      },
    ];
  });
  const firstToolCallMessageIndex =
    turns.find((turn) => turn.hasNewToolCalls)?.messageIndex ?? null;
  const firstPatchHypothesisTextTurn = assistantTextTurns.find(
    (turn) => turn.looksLikePatchHypothesis,
  );
  const firstPatchHypothesisBeforeToolCall =
    firstPatchHypothesisTextTurn &&
    (firstToolCallMessageIndex === null ||
      firstPatchHypothesisTextTurn.messageIndex < firstToolCallMessageIndex);
  const totalToolCalls = toolCallCounts.reduce((sum, count) => sum + count, 0);
  const toolCallTurnCount = toolCallCounts.filter((count) => count > 0).length;
  const parallelToolCallTurns = toolCallCounts.filter((count) => count > 1).length;
  const serialAcquisitionTurns = turns.filter((turn) => {
    const toolCalls = Array.isArray(turn.toolCalls) ? turn.toolCalls : [];
    const toolName = (toolCalls[0] as { name?: unknown } | undefined)?.name;
    return (
      toolCalls.length === 1 &&
      PROVIDER_TURN_OPTICS_ACQUISITION_TOOL_NAMES.has(
        typeof toolName === "string" ? (normalizeOptionalLowercaseString(toolName) ?? "") : "",
      )
    );
  }).length;
  return {
    eventType: PROVIDER_TURN_OPTICS_EVENT_TYPE,
    sessionKey: params.sessionKey,
    runId: params.runId,
    agentId: params.agentId,
    provider: params.provider ?? null,
    model: params.model ?? null,
    thinkingLevel: params.thinkingLevel ?? null,
    providerVisibleTools,
    providerVisibleToolsSorted: [...providerVisibleTools].toSorted((a, b) => a.localeCompare(b)),
    mutatingTools,
    applyPatchVisible: providerVisibleTools.includes("apply_patch"),
    toolCatalogSummary: buildSessionLaunchToolCatalogSummary(params.tools),
    turns,
    patchHypothesisObserved: Boolean(firstPatchHypothesisTextTurn),
    firstPatchHypothesisBeforeToolCallObserved: Boolean(firstPatchHypothesisBeforeToolCall),
    firstPatchHypothesisMessageIndex: firstPatchHypothesisTextTurn?.messageIndex ?? null,
    firstPatchHypothesisTextByteCount: firstPatchHypothesisTextTurn?.textByteCount ?? null,
    toolResultIds: Array.from(toolResultIds).toSorted((a, b) => a.localeCompare(b)),
    toolCallIdLinkageOk: turns.every((turn) => {
      const missing = (turn as { missingToolResultIds?: unknown }).missingToolResultIds;
      return Array.isArray(missing) && missing.length === 0;
    }),
    parallelToolCallTurns,
    averageToolCallsPerTurn: toolCallTurnCount > 0 ? totalToolCalls / toolCallTurnCount : 0,
    serialAcquisitionTurns,
  };
}

function extractAssistantTextBlocks(message: AgentMessage): string[] {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim() ? [content] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const texts: string[] = [];
  for (const block of content) {
    const record = recordFromUnknown(block);
    if (!record) {
      continue;
    }
    const type = stringFromRecord(record, "type");
    if (type !== "text" && type !== "output_text") {
      continue;
    }
    const text = stringFromRecord(record, "text");
    if (text) {
      texts.push(text);
    }
  }
  return texts;
}

function looksLikeJsonToolCallText(text: string): boolean {
  if (!/[{[]/u.test(text)) {
    return false;
  }
  return /["'](?:tool_calls?|tool_use|function_call|name|arguments|input)["']\s*:/iu.test(text);
}

function providerResponseDiagnosticsFromAssistant(
  message: AgentMessage,
): Record<string, unknown> | undefined {
  return recordFromUnknown(
    (message as { providerResponseDiagnostics?: unknown }).providerResponseDiagnostics,
  );
}

function buildProviderResponseNormalizationReceipt(params: {
  messages: readonly AgentMessage[];
  agentId: string;
  sessionKey: string;
  runId: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}): Record<string, unknown> {
  const toolResultIds = toolResultIdsFromMessages(params.messages);
  const assistantTurns = params.messages.flatMap((message, index) => {
    if ((message as { role?: unknown }).role !== "assistant") {
      return [];
    }
    const toolCalls = extractAssistantToolCallBlocks(message);
    const textBlocks = extractAssistantTextBlocks(message);
    const jsonLookingTextBlocks = textBlocks.filter(looksLikeJsonToolCallText);
    const providerDiagnostics = providerResponseDiagnosticsFromAssistant(message);
    const stopReason =
      typeof (message as { stopReason?: unknown }).stopReason === "string"
        ? (message as { stopReason: string }).stopReason
        : null;
    const matchingToolResultIds = toolCalls
      .map((call) => call.id)
      .filter((id) => toolResultIds.has(id));
    const missingToolResultIds = toolCalls
      .map((call) => call.id)
      .filter((id) => !toolResultIds.has(id));
    return [
      {
        messageIndex: index,
        normalizedStopReason: stopReason,
        normalizedToolCallCount: toolCalls.length,
        toolCallIds: toolCalls.map((call) => call.id),
        toolNames: toolCalls.map((call) => call.name),
        textBlockCount: textBlocks.length,
        textByteCount: Buffer.byteLength(textBlocks.join("\n"), "utf8"),
        hasTextAndToolCalls: textBlocks.length > 0 && toolCalls.length > 0,
        jsonLookingToolCallTextCount: jsonLookingTextBlocks.length,
        jsonLookingToolCallTextHashes: jsonLookingTextBlocks.map(stableAttemptTextHash),
        rawFinishReason: stringFromRecord(providerDiagnostics, "rawFinishReason") ?? null,
        rawToolCallChunkCount:
          numberFromRecord(providerDiagnostics, "rawToolCallChunkCount") ?? null,
        rawReasoningFieldPresent:
          booleanFromRecord(providerDiagnostics, "rawReasoningFieldPresent") ?? false,
        matchingToolResultIds,
        missingToolResultIds,
      },
    ];
  });
  const normalizedToolCallCount = assistantTurns.reduce(
    (sum, turn) => sum + turn.normalizedToolCallCount,
    0,
  );
  const stopReasonToolUseWithoutToolCalls = assistantTurns.filter(
    (turn) => turn.normalizedStopReason === "toolUse" && turn.normalizedToolCallCount === 0,
  ).length;
  const stopReasonStopWithToolCalls = assistantTurns.filter(
    (turn) => turn.normalizedStopReason === "stop" && turn.normalizedToolCallCount > 0,
  ).length;
  const missingToolResultIds = assistantTurns.flatMap((turn) => turn.missingToolResultIds);
  const rawTurns = assistantTurns.filter(
    (turn) => turn.rawFinishReason !== null || turn.rawToolCallChunkCount !== null,
  );
  const rawToolCallChunkCount = rawTurns.reduce(
    (sum, turn) => sum + (turn.rawToolCallChunkCount ?? 0),
    0,
  );
  return {
    eventType: PROVIDER_RESPONSE_NORMALIZATION_EVENT_TYPE,
    sessionKey: params.sessionKey,
    runId: params.runId,
    agentId: params.agentId,
    provider: params.provider ?? null,
    model: params.model ?? null,
    thinkingLevel: params.thinkingLevel ?? null,
    rawTransportCaptured: rawTurns.length > 0,
    rawFinishReason: rawTurns[rawTurns.length - 1]?.rawFinishReason ?? null,
    rawToolCallChunkCount: rawTurns.length > 0 ? rawToolCallChunkCount : null,
    rawReasoningFieldCaptured: assistantTurns.some((turn) => turn.rawReasoningFieldPresent),
    rawResponseStored: false,
    normalizedAssistantTurnCount: assistantTurns.length,
    normalizedToolCallCount,
    normalizedToolCallIds: assistantTurns.flatMap((turn) => turn.toolCallIds),
    normalizedToolNames: assistantTurns.flatMap((turn) => turn.toolNames),
    normalizedStopReasons: assistantTurns.map((turn) => turn.normalizedStopReason),
    stopReasonToolUseWithoutToolCalls,
    stopReasonStopWithToolCalls,
    finalTextAndToolCallsCoexisted: assistantTurns.some((turn) => turn.hasTextAndToolCalls),
    jsonLookingToolCallTextCount: assistantTurns.reduce(
      (sum, turn) => sum + turn.jsonLookingToolCallTextCount,
      0,
    ),
    toolResultIds: Array.from(toolResultIds).toSorted((a, b) => a.localeCompare(b)),
    missingToolResultIds,
    toolCallIdLinkageOk: missingToolResultIds.length === 0,
    turns: assistantTurns,
    recordedAtMs: Date.now(),
  };
}

function nativeTaskTraceEvents(
  events: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.filter((event) => event.eventType === "node_agent_native_task_result").slice(-20);
}

function nativeTaskContextPreservationEvents(
  events: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return events
    .filter(
      (event) => event.eventType === "node_agent_native_task_result_context_preservation_blocked",
    )
    .slice(-20);
}

function nodeAgentToolResultEvents(
  events: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.filter((event) => event.eventType === "node_agent_tool_result").slice(-80);
}

function findFirstToolResultEvent(
  events: readonly Record<string, unknown>[],
  predicate: (event: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  return events.find((event) => event.eventType === "node_agent_tool_result" && predicate(event));
}

function findFirstParentActionEventAfter(
  events: readonly Record<string, unknown>[],
  anchor: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const anchorIndex = anchor ? events.indexOf(anchor) : -1;
  if (anchorIndex < 0) {
    return undefined;
  }
  return events.slice(anchorIndex + 1).find((event) => {
    if (event.eventType === "node_agent_tool_result") {
      return isPostChildParentActionEvent(event);
    }
    return event.eventType === "node_agent_native_task_result";
  });
}

function findFirstParentTodoDecisionEventAfter(
  events: readonly Record<string, unknown>[],
  anchor: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const anchorIndex = anchor ? events.indexOf(anchor) : -1;
  if (anchorIndex < 0) {
    return undefined;
  }
  return events.slice(anchorIndex + 1).find((event) => {
    return (
      event.eventType === "node_agent_tool_result" &&
      stringFromRecord(event, "toolName") === "update_plan"
    );
  });
}

function findFirstParentNextActionEventAfter(
  events: readonly Record<string, unknown>[],
  anchor: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const anchorIndex = anchor ? events.indexOf(anchor) : -1;
  if (anchorIndex < 0) {
    return undefined;
  }
  return events.slice(anchorIndex + 1).find((event) => {
    if (event.eventType === "node_agent_native_task_result") {
      return true;
    }
    if (event.eventType !== "node_agent_tool_result") {
      return false;
    }
    const toolName = stringFromRecord(event, "toolName");
    return (
      toolName === "edit" ||
      toolName === "write" ||
      toolName === "apply_patch" ||
      toolName === "node_finish" ||
      booleanFromRecord(event, "mutatingAction") === true
    );
  });
}

function findFirstParentEditEventAfter(
  events: readonly Record<string, unknown>[],
  anchor: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const anchorIndex = anchor ? events.indexOf(anchor) : -1;
  if (anchorIndex < 0) {
    return undefined;
  }
  return events.slice(anchorIndex + 1).find((event) => {
    return (
      event.eventType === "node_agent_tool_result" &&
      !isReplayCompactedToolEvent(event) &&
      isParentToolEvent(event) &&
      isEditToolEvent(event)
    );
  });
}

function isPostChildParentActionEvent(event: Record<string, unknown>): boolean {
  const toolName = stringFromRecord(event, "toolName");
  return (
    toolName === "update_plan" ||
    toolName === "edit" ||
    toolName === "write" ||
    toolName === "apply_patch" ||
    toolName === "node_finish" ||
    booleanFromRecord(event, "mutatingAction") === true
  );
}

function parentActionRefFromEvent(event: Record<string, unknown> | undefined): string | null {
  if (!event) {
    return null;
  }
  if (event.eventType === "node_agent_native_task_result") {
    return stringFromRecord(event, "taskRef") ?? null;
  }
  return stringFromRecord(event, "toolResultRef") ?? null;
}

function parentActionToolNameFromEvent(event: Record<string, unknown> | undefined): string | null {
  if (!event) {
    return null;
  }
  if (event.eventType === "node_agent_native_task_result") {
    return "task";
  }
  return stringFromRecord(event, "toolName") ?? null;
}

function isScoutAgentId(agentId: string | undefined): boolean {
  return agentId === "execution-context-scout" || agentId === "execution-validation-scout";
}

function nodeAgentToolEventsForAgent(
  events: readonly Record<string, unknown>[],
  agentId: string,
): Record<string, unknown>[] {
  return events.filter(
    (event) =>
      event.eventType === "node_agent_tool_result" &&
      stringFromRecord(event, "agentId") === agentId,
  );
}

function compactToolEvent(event: Record<string, unknown>): Record<string, unknown> {
  const toolName = stringFromRecord(event, "toolName") ?? "unknown";
  return {
    toolName,
    toolResultRef: stringFromRecord(event, "toolResultRef") ?? null,
    status: stringFromRecord(event, "status") ?? null,
    ...(stringFromRecord(event, "readPath")
      ? { readPath: stringFromRecord(event, "readPath") }
      : {}),
    ...(numberFromRecord(event, "readOffset") !== undefined
      ? { readOffset: numberFromRecord(event, "readOffset") }
      : {}),
    ...(numberFromRecord(event, "readLimit") !== undefined
      ? { readLimit: numberFromRecord(event, "readLimit") }
      : {}),
    ...(stringFromRecord(event, "grepQuery")
      ? { grepQuery: stringFromRecord(event, "grepQuery") }
      : {}),
    ...(stringFromRecord(event, "grepPath")
      ? { grepPath: stringFromRecord(event, "grepPath") }
      : {}),
    ...(stringFromRecord(event, "grepGlob")
      ? { grepGlob: stringFromRecord(event, "grepGlob") }
      : {}),
    ...(stringFromRecord(event, "globPattern")
      ? { globPattern: stringFromRecord(event, "globPattern") }
      : {}),
    ...(stringFromRecord(event, "listPath")
      ? { listPath: stringFromRecord(event, "listPath") }
      : {}),
  };
}

function buildToolCallCountsByType(
  events: readonly Record<string, unknown>[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const toolName = stringFromRecord(event, "toolName") ?? "unknown";
    counts[toolName] = (counts[toolName] ?? 0) + 1;
  }
  return counts;
}

function buildScoutToolDiagnostics(events: readonly Record<string, unknown>[]) {
  const toolNames = events.map((event) => stringFromRecord(event, "toolName") ?? "unknown");
  const readEvents = events.filter((event) => stringFromRecord(event, "toolName") === "read");
  const rawTopOfFileReadCount = readEvents.filter((event) => {
    const offset = numberFromRecord(event, "readOffset");
    return offset === undefined || offset <= 1;
  }).length;
  return {
    toolCallCount: events.length,
    toolCallCountsByType: buildToolCallCountsByType(events),
    firstToolCalls: events.slice(0, 10).map(compactToolEvent),
    readCallCount: readEvents.length,
    grepCallCount: events.filter((event) => stringFromRecord(event, "toolName") === "grep").length,
    startedWithRead: toolNames[0] === "read",
    rawTopOfFileReadCount,
  };
}

function buildParentToolSequence(events: readonly Record<string, unknown>[]) {
  return events
    .filter((event) => {
      if (event.eventType !== "node_agent_tool_result") {
        return false;
      }
      return !isScoutAgentId(stringFromRecord(event, "agentId"));
    })
    .slice(0, 40)
    .map(compactToolEvent);
}

function buildNativeTaskSummaries(events: readonly Record<string, unknown>[]) {
  return events.map((event) => ({
    taskRef: stringFromRecord(event, "taskRef") ?? null,
    requestedAgentId: stringFromRecord(event, "requestedAgentId") ?? null,
    childSessionKey: stringFromRecord(event, "childSessionKey") ?? null,
    childRunId: stringFromRecord(event, "childRunId") ?? null,
    childProvider: stringFromRecord(event, "childProvider") ?? null,
    childModel: stringFromRecord(event, "childModel") ?? null,
    status: stringFromRecord(event, "status") ?? null,
    resultDeliveryStatus: stringFromRecord(event, "resultDeliveryStatus") ?? null,
    childProgressOutcome: stringFromRecord(event, "childProgressOutcome") ?? null,
    resultDeliveredToParentContext:
      booleanFromRecord(event, "resultDeliveredToParentContext") ?? false,
  }));
}

const PARENT_SOURCE_NAVIGATION_TOOL_NAMES = new Set(["read", "grep", "glob"]);
const SOURCE_ACTIVITY_TODO_VERBS =
  /\b(read|inspect|search|understand|map|gather|explore|investigate|review)\b/iu;
const SOURCE_ACTIVITY_TODO_NOUNS =
  /\b(source|context|file|files|caller|callers|code|integration|substrate|architecture|read\s+model|event\s+store|repository|surface)\b/iu;

function isParentToolEvent(event: Record<string, unknown>): boolean {
  return !isScoutAgentId(stringFromRecord(event, "agentId"));
}

function isSourceNavigationToolEvent(event: Record<string, unknown>): boolean {
  const toolName = stringFromRecord(event, "toolName");
  return Boolean(toolName && PARENT_SOURCE_NAVIGATION_TOOL_NAMES.has(toolName));
}

function isEditToolEvent(event: Record<string, unknown>): boolean {
  const toolName = stringFromRecord(event, "toolName");
  return (
    toolName === "edit" ||
    toolName === "write" ||
    toolName === "apply_patch" ||
    stringFromRecord(event, "changeSetWorkingContextEntryRef") != null
  );
}

function isReplayCompactedToolEvent(event: Record<string, unknown>): boolean {
  return (
    event.eventType === "node_agent_tool_result" &&
    booleanFromRecord(event, "replayCompacted") === true
  );
}

function isSourceActivityTodo(content: string | null): boolean {
  if (!content) {
    return false;
  }
  return SOURCE_ACTIVITY_TODO_VERBS.test(content) && SOURCE_ACTIVITY_TODO_NOUNS.test(content);
}

function buildPathOnlyReadAfterContinuationHintDiagnostics(
  events: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const continuationByPath = new Map<string, Record<string, unknown>>();
  const pathOnlyRepeats: Record<string, unknown>[] = [];
  for (const event of events) {
    if (stringFromRecord(event, "toolName") !== "read" || !isParentToolEvent(event)) {
      continue;
    }
    const readPath = stringFromRecord(event, "readPath");
    if (!readPath) {
      continue;
    }
    const readOffset = numberFromRecord(event, "readOffset");
    const priorContinuation = continuationByPath.get(readPath);
    if (priorContinuation && readOffset === undefined) {
      pathOnlyRepeats.push({
        toolResultRef: stringFromRecord(event, "toolResultRef") ?? null,
        readPath,
        expectedOffset: numberFromRecord(priorContinuation, "readNextOffset") ?? null,
        priorToolResultRef: stringFromRecord(priorContinuation, "toolResultRef") ?? null,
      });
    }
    const readNextOffset = numberFromRecord(event, "readNextOffset");
    if (readNextOffset !== undefined) {
      continuationByPath.set(readPath, event);
    }
  }
  return {
    pathOnlyReadAfterContinuationHintObserved: pathOnlyRepeats.length > 0,
    pathOnlyReadAfterContinuationHintCount: pathOnlyRepeats.length,
    pathOnlyReadAfterContinuationHintRefs: pathOnlyRepeats.slice(0, 8),
  };
}

function buildEditTransitionDiagnostics(params: {
  toolEvents: readonly Record<string, unknown>[];
  firstPlanUpdateEvent?: Record<string, unknown>;
  firstEditEvent?: Record<string, unknown>;
  firstLspEvent?: Record<string, unknown>;
  validationEvent?: Record<string, unknown>;
  repairEditAfterValidationEvent?: Record<string, unknown>;
  replayCompactedToolCallCount?: number;
  providerRequestDiagnostics?: readonly Record<string, unknown>[];
}): Record<string, unknown> {
  const parentToolEvents = params.toolEvents.filter(isParentToolEvent);
  const firstEditIndex = params.firstEditEvent
    ? parentToolEvents.indexOf(params.firstEditEvent)
    : -1;
  const beforeFirstEditEvents =
    firstEditIndex >= 0 ? parentToolEvents.slice(0, firstEditIndex) : parentToolEvents;
  const beforeFirstEditSourceEvents = beforeFirstEditEvents.filter(isSourceNavigationToolEvent);
  const sourceNavigationReminderEvent = params.toolEvents.find(
    (event) => booleanFromRecord(event, "sourceNavigationReminderShown") === true,
  );
  const firstTodoActiveItem =
    stringFromRecord(params.firstPlanUpdateEvent, "todoActiveItem") ?? null;
  const firstProviderRequest = params.providerRequestDiagnostics?.[0];
  const modelActivationAtMs = numberFromRecord(firstProviderRequest, "recordedAtMs") ?? null;
  const firstEditCompletedAtMs = numberFromRecord(params.firstEditEvent, "completedAtMs") ?? null;
  const firstLspCompletedAtMs = numberFromRecord(params.firstLspEvent, "completedAtMs") ?? null;
  const validationDelegationCompletedAtMs =
    numberFromRecord(params.validationEvent, "completedAtMs") ?? null;
  const repairEditAfterValidationCompletedAtMs =
    numberFromRecord(params.repairEditAfterValidationEvent, "completedAtMs") ?? null;
  const firstEditAfterModelActivationMs =
    modelActivationAtMs !== null &&
    firstEditCompletedAtMs !== null &&
    firstEditCompletedAtMs >= modelActivationAtMs
      ? firstEditCompletedAtMs - modelActivationAtMs
      : null;
  const firstLspAfterModelActivationMs =
    modelActivationAtMs !== null &&
    firstLspCompletedAtMs !== null &&
    firstLspCompletedAtMs >= modelActivationAtMs
      ? firstLspCompletedAtMs - modelActivationAtMs
      : null;
  const validationDelegationAfterModelActivationMs =
    modelActivationAtMs !== null &&
    validationDelegationCompletedAtMs !== null &&
    validationDelegationCompletedAtMs >= modelActivationAtMs
      ? validationDelegationCompletedAtMs - modelActivationAtMs
      : null;
  const repairEditAfterValidationMs =
    validationDelegationCompletedAtMs !== null &&
    repairEditAfterValidationCompletedAtMs !== null &&
    repairEditAfterValidationCompletedAtMs >= validationDelegationCompletedAtMs
      ? repairEditAfterValidationCompletedAtMs - validationDelegationCompletedAtMs
      : null;
  const liveToolCallCountsByType = buildToolCallCountsByType(params.toolEvents);
  const firstTodoShape = params.firstPlanUpdateEvent
    ? {
        ref:
          stringFromRecord(params.firstPlanUpdateEvent, "todoRef") ??
          stringFromRecord(params.firstPlanUpdateEvent, "toolResultRef") ??
          null,
        activeItem: firstTodoActiveItem,
        itemCount: numberFromRecord(params.firstPlanUpdateEvent, "todoItemCount") ?? null,
        completedCount: numberFromRecord(params.firstPlanUpdateEvent, "todoCompletedCount") ?? null,
        inProgressCount:
          numberFromRecord(params.firstPlanUpdateEvent, "todoInProgressCount") ?? null,
        activeItemLooksLikeSourceLookup: isSourceActivityTodo(firstTodoActiveItem),
      }
    : null;
  return {
    firstEditObserved: firstEditIndex >= 0,
    modelActivationAtMs,
    firstLspObserved: Boolean(params.firstLspEvent),
    firstLspRef: stringFromRecord(params.firstLspEvent, "toolResultRef") ?? null,
    firstLspCompletedAtMs,
    firstLspAfterModelActivationMs,
    firstEditCompletedAtMs,
    firstEditAfterModelActivationMs,
    liveToolCallCount: params.toolEvents.length,
    liveToolCallCountsByType,
    liveReadCallCount: liveToolCallCountsByType.read ?? 0,
    liveGrepCallCount: liveToolCallCountsByType.grep ?? 0,
    liveEditCallCount:
      (liveToolCallCountsByType.edit ?? 0) +
      (liveToolCallCountsByType.write ?? 0) +
      (liveToolCallCountsByType.apply_patch ?? 0),
    replayCompactedToolCallCount: params.replayCompactedToolCallCount ?? 0,
    toolCountBeforeFirstEdit: beforeFirstEditEvents.length,
    sourceToolCountBeforeFirstEdit: beforeFirstEditSourceEvents.length,
    validationDelegationRef: stringFromRecord(params.validationEvent, "taskRef") ?? null,
    validationDelegationCompletedAtMs,
    validationDelegationAfterModelActivationMs,
    repairEditAfterValidationObserved: Boolean(params.repairEditAfterValidationEvent),
    repairEditAfterValidationRef:
      stringFromRecord(params.repairEditAfterValidationEvent, "toolResultRef") ?? null,
    repairEditAfterValidationCompletedAtMs,
    repairEditAfterValidationMs,
    firstTodoShape,
    firstTodoLooksLikeSourceLookup: isSourceActivityTodo(firstTodoActiveItem),
    activeTodoStillSourceLookupAfterRepeatedSourceCalls:
      isSourceActivityTodo(firstTodoActiveItem) && beforeFirstEditSourceEvents.length >= 6,
    sourceNavigationReminderObserved: Boolean(sourceNavigationReminderEvent),
    sourceNavigationReminderRef:
      stringFromRecord(sourceNavigationReminderEvent, "toolResultRef") ?? null,
    sourceNavigationReminderSourceToolCount:
      numberFromRecord(sourceNavigationReminderEvent, "sourceNavigationCountSinceEdit") ?? null,
    ...buildPathOnlyReadAfterContinuationHintDiagnostics(parentToolEvents),
  };
}

function stableAttemptTextHash(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : stableToolCatalogValue(value);
  return createHash("sha256").update(text).digest("hex");
}

function requiredSourceIdForWorkspaceFile(params: {
  agentId: string;
  name: string;
  filePath: string;
}): string {
  const normalizedPath = params.filePath.replace(/\\/gu, "/");
  const agentRuntimeMarker = `/docs/agents/${params.agentId}/runtime/`;
  const runtimeIndex = normalizedPath.indexOf(agentRuntimeMarker);
  if (runtimeIndex >= 0) {
    const docName = normalizedPath.slice(runtimeIndex + agentRuntimeMarker.length).split("/")[0];
    if (docName) {
      return `agent://${params.agentId}/doc/${docName}`;
    }
  }
  return `workspace://${params.name || normalizedPath}`;
}

function requiredSourceIdForSkill(params: { name: string; sourceRef?: string }): string {
  const sourceRef = params.sourceRef?.trim();
  if (sourceRef) {
    return sourceRef;
  }
  return `skill://${params.name}/SKILL.md`;
}

function launchRequiredSourcesFromSystemPromptReport(params: {
  agentId: string;
  report: SessionSystemPromptReport;
}) {
  return [
    ...params.report.injectedWorkspaceFiles.map((file) => ({
      id: requiredSourceIdForWorkspaceFile({
        agentId: params.agentId,
        name: file.name,
        filePath: file.path,
      }),
      bytes: file.injectedChars,
      truncated: file.truncated,
    })),
    ...params.report.skills.entries.map((skill) => ({
      id: requiredSourceIdForSkill({ name: skill.name, sourceRef: skill.sourceRef }),
      bytes: skill.blockChars,
      truncated: false,
      ...(skill.sourceHash ? { hash: skill.sourceHash } : {}),
    })),
  ];
}

export function buildNodeAgentSessionTraceFromEvents(
  events: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
  type ChildBootstrapAdmissionTrace = Record<string, unknown> & {
    requestedAgentId: string;
    childSessionKey: string | null;
  };
  type ChildStartFailureTrace = {
    requestedAgentId: string;
    childSessionKey: string | null;
    taskRef: string | null;
    status: string | null;
    childStartFailureKind: string;
    error: string | null;
  };
  const taskEvents = nativeTaskTraceEvents(events);
  const toolEvents = nodeAgentToolResultEvents(events);
  const contextPreservationEvents = nativeTaskContextPreservationEvents(events);
  const launchEvent = events.find((event) => event.eventType === "session_launch");
  const providerTurnOptics = events.find(
    (event) => event.eventType === PROVIDER_TURN_OPTICS_EVENT_TYPE,
  );
  const providerResponseNormalizationReceipt = events.find(
    (event) => event.eventType === PROVIDER_RESPONSE_NORMALIZATION_EVENT_TYPE,
  );
  const providerWaitLockHandoffEvents = events.filter(
    (event) => event.eventType === PROVIDER_WAIT_LOCK_HANDOFF_EVENT_TYPE,
  );
  const preemptiveCheckpointEvents = events.filter(
    (event) => event.eventType === PREEMPTIVE_CHECKPOINT_EVENT_TYPE,
  );
  const providerRequestDiagnostics = events.filter(
    (event) => event.eventType === PROVIDER_REQUEST_DIAGNOSTICS_EVENT_TYPE,
  );
  const latestProviderRequestDiagnostics =
    providerRequestDiagnostics[providerRequestDiagnostics.length - 1];
  if (
    taskEvents.length === 0 &&
    toolEvents.length === 0 &&
    contextPreservationEvents.length === 0 &&
    !launchEvent &&
    providerWaitLockHandoffEvents.length === 0 &&
    preemptiveCheckpointEvents.length === 0 &&
    providerRequestDiagnostics.length === 0 &&
    !providerResponseNormalizationReceipt
  ) {
    return undefined;
  }
  const contextEvent = taskEvents.find(
    (event) => stringFromRecord(event, "requestedAgentId") === "execution-context-scout",
  );
  const validationEvent = taskEvents.find(
    (event) => stringFromRecord(event, "requestedAgentId") === "execution-validation-scout",
  );
  const firstEvent = contextEvent ?? taskEvents[0];
  const contextScoutToolEvents = nodeAgentToolEventsForAgent(events, "execution-context-scout");
  const validationScoutToolEvents = nodeAgentToolEventsForAgent(
    events,
    "execution-validation-scout",
  );
  const contextScoutToolDiagnostics = buildScoutToolDiagnostics(contextScoutToolEvents);
  const validationScoutToolDiagnostics = buildScoutToolDiagnostics(validationScoutToolEvents);
  const contextScoutHasSymbolWindows =
    booleanFromRecord(contextEvent, "workingContextHasSymbolWindows") === true;
  const contextScoutHasMissingWindows =
    booleanFromRecord(contextEvent, "workingContextHasMissingWindows") === true;
  const validationScoutHasSymbolWindows =
    booleanFromRecord(validationEvent, "workingContextHasSymbolWindows") === true;
  const validationScoutHasMissingWindows =
    booleanFromRecord(validationEvent, "workingContextHasMissingWindows") === true;
  const childBootstrapAdmissions = taskEvents
    .map<ChildBootstrapAdmissionTrace | null>((event) => {
      const admission = recordFromUnknown(event.childBootstrapAdmission);
      if (!admission) {
        return null;
      }
      return {
        requestedAgentId: stringFromRecord(event, "requestedAgentId") ?? "unknown",
        childSessionKey: stringFromRecord(event, "childSessionKey") ?? null,
        ...admission,
      };
    })
    .filter((entry): entry is ChildBootstrapAdmissionTrace => entry !== null);
  const childStartFailures = taskEvents
    .map<ChildStartFailureTrace | null>((event) => {
      const childStartFailureKind = stringFromRecord(event, "childStartFailureKind");
      if (!childStartFailureKind) {
        return null;
      }
      return {
        requestedAgentId: stringFromRecord(event, "requestedAgentId") ?? "unknown",
        childSessionKey: stringFromRecord(event, "childSessionKey") ?? null,
        taskRef: stringFromRecord(event, "taskRef") ?? null,
        status: stringFromRecord(event, "status") ?? null,
        childStartFailureKind,
        error: stringFromRecord(event, "error") ?? null,
      };
    })
    .filter((entry): entry is ChildStartFailureTrace => entry !== null);
  const childResultObserved =
    booleanFromRecord(contextEvent, "resultDeliveredToParentContext") === true ||
    booleanFromRecord(validationEvent, "resultDeliveredToParentContext") === true ||
    taskEvents.some((event) => booleanFromRecord(event, "resultDeliveredToParentContext") === true);
  const childResultDeliveryStatus =
    stringFromRecord(contextEvent, "resultDeliveryStatus") ??
    stringFromRecord(validationEvent, "resultDeliveryStatus") ??
    taskEvents
      .map((event) => stringFromRecord(event, "resultDeliveryStatus"))
      .find((value): value is string => Boolean(value)) ??
    null;
  const childResultOversized =
    childResultDeliveryStatus === "projected" ||
    booleanFromRecord(contextEvent, "resultTruncated") === true ||
    booleanFromRecord(validationEvent, "resultTruncated") === true ||
    taskEvents.some((event) => booleanFromRecord(event, "resultTruncated") === true);
  const latestContextPreservationEvent =
    contextPreservationEvents[contextPreservationEvents.length - 1];
  const firstPlanUpdateEvent = findFirstToolResultEvent(
    events,
    (event) => stringFromRecord(event, "toolName") === "update_plan",
  );
  const terminalNodeFinishEvent = findFirstToolResultEvent(
    events,
    (event) => stringFromRecord(event, "toolName") === "node_finish",
  );
  const firstChangeSetEvent = findFirstToolResultEvent(
    events,
    (event) => stringFromRecord(event, "changeSetWorkingContextEntryRef") != null,
  );
  const firstManagedOutputEvent = findFirstToolResultEvent(
    events,
    (event) =>
      stringFromRecord(event, "managedOutputRef") != null ||
      stringFromRecord(event, "managedOutputWorkingContextEntryRef") != null,
  );
  const parentPostChildActionEvent = findFirstParentActionEventAfter(events, contextEvent);
  const parentPostValidationActionEvent = findFirstParentActionEventAfter(events, validationEvent);
  const contextTodoDecisionEvent = findFirstParentTodoDecisionEventAfter(events, contextEvent);
  const validationTodoDecisionEvent = findFirstParentTodoDecisionEventAfter(
    events,
    validationEvent,
  );
  const contextNextActionEvent = findFirstParentNextActionEventAfter(
    events,
    contextTodoDecisionEvent,
  );
  const validationNextActionEvent = findFirstParentNextActionEventAfter(
    events,
    validationTodoDecisionEvent,
  );
  const replayCompactedToolEvents = toolEvents.filter(isReplayCompactedToolEvent);
  const liveToolEvents = toolEvents.filter((event) => !isReplayCompactedToolEvent(event));
  const firstLiveEditEvent = findFirstToolResultEvent(liveToolEvents, isEditToolEvent);
  const firstLspEvent = findFirstToolResultEvent(
    liveToolEvents,
    (event) => stringFromRecord(event, "toolName") === "lsp",
  );
  const repairEditAfterValidationEvent = findFirstParentEditEventAfter(events, validationEvent);
  const editTransitionDiagnostics = buildEditTransitionDiagnostics({
    toolEvents: liveToolEvents,
    firstPlanUpdateEvent,
    firstEditEvent: firstLiveEditEvent,
    firstLspEvent,
    validationEvent,
    repairEditAfterValidationEvent,
    replayCompactedToolCallCount: replayCompactedToolEvents.length,
    providerRequestDiagnostics,
  });
  Object.assign(editTransitionDiagnostics, {
    patchHypothesisObserved:
      booleanFromRecord(providerTurnOptics, "patchHypothesisObserved") ?? false,
    firstPatchHypothesisBeforeToolCallObserved:
      booleanFromRecord(providerTurnOptics, "firstPatchHypothesisBeforeToolCallObserved") ?? false,
    firstPatchHypothesisMessageIndex:
      numberFromRecord(providerTurnOptics, "firstPatchHypothesisMessageIndex") ?? null,
    firstPatchHypothesisTextByteCount:
      numberFromRecord(providerTurnOptics, "firstPatchHypothesisTextByteCount") ?? null,
  });
  return {
    sessionLaunchEventRef: stringFromRecord(launchEvent, "sessionLaunchEventRef") ?? null,
    sessionLaunchRef: stringFromRecord(launchEvent, "sessionLaunchRef") ?? null,
    sessionLaunchStatus: stringFromRecord(launchEvent, "admissionStatus") ?? null,
    sessionLaunchBlockerKind: stringFromRecord(launchEvent, "blockerKind") ?? null,
    sessionLaunchProvider: stringFromRecord(launchEvent, "provider") ?? null,
    sessionLaunchModel: stringFromRecord(launchEvent, "model") ?? null,
    sessionLaunchCwd: stringFromRecord(launchEvent, "cwd") ?? null,
    sessionLaunchReasoningLevel: stringFromRecord(launchEvent, "reasoningLevel") ?? null,
    sessionLaunchThinkingLevel: stringFromRecord(launchEvent, "thinkingLevel") ?? null,
    sessionLaunchToolCatalogRef: stringFromRecord(launchEvent, "toolCatalogRef") ?? null,
    sessionLaunchPromptHashMatched: booleanFromRecord(launchEvent, "promptHashMatched"),
    sessionLaunchPersisted: booleanFromRecord(launchEvent, "persisted") ?? false,
    providerTurnOptics: providerTurnOptics ?? null,
    providerResponseNormalizationReceipt: providerResponseNormalizationReceipt ?? null,
    providerRequestDiagnostics: latestProviderRequestDiagnostics ?? null,
    providerRequestDiagnosticCount: providerRequestDiagnostics.length,
    providerResponseNormalizationReceiptPresent: Boolean(providerResponseNormalizationReceipt),
    providerResponseRawTransportCaptured:
      booleanFromRecord(providerResponseNormalizationReceipt, "rawTransportCaptured") ?? false,
    providerResponseRawResponseStored:
      booleanFromRecord(providerResponseNormalizationReceipt, "rawResponseStored") ?? false,
    providerResponseToolCallIdLinkageOk:
      booleanFromRecord(providerResponseNormalizationReceipt, "toolCallIdLinkageOk") ?? null,
    providerResponseStopReasonToolUseWithoutToolCalls:
      numberFromRecord(providerResponseNormalizationReceipt, "stopReasonToolUseWithoutToolCalls") ??
      0,
    providerResponseStopReasonStopWithToolCalls:
      numberFromRecord(providerResponseNormalizationReceipt, "stopReasonStopWithToolCalls") ?? 0,
    providerRequestParallelToolCalls: latestProviderRequestDiagnostics?.parallel_tool_calls ?? null,
    providerRequestReasoning: latestProviderRequestDiagnostics?.reasoning ?? null,
    providerRequestReasoningEffort: latestProviderRequestDiagnostics?.reasoning_effort ?? null,
    providerRequestIncludeReasoning: latestProviderRequestDiagnostics?.include_reasoning ?? null,
    providerWaitLockHandoffCount: providerWaitLockHandoffEvents.length,
    providerWaitLockSuspendedCount: providerWaitLockHandoffEvents.filter(
      (event) => stringFromRecord(event, "phase") === "suspended",
    ).length,
    providerWaitLockResumedCount: providerWaitLockHandoffEvents.filter(
      (event) => stringFromRecord(event, "phase") === "resumed",
    ).length,
    preemptiveCheckpointCount: preemptiveCheckpointEvents.length,
    preemptiveCheckpointReasons: preemptiveCheckpointEvents.flatMap((event) => {
      const reason = stringFromRecord(event, "reason");
      return reason ? [reason] : [];
    }),
    preemptiveCheckpointTruncatedCount: preemptiveCheckpointEvents.filter(
      (event) => booleanFromRecord(event, "truncated") === true,
    ).length,
    providerTurnMutatingTools: Array.isArray(providerTurnOptics?.mutatingTools)
      ? providerTurnOptics.mutatingTools
      : [],
    providerTurnApplyPatchVisible:
      booleanFromRecord(providerTurnOptics, "applyPatchVisible") ?? false,
    providerTurnToolCallIdLinkageOk:
      booleanFromRecord(providerTurnOptics, "toolCallIdLinkageOk") ?? null,
    parallelToolCallTurns:
      typeof providerTurnOptics?.parallelToolCallTurns === "number"
        ? providerTurnOptics.parallelToolCallTurns
        : 0,
    averageToolCallsPerTurn:
      typeof providerTurnOptics?.averageToolCallsPerTurn === "number"
        ? providerTurnOptics.averageToolCallsPerTurn
        : 0,
    serialAcquisitionTurns:
      typeof providerTurnOptics?.serialAcquisitionTurns === "number"
        ? providerTurnOptics.serialAcquisitionTurns
        : 0,
    nativeTaskResultCount: taskEvents.length,
    nodeAgentToolResultCount: toolEvents.length,
    parentToolSequence: buildParentToolSequence(toolEvents),
    editTransitionDiagnostics,
    nativeTaskSummaries: buildNativeTaskSummaries(taskEvents),
    nativeTaskRef: stringFromRecord(firstEvent, "taskRef") ?? null,
    taskRef: stringFromRecord(firstEvent, "taskRef") ?? null,
    firstPlanUpdateRef:
      stringFromRecord(firstPlanUpdateEvent, "todoRef") ??
      stringFromRecord(firstPlanUpdateEvent, "toolResultRef") ??
      null,
    scoutSpawnRef: stringFromRecord(contextEvent, "taskRef") ?? null,
    contextScoutSessionKey: stringFromRecord(contextEvent, "childSessionKey") ?? null,
    contextScoutProvider: stringFromRecord(contextEvent, "childProvider") ?? null,
    contextScoutModel: stringFromRecord(contextEvent, "childModel") ?? null,
    childSessionKeyRef: stringFromRecord(contextEvent, "childSessionKey") ?? null,
    childResultRef:
      stringFromRecord(contextEvent, "childResultRef") ??
      stringFromRecord(validationEvent, "childResultRef") ??
      null,
    workingContextRef:
      stringFromRecord(contextEvent, "workingContextRef") ??
      stringFromRecord(validationEvent, "workingContextRef") ??
      null,
    workingContextEntryRef:
      stringFromRecord(contextEvent, "workingContextEntryRef") ??
      stringFromRecord(validationEvent, "workingContextEntryRef") ??
      null,
    validationStateRef: stringFromRecord(validationEvent, "workingContextEntryRef") ?? null,
    changeSetRef:
      stringFromRecord(firstChangeSetEvent, "changeSetWorkingContextEntryRef") ??
      stringFromRecord(firstChangeSetEvent, "toolResultRef") ??
      null,
    managedOutputRef: stringFromRecord(firstManagedOutputEvent, "managedOutputRef") ?? null,
    managedOutputWorkingContextEntryRef:
      stringFromRecord(firstManagedOutputEvent, "managedOutputWorkingContextEntryRef") ?? null,
    workingContextPersisted:
      booleanFromRecord(contextEvent, "workingContextPersisted") === true ||
      booleanFromRecord(validationEvent, "workingContextPersisted") === true,
    workingContextHasInlineContextWindows:
      booleanFromRecord(contextEvent, "workingContextHasInlineContextWindows") === true ||
      booleanFromRecord(validationEvent, "workingContextHasInlineContextWindows") === true,
    workingContextHasFileGraph:
      booleanFromRecord(contextEvent, "workingContextHasFileGraph") === true ||
      booleanFromRecord(validationEvent, "workingContextHasFileGraph") === true,
    workingContextHasSymbolWindows: contextScoutHasSymbolWindows || validationScoutHasSymbolWindows,
    workingContextHasMissingWindows:
      contextScoutHasMissingWindows || validationScoutHasMissingWindows,
    contextScoutHasSymbolWindows,
    contextScoutHasMissingWindows,
    contextScoutToolCallCount: contextScoutToolDiagnostics.toolCallCount,
    contextScoutToolCallCountsByType: contextScoutToolDiagnostics.toolCallCountsByType,
    contextScoutFirstToolCalls: contextScoutToolDiagnostics.firstToolCalls,
    contextScoutReadCallCount: contextScoutToolDiagnostics.readCallCount,
    contextScoutGrepCallCount: contextScoutToolDiagnostics.grepCallCount,
    contextScoutStartedWithRead: contextScoutToolDiagnostics.startedWithRead,
    contextScoutRawTopOfFileReadCount: contextScoutToolDiagnostics.rawTopOfFileReadCount,
    contextScoutHandoffQualityDiagnostics: {
      hasSymbolWindows: contextScoutHasSymbolWindows,
      hasInlineContextWindows:
        booleanFromRecord(contextEvent, "workingContextHasInlineContextWindows") === true,
      hasFileGraph: booleanFromRecord(contextEvent, "workingContextHasFileGraph") === true,
      hasMissingWindows: contextScoutHasMissingWindows,
      readCallCount: contextScoutToolDiagnostics.readCallCount,
      grepCallCount: contextScoutToolDiagnostics.grepCallCount,
      startedWithRead: contextScoutToolDiagnostics.startedWithRead,
      rawTopOfFileReadCount: contextScoutToolDiagnostics.rawTopOfFileReadCount,
      oversizedProjected: stringFromRecord(contextEvent, "resultDeliveryStatus") === "projected",
    },
    contextDecisionFooterObserved:
      booleanFromRecord(contextEvent, "parentDecisionFooterIncluded") === true,
    contextDecisionFooterKind: stringFromRecord(contextEvent, "parentDecisionFooterKind") ?? null,
    validationDecisionFooterObserved:
      booleanFromRecord(validationEvent, "parentDecisionFooterIncluded") === true,
    validationDecisionFooterKind:
      stringFromRecord(validationEvent, "parentDecisionFooterKind") ?? null,
    parentPostChildActionRef: parentActionRefFromEvent(parentPostChildActionEvent),
    parentSynthesisRef: parentActionRefFromEvent(parentPostChildActionEvent),
    parentPostChildActionObserved: Boolean(parentPostChildActionEvent),
    parentPostChildActionToolName: parentActionToolNameFromEvent(parentPostChildActionEvent),
    parentPostValidationActionRef: parentActionRefFromEvent(parentPostValidationActionEvent),
    parentPostValidationActionObserved: Boolean(parentPostValidationActionEvent),
    parentPostValidationActionToolName: parentActionToolNameFromEvent(
      parentPostValidationActionEvent,
    ),
    contextTodoDecisionRef: parentActionRefFromEvent(contextTodoDecisionEvent),
    contextTodoDecisionObserved: Boolean(contextTodoDecisionEvent),
    contextNextActionRef: parentActionRefFromEvent(contextNextActionEvent),
    contextNextActionObserved: Boolean(contextNextActionEvent),
    contextNextActionToolName: parentActionToolNameFromEvent(contextNextActionEvent),
    validationTodoDecisionRef: parentActionRefFromEvent(validationTodoDecisionEvent),
    validationTodoDecisionObserved: Boolean(validationTodoDecisionEvent),
    validationNextActionRef: parentActionRefFromEvent(validationNextActionEvent),
    validationNextActionObserved: Boolean(validationNextActionEvent),
    validationNextActionToolName: parentActionToolNameFromEvent(validationNextActionEvent),
    firstLspRef: stringFromRecord(firstLspEvent, "toolResultRef") ?? null,
    firstEditRef: stringFromRecord(firstLiveEditEvent, "toolResultRef") ?? null,
    firstEditChangedFilePaths: stringArrayFromRecord(firstLiveEditEvent, "changedFilePaths"),
    firstEditFirstChangedLine: numberFromRecord(firstLiveEditEvent, "firstChangedLine") ?? null,
    firstEditDiffAvailable: booleanFromRecord(firstLiveEditEvent, "diffAvailable") === true,
    firstEditDiffByteCount: numberFromRecord(firstLiveEditEvent, "diffByteCount") ?? null,
    firstEditDiagnosticSummaries: stringArrayFromRecord(firstLiveEditEvent, "diagnosticSummaries"),
    validationActionRef: stringFromRecord(validationEvent, "taskRef") ?? null,
    validationScoutProvider: stringFromRecord(validationEvent, "childProvider") ?? null,
    validationScoutModel: stringFromRecord(validationEvent, "childModel") ?? null,
    validationScoutHasSymbolWindows,
    validationScoutHasMissingWindows,
    validationScoutToolCallCount: validationScoutToolDiagnostics.toolCallCount,
    validationScoutToolCallCountsByType: validationScoutToolDiagnostics.toolCallCountsByType,
    validationScoutFirstToolCalls: validationScoutToolDiagnostics.firstToolCalls,
    validationScoutReadCallCount: validationScoutToolDiagnostics.readCallCount,
    validationScoutGrepCallCount: validationScoutToolDiagnostics.grepCallCount,
    validationScoutStartedWithRead: validationScoutToolDiagnostics.startedWithRead,
    validationScoutRawTopOfFileReadCount: validationScoutToolDiagnostics.rawTopOfFileReadCount,
    validationScoutHandoffQualityDiagnostics: {
      hasSymbolWindows: validationScoutHasSymbolWindows,
      hasInlineContextWindows:
        booleanFromRecord(validationEvent, "workingContextHasInlineContextWindows") === true,
      hasFileGraph: booleanFromRecord(validationEvent, "workingContextHasFileGraph") === true,
      hasMissingWindows: validationScoutHasMissingWindows,
      readCallCount: validationScoutToolDiagnostics.readCallCount,
      grepCallCount: validationScoutToolDiagnostics.grepCallCount,
      startedWithRead: validationScoutToolDiagnostics.startedWithRead,
      rawTopOfFileReadCount: validationScoutToolDiagnostics.rawTopOfFileReadCount,
      oversizedProjected: stringFromRecord(validationEvent, "resultDeliveryStatus") === "projected",
    },
    terminalNodeFinishRef: stringFromRecord(terminalNodeFinishEvent, "toolResultRef") ?? null,
    childResultObserved,
    contextScoutSpawnObserved: Boolean(stringFromRecord(contextEvent, "childSessionKey")),
    validationActionObserved: Boolean(validationEvent),
    validationScoutObserved: Boolean(validationEvent),
    validationScoutResultRef: stringFromRecord(validationEvent, "childResultRef") ?? null,
    validationStateObserved: Boolean(stringFromRecord(validationEvent, "workingContextEntryRef")),
    changeSetObserved: Boolean(firstChangeSetEvent),
    managedOutputObserved: Boolean(firstManagedOutputEvent),
    childResultDeliveryStatus,
    childResultOversized,
    childBootstrapAdmissions,
    childStartFailures,
    childProviderAdmissionObserved: childBootstrapAdmissions.some(
      (entry) => entry.providerReportObserved === true,
    ),
    childStartFailureObserved: childStartFailures.length > 0,
    nativeTaskContextPreservationBlocked: Boolean(latestContextPreservationEvent),
    nativeTaskContextPreservationReason:
      stringFromRecord(latestContextPreservationEvent, "reason") ?? null,
    nativeTaskContextPreservationRoute:
      stringFromRecord(latestContextPreservationEvent, "route") ?? null,
  };
}

export {
  appendAttemptCacheTtlIfNeeded,
  composeSystemPromptWithHookContext,
  resolveAttemptSpawnWorkspaceDir,
} from "./attempt.thread-helpers.js";
export {
  buildAfterTurnRuntimeContext,
  mergeOrphanedTrailingUserPrompt,
  prependSystemPromptAddition,
  resolveAttemptFsWorkspaceOnly,
  resolveAttemptPrependSystemContext,
  resolvePromptBuildHookResult,
  resolvePromptModeForSession,
  shouldWarnOnOrphanedUserRepair,
  shouldInjectHeartbeatPrompt,
} from "./attempt.prompt-helpers.js";
export {
  buildSessionsYieldContextMessage,
  persistSessionsYieldContextMessage,
  queueSessionsYieldInterruptMessage,
  stripSessionsYieldArtifacts,
} from "./attempt.sessions-yield.js";
export {
  isOllamaCompatProvider,
  resolveOllamaCompatNumCtxEnabled,
  shouldInjectOllamaCompatNumCtx,
  wrapOllamaCompatNumCtx,
} from "../../../plugin-sdk/ollama-runtime.js";

export {
  decodeHtmlEntitiesInObject,
  wrapStreamFnRepairMalformedToolCallArguments,
} from "./attempt.tool-call-argument-repair.js";
export {
  wrapStreamFnSanitizeMalformedToolCalls,
  wrapStreamFnTrimToolCallNames,
} from "./attempt.tool-call-normalization.js";
export {
  resetEmbeddedAgentBaseStreamFnCacheForTest,
  resolveEmbeddedAgentBaseStreamFn,
  resolveEmbeddedAgentStreamFn,
};

const MAX_BTW_SNAPSHOT_MESSAGES = 100;

export function resolveUnknownToolGuardThreshold(loopDetection?: {
  enabled?: boolean;
  unknownToolThreshold?: number;
}): number {
  // The unknown-tool guard is a safety net against the model hallucinating a
  // tool name or calling a tool that has since been removed from the allowlist
  // (for example after a `skills.allowBundled` config change). After `threshold`
  // consecutive unknown-tool attempts the stream wrapper rewrites the assistant
  // message content to tell the model to stop, which breaks otherwise-infinite
  // Tool-not-found loops against the provider. Unlike the genericRepeat /
  // pingPong / pollNoProgress detectors this guard has no false-positive
  // surface because the tool is objectively not registered in this run, so it
  // stays on regardless of `tools.loopDetection.enabled`.
  const raw = loopDetection?.unknownToolThreshold;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return UNKNOWN_TOOL_THRESHOLD;
}

function summarizeMessagePayload(msg: AgentMessage): { textChars: number; imageBlocks: number } {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    return { textChars: content.length, imageBlocks: 0 };
  }
  if (!Array.isArray(content)) {
    return { textChars: 0, imageBlocks: 0 };
  }

  let textChars = 0;
  let imageBlocks = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { type?: unknown; text?: unknown };
    if (typedBlock.type === "image") {
      imageBlocks++;
      continue;
    }
    if (typeof typedBlock.text === "string") {
      textChars += typedBlock.text.length;
    }
  }

  return { textChars, imageBlocks };
}

function summarizeSessionContext(messages: AgentMessage[]): {
  roleCounts: string;
  totalTextChars: number;
  totalImageBlocks: number;
  maxMessageTextChars: number;
} {
  const roleCounts = new Map<string, number>();
  let totalTextChars = 0;
  let totalImageBlocks = 0;
  let maxMessageTextChars = 0;

  for (const msg of messages) {
    const role = typeof msg.role === "string" ? msg.role : "unknown";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);

    const payload = summarizeMessagePayload(msg);
    totalTextChars += payload.textChars;
    totalImageBlocks += payload.imageBlocks;
    if (payload.textChars > maxMessageTextChars) {
      maxMessageTextChars = payload.textChars;
    }
  }

  return {
    roleCounts:
      [...roleCounts.entries()]
        .toSorted((a, b) => a[0].localeCompare(b[0]))
        .map(([role, count]) => `${role}:${count}`)
        .join(",") || "none",
    totalTextChars,
    totalImageBlocks,
    maxMessageTextChars,
  };
}

function isExecutionScoutAgentId(agentId: string | undefined): boolean {
  return agentId === "execution-context-scout" || agentId === "execution-validation-scout";
}

function executionScoutRequiredThinkingLevel(params: {
  agentId: string | undefined;
  thinkLevel: ThinkLevel;
}): ReturnType<typeof mapThinkingLevel> | undefined {
  if (!isExecutionScoutAgentId(params.agentId)) {
    return undefined;
  }
  const thinkingLevel = mapThinkingLevel(params.thinkLevel);
  return thinkingLevel === "off" ? undefined : thinkingLevel;
}

function modelForExecutionScoutRequiredThinking(
  model: EmbeddedRunAttemptParams["model"],
  requiredThinkingLevel: ReturnType<typeof mapThinkingLevel> | undefined,
): EmbeddedRunAttemptParams["model"] {
  if (!requiredThinkingLevel || model.reasoning) {
    return model;
  }
  return { ...model, reasoning: true };
}

function assertExecutionScoutProviderThinking(params: {
  session: Awaited<ReturnType<typeof createAgentSession>>["session"];
  agentId: string | undefined;
  requiredThinkingLevel: ReturnType<typeof mapThinkingLevel> | undefined;
}): void {
  if (!params.requiredThinkingLevel || !isExecutionScoutAgentId(params.agentId)) {
    return;
  }
  if (params.session.thinkingLevel !== params.requiredThinkingLevel) {
    params.session.setThinkingLevel(params.requiredThinkingLevel);
  }
  if (params.session.thinkingLevel !== params.requiredThinkingLevel) {
    throw new Error(
      [
        "native_child_thinking_level_mismatch",
        `agent=${params.agentId ?? "<unknown>"}`,
        `expected=${params.requiredThinkingLevel}`,
        `actual=${params.session.thinkingLevel ?? "<missing>"}`,
      ].join(" "),
    );
  }
}

function fallbackPromptProfileForAgentId(agentId: string | undefined): PromptProfile {
  if (agentId === "execution-coding") {
    return "execution_worker";
  }
  if (agentId === "execution-context-scout") {
    return "execution_context_scout";
  }
  if (agentId === "execution-validation-scout") {
    return "execution_validation_scout";
  }
  return "general_assistant";
}

function resolvePromptProfileForAgent(agentId: string | undefined): PromptProfile {
  if (!agentId) {
    return "general_assistant";
  }
  try {
    const entry = findAgentPackRegistryEntry({
      entries: loadAgentPackRegistryEntriesSync(),
      agentId,
    });
    return entry?.promptProfile ?? fallbackPromptProfileForAgentId(agentId);
  } catch {
    return fallbackPromptProfileForAgentId(agentId);
  }
}

export async function runEmbeddedAttempt(
  params: EmbeddedRunAttemptParams,
): Promise<EmbeddedRunAttemptResult> {
  const resolvedWorkspace = resolveUserPath(params.workspaceDir);
  const runAbortController = new AbortController();
  // Proxy bootstrap must happen before timeout tuning so the timeouts wrap the
  // active EnvHttpProxyAgent instead of being replaced by a bare proxy dispatcher.
  ensureGlobalUndiciEnvProxyDispatcher();
  ensureGlobalUndiciStreamTimeouts({ timeoutMs: params.timeoutMs });

  log.debug(
    `embedded run start: runId=${params.runId} sessionId=${params.sessionId} provider=${params.provider} model=${params.modelId} thinking=${params.thinkLevel} messageChannel=${params.messageChannel ?? params.messageProvider ?? "unknown"}`,
  );

  await fs.mkdir(resolvedWorkspace, { recursive: true });

  const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
  const sandbox = await resolveSandboxContext({
    config: params.config,
    sessionKey: sandboxSessionKey,
    workspaceDir: resolvedWorkspace,
  });
  const effectiveWorkspace = sandbox?.enabled
    ? sandbox.workspaceAccess === "rw"
      ? resolvedWorkspace
      : sandbox.workspaceDir
    : resolvedWorkspace;
  await fs.mkdir(effectiveWorkspace, { recursive: true });
  const { sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
    agentId: params.agentId,
  });
  const sessionStorePath = resolveStorePath(params.config?.session?.store, {
    agentId: sessionAgentId,
  });

  let restoreSkillEnv: (() => void) | undefined;
  try {
    const { shouldLoadSkillEntries, skillEntries } = resolveEmbeddedRunSkillEntries({
      workspaceDir: effectiveWorkspace,
      config: params.config,
      agentId: sessionAgentId,
      skillsSnapshot: params.skillsSnapshot,
    });
    restoreSkillEnv = params.skillsSnapshot
      ? applySkillEnvOverridesFromSnapshot({
          snapshot: params.skillsSnapshot,
          config: params.config,
        })
      : applySkillEnvOverrides({
          skills: skillEntries ?? [],
          config: params.config,
        });

    const skillsPrompt = resolveSkillsPromptForRun({
      skillsSnapshot: params.skillsSnapshot,
      entries: shouldLoadSkillEntries ? skillEntries : undefined,
      config: params.config,
      workspaceDir: effectiveWorkspace,
      agentId: sessionAgentId,
    });

    const sessionLockMaxHoldMs = resolveSessionLockMaxHoldFromTimeout({
      timeoutMs: resolveRunTimeoutWithCompactionGraceMs({
        runTimeoutMs: params.timeoutMs,
        compactionTimeoutMs: resolveCompactionTimeoutMs(params.config),
      }),
    });
    const sessionLock = await acquireSessionWriteLock({
      sessionFile: params.sessionFile,
      maxHoldMs: sessionLockMaxHoldMs,
    });
    await params.onSessionLockAcquired?.(sessionLock.trace);
    const parentSessionLockHandoff = bindRunChildTaskToParentSessionLockHandoff({
      runChildTask: params.nodeAgentNativeTaskMode?.runChildTask,
      sessionFile: params.sessionFile,
      initialLock: sessionLock,
      maxHoldMs: sessionLockMaxHoldMs,
      onSessionLockAcquired: params.onSessionLockAcquired,
    });

    const sessionLabel = params.sessionKey ?? params.sessionId;
    const contextInjectionMode = resolveContextInjectionMode(params.config);
    const {
      bootstrapFiles: hookAdjustedBootstrapFiles,
      contextFiles,
      shouldRecordCompletedBootstrapTurn,
    } = await resolveAttemptBootstrapContext({
      contextInjectionMode,
      bootstrapContextMode: params.bootstrapContextMode,
      bootstrapContextRunKind: params.bootstrapContextRunKind,
      sessionFile: params.sessionFile,
      hasCompletedBootstrapTurn,
      resolveBootstrapContextForRun: async () =>
        await resolveBootstrapContextForRun({
          workspaceDir: effectiveWorkspace,
          config: params.config,
          sessionKey: params.sessionKey,
          sessionId: params.sessionId,
          agentId: params.agentId,
          currentTurnText: params.prompt,
          warn: makeBootstrapWarn({ sessionLabel, warn: (message) => log.warn(message) }),
          contextMode: params.bootstrapContextMode,
          runKind: params.bootstrapContextRunKind,
        }),
    });
    const bootstrapMaxChars = resolveBootstrapMaxChars(params.config);
    const bootstrapTotalMaxChars = resolveBootstrapTotalMaxChars(params.config);
    const bootstrapAnalysis = analyzeBootstrapBudget({
      files: buildBootstrapInjectionStats({
        bootstrapFiles: hookAdjustedBootstrapFiles,
        injectedFiles: contextFiles,
      }),
      bootstrapMaxChars,
      bootstrapTotalMaxChars,
    });
    const bootstrapPromptWarningMode = resolveBootstrapPromptTruncationWarningMode(params.config);
    const bootstrapPromptWarning = buildBootstrapPromptWarning({
      analysis: bootstrapAnalysis,
      mode: bootstrapPromptWarningMode,
      seenSignatures: params.bootstrapPromptWarningSignaturesSeen,
      previousSignature: params.bootstrapPromptWarningSignature,
    });
    const workspaceNotes = hookAdjustedBootstrapFiles.some(
      (file) => file.name === DEFAULT_BOOTSTRAP_FILENAME && !file.missing,
    )
      ? ["Reminder: commit your changes in this workspace after edits."]
      : undefined;

    const agentDir = params.agentDir ?? resolveOpenClawAgentDir();

    const { defaultAgentId } = resolveSessionAgentIds({
      sessionKey: params.sessionKey,
      config: params.config,
      agentId: params.agentId,
    });
    const effectiveFsWorkspaceOnly = resolveAttemptFsWorkspaceOnly({
      config: params.config,
      sessionAgentId,
    });
    // Track sessions_yield tool invocation (callback pattern, like clientToolCallDetected)
    let yieldDetected = false;
    let yieldMessage: string | null = null;
    // Late-binding reference so onYield can abort the session (declared after tool creation)
    let abortSessionForYield: (() => void) | null = null;
    let queueYieldInterruptForSession: (() => void) | null = null;
    let yieldAbortSettled: Promise<void> | null = null;
    const nodeAgentSessionTraceEvents: Record<string, unknown>[] = [];
    const deferredProviderCustomEntries: DeferredProviderCustomEntry[] = [];
    const nodeAgentPreemptiveCheckpointTracker = createNodeAgentPreemptiveCheckpointTracker();
    const nodeAgentNativeTaskMode =
      params.nodeAgentNativeTaskMode?.enabled === true && parentSessionLockHandoff.runChildTask
        ? {
            ...params.nodeAgentNativeTaskMode,
            runChildTask: parentSessionLockHandoff.runChildTask,
          }
        : params.nodeAgentNativeTaskMode;
    // Check if the model supports native image input
    const modelHasVision = params.model.input?.includes("image") ?? false;
    const nativeLspService = createOpenClawLspService({
      workspaceRoot: effectiveWorkspace,
      externalEnabled: true,
    });
    const toolsRaw = params.disableTools
      ? []
      : (() => {
          const allTools = createOpenClawCodingTools({
            agentId: sessionAgentId,
            ...buildEmbeddedAttemptToolRunContext(params),
            exec: {
              ...params.execOverrides,
              elevated: params.bashElevated,
            },
            sandbox,
            messageProvider: params.messageChannel ?? params.messageProvider,
            agentAccountId: params.agentAccountId,
            messageTo: params.messageTo,
            messageThreadId: params.messageThreadId,
            groupId: params.groupId,
            groupChannel: params.groupChannel,
            groupSpace: params.groupSpace,
            spawnedBy: params.spawnedBy,
            senderId: params.senderId,
            senderName: params.senderName,
            senderUsername: params.senderUsername,
            senderE164: params.senderE164,
            senderIsOwner: params.senderIsOwner,
            allowGatewaySubagentBinding: params.allowGatewaySubagentBinding,
            sessionKey: sandboxSessionKey,
            sessionId: params.sessionId,
            runId: params.runId,
            agentDir,
            workspaceDir: effectiveWorkspace,
            // When sandboxing uses a copied workspace (`ro` or `none`), effectiveWorkspace points
            // at the sandbox copy. Spawned subagents should inherit the real workspace instead.
            spawnWorkspaceDir: resolveAttemptSpawnWorkspaceDir({
              sandbox,
              resolvedWorkspace,
            }),
            config: params.config,
            abortSignal: runAbortController.signal,
            modelProvider: params.model.provider,
            modelId: params.modelId,
            modelCompat: params.model.compat,
            modelApi: params.model.api,
            modelContextWindowTokens: params.model.contextWindow,
            modelAuthMode: resolveModelAuthMode(params.model.provider, params.config),
            currentChannelId: params.currentChannelId,
            currentThreadTs: params.currentThreadTs,
            currentMessageId: params.currentMessageId,
            replyToMode: params.replyToMode,
            hasRepliedRef: params.hasRepliedRef,
            modelHasVision,
            requireExplicitMessageTarget:
              params.requireExplicitMessageTarget ?? isSubagentSessionKey(params.sessionKey),
            disableMessageTool: params.disableMessageTool,
            nativeRuntimeTools: params.nativeRuntimeTools,
            extraTools: params.extraTools,
            nodeAuthorityOverlay: params.nodeAuthorityOverlay,
            nodeAgentParentCrawlGuard: params.nodeAgentParentCrawlGuard,
            lspService: nativeLspService,
            nodeAgentNativeTaskMode,
            onYield: (message) => {
              yieldDetected = true;
              yieldMessage = message;
              queueYieldInterruptForSession?.();
              runAbortController.abort("sessions_yield");
              abortSessionForYield?.();
            },
          });
          if (params.toolsAllow && params.toolsAllow.length > 0) {
            const allowSet = new Set(params.toolsAllow);
            return allTools.filter((tool) => allowSet.has(tool.name));
          }
          return allTools;
        })();
    const toolsEnabled = supportsModelTools(params.model);
    const tools = normalizeProviderToolSchemas({
      tools: toolsEnabled ? toolsRaw : [],
      provider: params.provider,
      config: params.config,
      workspaceDir: effectiveWorkspace,
      env: process.env,
      modelId: params.modelId,
      modelApi: params.model.api,
      model: params.model,
    });
    const clientTools = toolsEnabled ? params.clientTools : undefined;
    const bundleMcpSessionRuntime = toolsEnabled
      ? await getOrCreateSessionMcpRuntime({
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          workspaceDir: effectiveWorkspace,
          cfg: params.config,
        })
      : undefined;
    const bundleMcpRuntime = bundleMcpSessionRuntime
      ? await materializeBundleMcpToolsForRun({
          runtime: bundleMcpSessionRuntime,
          reservedToolNames: [
            ...tools.map((tool) => tool.name),
            ...(clientTools?.map((tool) => tool.function.name) ?? []),
          ],
        })
      : undefined;
    const bundleLspRuntime = toolsEnabled
      ? await createBundleLspToolRuntime({
          workspaceDir: effectiveWorkspace,
          cfg: params.config,
          reservedToolNames: [
            ...tools.map((tool) => tool.name),
            ...(clientTools?.map((tool) => tool.function.name) ?? []),
            ...(bundleMcpRuntime?.tools.map((tool) => tool.name) ?? []),
          ],
        })
      : undefined;
    const effectiveTools = filterToolsForExecutionScoutMode({
      tools: filterEffectiveToolsForNodeAgentNativeTaskMode({
        tools: [...tools, ...(bundleMcpRuntime?.tools ?? []), ...(bundleLspRuntime?.tools ?? [])],
        mode: params.nodeAgentNativeTaskMode,
      }),
      agentId: sessionAgentId,
    });
    const effectiveToolNames = Array.from(
      new Set(
        effectiveTools
          .map((tool) => tool.name)
          .filter((name): name is string => typeof name === "string" && name.length > 0),
      ),
    ).toSorted();
    const allowedToolNames = collectAllowedToolNames({
      tools: effectiveTools,
      clientTools,
    });
    logProviderToolSchemaDiagnostics({
      tools: effectiveTools,
      provider: params.provider,
      config: params.config,
      workspaceDir: effectiveWorkspace,
      env: process.env,
      modelId: params.modelId,
      modelApi: params.model.api,
      model: params.model,
    });

    const machineName = await getMachineDisplayName();
    const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
    let runtimeCapabilities = runtimeChannel
      ? (resolveChannelCapabilities({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        }) ?? [])
      : undefined;
    const promptCapabilities =
      runtimeChannel && params.config
        ? resolveChannelMessageToolCapabilities({
            cfg: params.config,
            channel: runtimeChannel,
            accountId: params.agentAccountId,
          })
        : [];
    if (promptCapabilities.length > 0) {
      runtimeCapabilities ??= [];
      const seenCapabilities = new Set(
        runtimeCapabilities.map((cap) => normalizeOptionalLowercaseString(cap)).filter(Boolean),
      );
      for (const capability of promptCapabilities) {
        const normalizedCapability = normalizeOptionalLowercaseString(capability);
        if (!normalizedCapability || seenCapabilities.has(normalizedCapability)) {
          continue;
        }
        seenCapabilities.add(normalizedCapability);
        runtimeCapabilities.push(capability);
      }
    }
    const reactionGuidance =
      runtimeChannel && params.config
        ? resolveChannelReactionGuidance({
            cfg: params.config,
            channel: runtimeChannel,
            accountId: params.agentAccountId,
          })
        : undefined;
    const sandboxInfo = buildEmbeddedSandboxInfo(sandbox, params.bashElevated);
    const reasoningTagHint = isReasoningTagProvider(params.provider, {
      config: params.config,
      workspaceDir: effectiveWorkspace,
      env: process.env,
      modelId: params.modelId,
      modelApi: params.model.api,
      model: params.model,
    });
    // Resolve channel-specific message actions for system prompt
    const channelActions = runtimeChannel
      ? listChannelSupportedActions(
          buildEmbeddedMessageActionDiscoveryInput({
            cfg: params.config,
            channel: runtimeChannel,
            currentChannelId: params.currentChannelId,
            currentThreadTs: params.currentThreadTs,
            currentMessageId: params.currentMessageId,
            accountId: params.agentAccountId,
            sessionKey: params.sessionKey,
            sessionId: params.sessionId,
            agentId: sessionAgentId,
            senderId: params.senderId,
            senderIsOwner: params.senderIsOwner,
          }),
        )
      : undefined;
    const messageToolHints = runtimeChannel
      ? resolveChannelMessageToolHints({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        })
      : undefined;

    const defaultModelRef = resolveDefaultModelForAgent({
      cfg: params.config ?? {},
      agentId: sessionAgentId,
    });
    const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
    const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
      config: params.config,
      agentId: sessionAgentId,
      workspaceDir: effectiveWorkspace,
      cwd: effectiveWorkspace,
      runtime: {
        host: machineName,
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        node: process.version,
        model: `${params.provider}/${params.modelId}`,
        defaultModel: defaultModelLabel,
        shell: detectRuntimeShell(),
        channel: runtimeChannel,
        capabilities: runtimeCapabilities,
        channelActions,
      },
    });
    const isDefaultAgent = sessionAgentId === defaultAgentId;
    const promptMode = resolvePromptModeForSession(params.sessionKey);
    const promptProfile = resolvePromptProfileForAgent(sessionAgentId);

    // When toolsAllow is set, use minimal prompt, but keep skills visible.
    // Restricted tool menus still need skill instructions for correct agent behavior.
    const effectivePromptMode = params.toolsAllow?.length ? ("minimal" as const) : promptMode;
    const effectiveSkillsPrompt = skillsPrompt;
    const docsPath = await resolveOpenClawDocsPath({
      workspaceDir: effectiveWorkspace,
      argv1: process.argv[1],
      cwd: effectiveWorkspace,
      moduleUrl: import.meta.url,
    });
    const ttsHint = params.config ? buildTtsSystemPromptHint(params.config) : undefined;
    const ownerDisplay = resolveOwnerDisplaySetting(params.config);
    const heartbeatPrompt = shouldInjectHeartbeatPrompt({
      config: params.config,
      agentId: sessionAgentId,
      defaultAgentId,
      isDefaultAgent,
      trigger: params.trigger,
    })
      ? resolveHeartbeatPromptForSystemPrompt({
          config: params.config,
          agentId: sessionAgentId,
          defaultAgentId,
        })
      : undefined;
    const promptContribution = resolveProviderSystemPromptContribution({
      provider: params.provider,
      config: params.config,
      workspaceDir: effectiveWorkspace,
      context: {
        config: params.config,
        agentDir: params.agentDir,
        workspaceDir: effectiveWorkspace,
        provider: params.provider,
        modelId: params.modelId,
        promptMode: effectivePromptMode,
        promptProfile,
        runtimeChannel,
        runtimeCapabilities,
        agentId: sessionAgentId,
      },
    });

    const builtAppendPrompt =
      resolveSystemPromptOverride({
        config: params.config,
        agentId: sessionAgentId,
      }) ??
      buildEmbeddedSystemPrompt({
        workspaceDir: effectiveWorkspace,
        defaultThinkLevel: params.thinkLevel,
        reasoningLevel: params.reasoningLevel ?? "off",
        extraSystemPrompt: params.extraSystemPrompt,
        ownerNumbers: params.ownerNumbers,
        ownerDisplay: ownerDisplay.ownerDisplay,
        ownerDisplaySecret: ownerDisplay.ownerDisplaySecret,
        reasoningTagHint,
        heartbeatPrompt,
        skillsPrompt: effectiveSkillsPrompt,
        docsPath: docsPath ?? undefined,
        ttsHint,
        workspaceNotes,
        reactionGuidance,
        promptMode: effectivePromptMode,
        promptProfile,
        acpEnabled: params.config?.acp?.enabled !== false,
        runtimeInfo,
        messageToolHints,
        sandboxInfo,
        tools: effectiveTools,
        modelAliasLines: buildModelAliasLines(params.config),
        userTimezone,
        userTime,
        userTimeFormat,
        contextFiles,
        includeMemorySection: !params.contextEngine || params.contextEngine.info.id === "legacy",
        memoryCitationsMode: params.config?.memory?.citations,
        promptContribution,
      });
    const appendPrompt = transformProviderSystemPrompt({
      provider: params.provider,
      config: params.config,
      workspaceDir: effectiveWorkspace,
      context: {
        config: params.config,
        agentDir: params.agentDir,
        workspaceDir: effectiveWorkspace,
        provider: params.provider,
        modelId: params.modelId,
        promptMode: effectivePromptMode,
        promptProfile,
        runtimeChannel,
        runtimeCapabilities,
        agentId: sessionAgentId,
        systemPrompt: builtAppendPrompt,
      },
    });
    const buildAttemptSystemPromptReport = (systemPrompt: string) =>
      buildSystemPromptReport({
        source: "run",
        generatedAt: Date.now(),
        sessionId: params.sessionId,
        sessionKey: params.sessionKey ?? params.sessionId,
        provider: params.provider,
        model: params.modelId,
        workspaceDir: effectiveWorkspace,
        bootstrapMaxChars,
        bootstrapTotalMaxChars,
        bootstrapTruncation: buildBootstrapTruncationReportMeta({
          analysis: bootstrapAnalysis,
          warningMode: bootstrapPromptWarningMode,
          warning: bootstrapPromptWarning,
        }),
        sandbox: (() => {
          const runtime = resolveSandboxRuntimeStatus({
            cfg: params.config,
            sessionKey: sandboxSessionKey,
          });
          return { mode: runtime.mode, sandboxed: runtime.sandboxed };
        })(),
        systemPrompt,
        bootstrapFiles: hookAdjustedBootstrapFiles,
        injectedFiles: contextFiles,
        skillsPrompt,
        tools: effectiveTools,
      });
    let systemPromptReport = buildAttemptSystemPromptReport(appendPrompt);
    const systemPromptOverride = createSystemPromptOverride(appendPrompt);
    let systemPromptText = systemPromptOverride();

    let sessionManager: ReturnType<typeof guardSessionManager> | undefined;
    let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
    let removeToolResultContextGuard: (() => void) | undefined;
    try {
      await repairSessionFileIfNeeded({
        sessionFile: params.sessionFile,
        warn: (message) => log.warn(message),
      });
      const hadSessionFile = await fs
        .stat(params.sessionFile)
        .then(() => true)
        .catch(() => false);

      const transcriptPolicy = resolveTranscriptPolicy({
        modelApi: params.model?.api,
        provider: params.provider,
        modelId: params.modelId,
        config: params.config,
        workspaceDir: effectiveWorkspace,
        env: process.env,
        model: params.model,
      });

      await prewarmSessionFile(params.sessionFile);
      sessionManager = guardSessionManager(SessionManager.open(params.sessionFile), {
        agentId: sessionAgentId,
        sessionKey: params.sessionKey,
        config: params.config,
        contextWindowTokens: params.contextTokenBudget,
        inputProvenance: params.inputProvenance,
        allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
        allowedToolNames,
        stateRoot: resolveStateDir(process.env),
      });
      trackSessionManagerAccess(params.sessionFile);

      await runAttemptContextEngineBootstrap({
        hadSessionFile,
        contextEngine: params.contextEngine,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        sessionManager,
        runtimeContext: buildAfterTurnRuntimeContext({
          attempt: params,
          workspaceDir: effectiveWorkspace,
          agentDir,
          tokenBudget: params.contextTokenBudget,
        }),
        runMaintenance: async (contextParams) =>
          await runContextEngineMaintenance({
            contextEngine: contextParams.contextEngine as never,
            sessionId: contextParams.sessionId,
            sessionKey: contextParams.sessionKey,
            sessionFile: contextParams.sessionFile,
            reason: contextParams.reason,
            sessionManager: contextParams.sessionManager as never,
            runtimeContext: contextParams.runtimeContext,
          }),
        warn: (message) => log.warn(message),
      });

      await prepareSessionManagerForRun({
        sessionManager,
        sessionFile: params.sessionFile,
        hadSessionFile,
        sessionId: params.sessionId,
        cwd: effectiveWorkspace,
      });

      const settingsManager = createPreparedEmbeddedPiSettingsManager({
        cwd: effectiveWorkspace,
        agentDir,
        cfg: params.config,
        contextTokenBudget: params.contextTokenBudget,
      });
      applyPiAutoCompactionGuard({
        settingsManager,
        contextEngineInfo: params.contextEngine?.info,
      });

      // Sets compaction/pruning runtime state and returns extension factories
      // that must be passed to the resource loader for the safeguard to be active.
      const extensionFactories = buildEmbeddedExtensionFactories({
        cfg: params.config,
        sessionManager,
        provider: params.provider,
        modelId: params.modelId,
        model: params.model,
      });
      // Only create an explicit resource loader when there are extension factories
      // to register; otherwise let createAgentSession use its built-in default.
      let resourceLoader: DefaultResourceLoader | undefined;
      if (extensionFactories.length > 0) {
        resourceLoader = new DefaultResourceLoader({
          cwd: resolvedWorkspace,
          agentDir,
          settingsManager,
          extensionFactories,
        });
        await resourceLoader.reload();
      }

      // Get hook runner early so it's available when creating tools
      const hookRunner = getGlobalHookRunner();

      const { builtInTools, customTools } = splitSdkTools({
        tools: effectiveTools,
        sandboxEnabled: !!sandbox?.enabled,
      });

      // Add client tools (OpenResponses hosted tools) to customTools
      let clientToolCallDetected: { name: string; params: Record<string, unknown> } | null = null;
      const clientToolLoopDetection = resolveToolLoopDetectionConfig({
        cfg: params.config,
        agentId: sessionAgentId,
      });
      // Exact raw names of every tool registered for this run, including
      // bundled/plugin tools. Used as the raw-name set for the trusted local
      // MEDIA: passthrough gate: a normalized alias is not sufficient — the
      // emitted tool name must match an exact registration of this run.
      const builtinToolNames = new Set(
        effectiveTools.flatMap((tool) => {
          const name = (tool.name ?? "").trim();
          return name ? [name] : [];
        }),
      );
      // Admission-time conflict check only against non-plugin core tools, to
      // preserve prior behavior where client tools may coexist with unrelated
      // plugin tool names. MEDIA passthrough is still gated by the raw-name
      // set above, so a client tool that normalize-collides with a plugin
      // tool cannot inherit the plugin's local-media trust.
      const coreBuiltinToolNames = new Set(
        effectiveTools.flatMap((tool) => {
          const name = (tool.name ?? "").trim();
          if (!name || getPluginToolMeta(tool)) {
            return [];
          }
          return [name];
        }),
      );
      const clientToolNameConflicts = findClientToolNameConflicts({
        tools: clientTools ?? [],
        existingToolNames: coreBuiltinToolNames,
      });
      if (clientToolNameConflicts.length > 0) {
        throw createClientToolNameConflictError(clientToolNameConflicts);
      }
      const clientToolDefs = clientTools
        ? toClientToolDefinitions(
            clientTools,
            (toolName, toolParams) => {
              clientToolCallDetected = { name: toolName, params: toolParams };
            },
            {
              agentId: sessionAgentId,
              sessionKey: sandboxSessionKey,
              sessionId: params.sessionId,
              runId: params.runId,
              loopDetection: clientToolLoopDetection,
            },
          )
        : [];

      const allCustomTools = [...customTools, ...clientToolDefs];
      const nativeRequiredThinkingLevel = executionScoutRequiredThinkingLevel({
        agentId: sessionAgentId,
        thinkLevel: params.thinkLevel,
      });
      const providerThinkingLevel = mapThinkingLevel(params.thinkLevel);
      const sessionRuntimeModel = modelForExecutionScoutRequiredThinking(
        params.model,
        nativeRequiredThinkingLevel,
      );

      ({ session } = await createAgentSession({
        cwd: resolvedWorkspace,
        agentDir,
        authStorage: params.authStorage,
        modelRegistry: params.modelRegistry,
        model: sessionRuntimeModel,
        thinkingLevel: providerThinkingLevel,
        tools: builtInTools,
        customTools: allCustomTools,
        sessionManager,
        settingsManager,
        resourceLoader,
      }));
      if (!session) {
        throw new Error("Embedded agent session missing");
      }
      assertExecutionScoutProviderThinking({
        session,
        agentId: sessionAgentId,
        requiredThinkingLevel: nativeRequiredThinkingLevel,
      });
      applySystemPromptOverrideToSession(session, systemPromptText);
      const activeSession = session;
      let prePromptMessageCount = activeSession.messages.length;
      abortSessionForYield = () => {
        yieldAbortSettled = Promise.resolve(activeSession.abort());
      };
      queueYieldInterruptForSession = () => {
        queueSessionsYieldInterruptMessage(activeSession);
      };
      if (params.contextEngine?.info?.ownsCompaction !== true) {
        removeToolResultContextGuard = installToolResultContextGuard({
          agent: activeSession.agent,
          contextWindowTokens: params.contextTokenBudget ?? DEFAULT_CONTEXT_TOKENS,
        });
      } else {
        removeToolResultContextGuard = installContextEngineLoopHook({
          agent: activeSession.agent,
          contextEngine: params.contextEngine,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          sessionFile: params.sessionFile,
          tokenBudget: params.contextTokenBudget,
          modelId: params.modelId,
          getPrePromptMessageCount: () => prePromptMessageCount,
          refreshSystemPrompt: () => {},
        });
      }
      const cacheTrace = createCacheTrace({
        cfg: params.config,
        env: process.env,
        runId: params.runId,
        sessionId: activeSession.sessionId,
        sessionKey: params.sessionKey,
        provider: params.provider,
        modelId: params.modelId,
        modelApi: params.model.api,
        workspaceDir: params.workspaceDir,
      });
      const anthropicPayloadLogger = createAnthropicPayloadLogger({
        env: process.env,
        runId: params.runId,
        sessionId: activeSession.sessionId,
        sessionKey: params.sessionKey,
        provider: params.provider,
        modelId: params.modelId,
        modelApi: params.model.api,
        workspaceDir: params.workspaceDir,
      });

      // Rebuild each turn from the session's original stream base so prior-turn
      // wrappers do not pin us to stale provider/API transport behavior.
      const defaultSessionStreamFn = resolveEmbeddedAgentBaseStreamFn({
        session: activeSession,
      });
      const providerStreamFn = registerProviderStreamForModel({
        model: params.model,
        cfg: params.config,
        agentDir,
        workspaceDir: effectiveWorkspace,
      });
      const shouldUseWebSocketTransport = shouldUseOpenAIWebSocketTransport({
        provider: params.provider,
        modelApi: params.model.api,
      });
      const wsApiKey = shouldUseWebSocketTransport
        ? await resolveEmbeddedAgentApiKey({
            provider: params.provider,
            resolvedApiKey: params.resolvedApiKey,
            authStorage: params.authStorage,
          })
        : undefined;
      if (shouldUseWebSocketTransport && !wsApiKey) {
        log.warn(
          `[ws-stream] no API key for provider=${params.provider}; keeping session-managed HTTP transport`,
        );
      }
      const streamStrategy = describeEmbeddedAgentStreamStrategy({
        currentStreamFn: defaultSessionStreamFn,
        providerStreamFn,
        shouldUseWebSocketTransport,
        wsApiKey,
        model: params.model,
      });
      activeSession.agent.streamFn = resolveEmbeddedAgentStreamFn({
        currentStreamFn: defaultSessionStreamFn,
        providerStreamFn,
        shouldUseWebSocketTransport,
        wsApiKey,
        sessionId: params.sessionId,
        signal: runAbortController.signal,
        model: params.model,
        resolvedApiKey: params.resolvedApiKey,
        authStorage: params.authStorage,
      });
      const providerTextTransforms = resolveProviderTextTransforms({
        provider: params.provider,
        config: params.config,
        workspaceDir: effectiveWorkspace,
      });
      if (providerTextTransforms) {
        activeSession.agent.streamFn = wrapStreamFnTextTransforms({
          streamFn: activeSession.agent.streamFn,
          input: providerTextTransforms.input,
          output: providerTextTransforms.output,
          transformSystemPrompt: false,
        });
      }

      const { effectiveExtraParams } = applyExtraParamsToAgent(
        activeSession.agent,
        params.config,
        params.provider,
        params.modelId,
        {
          ...params.streamParams,
          fastMode: params.fastMode,
        },
        params.thinkLevel,
        sessionAgentId,
        effectiveWorkspace,
        params.model,
        agentDir,
      );
      const effectivePromptCacheRetention = resolveCacheRetention(
        effectiveExtraParams,
        params.provider,
        params.model.api,
        params.modelId,
      );
      const agentTransportOverride = resolveAgentTransportOverride({
        settingsManager,
        effectiveExtraParams,
      });
      const effectiveAgentTransport = agentTransportOverride ?? activeSession.agent.transport;
      if (agentTransportOverride && activeSession.agent.transport !== agentTransportOverride) {
        const previousTransport = activeSession.agent.transport;
        log.debug(
          `embedded agent transport override: ${previousTransport} -> ${agentTransportOverride} ` +
            `(${params.provider}/${params.modelId})`,
        );
      }

      const cacheObservabilityEnabled = Boolean(cacheTrace) || log.isEnabled("debug");
      const promptCacheToolNames = collectPromptCacheToolNames([
        ...builtInTools,
        ...allCustomTools,
      ] as Array<{ name?: string }>);
      let promptCacheChangesForTurn: PromptCacheChange[] | null = null;

      if (cacheTrace) {
        cacheTrace.recordStage("session:loaded", {
          messages: activeSession.messages,
          system: systemPromptText,
          note: "after session create",
        });
        activeSession.agent.streamFn = cacheTrace.wrapStreamFn(activeSession.agent.streamFn);
      }

      // Anthropic Claude endpoints can reject replayed `thinking` blocks
      // (e.g. thinkingSignature:"reasoning_text") on any follow-up provider
      // call, including tool continuations. Wrap the stream function so every
      // outbound request sees sanitized messages.
      if (transcriptPolicy.dropThinkingBlocks) {
        const inner = activeSession.agent.streamFn;
        activeSession.agent.streamFn = (model, context, options) => {
          const ctx = context as unknown as { messages?: unknown };
          const messages = ctx?.messages;
          if (!Array.isArray(messages)) {
            return inner(model, context, options);
          }
          const sanitized = dropThinkingBlocks(messages as unknown as AgentMessage[]) as unknown;
          if (sanitized === messages) {
            return inner(model, context, options);
          }
          const nextContext = {
            ...(context as unknown as Record<string, unknown>),
            messages: sanitized,
          } as unknown;
          return inner(model, nextContext as typeof context, options);
        };
      }

      // Mistral (and other strict providers) reject tool call IDs that don't match their
      // format requirements (e.g. [a-zA-Z0-9]{9}). sanitizeSessionHistory only processes
      // historical messages at attempt start, but the agent loop's internal tool call →
      // tool result cycles bypass that path. Wrap streamFn so every outbound request
      // sees sanitized tool call IDs.
      const isOpenAIResponsesApi =
        params.model.api === "openai-responses" ||
        params.model.api === "azure-openai-responses" ||
        params.model.api === "openai-codex-responses";

      if (
        transcriptPolicy.sanitizeToolCallIds &&
        transcriptPolicy.toolCallIdMode &&
        !isOpenAIResponsesApi
      ) {
        const inner = activeSession.agent.streamFn;
        const mode = transcriptPolicy.toolCallIdMode;
        activeSession.agent.streamFn = (model, context, options) => {
          const ctx = context as unknown as { messages?: unknown };
          const messages = ctx?.messages;
          if (!Array.isArray(messages)) {
            return inner(model, context, options);
          }
          const nextMessages = sanitizeReplayToolCallIdsForStream({
            messages: messages as AgentMessage[],
            mode,
            allowedToolNames,
            preserveNativeAnthropicToolUseIds: transcriptPolicy.preserveNativeAnthropicToolUseIds,
            preserveReplaySafeThinkingToolCallIds: shouldAllowProviderOwnedThinkingReplay({
              modelApi: (model as { api?: unknown })?.api as string | null | undefined,
              policy: transcriptPolicy,
            }),
            repairToolUseResultPairing: transcriptPolicy.repairToolUseResultPairing,
          });
          if (nextMessages === messages) {
            return inner(model, context, options);
          }
          const nextContext = {
            ...(context as unknown as Record<string, unknown>),
            messages: nextMessages,
          } as unknown;
          return inner(model, nextContext as typeof context, options);
        };
      }

      if (isOpenAIResponsesApi) {
        const inner = activeSession.agent.streamFn;
        activeSession.agent.streamFn = (model, context, options) => {
          const ctx = context as unknown as { messages?: unknown };
          const messages = ctx?.messages;
          if (!Array.isArray(messages)) {
            return inner(model, context, options);
          }
          const sanitized = downgradeOpenAIFunctionCallReasoningPairs(messages as AgentMessage[]);
          if (sanitized === messages) {
            return inner(model, context, options);
          }
          const nextContext = {
            ...(context as unknown as Record<string, unknown>),
            messages: sanitized,
          } as unknown;
          return inner(model, nextContext as typeof context, options);
        };
      }

      const innerStreamFn = activeSession.agent.streamFn;
      activeSession.agent.streamFn = (model, context, options) => {
        const signal = runAbortController.signal as AbortSignal & { reason?: unknown };
        if (yieldDetected && signal.aborted && signal.reason === "sessions_yield") {
          return createYieldAbortedResponse(model) as unknown as Awaited<
            ReturnType<typeof innerStreamFn>
          >;
        }
        return innerStreamFn(model, context, options);
      };

      // Some models emit tool names with surrounding whitespace (e.g. " read ").
      // pi-agent-core dispatches tool calls with exact string matching, so normalize
      // names on the live response stream before tool execution.
      activeSession.agent.streamFn = wrapStreamFnSanitizeMalformedToolCalls(
        activeSession.agent.streamFn,
        allowedToolNames,
        transcriptPolicy,
      );
      activeSession.agent.streamFn = wrapStreamFnTrimToolCallNames(
        activeSession.agent.streamFn,
        allowedToolNames,
        {
          unknownToolThreshold: resolveUnknownToolGuardThreshold(clientToolLoopDetection),
        },
      );

      if (
        params.model.api === "anthropic-messages" &&
        shouldRepairMalformedAnthropicToolCallArguments(params.provider)
      ) {
        activeSession.agent.streamFn = wrapStreamFnRepairMalformedToolCallArguments(
          activeSession.agent.streamFn,
        );
      }

      if (resolveToolCallArgumentsEncoding(params.model) === "html-entities") {
        activeSession.agent.streamFn = wrapStreamFnDecodeXaiToolCallArguments(
          activeSession.agent.streamFn,
        );
      }

      if (anthropicPayloadLogger) {
        activeSession.agent.streamFn = anthropicPayloadLogger.wrapStreamFn(
          activeSession.agent.streamFn,
        );
      }
      // Anthropic-compatible providers can add new stop reasons before pi-ai maps them.
      // Recover the known "sensitive" stop reason here so a model refusal does not
      // bubble out as an uncaught runner error and stall channel polling.
      activeSession.agent.streamFn = wrapStreamFnHandleSensitiveStopReason(
        activeSession.agent.streamFn,
      );

      activeSession.agent.streamFn = wrapStreamFnWithProviderRequestDiagnostics({
        streamFn: activeSession.agent.streamFn,
        sessionManager,
        deferredCustomEntries: deferredProviderCustomEntries,
        nodeAgentSessionTraceEvents,
        provider: params.provider,
        modelId: params.modelId,
        api: params.model.api,
        agentId: sessionAgentId,
        nodeRunId: params.nodeRunId ?? params.runId,
        sessionKey: params.sessionKey ?? params.sessionId,
        runId: params.runId,
        getSystemPromptReceipt: (request) =>
          buildProviderSystemPromptContributionReceipt({
            systemPrompt: systemPromptText,
            provider: request.provider,
            modelId: request.model,
            agentId: sessionAgentId,
            promptMode: effectivePromptMode,
            promptProfile,
          }),
      });

      activeSession.agent.streamFn = wrapStreamFnWithProviderWaitLockHandoff({
        streamFn: activeSession.agent.streamFn,
        sessionManager,
        deferredCustomEntries: deferredProviderCustomEntries,
        nodeAgentSessionTraceEvents,
        suspendParentLockForProviderWait: parentSessionLockHandoff.suspendParentLockForProviderWait,
        sessionKey: params.sessionKey ?? params.sessionId,
        runId: params.runId,
        agentId: sessionAgentId,
      });

      let idleTimeoutTrigger: ((error: Error) => void) | undefined;

      // Wrap stream with idle timeout detection
      const configuredRunTimeoutMs = resolveAgentTimeoutMs({
        cfg: params.config,
      });
      const idleTimeoutMs = resolveLlmIdleTimeoutMs({
        cfg: params.config,
        trigger: params.trigger,
        runTimeoutMs: params.timeoutMs !== configuredRunTimeoutMs ? params.timeoutMs : undefined,
        policy: params.lane === AGENT_LANE_SUBAGENT ? "request-idle" : "run-timeout",
      });
      if (idleTimeoutMs > 0) {
        activeSession.agent.streamFn = streamWithIdleTimeout(
          activeSession.agent.streamFn,
          idleTimeoutMs,
          (error) => idleTimeoutTrigger?.(error),
        );
      }

      try {
        const prior = await sanitizeSessionHistory({
          messages: activeSession.messages,
          modelApi: params.model.api,
          modelId: params.modelId,
          provider: params.provider,
          allowedToolNames,
          config: params.config,
          workspaceDir: effectiveWorkspace,
          env: process.env,
          model: params.model,
          sessionManager,
          sessionId: params.sessionId,
          policy: transcriptPolicy,
        });
        cacheTrace?.recordStage("session:sanitized", { messages: prior });
        const validated = await validateReplayTurns({
          messages: prior,
          modelApi: params.model.api,
          modelId: params.modelId,
          provider: params.provider,
          config: params.config,
          workspaceDir: effectiveWorkspace,
          env: process.env,
          model: params.model,
          sessionId: params.sessionId,
          policy: transcriptPolicy,
        });
        const heartbeatSummary =
          params.config && sessionAgentId
            ? resolveHeartbeatSummaryForAgent(params.config, sessionAgentId)
            : undefined;
        const heartbeatFiltered = filterHeartbeatPairs(
          validated,
          heartbeatSummary?.ackMaxChars,
          heartbeatSummary?.prompt,
        );
        const truncated = limitHistoryTurns(
          heartbeatFiltered,
          getDmHistoryLimitFromSessionKey(params.sessionKey, params.config),
        );
        // Re-run tool_use/tool_result pairing repair after truncation, since
        // limitHistoryTurns can orphan tool_result blocks by removing the
        // assistant message that contained the matching tool_use.
        const limited = transcriptPolicy.repairToolUseResultPairing
          ? sanitizeToolUseResultPairing(truncated, {
              erroredAssistantResultPolicy: "drop",
            })
          : truncated;
        cacheTrace?.recordStage("session:limited", { messages: limited });
        if (limited.length > 0) {
          activeSession.agent.state.messages = limited;
        }

        if (params.contextEngine) {
          try {
            const assembled = await assembleAttemptContextEngine({
              contextEngine: params.contextEngine,
              sessionId: params.sessionId,
              sessionKey: params.sessionKey,
              sessionStorePath,
              messages: activeSession.messages,
              tokenBudget: params.contextTokenBudget,
              availableTools: new Set(effectiveTools.map((tool) => tool.name)),
              citationsMode: params.config?.memory?.citations,
              modelId: params.modelId,
              ...(params.prompt !== undefined ? { prompt: params.prompt } : {}),
            });
            if (!assembled) {
              throw new Error("context engine assemble returned no result");
            }
            if (assembled.messages !== activeSession.messages) {
              activeSession.agent.state.messages = assembled.messages;
            }
            if (assembled.systemPromptAddition) {
              systemPromptText = prependSystemPromptAddition({
                systemPrompt: systemPromptText,
                systemPromptAddition: assembled.systemPromptAddition,
              });
              applySystemPromptOverrideToSession(activeSession, systemPromptText);
              log.debug(
                `context engine: prepended system prompt addition (${assembled.systemPromptAddition.length} chars)`,
              );
            }
          } catch (assembleErr) {
            log.warn(
              `context engine assemble failed, using pipeline messages: ${String(assembleErr)}`,
            );
          }
        }
      } catch (err) {
        await flushPendingToolResultsAfterIdle({
          agent: activeSession?.agent,
          sessionManager,
          clearPendingOnTimeout: true,
        });
        activeSession.dispose();
        throw err;
      }

      let aborted = Boolean(params.abortSignal?.aborted);
      let externalAbort = false;
      let yieldAborted = false;
      let timedOut = false;
      let idleTimedOut = false;
      let timedOutDuringCompaction = false;
      let progressTimeoutKind: EmbeddedRunProgressTimeoutKind | undefined;
      const getAbortReason = (signal: AbortSignal): unknown =>
        "reason" in signal ? (signal as { reason?: unknown }).reason : undefined;
      const makeTimeoutAbortReason = (): Error => {
        const err = new Error("request timed out");
        err.name = "TimeoutError";
        return err;
      };
      const makeAbortError = (signal: AbortSignal): Error => {
        const reason = getAbortReason(signal);
        // If the reason is already an Error, preserve it to keep the original message
        // (e.g., "LLM idle timeout (<n>s): no response from model" instead of "aborted")
        if (reason instanceof Error) {
          const err = new Error(reason.message, { cause: reason });
          err.name = "AbortError";
          return err;
        }
        const err = reason ? new Error("aborted", { cause: reason }) : new Error("aborted");
        err.name = "AbortError";
        return err;
      };
      const abortCompaction = () => {
        if (!activeSession.isCompacting) {
          return;
        }
        try {
          activeSession.abortCompaction();
        } catch (err) {
          if (!isProbeSession) {
            log.warn(
              `embedded run abortCompaction failed: runId=${params.runId} sessionId=${params.sessionId} err=${String(err)}`,
            );
          }
        }
      };
      const abortRun = (isTimeout = false, reason?: unknown) => {
        aborted = true;
        if (isTimeout) {
          timedOut = true;
        }
        if (isTimeout) {
          runAbortController.abort(reason ?? makeTimeoutAbortReason());
        } else {
          runAbortController.abort(reason);
        }
        abortCompaction();
        void activeSession.abort();
      };
      idleTimeoutTrigger = (error) => {
        idleTimedOut = true;
        abortRun(true, error);
      };
      const abortable = <T>(promise: Promise<T>): Promise<T> => {
        const signal = runAbortController.signal;
        if (signal.aborted) {
          return Promise.reject(makeAbortError(signal));
        }
        return new Promise<T>((resolve, reject) => {
          const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(makeAbortError(signal));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          promise.then(
            (value) => {
              signal.removeEventListener("abort", onAbort);
              resolve(value);
            },
            (err) => {
              signal.removeEventListener("abort", onAbort);
              reject(err);
            },
          );
        });
      };

      let recordRunProgress: (label?: string, signature?: string) => void = () => undefined;
      const progressDigest = (value: unknown): string | undefined => {
        if (typeof value !== "string" || !value) {
          return undefined;
        }
        return createHash("sha256").update(value).digest("hex").slice(0, 16);
      };
      const progressSignatureFromRecord = (
        label: string,
        record: Record<string, unknown> | undefined,
      ): string => {
        const parts = [
          label,
          typeof record?.eventType === "string" ? record.eventType : undefined,
          typeof record?.type === "string" ? record.type : undefined,
          typeof record?.toolName === "string" ? record.toolName : undefined,
          typeof record?.toolCallId === "string" ? record.toolCallId : undefined,
          typeof record?.messageId === "string" ? record.messageId : undefined,
          typeof record?.childSessionKey === "string" ? record.childSessionKey : undefined,
          typeof record?.runId === "string" ? record.runId : undefined,
          typeof record?.status === "string" ? record.status : undefined,
          typeof record?.phase === "string" ? record.phase : undefined,
          progressDigest(record?.delta),
          progressDigest(record?.text),
        ].filter((part): part is string => typeof part === "string" && part.length > 0);
        return parts.join(":");
      };
      const progressSignatureFromPayload = (
        label: string,
        payload: { text?: string; mediaUrls?: string[] } | undefined,
      ): string =>
        [
          label,
          progressDigest(payload?.text),
          Array.isArray(payload?.mediaUrls) && payload.mediaUrls.length > 0
            ? `media:${payload.mediaUrls.length}`
            : undefined,
        ]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(":");

      const subscription = subscribeEmbeddedPiSession(
        buildEmbeddedSubscriptionParams({
          session: activeSession,
          runId: params.runId,
          initialReplayState: params.initialReplayState,
          hookRunner: getGlobalHookRunner() ?? undefined,
          verboseLevel: params.verboseLevel,
          reasoningMode: params.reasoningLevel ?? "off",
          toolResultFormat: params.toolResultFormat,
          shouldEmitToolResult: params.shouldEmitToolResult,
          shouldEmitToolOutput: params.shouldEmitToolOutput,
          onToolResult: params.onToolResult
            ? async (payload) => {
                recordRunProgress(
                  "tool_result",
                  progressSignatureFromPayload("tool_result", payload),
                );
                await params.onToolResult?.(payload);
              }
            : undefined,
          onReasoningStream: params.onReasoningStream,
          onReasoningEnd: params.onReasoningEnd,
          onBlockReply: params.onBlockReply,
          onBlockReplyFlush: params.onBlockReplyFlush,
          blockReplyBreak: params.blockReplyBreak,
          blockReplyChunking: params.blockReplyChunking,
          onPartialReply: params.onPartialReply
            ? async (payload) => {
                recordRunProgress(
                  "assistant_partial",
                  progressSignatureFromPayload("assistant_partial", payload),
                );
                await params.onPartialReply?.(payload);
              }
            : undefined,
          onAssistantMessageStart: async () => {
            recordRunProgress("assistant_message_start", "assistant_message_start");
            await params.onAssistantMessageStart?.();
          },
          onAgentEvent: async (evt) => {
            recordRunProgress(
              `agent_event:${evt.stream}`,
              progressSignatureFromRecord(`agent_event:${evt.stream}`, evt.data),
            );
            if (
              evt.stream === "node-agent" &&
              (evt.data.eventType === "node_agent_native_task_result" ||
                evt.data.eventType === "node_agent_tool_result")
            ) {
              nodeAgentSessionTraceEvents.push(evt.data);
            }
            const checkpointReason = nodeAgentPreemptiveCheckpointReasonForEvent({
              stream: evt.stream,
              data: evt.data,
              tracker: nodeAgentPreemptiveCheckpointTracker,
            });
            if (checkpointReason) {
              appendNodeAgentPreemptiveCheckpoint({
                stream: evt.stream,
                data: evt.data,
                reason: checkpointReason,
                tracker: nodeAgentPreemptiveCheckpointTracker,
                sessionManager: sessionManager!,
                nodeAgentSessionTraceEvents,
                sessionKey: params.sessionKey ?? params.sessionId,
                sessionId: params.sessionId,
                sessionFile: params.sessionFile,
                runId: params.runId,
                agentId: sessionAgentId,
                contextTokenBudget: params.contextTokenBudget ?? DEFAULT_CONTEXT_TOKENS,
                config: params.config,
              });
            }
            params.onAgentEvent?.(evt);
          },
          enforceFinalTag: params.enforceFinalTag,
          silentExpected: params.silentExpected,
          config: params.config,
          sessionKey: sandboxSessionKey,
          sessionId: params.sessionId,
          agentId: sessionAgentId,
          builtinToolNames,
          internalEvents: params.internalEvents,
        }),
      );

      const {
        assistantTexts,
        toolMetas,
        unsubscribe,
        waitForCompactionRetry,
        isCompactionInFlight,
        getItemLifecycle,
        getMessagingToolSentTexts,
        getMessagingToolSentMediaUrls,
        getMessagingToolSentTargets,
        getSuccessfulCronAdds,
        getReplayState,
        didSendViaMessagingTool,
        getLastToolError,
        setTerminalLifecycleMeta,
        getUsageTotals,
        getCompactionCount,
      } = subscription;

      const queueHandle: EmbeddedPiQueueHandle & {
        kind: "embedded";
        cancel: (reason?: "user_abort" | "restart" | "superseded") => void;
      } = {
        kind: "embedded",
        queueMessage: async (text: string) => {
          await activeSession.steer(text);
        },
        isStreaming: () => activeSession.isStreaming,
        isCompacting: () => subscription.isCompacting(),
        cancel: () => {
          abortRun();
        },
        abort: abortRun,
      };
      let lastAssistant: AgentMessage | undefined;
      let currentAttemptAssistant: EmbeddedRunAttemptResult["currentAttemptAssistant"];
      let attemptUsage: NormalizedUsage | undefined;
      let cacheBreak: ReturnType<typeof completePromptCacheObservation> = null;
      let promptCache: EmbeddedRunAttemptResult["promptCache"];
      let finalPromptText: string | undefined;
      if (params.replyOperation) {
        params.replyOperation.attachBackend(queueHandle);
      }
      setActiveEmbeddedRun(params.sessionId, queueHandle, params.sessionKey);

      let abortWarnTimer: NodeJS.Timeout | undefined;
      const isProbeSession = params.sessionId?.startsWith("probe-") ?? false;
      const compactionTimeoutMs = resolveCompactionTimeoutMs(params.config);
      let compactionGraceUsed = false;
      const progressLease = createProgressLeaseTimeout({
        leaseMs: params.timeoutMs,
        onExpire: (event) => {
          const timeoutAction = resolveRunTimeoutDuringCompaction({
            isCompactionPendingOrRetrying: subscription.isCompacting(),
            isCompactionInFlight: activeSession.isCompacting,
            graceAlreadyUsed: compactionGraceUsed,
          });
          if (timeoutAction === "extend") {
            compactionGraceUsed = true;
            if (!isProbeSession) {
              log.warn(
                `embedded run timeout reached during compaction; extending deadline: ` +
                  `runId=${params.runId} sessionId=${params.sessionId} extraMs=${compactionTimeoutMs}`,
              );
            }
            progressLease.schedule(compactionTimeoutMs, "compaction-grace");
            return;
          }

          if (!isProbeSession) {
            log.warn(
              event.reason === "compaction-grace"
                ? `embedded run timeout after compaction grace: runId=${params.runId} sessionId=${params.sessionId} timeoutMs=${params.timeoutMs} compactionGraceMs=${compactionTimeoutMs}`
                : `embedded run no-progress timeout: runId=${params.runId} sessionId=${params.sessionId} leaseMs=${params.timeoutMs} progressCount=${event.progressCount} lastProgress=${event.progressLabel ?? "none"} idleMs=${event.idleMs ?? "unknown"}`,
            );
          }
          if (
            shouldFlagCompactionTimeout({
              isTimeout: true,
              isCompactionPendingOrRetrying: subscription.isCompacting(),
              isCompactionInFlight: activeSession.isCompacting,
            })
          ) {
            timedOutDuringCompaction = true;
          }
          progressTimeoutKind =
            event.progressCount === 0 && event.reason === "initial"
              ? "no_progress_timeout"
              : event.ignoredRepeatedProgressCount > 0
                ? "repeated_low_value_progress"
                : progressTimeoutKind;
          abortRun(true);
          if (!abortWarnTimer) {
            abortWarnTimer = setTimeout(() => {
              if (!activeSession.isStreaming) {
                return;
              }
              if (!isProbeSession) {
                log.warn(
                  `embedded run abort still streaming: runId=${params.runId} sessionId=${params.sessionId}`,
                );
              }
            }, 10_000);
          }
        },
      });
      recordRunProgress = (label?: string, signature?: string) => {
        progressLease.recordProgress(label, signature);
      };
      progressLease.start("initial", params.timeoutMs);

      let messagesSnapshot: AgentMessage[] = [];
      let sessionIdUsed = activeSession.sessionId;
      const onAbort = () => {
        externalAbort = true;
        const reason = params.abortSignal ? getAbortReason(params.abortSignal) : undefined;
        const timeout = reason ? isTimeoutError(reason) : false;
        if (
          shouldFlagCompactionTimeout({
            isTimeout: timeout,
            isCompactionPendingOrRetrying: subscription.isCompacting(),
            isCompactionInFlight: activeSession.isCompacting,
          })
        ) {
          timedOutDuringCompaction = true;
        }
        abortRun(timeout, reason);
      };
      if (params.abortSignal) {
        if (params.abortSignal.aborted) {
          onAbort();
        } else {
          params.abortSignal.addEventListener("abort", onAbort, {
            once: true,
          });
        }
      }

      // Hook runner was already obtained earlier before tool creation
      const hookAgentId = sessionAgentId;

      let promptError: unknown = null;
      let contextPressureOutcome: EmbeddedRunAttemptResult["contextPressureOutcome"];
      let providerContextAdmissionBlock: EmbeddedRunAttemptResult["providerContextAdmissionBlock"];
      let promptErrorOrigin: "prompt" | "compaction" | "precheck" | null = null;
      let skipPromptSubmission = false;
      try {
        const promptStartedAt = Date.now();

        // Run before_prompt_build hooks to allow plugins to inject prompt context.
        // Legacy compatibility: before_agent_start is also checked for context fields.
        let effectivePrompt = prependBootstrapPromptWarning(
          params.prompt,
          bootstrapPromptWarning.lines,
          {
            preserveExactPrompt: heartbeatPrompt,
          },
        );
        const hookCtx = {
          runId: params.runId,
          agentId: hookAgentId,
          sessionKey: params.sessionKey,
          sessionId: params.sessionId,
          workspaceDir: params.workspaceDir,
          modelProviderId: params.model.provider,
          modelId: params.model.id,
          messageProvider: params.messageProvider ?? undefined,
          trigger: params.trigger,
          channelId: params.messageChannel ?? params.messageProvider ?? undefined,
        };
        const hookResult = await resolvePromptBuildHookResult({
          prompt: params.prompt,
          messages: activeSession.messages,
          hookCtx,
          hookRunner,
          legacyBeforeAgentStartResult: params.legacyBeforeAgentStartResult,
        });
        {
          if (hookResult?.prependContext) {
            effectivePrompt = `${hookResult.prependContext}\n\n${effectivePrompt}`;
            log.debug(
              `hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`,
            );
          }
          const legacySystemPrompt = normalizeOptionalString(hookResult?.systemPrompt) ?? "";
          if (legacySystemPrompt) {
            applySystemPromptOverrideToSession(activeSession, legacySystemPrompt);
            systemPromptText = legacySystemPrompt;
            log.debug(`hooks: applied systemPrompt override (${legacySystemPrompt.length} chars)`);
          }
          const prependedOrAppendedSystemPrompt = composeSystemPromptWithHookContext({
            baseSystemPrompt: systemPromptText,
            prependSystemContext: resolveAttemptPrependSystemContext({
              sessionKey: params.sessionKey,
              trigger: params.trigger,
              hookPrependSystemContext: hookResult?.prependSystemContext,
            }),
            appendSystemContext: hookResult?.appendSystemContext,
          });
          if (prependedOrAppendedSystemPrompt) {
            const prependSystemLen = hookResult?.prependSystemContext?.trim().length ?? 0;
            const appendSystemLen = hookResult?.appendSystemContext?.trim().length ?? 0;
            applySystemPromptOverrideToSession(activeSession, prependedOrAppendedSystemPrompt);
            systemPromptText = prependedOrAppendedSystemPrompt;
            log.debug(
              `hooks: applied prependSystemContext/appendSystemContext (${prependSystemLen}+${appendSystemLen} chars)`,
            );
          }
        }
        systemPromptReport = buildAttemptSystemPromptReport(systemPromptText);
        if (params.requiredProviderContextAdmission && !skipPromptSubmission) {
          const admission = evaluateRequiredProviderContextAdmission({
            report: systemPromptReport,
            required: params.requiredProviderContextAdmission,
          });
          if (!admission.admitted) {
            providerContextAdmissionBlock = {
              reason: admission.message ?? undefined,
              reasonCodes: admission.reasonCodes,
            };
            nodeAgentSessionTraceEvents.push({
              eventType: "provider_context_admission_blocked",
              sessionKey: params.sessionKey ?? params.sessionId,
              agentId: sessionAgentId,
              missingWorkspaceFileNames: admission.missingWorkspaceFileNames,
              missingSkillNames: admission.missingSkillNames,
              truncatedWorkspaceFileNames: admission.truncatedWorkspaceFileNames,
              reasonCodes: admission.reasonCodes,
            });
            promptError = new Error(
              admission.message ?? "Provider context admission failed before model invocation.",
            );
            promptErrorOrigin = "precheck";
            skipPromptSubmission = true;
            log.warn(
              `[provider-context-admission] blocked model invocation for ` +
                `${params.provider}/${params.modelId} sessionKey=${params.sessionKey ?? params.sessionId} ` +
                `reasonCodes=${admission.reasonCodes.join(",")}`,
            );
          }
        }

        if (cacheObservabilityEnabled) {
          const cacheObservation = beginPromptCacheObservation({
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
            provider: params.provider,
            modelId: params.modelId,
            modelApi: params.model.api,
            cacheRetention: effectivePromptCacheRetention,
            streamStrategy,
            transport: effectiveAgentTransport,
            systemPrompt: systemPromptText,
            toolNames: promptCacheToolNames,
          });
          promptCacheChangesForTurn = cacheObservation.changes;
          cacheTrace?.recordStage("cache:state", {
            options: {
              snapshot: cacheObservation.snapshot,
              previousCacheRead: cacheObservation.previousCacheRead ?? undefined,
              changes:
                cacheObservation.changes?.map((change) => ({
                  code: change.code,
                  detail: change.detail,
                })) ?? undefined,
            },
          });
        }

        const googlePromptCacheStreamFn = await prepareGooglePromptCacheStreamFn({
          apiKey: await resolveEmbeddedAgentApiKey({
            provider: params.provider,
            resolvedApiKey: params.resolvedApiKey,
            authStorage: params.authStorage,
          }),
          extraParams: effectiveExtraParams,
          model: params.model,
          modelId: params.modelId,
          provider: params.provider,
          sessionManager,
          signal: runAbortController.signal,
          streamFn: activeSession.agent.streamFn,
          systemPrompt: systemPromptText,
        });
        if (googlePromptCacheStreamFn) {
          activeSession.agent.streamFn = googlePromptCacheStreamFn;
        }

        const routingSummary = describeProviderRequestRoutingSummary({
          provider: params.provider,
          api: params.model.api,
          baseUrl: params.model.baseUrl,
          capability: "llm",
          transport: "stream",
        });
        log.debug(
          `embedded run prompt start: runId=${params.runId} sessionId=${params.sessionId} ` +
            routingSummary,
        );
        cacheTrace?.recordStage("prompt:before", {
          prompt: effectivePrompt,
          messages: activeSession.messages,
        });

        // Repair orphaned trailing user messages so new prompts don't violate role ordering.
        const leafEntry = sessionManager.getLeafEntry();
        if (leafEntry?.type === "message" && leafEntry.message.role === "user") {
          const orphanPromptMerge = mergeOrphanedTrailingUserPrompt({
            prompt: effectivePrompt,
            trigger: params.trigger,
            leafMessage: leafEntry.message,
          });
          effectivePrompt = orphanPromptMerge.prompt;
          if (leafEntry.parentId) {
            sessionManager.branch(leafEntry.parentId);
          } else {
            sessionManager.resetLeaf();
          }
          const sessionContext = sessionManager.buildSessionContext();
          activeSession.agent.state.messages = sessionContext.messages;
          const orphanRepairMessage =
            `${orphanPromptMerge.merged ? "Merged and removed" : "Removed"} orphaned user message ` +
            `to prevent consecutive user turns. ` +
            `runId=${params.runId} sessionId=${params.sessionId} trigger=${params.trigger}`;
          if (shouldWarnOnOrphanedUserRepair(params.trigger)) {
            log.warn(orphanRepairMessage);
          } else {
            log.debug(orphanRepairMessage);
          }
        }
        const transcriptLeafId =
          (sessionManager.getLeafEntry() as { id?: string } | null | undefined)?.id ?? null;
        const heartbeatSummary =
          params.config && sessionAgentId
            ? resolveHeartbeatSummaryForAgent(params.config, sessionAgentId)
            : undefined;

        try {
          // Idempotent cleanup: prune old image blocks to limit context
          // growth. Only mutates turns older than a few assistant replies;
          // the delay also reduces prompt-cache churn.
          const didPruneImages = pruneProcessedHistoryImages(activeSession.messages);
          if (didPruneImages) {
            activeSession.agent.state.messages = activeSession.messages;
          }

          const filteredMessages = filterHeartbeatPairs(
            activeSession.messages,
            heartbeatSummary?.ackMaxChars,
            heartbeatSummary?.prompt,
          );
          if (filteredMessages.length < activeSession.messages.length) {
            activeSession.agent.state.messages = filteredMessages;
          }
          prePromptMessageCount = activeSession.messages.length;

          // Detect and load images referenced in the prompt for vision-capable models.
          // Images are prompt-local only (pi-like behavior).
          const imageResult = await detectAndLoadPromptImages({
            prompt: effectivePrompt,
            workspaceDir: effectiveWorkspace,
            model: params.model,
            existingImages: params.images,
            imageOrder: params.imageOrder,
            maxBytes: MAX_IMAGE_BYTES,
            maxDimensionPx: resolveImageSanitizationLimits(params.config).maxDimensionPx,
            workspaceOnly: effectiveFsWorkspaceOnly,
            // Enforce sandbox path restrictions when sandbox is enabled
            sandbox:
              sandbox?.enabled && sandbox?.fsBridge
                ? { root: sandbox.workspaceDir, bridge: sandbox.fsBridge }
                : undefined,
          });

          cacheTrace?.recordStage("prompt:images", {
            prompt: effectivePrompt,
            messages: activeSession.messages,
            note: `images: prompt=${imageResult.images.length}`,
          });

          // Diagnostic: log context sizes before prompt to help debug early overflow errors.
          if (log.isEnabled("debug")) {
            const msgCount = activeSession.messages.length;
            const systemLen = systemPromptText?.length ?? 0;
            const promptLen = effectivePrompt.length;
            const sessionSummary = summarizeSessionContext(activeSession.messages);
            log.debug(
              `[context-diag] pre-prompt: sessionKey=${params.sessionKey ?? params.sessionId} ` +
                `messages=${msgCount} roleCounts=${sessionSummary.roleCounts} ` +
                `historyTextChars=${sessionSummary.totalTextChars} ` +
                `maxMessageTextChars=${sessionSummary.maxMessageTextChars} ` +
                `historyImageBlocks=${sessionSummary.totalImageBlocks} ` +
                `systemPromptChars=${systemLen} promptChars=${promptLen} ` +
                `promptImages=${imageResult.images.length} ` +
                `provider=${params.provider}/${params.modelId} sessionFile=${params.sessionFile}`,
            );
          }

          if (hookRunner?.hasHooks("llm_input")) {
            hookRunner
              .runLlmInput(
                {
                  runId: params.runId,
                  sessionId: params.sessionId,
                  provider: params.provider,
                  model: params.modelId,
                  systemPrompt: systemPromptText,
                  prompt: effectivePrompt,
                  historyMessages: activeSession.messages,
                  imagesCount: imageResult.images.length,
                },
                {
                  runId: params.runId,
                  agentId: hookAgentId,
                  sessionKey: params.sessionKey,
                  sessionId: params.sessionId,
                  workspaceDir: params.workspaceDir,
                  messageProvider: params.messageProvider ?? undefined,
                  trigger: params.trigger,
                  channelId: params.messageChannel ?? params.messageProvider ?? undefined,
                },
              )
              .catch((err) => {
                log.warn(`llm_input hook failed: ${String(err)}`);
              });
          }

          const reserveTokens = settingsManager.getCompactionReserveTokens();
          const contextTokenBudget = params.contextTokenBudget ?? DEFAULT_CONTEXT_TOKENS;
          const preferActualUsageCompaction = shouldPreferActualUsageCompaction({
            provider: params.provider,
            modelId: params.modelId,
            model: params.model as { compat?: unknown; baseUrl?: unknown; provider?: unknown },
          });
          const contextPressure = params.contextPressure ?? createContextPressureController();
          const toolResultMaxChars = resolveLiveToolResultMaxChars({
            contextWindowTokens: contextTokenBudget,
            cfg: params.config,
            agentId: sessionAgentId,
          });
          const toolResultPotential = estimateToolResultReductionPotential({
            messages: activeSession.messages,
            contextWindowTokens: contextTokenBudget,
            maxCharsOverride: toolResultMaxChars,
          });
          const providerVisibleContextBreakdown = estimateProviderVisibleContextBreakdown(
            activeSession.messages,
          );
          if (!sessionManager) {
            throw new Error("Session manager was not initialized before provider submit.");
          }
          const initializedSessionManager = sessionManager;
          const beforeSubmitPressure = await contextPressure.beforeSubmit({
            messages: activeSession.messages,
            systemPrompt: systemPromptText,
            prompt: effectivePrompt,
            contextWindowTokens: contextTokenBudget,
            reserveTokens,
            preferActualUsageCompaction,
            contextEngineOwnsCompaction: params.contextEngine?.info?.ownsCompaction === true,
            pruneReducibleChars: toolResultPotential.maxReducibleChars,
            protectedContextReason: hasDeliveredNativeTaskResultAwaitingParentTurn(
              activeSession.messages,
            )
              ? NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_REASON
              : undefined,
            contextBreakdown: toContextPressureBreakdown(providerVisibleContextBreakdown),
            truncateToolResults: () =>
              truncateOversizedToolResultsInSessionManager({
                sessionManager: initializedSessionManager,
                contextWindowTokens: contextTokenBudget,
                maxCharsOverride: toolResultMaxChars,
                sessionFile: params.sessionFile,
                sessionId: params.sessionId,
                sessionKey: params.sessionKey,
                stateRoot: resolveStateDir(process.env),
              }),
            emit: (event) => {
              nodeAgentSessionTraceEvents.push({
                ...event,
                sessionKey: params.sessionKey ?? params.sessionId,
                runId: params.runId,
                agentId: sessionAgentId,
                provider: params.provider,
                model: params.modelId,
              });
            },
          });
          const pressureDecision = beforeSubmitPressure.decision;
          if (
            beforeSubmitPressure.action === "block" &&
            beforeSubmitPressure.reason === NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_REASON
          ) {
            contextPressureOutcome = beforeSubmitPressure;
            nodeAgentSessionTraceEvents.push({
              eventType: "node_agent_native_task_result_context_preservation_blocked",
              reason: NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_REASON,
              action: pressureDecision.action,
              trigger: pressureDecision.trigger,
              sessionKey: params.sessionKey ?? params.sessionId,
              estimatedPromptTokens: pressureDecision.estimate?.promptTokens ?? 0,
              usableContextTokens: pressureDecision.budget.usableTokens,
              overflowTokens: pressureDecision.pressure?.overBudgetTokens ?? 0,
              pruneReducibleChars: pressureDecision.prune?.reducibleChars ?? 0,
              reserveTokens: pressureDecision.budget.reserveTokens,
              ...providerVisibleContextBreakdown,
            });
            promptError = new Error(NATIVE_TASK_RESULT_AWAITING_PARENT_CONTEXT_ERROR_TEXT);
            promptErrorOrigin = "precheck";
            log.warn(
              `[context-overflow-precheck] blocked recovery that would compact or truncate a ` +
                `delivered native task result before parent synthesis ` +
                `sessionKey=${params.sessionKey ?? params.sessionId} ` +
                `provider=${params.provider}/${params.modelId} ` +
                `action=${pressureDecision.action} trigger=${pressureDecision.trigger} ` +
                `estimatedPromptTokens=${pressureDecision.estimate?.promptTokens ?? 0} ` +
                `usableContextTokens=${pressureDecision.budget.usableTokens} ` +
                `overflowTokens=${pressureDecision.pressure?.overBudgetTokens ?? 0} ` +
                `pruneReducibleChars=${pressureDecision.prune?.reducibleChars ?? 0} ` +
                `reserveTokens=${reserveTokens} ` +
                `sourceOrLocatorChars=${providerVisibleContextBreakdown.likelySourceOrLocatorChars} ` +
                `nonSourceVisibleChars=${providerVisibleContextBreakdown.nonSourceVisibleChars} ` +
                `strippedToolDetailsChars=${providerVisibleContextBreakdown.strippedToolDetailsChars} ` +
                `sessionFile=${params.sessionFile}`,
            );
            skipPromptSubmission = true;
          }
          if (!skipPromptSubmission && beforeSubmitPressure.action === "prune_retry") {
            if ("prune" in beforeSubmitPressure && beforeSubmitPressure.prune.truncated) {
              contextPressureOutcome = beforeSubmitPressure;
              log.info(
                `[context-overflow-precheck] early tool-result truncation succeeded for ` +
                  `${params.provider}/${params.modelId} action=${pressureDecision.action} ` +
                  `truncatedCount=${beforeSubmitPressure.prune.truncatedCount ?? 0} ` +
                  `estimatedPromptTokens=${pressureDecision.estimate?.promptTokens ?? 0} ` +
                  `usableContextTokens=${pressureDecision.budget.usableTokens} ` +
                  `overflowTokens=${pressureDecision.pressure?.overBudgetTokens ?? 0} ` +
                  `pruneReducibleChars=${pressureDecision.prune?.reducibleChars ?? 0} ` +
                  `sourceOrLocatorChars=${providerVisibleContextBreakdown.likelySourceOrLocatorChars} ` +
                  `nonSourceVisibleChars=${providerVisibleContextBreakdown.nonSourceVisibleChars} ` +
                  `strippedToolDetailsChars=${providerVisibleContextBreakdown.strippedToolDetailsChars} ` +
                  `sessionFile=${params.sessionFile}`,
              );
              skipPromptSubmission = true;
            }
            if (!skipPromptSubmission) {
              log.warn(
                `[context-overflow-precheck] early tool-result truncation did not help for ` +
                  `${params.provider}/${params.modelId}; falling back to compaction ` +
                  `reason=${pressureDecision.prune?.reason ?? "unknown"} sessionFile=${params.sessionFile}`,
              );
              contextPressureOutcome = beforeSubmitPressure;
              promptError = new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT);
              promptErrorOrigin = "precheck";
              skipPromptSubmission = true;
            }
          }
          if (!skipPromptSubmission && beforeSubmitPressure.action === "summary_retry") {
            contextPressureOutcome = beforeSubmitPressure;
            promptError = new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT);
            promptErrorOrigin = "precheck";
            log.warn(
              `[context-overflow-precheck] sessionKey=${params.sessionKey ?? params.sessionId} ` +
                `provider=${params.provider}/${params.modelId} ` +
                `action=${pressureDecision.action} trigger=${pressureDecision.trigger} ` +
                `estimatedPromptTokens=${pressureDecision.estimate?.promptTokens ?? 0} ` +
                `usableContextTokens=${pressureDecision.budget.usableTokens} ` +
                `overflowTokens=${pressureDecision.pressure?.overBudgetTokens ?? 0} ` +
                `pruneReducibleChars=${pressureDecision.prune?.reducibleChars ?? 0} ` +
                `reserveTokens=${reserveTokens} ` +
                `sourceOrLocatorChars=${providerVisibleContextBreakdown.likelySourceOrLocatorChars} ` +
                `nonSourceVisibleChars=${providerVisibleContextBreakdown.nonSourceVisibleChars} ` +
                `strippedToolDetailsChars=${providerVisibleContextBreakdown.strippedToolDetailsChars} ` +
                `sessionFile=${params.sessionFile}`,
            );
            skipPromptSubmission = true;
          }

          const preflightReasonCodes = providerContextAdmissionBlock?.reasonCodes ?? [];
          const launchBlockers = skipPromptSubmission
            ? preflightReasonCodes.length
              ? preflightReasonCodes
              : promptErrorOrigin
                ? [`${promptErrorOrigin}_blocked_before_model_invocation`]
                : ["model_invocation_blocked_before_provider_submission"]
            : [];
          const launchAdmissionStatus = launchBlockers.length > 0 ? "blocked" : "accepted";
          const sessionLaunchToolCatalogRef = `openclaw-effective-tool-inventory://${encodeURIComponent(
            params.sessionKey ?? params.sessionId,
          )}`;
          const sessionLaunchToolCatalogSummary =
            buildSessionLaunchToolCatalogSummary(effectiveTools);
          const sessionLaunchLocation = buildSessionLaunchLocation({
            sourceRoot: resolveBootstrapRepoRoot({
              importMetaUrl: import.meta.url,
              cwd: process.cwd(),
            }),
            workspaceRoot: effectiveWorkspace,
            stateRoot: resolveStateDir(process.env),
          });
          const sessionLaunch = await updateSessionLaunch({
            storePath: sessionStorePath,
            input: {
              sessionKey: params.sessionKey ?? params.sessionId,
              agentId: sessionAgentId,
              runId: params.runId,
              nodeRunId: params.nodeRunId ?? params.runId,
              parentSessionKey: params.spawnedBy ?? null,
              parentToolCallId: params.parentToolCallId ?? null,
              admissionStatus: launchAdmissionStatus,
              blockerKind: launchBlockers[0] ?? null,
              provider: params.provider,
              model: params.modelId,
              cwd: effectiveWorkspace,
              resolvedLocation: sessionLaunchLocation.resolvedLocation,
              sourceIdentity: sessionLaunchLocation.sourceIdentity,
              workspaceIdentity: sessionLaunchLocation.workspaceIdentity,
              reasoningLevel: params.reasoningLevel,
              thinkingLevel: params.thinkLevel,
              promptHash: stableAttemptTextHash(effectivePrompt),
              submittedPromptHash: skipPromptSubmission
                ? null
                : stableAttemptTextHash(effectivePrompt),
              promptHashMatched: skipPromptSubmission ? null : true,
              requiredSources: launchRequiredSourcesFromSystemPromptReport({
                agentId: sessionAgentId,
                report: systemPromptReport,
              }),
              toolCatalogRef: sessionLaunchToolCatalogRef,
              effectiveToolNames,
              toolCatalogSummary: sessionLaunchToolCatalogSummary,
              allowedChildAgentIds: params.nodeAgentNativeTaskMode?.allowedAgentIds ?? [],
              blockers: launchBlockers,
              reasonCodes: [
                launchAdmissionStatus === "accepted"
                  ? "session_launch_accepted_before_provider_submission"
                  : "session_launch_blocked_before_provider_submission",
                ...launchBlockers,
              ],
            },
          });
          nodeAgentSessionTraceEvents.push({
            eventType: "session_launch",
            sessionKey: params.sessionKey ?? params.sessionId,
            agentId: sessionAgentId,
            admissionStatus: launchAdmissionStatus,
            blockerKind: launchBlockers[0] ?? null,
            provider: params.provider ?? null,
            model: params.modelId ?? null,
            cwd: effectiveWorkspace,
            reasoningLevel: params.reasoningLevel ?? null,
            thinkingLevel: params.thinkLevel ?? null,
            promptHashMatched: skipPromptSubmission ? null : true,
            toolCatalogRef: sessionLaunchToolCatalogRef,
            toolCatalogSummary: sessionLaunchToolCatalogSummary,
            persisted: sessionLaunch.persisted,
            sessionLaunchRef: sessionLaunch.launchRef,
            ...(sessionLaunch.persisted
              ? { sessionLaunchEventRef: sessionLaunch.launchEventRef }
              : { sessionLaunchPersistFailureReason: sessionLaunch.reason }),
            reasonCodes: sessionLaunch.persisted
              ? ["session_launch_event_persisted"]
              : [`session_launch_event_not_persisted:${sessionLaunch.reason}`],
          });

          if (!skipPromptSubmission) {
            finalPromptText = effectivePrompt;
            const btwSnapshotMessages = activeSession.messages.slice(-MAX_BTW_SNAPSHOT_MESSAGES);
            updateActiveEmbeddedRunSnapshot(params.sessionId, {
              transcriptLeafId,
              messages: btwSnapshotMessages,
              inFlightPrompt: effectivePrompt,
            });

            // Only pass images option if there are actually images to pass
            // This avoids potential issues with models that don't expect the images parameter
            if (imageResult.images.length > 0) {
              await abortable(
                activeSession.prompt(effectivePrompt, { images: imageResult.images }),
              );
            } else {
              await abortable(activeSession.prompt(effectivePrompt));
            }
          }
        } catch (err) {
          yieldAborted =
            yieldDetected &&
            isRunnerAbortError(err) &&
            err instanceof Error &&
            err.cause === "sessions_yield";
          if (yieldAborted) {
            aborted = false;
            await waitForSessionsYieldAbortSettle({
              settlePromise: yieldAbortSettled,
              runId: params.runId,
              sessionId: params.sessionId,
            });
            stripSessionsYieldArtifacts(activeSession);
            if (yieldMessage) {
              await persistSessionsYieldContextMessage(activeSession, yieldMessage);
            }
          } else {
            promptError = err;
            promptErrorOrigin = "prompt";
          }
        } finally {
          log.debug(
            `embedded run prompt end: runId=${params.runId} sessionId=${params.sessionId} durationMs=${Date.now() - promptStartedAt}`,
          );
        }

        // Capture snapshot before compaction wait so we have complete messages if timeout occurs
        // Check compaction state before and after to avoid race condition where compaction starts during capture
        // Use session state (not subscription) for snapshot decisions - need instantaneous compaction status
        const wasCompactingBefore = activeSession.isCompacting;
        const snapshot = activeSession.messages.slice();
        const wasCompactingAfter = activeSession.isCompacting;
        // Only trust snapshot if compaction wasn't running before or after capture
        const preCompactionSnapshot = wasCompactingBefore || wasCompactingAfter ? null : snapshot;
        const preCompactionSessionId = activeSession.sessionId;
        const COMPACTION_RETRY_AGGREGATE_TIMEOUT_MS = 60_000;

        try {
          // Flush buffered block replies before waiting for compaction so the
          // user receives the assistant response immediately.  Without this,
          // coalesced/buffered blocks stay in the pipeline until compaction
          // finishes — which can take minutes on large contexts (#35074).
          if (params.onBlockReplyFlush) {
            await params.onBlockReplyFlush();
          }

          // Skip compaction wait when yield aborted the run — the signal is
          // already tripped and abortable() would immediately reject.
          const compactionRetryWait = yieldAborted
            ? { timedOut: false }
            : await waitForCompactionRetryWithAggregateTimeout({
                waitForCompactionRetry,
                abortable,
                aggregateTimeoutMs: COMPACTION_RETRY_AGGREGATE_TIMEOUT_MS,
                isCompactionStillInFlight: isCompactionInFlight,
              });
          if (compactionRetryWait.timedOut) {
            timedOutDuringCompaction = true;
            if (!isProbeSession) {
              log.warn(
                `compaction retry aggregate timeout (${COMPACTION_RETRY_AGGREGATE_TIMEOUT_MS}ms): ` +
                  `proceeding with pre-compaction state runId=${params.runId} sessionId=${params.sessionId}`,
              );
            }
          }
        } catch (err) {
          if (isRunnerAbortError(err)) {
            if (!promptError) {
              promptError = err;
              promptErrorOrigin = "compaction";
            }
            if (!isProbeSession) {
              log.debug(
                `compaction wait aborted: runId=${params.runId} sessionId=${params.sessionId}`,
              );
            }
          } else {
            throw err;
          }
        }

        // Check if ANY compaction occurred during the entire attempt (prompt + retry).
        // Using a cumulative count (> 0) instead of a delta check avoids missing
        // compactions that complete during activeSession.prompt() before the delta
        // baseline is sampled.
        const compactionOccurredThisAttempt = getCompactionCount() > 0;
        // Append cache-TTL timestamp AFTER prompt + compaction retry completes.
        // Previously this was before the prompt, which caused a custom entry to be
        // inserted between compaction and the next prompt — breaking the
        // prepareCompaction() guard that checks the last entry type, leading to
        // double-compaction. See: https://github.com/openclaw/openclaw/issues/9282
        // Skip when timed out during compaction — session state may be inconsistent.
        // Also skip when compaction ran this attempt — appending a custom entry
        // after compaction would break the guard again. See: #28491
        appendAttemptCacheTtlIfNeeded({
          sessionManager,
          timedOutDuringCompaction,
          compactionOccurredThisAttempt,
          config: params.config,
          provider: params.provider,
          modelId: params.modelId,
          modelApi: params.model.api,
          isCacheTtlEligibleProvider,
        });

        // If timeout occurred during compaction, use pre-compaction snapshot when available
        // (compaction restructures messages but does not add user/assistant turns).
        const snapshotSelection = selectCompactionTimeoutSnapshot({
          timedOutDuringCompaction,
          preCompactionSnapshot,
          preCompactionSessionId,
          currentSnapshot: activeSession.messages.slice(),
          currentSessionId: activeSession.sessionId,
        });
        if (timedOutDuringCompaction) {
          if (!isProbeSession) {
            log.warn(
              `using ${snapshotSelection.source} snapshot: timed out during compaction runId=${params.runId} sessionId=${params.sessionId}`,
            );
          }
        }
        messagesSnapshot = snapshotSelection.messagesSnapshot;
        sessionIdUsed = snapshotSelection.sessionIdUsed;

        lastAssistant = messagesSnapshot
          .slice()
          .toReversed()
          .find((m) => m.role === "assistant");
        currentAttemptAssistant = findCurrentAttemptAssistantMessage({
          messagesSnapshot,
          prePromptMessageCount,
        });
        attemptUsage = getUsageTotals();
        cacheBreak = cacheObservabilityEnabled
          ? completePromptCacheObservation({
              sessionId: params.sessionId,
              sessionKey: params.sessionKey,
              usage: attemptUsage,
            })
          : null;
        const lastCallUsage = normalizeUsage(currentAttemptAssistant?.usage);
        const promptCacheObservation =
          cacheObservabilityEnabled &&
          (cacheBreak || promptCacheChangesForTurn || typeof attemptUsage?.cacheRead === "number")
            ? {
                broke: Boolean(cacheBreak),
                ...(typeof cacheBreak?.previousCacheRead === "number"
                  ? { previousCacheRead: cacheBreak.previousCacheRead }
                  : {}),
                ...(typeof cacheBreak?.cacheRead === "number"
                  ? { cacheRead: cacheBreak.cacheRead }
                  : typeof attemptUsage?.cacheRead === "number"
                    ? { cacheRead: attemptUsage.cacheRead }
                    : {}),
                changes: cacheBreak?.changes ?? promptCacheChangesForTurn,
              }
            : undefined;
        promptCache = buildContextEnginePromptCacheInfo({
          retention: effectivePromptCacheRetention,
          lastCallUsage,
          observation: promptCacheObservation,
          lastCacheTouchAt: readLastCacheTtlTimestamp(sessionManager, {
            provider: params.provider,
            modelId: params.modelId,
          }),
        });

        if (promptError && promptErrorOrigin === "prompt" && !compactionOccurredThisAttempt) {
          try {
            sessionManager.appendCustomEntry("openclaw:prompt-error", {
              timestamp: Date.now(),
              runId: params.runId,
              sessionId: params.sessionId,
              provider: params.provider,
              model: params.modelId,
              api: params.model.api,
              error: formatErrorMessage(promptError),
            });
          } catch (entryErr) {
            log.warn(`failed to persist prompt error entry: ${String(entryErr)}`);
          }
        }

        // Let the active context engine run its post-turn lifecycle.
        if (params.contextEngine) {
          const runtimeCurrentTokenCount = derivePromptTokens(lastCallUsage);
          const afterTurnRuntimeContext = buildAfterTurnRuntimeContext({
            attempt: params,
            workspaceDir: effectiveWorkspace,
            agentDir,
            tokenBudget: params.contextTokenBudget,
            currentTokenCount: runtimeCurrentTokenCount,
            promptCache,
          });
          await finalizeAttemptContextEngineTurn({
            contextEngine: params.contextEngine,
            promptError: Boolean(promptError),
            aborted,
            yieldAborted,
            sessionIdUsed,
            sessionKey: params.sessionKey,
            sessionFile: params.sessionFile,
            messagesSnapshot,
            prePromptMessageCount,
            tokenBudget: params.contextTokenBudget,
            runtimeContext: afterTurnRuntimeContext,
            runMaintenance: async (contextParams) =>
              await runContextEngineMaintenance({
                contextEngine: contextParams.contextEngine as never,
                sessionId: contextParams.sessionId,
                sessionKey: contextParams.sessionKey,
                sessionFile: contextParams.sessionFile,
                reason: contextParams.reason,
                sessionManager: contextParams.sessionManager as never,
                runtimeContext: contextParams.runtimeContext,
              }),
            sessionManager,
            warn: (message) => log.warn(message),
          });
        }

        if (
          shouldPersistCompletedBootstrapTurn({
            shouldRecordCompletedBootstrapTurn,
            promptError,
            aborted,
            timedOutDuringCompaction,
            compactionOccurredThisAttempt,
          })
        ) {
          try {
            sessionManager.appendCustomEntry(FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE, {
              timestamp: Date.now(),
              runId: params.runId,
              sessionId: params.sessionId,
            });
          } catch (entryErr) {
            log.warn(`failed to persist bootstrap completion entry: ${String(entryErr)}`);
          }
        }

        if (messagesSnapshot.length > 0) {
          try {
            const providerTurnOptics = buildProviderTurnOptics({
              messages: messagesSnapshot,
              tools: effectiveTools,
              agentId: sessionAgentId,
              sessionKey: params.sessionKey ?? params.sessionId,
              runId: params.runId,
              provider: params.provider,
              model: params.modelId,
              thinkingLevel: params.thinkLevel,
            });
            sessionManager.appendCustomEntry(PROVIDER_TURN_OPTICS_CUSTOM_TYPE, providerTurnOptics);
            nodeAgentSessionTraceEvents.push(providerTurnOptics);
            const providerResponseNormalizationReceipt = buildProviderResponseNormalizationReceipt({
              messages: messagesSnapshot,
              agentId: sessionAgentId,
              sessionKey: params.sessionKey ?? params.sessionId,
              runId: params.runId,
              provider: params.provider,
              model: params.modelId,
              thinkingLevel: params.thinkLevel,
            });
            sessionManager.appendCustomEntry(
              PROVIDER_RESPONSE_NORMALIZATION_CUSTOM_TYPE,
              providerResponseNormalizationReceipt,
            );
            nodeAgentSessionTraceEvents.push(providerResponseNormalizationReceipt);
          } catch (entryErr) {
            log.warn(`failed to persist provider turn optics: ${String(entryErr)}`);
          }
        }

        cacheTrace?.recordStage("session:after", {
          messages: messagesSnapshot,
          note: timedOutDuringCompaction
            ? "compaction timeout"
            : promptError
              ? "prompt error"
              : undefined,
        });
        anthropicPayloadLogger?.recordUsage(messagesSnapshot, promptError);

        void recordModelMemoryProductionHookProbe({
          hookName: "agent_end",
          triggerSurface: "pi_embedded_runner.agent_end",
          payload: {
            messageCount: messagesSnapshot.length,
            success: !aborted && !promptError,
            durationMs: Date.now() - promptStartedAt,
            trigger: params.trigger,
          },
          context: {
            runId: params.runId,
            agentId: hookAgentId,
            sessionKey: params.sessionKey,
            sessionId: params.sessionId,
            workspaceDir: params.workspaceDir,
            messageProvider: params.messageProvider ?? undefined,
            channelId: params.messageChannel ?? params.messageProvider ?? undefined,
          },
        }).catch(() => undefined);
        void recordModelMemoryCaptureSeamEvidence({
          seamName: "agent_end",
          triggerSurface: "pi_embedded_runner.agent_end",
          payload: {
            messageCount: messagesSnapshot.length,
            success: !aborted && !promptError,
            durationMs: Date.now() - promptStartedAt,
            trigger: params.trigger,
          },
          context: {
            runId: params.runId,
            agentId: hookAgentId,
            sessionKey: params.sessionKey,
            sessionId: params.sessionId,
            workspaceDir: params.workspaceDir,
            messageProvider: params.messageProvider ?? undefined,
            channelId: params.messageChannel ?? params.messageProvider ?? undefined,
          },
        }).catch(() => undefined);

        // Run agent_end hooks to allow plugins to analyze the conversation
        // This is fire-and-forget, so we don't await
        // Run even on compaction timeout so plugins can log/cleanup
        if (hookRunner?.hasHooks("agent_end")) {
          hookRunner
            .runAgentEnd(
              {
                messages: messagesSnapshot,
                success: !aborted && !promptError,
                error: promptError ? formatErrorMessage(promptError) : undefined,
                durationMs: Date.now() - promptStartedAt,
              },
              {
                runId: params.runId,
                agentId: hookAgentId,
                sessionKey: params.sessionKey,
                sessionId: params.sessionId,
                workspaceDir: params.workspaceDir,
                messageProvider: params.messageProvider ?? undefined,
                trigger: params.trigger,
                channelId: params.messageChannel ?? params.messageProvider ?? undefined,
              },
            )
            .catch((err) => {
              log.warn(`agent_end hook failed: ${err}`);
            });
        }
      } finally {
        progressLease.cancel();
        if (abortWarnTimer) {
          clearTimeout(abortWarnTimer);
        }
        if (!isProbeSession && (aborted || timedOut) && !timedOutDuringCompaction) {
          log.debug(
            `run cleanup: runId=${params.runId} sessionId=${params.sessionId} aborted=${aborted} timedOut=${timedOut}`,
          );
        }
        try {
          unsubscribe();
        } catch (err) {
          // unsubscribe() should never throw; if it does, it indicates a serious bug.
          // Log at error level to ensure visibility, but don't rethrow in finally block
          // as it would mask any exception from the try block above.
          log.error(
            `CRITICAL: unsubscribe failed, possible resource leak: runId=${params.runId} ${String(err)}`,
          );
        }
        if (params.replyOperation) {
          params.replyOperation.detachBackend(queueHandle);
        }
        clearActiveEmbeddedRun(params.sessionId, queueHandle, params.sessionKey);
        params.abortSignal?.removeEventListener?.("abort", onAbort);
      }

      const toolMetasNormalized = toolMetas
        .filter(
          (entry): entry is { toolName: string; meta?: string } =>
            typeof entry.toolName === "string" && entry.toolName.trim().length > 0,
        )
        .map((entry) => ({ toolName: entry.toolName, meta: entry.meta }));
      if (cacheObservabilityEnabled) {
        if (cacheBreak) {
          const changeSummary =
            cacheBreak.changes?.map((change) => `${change.code}(${change.detail})`).join(", ") ??
            "no tracked cache input change";
          log.warn(
            `[prompt-cache] cache read dropped ${cacheBreak.previousCacheRead} -> ${cacheBreak.cacheRead} ` +
              `for ${params.provider}/${params.modelId} via ${streamStrategy}; ${changeSummary}`,
          );
          cacheTrace?.recordStage("cache:result", {
            options: {
              previousCacheRead: cacheBreak.previousCacheRead,
              cacheRead: cacheBreak.cacheRead,
              changes:
                cacheBreak.changes?.map((change) => ({
                  code: change.code,
                  detail: change.detail,
                })) ?? undefined,
            },
          });
        } else if (cacheTrace && promptCacheChangesForTurn) {
          cacheTrace.recordStage("cache:result", {
            note: "state changed without a cache-read break",
            options: {
              cacheRead: attemptUsage?.cacheRead ?? 0,
              changes: promptCacheChangesForTurn.map((change) => ({
                code: change.code,
                detail: change.detail,
              })),
            },
          });
        } else if (cacheTrace) {
          cacheTrace.recordStage("cache:result", {
            note: "stable cache inputs",
            options: {
              cacheRead: attemptUsage?.cacheRead ?? 0,
            },
          });
        }
      }

      if (hookRunner?.hasHooks("llm_output")) {
        hookRunner
          .runLlmOutput(
            {
              runId: params.runId,
              sessionId: params.sessionId,
              provider: params.provider,
              model: params.modelId,
              assistantTexts,
              lastAssistant,
              usage: attemptUsage,
            },
            {
              runId: params.runId,
              agentId: hookAgentId,
              sessionKey: params.sessionKey,
              sessionId: params.sessionId,
              workspaceDir: params.workspaceDir,
              messageProvider: params.messageProvider ?? undefined,
              trigger: params.trigger,
              channelId: params.messageChannel ?? params.messageProvider ?? undefined,
            },
          )
          .catch((err) => {
            log.warn(`llm_output hook failed: ${String(err)}`);
          });
      }

      const observedReplayMetadata = buildAttemptReplayMetadata({
        toolMetas: toolMetasNormalized,
        didSendViaMessagingTool: didSendViaMessagingTool(),
        successfulCronAdds: getSuccessfulCronAdds(),
      });
      const replayMetadata = replayMetadataFromState(
        observeReplayMetadata(getReplayState(), observedReplayMetadata),
      );

      return {
        replayMetadata,
        itemLifecycle: getItemLifecycle(),
        setTerminalLifecycleMeta,
        aborted,
        externalAbort,
        timedOut,
        idleTimedOut,
        timedOutDuringCompaction,
        progressTimeoutKind,
        promptError,
        promptErrorOrigin,
        contextPressureOutcome,
        providerContextAdmissionBlock,
        sessionIdUsed,
        bootstrapPromptWarningSignaturesSeen: bootstrapPromptWarning.warningSignaturesSeen,
        bootstrapPromptWarningSignature: bootstrapPromptWarning.signature,
        systemPromptReport,
        finalPromptText,
        effectiveToolNames,
        messagesSnapshot,
        assistantTexts,
        toolMetas: toolMetasNormalized,
        nodeAgentSessionTrace: buildNodeAgentSessionTraceFromEvents(nodeAgentSessionTraceEvents),
        lastAssistant,
        currentAttemptAssistant,
        lastToolError: getLastToolError?.(),
        didSendViaMessagingTool: didSendViaMessagingTool(),
        messagingToolSentTexts: getMessagingToolSentTexts(),
        messagingToolSentMediaUrls: getMessagingToolSentMediaUrls(),
        messagingToolSentTargets: getMessagingToolSentTargets(),
        successfulCronAdds: getSuccessfulCronAdds(),
        cloudCodeAssistFormatError: Boolean(
          lastAssistant?.errorMessage && isCloudCodeAssistFormatError(lastAssistant.errorMessage),
        ),
        attemptUsage,
        promptCache,
        compactionCount: getCompactionCount(),
        // Client tool call detected (OpenResponses hosted tools)
        clientToolCall: clientToolCallDetected ?? undefined,
        yieldDetected: yieldDetected || undefined,
        sessionLockTrace: parentSessionLockHandoff.getCurrentLock().trace,
      };
    } finally {
      // Always tear down the session (and release the lock) before we leave this attempt.
      //
      // BUGFIX: Wait for the agent to be truly idle before flushing pending tool results.
      // pi-agent-core's auto-retry resolves waitForRetry() on assistant message receipt,
      // *before* tool execution completes in the retried agent loop. Without this wait,
      // flushPendingToolResults() fires while tools are still executing, inserting
      // synthetic "missing tool result" errors and causing silent agent failures.
      // See: https://github.com/openclaw/openclaw/issues/8643
      await cleanupEmbeddedAttemptResources({
        removeToolResultContextGuard,
        flushPendingToolResultsAfterIdle,
        session,
        sessionManager,
        releaseWsSession,
        sessionId: params.sessionId,
        nativeLspService,
        bundleLspRuntime,
        sessionLock: parentSessionLockHandoff.getCurrentLock(),
      });
    }
  } finally {
    restoreSkillEnv?.();
  }
}

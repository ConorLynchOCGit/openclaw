import fs from "node:fs/promises";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import { resolveStateDir } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  createContextPressureController,
  executionNodeContinuationStrategy,
  PREEMPTIVE_OVERFLOW_ERROR_TEXT,
  pruneToolOutputsForContextPressure,
  shouldPreferActualUsageCompaction,
  type ContextBreakdownSnapshot,
  type ContextPressureController,
  type ContextPressureOutcome,
  type ProviderUsageSnapshot,
} from "../context-engine/pressure/index.js";
import type { ContextEngine, ContextEnginePromptCacheInfo } from "../context-engine/types.js";
import type { ExecElevatedDefaults } from "./bash-tools.exec-types.js";
import { DEFAULT_CONTEXT_TOKENS } from "./defaults.js";
import { runPostCompactionSideEffects } from "./pi-embedded-runner/compaction-hooks.js";
import { buildEmbeddedCompactionRuntimeContext } from "./pi-embedded-runner/compaction-runtime-context.js";
import { runContextEngineMaintenance } from "./pi-embedded-runner/context-engine-maintenance.js";
import { finalizeAttemptContextEngineTurn } from "./pi-embedded-runner/run/attempt.context-engine-helpers.js";
import { buildAfterTurnRuntimeContext } from "./pi-embedded-runner/run/attempt.prompt-helpers.js";
import type {
  EmbeddedRunAttemptParams,
  EmbeddedRunAttemptResult,
} from "./pi-embedded-runner/run/types.js";
import { estimateProviderVisibleContextBreakdown } from "./pi-embedded-runner/tool-result-char-estimator.js";
import {
  estimateToolResultReductionPotential,
  resolveLiveToolResultMaxChars,
  sessionLikelyHasOversizedToolResults,
  truncateOversizedToolResultsInSession,
  truncateOversizedToolResultsInSessionManager,
} from "./pi-embedded-runner/tool-result-truncation.js";
import type { SkillSnapshot } from "./skills.js";

const NODE_WORKER_COMPACTION_CONTINUATION_INSTRUCTION =
  "Continue the current implementation. If target files, patch shape, and validation signal are known, edit or validate next. Do not restart source discovery unless a named source window, failed edit, or validation error requires it.";

const COMPACTION_REPAIR_WINDOW_CONTEXT_LINES = 40;

type SessionManagerForContextPressure = Parameters<
  typeof truncateOversizedToolResultsInSessionManager
>[0]["sessionManager"];

type ContextManagerLogger = {
  info(message: string): void;
  warn(message: string): void;
};

export type ContextManagerRunParams = {
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  currentChannelId?: string;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  senderIsOwner?: boolean;
  senderId?: string | null;
  reasoningLevel?: ReasoningLevel;
  bashElevated?: ExecElevatedDefaults;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  runId: string;
};

export type ProviderVisibleContextBreakdown = ReturnType<
  typeof estimateProviderVisibleContextBreakdown
>;

export function resolveAutoCompactionCustomInstructions(params: {
  existing?: string | null;
  sessionAgentId?: string | null;
  sessionKey?: string | null;
}): string | undefined {
  const existing = params.existing?.trim();
  const agentId = params.sessionAgentId?.trim();
  const sessionKey = params.sessionKey?.trim();
  const shouldAppend =
    agentId === "execution-coding" &&
    typeof sessionKey === "string" &&
    sessionKey.includes(":node:");
  if (!shouldAppend) {
    return existing || undefined;
  }
  if (existing?.includes(NODE_WORKER_COMPACTION_CONTINUATION_INSTRUCTION)) {
    return existing;
  }
  return [existing, NODE_WORKER_COMPACTION_CONTINUATION_INSTRUCTION]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join("\n\n");
}

export function toContextPressureBreakdown(
  breakdown: ProviderVisibleContextBreakdown,
): ContextBreakdownSnapshot {
  return {
    sourceOrLocatorChars: breakdown.likelySourceOrLocatorChars,
    nonSourceVisibleChars: breakdown.nonSourceVisibleChars,
    strippedDetailsChars: breakdown.strippedToolDetailsChars,
  };
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function readCompactionRepairWindow(params: {
  workspaceDir: string;
  filePath: string;
  line: number | null;
}): Promise<string | undefined> {
  const workspaceDir = path.resolve(params.workspaceDir);
  const rawFilePath = params.filePath.trim();
  if (!rawFilePath) {
    return undefined;
  }
  const absolutePath = path.resolve(
    path.isAbsolute(rawFilePath) ? rawFilePath : path.join(workspaceDir, rawFilePath),
  );
  if (!isPathInside(workspaceDir, absolutePath)) {
    return undefined;
  }
  let content: string;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch {
    return undefined;
  }
  const lines = content.split(/\r?\n/u);
  if (lines.length === 0) {
    return undefined;
  }
  const targetLine =
    params.line && params.line >= 1
      ? Math.min(Math.floor(params.line), lines.length)
      : Math.min(1, lines.length);
  const startLine = Math.max(1, targetLine - COMPACTION_REPAIR_WINDOW_CONTEXT_LINES);
  const endLine = Math.min(lines.length, targetLine + COMPACTION_REPAIR_WINDOW_CONTEXT_LINES);
  const displayPath = path.relative(workspaceDir, absolutePath).replace(/\\/gu, "/");
  const numbered = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => `${startLine + index}: ${line}`);
  return [
    `<path>${displayPath}</path>`,
    "<type>file</type>",
    "<content>",
    ...numbered,
    "</content>",
  ].join("\n");
}

export async function runBeforeSubmitContextPressure(params: {
  messages: AgentMessage[];
  systemPrompt: string;
  prompt: string;
  provider: string;
  modelId: string;
  model?: { compat?: unknown; baseUrl?: unknown; provider?: unknown };
  contextPressure?: ContextPressureController;
  contextEngineOwnsCompaction?: boolean;
  contextTokenBudget?: number;
  reserveTokens: number;
  sessionManager: SessionManagerForContextPressure;
  sessionFile: string;
  sessionId: string;
  sessionKey?: string;
  config?: OpenClawConfig;
  agentId: string;
  runId: string;
  nativeTaskResultAwaitingParentContext: boolean;
  nativeTaskResultAwaitingParentContextReason: string;
  nativeTaskResultAwaitingParentContextErrorText: string;
  nodeAgentSessionTraceEvents: Record<string, unknown>[];
  log: ContextManagerLogger;
}): Promise<{
  contextPressure: ContextPressureController;
  contextTokenBudget: number;
  toolResultMaxChars: number;
  providerVisibleContextBreakdown: ProviderVisibleContextBreakdown;
  outcome?: ContextPressureOutcome;
  skipPromptSubmission: boolean;
  promptError?: Error;
  promptErrorOrigin?: "precheck";
}> {
  const contextTokenBudget = params.contextTokenBudget ?? DEFAULT_CONTEXT_TOKENS;
  const contextPressure = params.contextPressure ?? createContextPressureController();
  const provider = params.provider;
  const modelId = params.modelId;
  const toolResultMaxChars = resolveLiveToolResultMaxChars({
    contextWindowTokens: contextTokenBudget,
    cfg: params.config,
    agentId: params.agentId,
  });
  const toolResultPotential = estimateToolResultReductionPotential({
    messages: params.messages,
    contextWindowTokens: contextTokenBudget,
    maxCharsOverride: toolResultMaxChars,
  });
  const providerVisibleContextBreakdown = estimateProviderVisibleContextBreakdown(params.messages);
  const beforeSubmitPressure = await contextPressure.beforeSubmit({
    messages: params.messages,
    systemPrompt: params.systemPrompt,
    prompt: params.prompt,
    contextWindowTokens: contextTokenBudget,
    reserveTokens: params.reserveTokens,
    preferActualUsageCompaction: shouldPreferActualUsageCompaction({
      provider,
      modelId,
      model: params.model,
    }),
    contextEngineOwnsCompaction: params.contextEngineOwnsCompaction === true,
    pruneReducibleChars: toolResultPotential.maxReducibleChars,
    protectedContextReason: params.nativeTaskResultAwaitingParentContext
      ? params.nativeTaskResultAwaitingParentContextReason
      : undefined,
    contextBreakdown: toContextPressureBreakdown(providerVisibleContextBreakdown),
    truncateToolResults: () =>
      truncateOversizedToolResultsInSessionManager({
        sessionManager: params.sessionManager,
        contextWindowTokens: contextTokenBudget,
        maxCharsOverride: toolResultMaxChars,
        sessionFile: params.sessionFile,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        stateRoot: resolveStateDir(process.env),
      }),
    emit: (event) => {
      params.nodeAgentSessionTraceEvents.push({
        ...event,
        sessionKey: params.sessionKey ?? params.sessionId,
        runId: params.runId,
        agentId: params.agentId,
        provider,
        model: modelId,
      });
    },
  });
  const pressureDecision = beforeSubmitPressure.decision;
  if (
    beforeSubmitPressure.action === "block" &&
    beforeSubmitPressure.reason === params.nativeTaskResultAwaitingParentContextReason
  ) {
    params.nodeAgentSessionTraceEvents.push({
      eventType: "node_agent_native_task_result_context_preservation_blocked",
      reason: params.nativeTaskResultAwaitingParentContextReason,
      action: pressureDecision.action,
      trigger: pressureDecision.trigger,
      sessionKey: params.sessionKey ?? params.sessionId,
      estimatedPromptTokens: pressureDecision.estimate?.promptTokens ?? 0,
      usableContextTokens: pressureDecision.budget.usableTokens,
      overflowTokens: pressureDecision.pressure?.overBudgetTokens ?? 0,
      pruneReducibleChars: pressureDecision.prune?.reducibleChars ?? 0,
      reserveTokens: params.reserveTokens,
      ...providerVisibleContextBreakdown,
    });
    params.log.warn(
      `[context-overflow-precheck] blocked recovery that would compact or truncate a ` +
        `delivered native task result before parent synthesis ` +
        `sessionKey=${params.sessionKey ?? params.sessionId} ` +
        `provider=${provider}/${modelId} ` +
        `action=${pressureDecision.action} trigger=${pressureDecision.trigger} ` +
        `estimatedPromptTokens=${pressureDecision.estimate?.promptTokens ?? 0} ` +
        `usableContextTokens=${pressureDecision.budget.usableTokens} ` +
        `overflowTokens=${pressureDecision.pressure?.overBudgetTokens ?? 0} ` +
        `pruneReducibleChars=${pressureDecision.prune?.reducibleChars ?? 0} ` +
        `reserveTokens=${params.reserveTokens} ` +
        `sourceOrLocatorChars=${providerVisibleContextBreakdown.likelySourceOrLocatorChars} ` +
        `nonSourceVisibleChars=${providerVisibleContextBreakdown.nonSourceVisibleChars} ` +
        `strippedToolDetailsChars=${providerVisibleContextBreakdown.strippedToolDetailsChars} ` +
        `sessionFile=${params.sessionFile}`,
    );
    return {
      contextPressure,
      contextTokenBudget,
      toolResultMaxChars,
      providerVisibleContextBreakdown,
      outcome: beforeSubmitPressure,
      skipPromptSubmission: true,
      promptError: new Error(params.nativeTaskResultAwaitingParentContextErrorText),
      promptErrorOrigin: "precheck",
    };
  }
  if (beforeSubmitPressure.action === "prune_retry") {
    if ("prune" in beforeSubmitPressure && beforeSubmitPressure.prune.truncated) {
      params.log.info(
        `[context-overflow-precheck] early tool-result truncation succeeded for ` +
          `${provider}/${modelId} action=${pressureDecision.action} ` +
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
      return {
        contextPressure,
        contextTokenBudget,
        toolResultMaxChars,
        providerVisibleContextBreakdown,
        outcome: beforeSubmitPressure,
        skipPromptSubmission: true,
      };
    }
    params.log.warn(
      `[context-overflow-precheck] early tool-result truncation did not help for ` +
        `${provider}/${modelId}; falling back to compaction ` +
        `reason=${pressureDecision.prune?.reason ?? "unknown"} sessionFile=${params.sessionFile}`,
    );
    return {
      contextPressure,
      contextTokenBudget,
      toolResultMaxChars,
      providerVisibleContextBreakdown,
      outcome: beforeSubmitPressure,
      skipPromptSubmission: true,
      promptError: new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT),
      promptErrorOrigin: "precheck",
    };
  }
  if (beforeSubmitPressure.action === "summary_retry") {
    params.log.warn(
      `[context-overflow-precheck] sessionKey=${params.sessionKey ?? params.sessionId} ` +
        `provider=${provider}/${modelId} ` +
        `action=${pressureDecision.action} trigger=${pressureDecision.trigger} ` +
        `estimatedPromptTokens=${pressureDecision.estimate?.promptTokens ?? 0} ` +
        `usableContextTokens=${pressureDecision.budget.usableTokens} ` +
        `overflowTokens=${pressureDecision.pressure?.overBudgetTokens ?? 0} ` +
        `pruneReducibleChars=${pressureDecision.prune?.reducibleChars ?? 0} ` +
        `reserveTokens=${params.reserveTokens} ` +
        `sourceOrLocatorChars=${providerVisibleContextBreakdown.likelySourceOrLocatorChars} ` +
        `nonSourceVisibleChars=${providerVisibleContextBreakdown.nonSourceVisibleChars} ` +
        `strippedToolDetailsChars=${providerVisibleContextBreakdown.strippedToolDetailsChars} ` +
        `sessionFile=${params.sessionFile}`,
    );
    return {
      contextPressure,
      contextTokenBudget,
      toolResultMaxChars,
      providerVisibleContextBreakdown,
      outcome: beforeSubmitPressure,
      skipPromptSubmission: true,
      promptError: new Error(PREEMPTIVE_OVERFLOW_ERROR_TEXT),
      promptErrorOrigin: "precheck",
    };
  }
  return {
    contextPressure,
    contextTokenBudget,
    toolResultMaxChars,
    providerVisibleContextBreakdown,
    skipPromptSubmission: false,
  };
}

export function buildAttemptContextRuntimeContext(params: {
  attempt: EmbeddedRunAttemptParams;
  workspaceDir: string;
  agentDir: string;
  tokenBudget?: number;
  currentTokenCount?: number;
  promptCache?: ContextEnginePromptCacheInfo;
}) {
  return buildAfterTurnRuntimeContext(params);
}

export async function finalizeAttemptContextManagerTurn(params: {
  attempt: EmbeddedRunAttemptParams;
  effectiveWorkspace: string;
  agentDir: string;
  currentTokenCount?: number;
  promptCache?: ContextEnginePromptCacheInfo;
  promptError: boolean;
  aborted: boolean;
  yieldAborted: boolean;
  sessionIdUsed: string;
  messagesSnapshot: AgentMessage[];
  prePromptMessageCount: number;
  sessionManager: unknown;
  warn: (message: string) => void;
}) {
  if (!params.attempt.contextEngine) {
    return { postTurnFinalizationSucceeded: true };
  }
  const runtimeContext = buildAttemptContextRuntimeContext({
    attempt: params.attempt,
    workspaceDir: params.effectiveWorkspace,
    agentDir: params.agentDir,
    tokenBudget: params.attempt.contextTokenBudget,
    currentTokenCount: params.currentTokenCount,
    promptCache: params.promptCache,
  });
  return await finalizeAttemptContextEngineTurn({
    contextEngine: params.attempt.contextEngine,
    promptError: params.promptError,
    aborted: params.aborted,
    yieldAborted: params.yieldAborted,
    sessionIdUsed: params.sessionIdUsed,
    sessionKey: params.attempt.sessionKey,
    sessionFile: params.attempt.sessionFile,
    messagesSnapshot: params.messagesSnapshot,
    prePromptMessageCount: params.prePromptMessageCount,
    tokenBudget: params.attempt.contextTokenBudget,
    runtimeContext,
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
    sessionManager: params.sessionManager,
    warn: params.warn,
  });
}

export async function runActualUsageContextPressure(params: {
  runParams: ContextManagerRunParams;
  attemptResult: Pick<
    EmbeddedRunAttemptResult,
    "messagesSnapshot" | "promptCache" | "nodeAgentSessionTrace"
  >;
  contextPressure: ContextPressureController;
  contextEngine: ContextEngine;
  usage: ProviderUsageSnapshot;
  provider: string;
  modelId: string;
  contextWindowTokens: number;
  resolvedWorkspace: string;
  agentDir: string;
  authProfileId?: string | null;
  thinkLevel: ThinkLevel;
  sessionAgentId: string;
  existingInstructions?: string;
  emit: (event: Record<string, unknown>) => void | Promise<void>;
  beforeSummary: () => Promise<void>;
  afterSummary: (result: Awaited<ReturnType<ContextEngine["compact"]>>) => Promise<void>;
  log: ContextManagerLogger;
}): Promise<{
  outcome: ContextPressureOutcome;
  compactionCountIncrement: number;
}> {
  const actualUsageContextBreakdown = estimateProviderVisibleContextBreakdown(
    params.attemptResult.messagesSnapshot ?? [],
  );
  const runtimeContext = {
    ...buildEmbeddedCompactionRuntimeContext({
      sessionKey: params.runParams.sessionKey,
      messageChannel: params.runParams.messageChannel,
      messageProvider: params.runParams.messageProvider,
      agentAccountId: params.runParams.agentAccountId,
      currentChannelId: params.runParams.currentChannelId,
      currentThreadTs: params.runParams.currentThreadTs,
      currentMessageId: params.runParams.currentMessageId,
      authProfileId: params.authProfileId ?? undefined,
      workspaceDir: params.resolvedWorkspace,
      agentDir: params.agentDir,
      config: params.runParams.config,
      skillsSnapshot: params.runParams.skillsSnapshot,
      senderIsOwner: params.runParams.senderIsOwner,
      senderId: params.runParams.senderId,
      provider: params.provider,
      modelId: params.modelId,
      thinkLevel: params.thinkLevel,
      reasoningLevel: params.runParams.reasoningLevel,
      bashElevated: params.runParams.bashElevated,
      extraSystemPrompt: params.runParams.extraSystemPrompt,
      ownerNumbers: params.runParams.ownerNumbers,
    }),
    ...(params.attemptResult.promptCache ? { promptCache: params.attemptResult.promptCache } : {}),
    runId: params.runParams.runId,
    trigger: "actual_usage",
    currentTokenCount: params.usage.promptTokens,
  };
  let compactionCountIncrement = 0;
  const outcome = await params.contextPressure.afterTurn({
    sessionId: params.runParams.sessionId,
    sessionKey: params.runParams.sessionKey,
    sessionFile: params.runParams.sessionFile,
    provider: params.provider,
    modelId: params.modelId,
    contextEngine: params.contextEngine,
    contextWindowTokens: params.contextWindowTokens,
    usage: params.usage,
    messages: params.attemptResult.messagesSnapshot,
    contextBreakdown: toContextPressureBreakdown(actualUsageContextBreakdown),
    runtimeContext,
    continuationStrategy: executionNodeContinuationStrategy,
    existingInstructions: params.existingInstructions,
    nodeTrace: params.attemptResult.nodeAgentSessionTrace,
    readSourceWindow: ({ path, line }) =>
      readCompactionRepairWindow({
        workspaceDir: params.resolvedWorkspace,
        filePath: path,
        line: line ?? null,
      }),
    prune: () =>
      pruneToolOutputsForContextPressure({
        reason: "actual_usage",
        provider: params.provider,
        modelId: params.modelId,
        sessionFile: params.runParams.sessionFile,
        sessionId: params.runParams.sessionId,
        sessionKey: params.runParams.sessionKey,
        contextWindowTokens: params.contextWindowTokens,
        config: params.runParams.config,
        agentId: params.sessionAgentId,
        log: params.log,
      }),
    beforeSummary: params.beforeSummary,
    afterSummary: params.afterSummary,
    emit: params.emit,
    onSummaryCompacted: async (result) => {
      compactionCountIncrement += 1;
      await runContextEngineMaintenance({
        contextEngine: params.contextEngine,
        sessionId: params.runParams.sessionId,
        sessionKey: params.runParams.sessionKey,
        sessionFile: params.runParams.sessionFile,
        reason: "compaction",
        runtimeContext,
      });
      params.log.info(
        `[context-pressure] actual_usage summary completed ` +
          `tokensAfter=${result.result?.tokensAfter ?? "unknown"}`,
      );
    },
  });
  if (outcome.action === "prune_retry") {
    params.log.info(
      `[context-pressure] deterministic prune handled actual_usage pressure ` +
        `diagId=${outcome.decision.diagId} ` +
        `truncatedCount=${outcome.prune.truncatedCount ?? 0}`,
    );
  } else if (outcome.action === "block") {
    params.log.warn(
      `[context-pressure] actual_usage compaction skipped or failed ` +
        `diagId=${outcome.decision.diagId} reason=${outcome.reason}`,
    );
  }
  return { outcome, compactionCountIncrement };
}

export async function runTimeoutHighUsageContextPressure(params: {
  runParams: ContextManagerRunParams;
  attemptResult: Pick<EmbeddedRunAttemptResult, "promptCache" | "nodeAgentSessionTrace">;
  contextPressure: ContextPressureController;
  contextEngine: ContextEngine;
  promptTokens: number;
  totalTokens?: number;
  provider: string;
  modelId: string;
  contextWindowTokens: number;
  resolvedWorkspace: string;
  agentDir: string;
  authProfileId?: string | null;
  thinkLevel: ThinkLevel;
  sessionAgentId: string;
  existingInstructions?: string;
  diagId: string;
  attemptNumber: number;
  maxAttempts: number;
  emit: (event: Record<string, unknown>) => void | Promise<void>;
  beforeSummary: () => Promise<void>;
  afterSummary: (result: Awaited<ReturnType<ContextEngine["compact"]>>) => Promise<void>;
  log: ContextManagerLogger;
}): Promise<{
  outcome: ContextPressureOutcome;
  shouldRetryPrompt: boolean;
  compactionCountIncrement: number;
}> {
  const runtimeContext = {
    ...buildEmbeddedCompactionRuntimeContext({
      sessionKey: params.runParams.sessionKey,
      messageChannel: params.runParams.messageChannel,
      messageProvider: params.runParams.messageProvider,
      agentAccountId: params.runParams.agentAccountId,
      currentChannelId: params.runParams.currentChannelId,
      currentThreadTs: params.runParams.currentThreadTs,
      currentMessageId: params.runParams.currentMessageId,
      authProfileId: params.authProfileId ?? undefined,
      workspaceDir: params.resolvedWorkspace,
      agentDir: params.agentDir,
      config: params.runParams.config,
      skillsSnapshot: params.runParams.skillsSnapshot,
      senderIsOwner: params.runParams.senderIsOwner,
      senderId: params.runParams.senderId,
      provider: params.provider,
      modelId: params.modelId,
      thinkLevel: params.thinkLevel,
      reasoningLevel: params.runParams.reasoningLevel,
      bashElevated: params.runParams.bashElevated,
      extraSystemPrompt: params.runParams.extraSystemPrompt,
      ownerNumbers: params.runParams.ownerNumbers,
    }),
    ...(params.attemptResult.promptCache ? { promptCache: params.attemptResult.promptCache } : {}),
    runId: params.runParams.runId,
    trigger: "timeout_recovery",
    diagId: params.diagId,
    attempt: params.attemptNumber,
    maxAttempts: params.maxAttempts,
  };
  let compactionCountIncrement = 0;
  const outcome = await params.contextPressure.recover({
    trigger: "timeout_high_usage",
    sessionId: params.runParams.sessionId,
    sessionKey: params.runParams.sessionKey,
    sessionFile: params.runParams.sessionFile,
    provider: params.provider,
    modelId: params.modelId,
    contextEngine: params.contextEngine,
    contextWindowTokens: params.contextWindowTokens,
    usage: {
      source: "provider",
      promptTokens: params.promptTokens,
      totalTokens: params.totalTokens,
    },
    runtimeContext,
    continuationStrategy: executionNodeContinuationStrategy,
    existingInstructions: params.existingInstructions,
    nodeTrace: params.attemptResult.nodeAgentSessionTrace,
    readSourceWindow: ({ path, line }) =>
      readCompactionRepairWindow({
        workspaceDir: params.resolvedWorkspace,
        filePath: path,
        line: line ?? null,
      }),
    prune: () =>
      pruneToolOutputsForContextPressure({
        reason: "timeout_high_usage",
        provider: params.provider,
        modelId: params.modelId,
        sessionFile: params.runParams.sessionFile,
        sessionId: params.runParams.sessionId,
        sessionKey: params.runParams.sessionKey,
        contextWindowTokens: params.contextWindowTokens,
        config: params.runParams.config,
        agentId: params.sessionAgentId,
        log: params.log,
      }),
    beforeSummary: params.beforeSummary,
    afterSummary: params.afterSummary,
    emit: params.emit,
    onSummaryCompacted: async () => {
      compactionCountIncrement += 1;
      if (params.contextEngine.info.ownsCompaction === true) {
        await runPostCompactionSideEffects({
          config: params.runParams.config,
          sessionKey: params.runParams.sessionKey,
          sessionFile: params.runParams.sessionFile,
        });
      }
    },
  });
  if (outcome.action === "prune_retry") {
    params.log.info(
      `[timeout-compaction] deterministic prune succeeded before LLM compaction; ` +
        `retrying prompt diagId=${outcome.decision.diagId} ` +
        `truncatedCount=${outcome.prune.truncatedCount ?? 0}`,
    );
    return { outcome, shouldRetryPrompt: true, compactionCountIncrement };
  }
  if (outcome.action === "summary_retry") {
    params.log.info(
      `[timeout-compaction] compaction succeeded for ${params.provider}/${params.modelId}; retrying prompt`,
    );
    return { outcome, shouldRetryPrompt: true, compactionCountIncrement };
  }
  params.log.warn(
    `[timeout-compaction] compaction did not reduce context for ${params.provider}/${params.modelId}; falling through to normal handling`,
  );
  return { outcome, shouldRetryPrompt: false, compactionCountIncrement };
}

export async function runProviderOverflowContextPressure(params: {
  runParams: ContextManagerRunParams;
  attemptResult: Pick<
    EmbeddedRunAttemptResult,
    "messagesSnapshot" | "promptCache" | "nodeAgentSessionTrace"
  >;
  contextPressure: ContextPressureController;
  contextPressureOutcome?: ContextPressureOutcome;
  contextEngine: ContextEngine;
  observedOverflowTokens?: number;
  provider: string;
  modelId: string;
  contextWindowTokens: number;
  resolvedWorkspace: string;
  agentDir: string;
  authProfileId?: string | null;
  thinkLevel: ThinkLevel;
  sessionAgentId: string;
  existingInstructions?: string;
  diagId: string;
  attemptNumber: number;
  maxAttempts: number;
  toolResultTruncationAttempted: boolean;
  emit: (event: Record<string, unknown>) => void | Promise<void>;
  beforeSummary: () => Promise<void>;
  afterSummary: (result: Awaited<ReturnType<ContextEngine["compact"]>>) => Promise<void>;
  log: ContextManagerLogger;
}): Promise<{
  outcome?: ContextPressureOutcome;
  shouldRetryPrompt: boolean;
  compactionCountIncrement: number;
  toolResultTruncationAttempted: boolean;
}> {
  const runtimeContext = {
    ...buildEmbeddedCompactionRuntimeContext({
      sessionKey: params.runParams.sessionKey,
      messageChannel: params.runParams.messageChannel,
      messageProvider: params.runParams.messageProvider,
      agentAccountId: params.runParams.agentAccountId,
      currentChannelId: params.runParams.currentChannelId,
      currentThreadTs: params.runParams.currentThreadTs,
      currentMessageId: params.runParams.currentMessageId,
      authProfileId: params.authProfileId ?? undefined,
      workspaceDir: params.resolvedWorkspace,
      agentDir: params.agentDir,
      config: params.runParams.config,
      skillsSnapshot: params.runParams.skillsSnapshot,
      senderIsOwner: params.runParams.senderIsOwner,
      senderId: params.runParams.senderId,
      provider: params.provider,
      modelId: params.modelId,
      thinkLevel: params.thinkLevel,
      reasoningLevel: params.runParams.reasoningLevel,
      bashElevated: params.runParams.bashElevated,
      extraSystemPrompt: params.runParams.extraSystemPrompt,
      ownerNumbers: params.runParams.ownerNumbers,
    }),
    ...(params.attemptResult.promptCache ? { promptCache: params.attemptResult.promptCache } : {}),
    runId: params.runParams.runId,
    trigger: "overflow",
    ...(params.observedOverflowTokens !== undefined
      ? { currentTokenCount: params.observedOverflowTokens }
      : {}),
    diagId: params.diagId,
    attempt: params.attemptNumber,
    maxAttempts: params.maxAttempts,
  };
  let compactionCountIncrement = 0;
  const outcome = await params.contextPressure.recover({
    trigger: "provider_overflow",
    sessionId: params.runParams.sessionId,
    sessionKey: params.runParams.sessionKey,
    sessionFile: params.runParams.sessionFile,
    provider: params.provider,
    modelId: params.modelId,
    contextEngine: params.contextEngine,
    contextWindowTokens: params.contextWindowTokens,
    usage:
      params.observedOverflowTokens !== undefined
        ? { source: "estimate", promptTokens: params.observedOverflowTokens }
        : undefined,
    currentTokenCount: params.observedOverflowTokens,
    runtimeContext,
    continuationStrategy: executionNodeContinuationStrategy,
    existingInstructions: params.existingInstructions,
    nodeTrace: params.attemptResult.nodeAgentSessionTrace,
    readSourceWindow: ({ path, line }) =>
      readCompactionRepairWindow({
        workspaceDir: params.resolvedWorkspace,
        filePath: path,
        line: line ?? null,
      }),
    prune: () =>
      pruneToolOutputsForContextPressure({
        reason: "provider_overflow",
        provider: params.provider,
        modelId: params.modelId,
        sessionFile: params.runParams.sessionFile,
        sessionId: params.runParams.sessionId,
        sessionKey: params.runParams.sessionKey,
        contextWindowTokens: params.contextWindowTokens,
        config: params.runParams.config,
        agentId: params.sessionAgentId,
        log: params.log,
      }),
    beforeSummary: params.beforeSummary,
    afterSummary: params.afterSummary,
    emit: params.emit,
    onSummaryCompacted: async () => {
      if (
        params.contextPressureOutcome?.decision.trigger === "preflight_emergency_estimate" &&
        params.contextPressureOutcome.action === "summary_retry" &&
        (params.contextPressureOutcome.decision.prune?.reducibleChars ?? 0) > 0
      ) {
        const truncResult = await truncateOversizedToolResultsInSession({
          sessionFile: params.runParams.sessionFile,
          contextWindowTokens: params.contextWindowTokens,
          maxCharsOverride: resolveLiveToolResultMaxChars({
            contextWindowTokens: params.contextWindowTokens,
            cfg: params.runParams.config,
            agentId: params.sessionAgentId,
          }),
          sessionId: params.runParams.sessionId,
          sessionKey: params.runParams.sessionKey,
          stateRoot: resolveStateDir(process.env),
        });
        if (truncResult.truncated) {
          params.log.info(
            `[context-overflow-precheck] post-compaction tool-result truncation succeeded for ` +
              `${params.provider}/${params.modelId}; truncated ${truncResult.truncatedCount} tool result(s)`,
          );
        } else {
          params.log.warn(
            `[context-overflow-precheck] post-compaction tool-result truncation did not help for ` +
              `${params.provider}/${params.modelId}: ${truncResult.reason ?? "unknown"}`,
          );
        }
      }
      compactionCountIncrement += 1;
      await runContextEngineMaintenance({
        contextEngine: params.contextEngine,
        sessionId: params.runParams.sessionId,
        sessionKey: params.runParams.sessionKey,
        sessionFile: params.runParams.sessionFile,
        reason: "compaction",
        runtimeContext,
      });
    },
  });
  if (outcome.action === "prune_retry") {
    params.log.info(
      `[context-overflow-recovery] deterministic prune succeeded before LLM compaction; ` +
        `retrying prompt diagId=${outcome.decision.diagId} ` +
        `truncatedCount=${outcome.prune.truncatedCount ?? 0}`,
    );
    return {
      outcome,
      shouldRetryPrompt: true,
      compactionCountIncrement,
      toolResultTruncationAttempted: params.toolResultTruncationAttempted,
    };
  }
  if (outcome.action === "summary_retry") {
    params.log.info(
      `auto-compaction succeeded for ${params.provider}/${params.modelId}; retrying prompt`,
    );
    return {
      outcome,
      shouldRetryPrompt: true,
      compactionCountIncrement,
      toolResultTruncationAttempted: params.toolResultTruncationAttempted,
    };
  }
  params.log.warn(
    `auto-compaction failed for ${params.provider}/${params.modelId}: ${
      outcome.action === "block" ? outcome.reason : "nothing to compact"
    }`,
  );

  const fallback = await runOverflowToolResultFallbackTruncation({
    runParams: params.runParams,
    attemptResult: params.attemptResult,
    provider: params.provider,
    modelId: params.modelId,
    contextWindowTokens: params.contextWindowTokens,
    sessionAgentId: params.sessionAgentId,
    toolResultTruncationAttempted: params.toolResultTruncationAttempted,
    log: params.log,
  });
  return {
    outcome,
    shouldRetryPrompt: fallback.shouldRetryPrompt,
    compactionCountIncrement,
    toolResultTruncationAttempted: fallback.toolResultTruncationAttempted,
  };
}

export async function runOverflowToolResultFallbackTruncation(params: {
  runParams: ContextManagerRunParams;
  attemptResult: Pick<EmbeddedRunAttemptResult, "messagesSnapshot">;
  provider: string;
  modelId: string;
  contextWindowTokens: number;
  sessionAgentId: string;
  toolResultTruncationAttempted: boolean;
  log: ContextManagerLogger;
}): Promise<{
  shouldRetryPrompt: boolean;
  toolResultTruncationAttempted: boolean;
}> {
  if (params.toolResultTruncationAttempted) {
    return { shouldRetryPrompt: false, toolResultTruncationAttempted: true };
  }
  const toolResultMaxChars = resolveLiveToolResultMaxChars({
    contextWindowTokens: params.contextWindowTokens,
    cfg: params.runParams.config,
    agentId: params.sessionAgentId,
  });
  const hasOversized = sessionLikelyHasOversizedToolResults({
    messages: params.attemptResult.messagesSnapshot,
    contextWindowTokens: params.contextWindowTokens,
    maxCharsOverride: toolResultMaxChars,
  });

  if (!hasOversized) {
    return { shouldRetryPrompt: false, toolResultTruncationAttempted: false };
  }
  params.log.warn(
    `[context-overflow-recovery] Attempting tool result truncation for ${params.provider}/${params.modelId} ` +
      `(contextWindow=${params.contextWindowTokens} tokens)`,
  );
  const truncResult = await truncateOversizedToolResultsInSession({
    sessionFile: params.runParams.sessionFile,
    contextWindowTokens: params.contextWindowTokens,
    maxCharsOverride: toolResultMaxChars,
    sessionId: params.runParams.sessionId,
    sessionKey: params.runParams.sessionKey,
    stateRoot: resolveStateDir(process.env),
  });
  if (truncResult.truncated) {
    params.log.info(
      `[context-overflow-recovery] Truncated ${truncResult.truncatedCount} tool result(s); retrying prompt`,
    );
    return { shouldRetryPrompt: true, toolResultTruncationAttempted: true };
  }
  params.log.warn(
    `[context-overflow-recovery] Tool result truncation did not help: ${truncResult.reason ?? "unknown"}`,
  );
  return { shouldRetryPrompt: false, toolResultTruncationAttempted: true };
}

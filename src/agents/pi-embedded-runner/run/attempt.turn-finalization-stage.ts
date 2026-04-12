import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawConfig } from "../../../config/config.js";
import type { ContextEngineRuntimeContext } from "../../../context-engine/types.js";
import { describeUnknownError } from "../utils.js";
import {
  finalizeAttemptContextEngineTurn,
  type AttemptContextEngine,
} from "./attempt.context-engine-helpers.js";
import { appendAttemptCacheTtlIfNeeded } from "./attempt.thread-helpers.js";
import { selectCompactionTimeoutSnapshot } from "./compaction-timeout.js";

type FinalizationSessionManager = {
  appendCustomEntry: (type: string, data: Record<string, unknown>) => void;
};

export type AttemptTurnFinalizationStageResult = {
  messagesSnapshot: AgentMessage[];
  sessionIdUsed: string;
  cacheTraceNote?: string;
};

export async function finalizeAttemptTurnStage(params: {
  sessionManager: FinalizationSessionManager;
  timedOutDuringCompaction: boolean;
  getCompactionCount: () => number;
  preCompactionSnapshot: AgentMessage[] | null;
  preCompactionSessionId: string;
  currentMessages: AgentMessage[];
  currentSessionId: string;
  config?: OpenClawConfig;
  provider: string;
  modelId: string;
  modelApi: string;
  isCacheTtlEligibleProvider: (provider: string, modelId: string) => boolean;
  promptError: unknown;
  promptErrorSource: "prompt" | "compaction" | null;
  runId: string;
  sessionId: string;
  isProbeSession: boolean;
  warn: (message: string) => void;
  contextEngine?: AttemptContextEngine;
  aborted: boolean;
  yieldAborted: boolean;
  sessionKey?: string;
  sessionFile: string;
  prePromptMessageCount: number;
  tokenBudget?: number;
  runtimeContext?: ContextEngineRuntimeContext;
  runMaintenance: (params: {
    contextEngine?: unknown;
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    reason: "turn";
    sessionManager: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }) => Promise<unknown>;
}): Promise<AttemptTurnFinalizationStageResult> {
  const compactionOccurredThisAttempt = params.getCompactionCount() > 0;

  appendAttemptCacheTtlIfNeeded({
    sessionManager: params.sessionManager as never,
    timedOutDuringCompaction: params.timedOutDuringCompaction,
    compactionOccurredThisAttempt,
    config: params.config as never,
    provider: params.provider,
    modelId: params.modelId,
    isCacheTtlEligibleProvider: params.isCacheTtlEligibleProvider,
  });

  const snapshotSelection = selectCompactionTimeoutSnapshot({
    timedOutDuringCompaction: params.timedOutDuringCompaction,
    preCompactionSnapshot: params.preCompactionSnapshot ?? null,
    preCompactionSessionId: params.preCompactionSessionId,
    currentSnapshot: params.currentMessages.slice(),
    currentSessionId: params.currentSessionId,
  });

  if (params.timedOutDuringCompaction && !params.isProbeSession) {
    params.warn(
      `using ${snapshotSelection.source} snapshot: timed out during compaction runId=${params.runId} sessionId=${params.sessionId}`,
    );
  }

  if (
    params.promptError &&
    params.promptErrorSource === "prompt" &&
    !compactionOccurredThisAttempt
  ) {
    try {
      params.sessionManager.appendCustomEntry("openclaw:prompt-error", {
        timestamp: Date.now(),
        runId: params.runId,
        sessionId: params.sessionId,
        provider: params.provider,
        model: params.modelId,
        api: params.modelApi,
        error: describeUnknownError(params.promptError),
      });
    } catch (entryErr) {
      params.warn(`failed to persist prompt error entry: ${String(entryErr)}`);
    }
  }

  if (params.contextEngine) {
    await finalizeAttemptContextEngineTurn({
      contextEngine: params.contextEngine,
      promptError: Boolean(params.promptError),
      aborted: params.aborted,
      yieldAborted: params.yieldAborted,
      sessionIdUsed: snapshotSelection.sessionIdUsed,
      sessionKey: params.sessionKey,
      sessionFile: params.sessionFile,
      messagesSnapshot: snapshotSelection.messagesSnapshot,
      prePromptMessageCount: params.prePromptMessageCount,
      tokenBudget: params.tokenBudget,
      runtimeContext: params.runtimeContext,
      runMaintenance: params.runMaintenance,
      sessionManager: params.sessionManager,
      warn: params.warn,
    });
  }

  return {
    messagesSnapshot: snapshotSelection.messagesSnapshot,
    sessionIdUsed: snapshotSelection.sessionIdUsed,
    ...(params.timedOutDuringCompaction
      ? { cacheTraceNote: "compaction timeout" }
      : params.promptError
        ? { cacheTraceNote: "prompt error" }
        : {}),
  };
}

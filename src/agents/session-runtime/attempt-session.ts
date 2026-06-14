import fs from "node:fs/promises";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveStateDir } from "../../config/paths.js";
import type { ContextEngineRuntimeContext } from "../../context-engine/types.js";
import { resolveCompactionTimeoutMs } from "../pi-embedded-runner/compaction-safety-timeout.js";
import { runContextEngineMaintenance } from "../pi-embedded-runner/context-engine-maintenance.js";
import { log } from "../pi-embedded-runner/logger.js";
import { runAttemptContextEngineBootstrap } from "../pi-embedded-runner/run/attempt.context-engine-helpers.js";
import { resolveRunTimeoutWithCompactionGraceMs } from "../pi-embedded-runner/run/compaction-timeout.js";
import type { EmbeddedRunAttemptParams } from "../pi-embedded-runner/run/types.js";
import {
  prewarmSessionFile,
  trackSessionManagerAccess,
} from "../pi-embedded-runner/session-manager-cache.js";
import { prepareSessionManagerForRun } from "../pi-embedded-runner/session-manager-init.js";
import { repairSessionFileIfNeeded } from "../session-file-repair.js";
import { guardSessionManager } from "../session-tool-result-guard-wrapper.js";
import {
  acquireSessionWriteLock,
  resolveSessionLockMaxHoldFromTimeout,
} from "../session-write-lock.js";
import { resolveTranscriptPolicy, type TranscriptPolicy } from "../transcript-policy.js";
import { bindRunChildTaskToParentSessionLockHandoff } from "./parent-lock-handoff.js";

export type AttemptSessionLockRuntime = {
  sessionLockMaxHoldMs: number;
  parentSessionLockHandoff: ReturnType<typeof bindRunChildTaskToParentSessionLockHandoff>;
};

export type AttemptSessionTranscriptRuntime = {
  hadSessionFile: boolean;
  transcriptPolicy: TranscriptPolicy;
  sessionManager: ReturnType<typeof guardSessionManager>;
};

export async function acquireAttemptSessionLockRuntime(
  params: Pick<
    EmbeddedRunAttemptParams,
    "config" | "timeoutMs" | "sessionFile" | "nodeAgentNativeTaskMode" | "onSessionLockAcquired"
  >,
): Promise<AttemptSessionLockRuntime> {
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
  return {
    sessionLockMaxHoldMs,
    parentSessionLockHandoff: bindRunChildTaskToParentSessionLockHandoff({
      runChildTask: params.nodeAgentNativeTaskMode?.runChildTask,
      sessionFile: params.sessionFile,
      initialLock: sessionLock,
      maxHoldMs: sessionLockMaxHoldMs,
      onSessionLockAcquired: params.onSessionLockAcquired,
    }),
  };
}

export async function openAttemptSessionTranscriptRuntime(params: {
  attempt: EmbeddedRunAttemptParams;
  sessionAgentId: string;
  effectiveWorkspace: string;
  agentDir: string;
  allowedToolNames: Set<string>;
  runtimeContext?: ContextEngineRuntimeContext;
}): Promise<AttemptSessionTranscriptRuntime> {
  const attempt = params.attempt;
  await repairSessionFileIfNeeded({
    sessionFile: attempt.sessionFile,
    warn: (message) => log.warn(message),
  });
  const hadSessionFile = await fs
    .stat(attempt.sessionFile)
    .then(() => true)
    .catch(() => false);

  const transcriptPolicy = resolveTranscriptPolicy({
    modelApi: attempt.model?.api,
    provider: attempt.provider,
    modelId: attempt.modelId,
    config: attempt.config,
    workspaceDir: params.effectiveWorkspace,
    env: process.env,
    model: attempt.model,
  });

  await prewarmSessionFile(attempt.sessionFile);
  const sessionManager = guardSessionManager(SessionManager.open(attempt.sessionFile), {
    agentId: params.sessionAgentId,
    sessionKey: attempt.sessionKey,
    config: attempt.config,
    contextWindowTokens: attempt.contextTokenBudget,
    inputProvenance: attempt.inputProvenance,
    allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
    allowedToolNames: params.allowedToolNames,
    stateRoot: resolveStateDir(process.env),
  });
  trackSessionManagerAccess(attempt.sessionFile);

  await runAttemptContextEngineBootstrap({
    hadSessionFile,
    contextEngine: attempt.contextEngine,
    sessionId: attempt.sessionId,
    sessionKey: attempt.sessionKey,
    sessionFile: attempt.sessionFile,
    sessionManager,
    runtimeContext: params.runtimeContext,
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
    sessionFile: attempt.sessionFile,
    hadSessionFile,
    sessionId: attempt.sessionId,
    cwd: params.effectiveWorkspace,
  });

  return {
    hadSessionFile,
    transcriptPolicy,
    sessionManager,
  };
}

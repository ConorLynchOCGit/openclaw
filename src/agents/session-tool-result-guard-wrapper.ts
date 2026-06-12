import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import {
  applyInputProvenanceToUserMessage,
  type InputProvenance,
} from "../sessions/input-provenance.js";
import { recordModelMemoryCaptureSeamEvidence } from "./model-memory.capture-seams.js";
import { recordModelMemoryProductionHookProbe } from "./model-memory.hook-probe.js";
import { resolveLiveToolResultMaxChars } from "./pi-embedded-runner/tool-result-truncation.js";
import { installSessionToolResultGuard } from "./session-tool-result-guard.js";

export type GuardedSessionManager = SessionManager & {
  /** Flush any synthetic tool results for pending tool calls. Idempotent. */
  flushPendingToolResults?: () => void;
  /** Clear pending tool calls without persisting synthetic tool results. Idempotent. */
  clearPendingToolResults?: () => void;
};

function readAgentMessageContent(message: AgentMessage): unknown {
  return "content" in message ? message.content : undefined;
}

/**
 * Apply the tool-result guard to a SessionManager exactly once and expose
 * a flush method on the instance for easy teardown handling.
 */
export function guardSessionManager(
  sessionManager: SessionManager,
  opts?: {
    agentId?: string;
    sessionKey?: string;
    config?: OpenClawConfig;
    contextWindowTokens?: number;
    inputProvenance?: InputProvenance;
    allowSyntheticToolResults?: boolean;
    allowedToolNames?: Iterable<string>;
    stateRoot?: string | null;
  },
): GuardedSessionManager {
  if (typeof (sessionManager as GuardedSessionManager).flushPendingToolResults === "function") {
    return sessionManager as GuardedSessionManager;
  }

  const hookRunner = getGlobalHookRunner();
  const beforeMessageWrite = hookRunner?.hasHooks("before_message_write")
    ? (event: { message: import("@mariozechner/pi-agent-core").AgentMessage }) => {
        return hookRunner.runBeforeMessageWrite(event, {
          agentId: opts?.agentId,
          sessionKey: opts?.sessionKey,
        });
      }
    : undefined;

  const transform = (
    message: AgentMessage,
    meta: { toolCallId?: string; toolName?: string; isSynthetic?: boolean },
  ) => {
    const messageContent = readAgentMessageContent(message);
    void recordModelMemoryProductionHookProbe({
      hookName: "tool_result_persist",
      triggerSurface: "session_tool_result_guard.persist",
      payload: {
        message,
        isSynthetic: meta.isSynthetic,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
      },
      context: {
        agentId: opts?.agentId,
        sessionKey: opts?.sessionKey,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
      },
      config: opts?.config,
    }).catch(() => undefined);
    void recordModelMemoryCaptureSeamEvidence({
      seamName: "tool_result_persist",
      triggerSurface: "session_tool_result_guard.persist",
      payload: {
        isSynthetic: meta.isSynthetic,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
        messageRole: message.role,
        contentKind: Array.isArray(messageContent) ? "array" : typeof messageContent,
      },
      context: {
        agentId: opts?.agentId,
        sessionKey: opts?.sessionKey,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
      },
      config: opts?.config,
    }).catch(() => undefined);
    if (!meta.isSynthetic) {
      void import("./model-memory.live-runtime.js")
        .then(async ({ captureModelMemoryToolResultProof }) => {
          const captureResult = await captureModelMemoryToolResultProof({
            config: opts?.config,
            hookName: "tool_result_persist",
            toolName: meta.toolName ?? "unknown_tool",
            toolCallId: meta.toolCallId,
            sessionKey: opts?.sessionKey,
            agentId: opts?.agentId,
            result: messageContent,
          });
          await recordModelMemoryCaptureSeamEvidence({
            seamName: "tool_result_persist",
            triggerSurface: "session_tool_result_guard.persist.capture_result",
            payload: {
              toolName: meta.toolName,
              toolCallId: meta.toolCallId,
              captured: captureResult.captured,
              reason: captureResult.captured ? "captured" : captureResult.reason,
              sourceId: captureResult.captured ? captureResult.sourceId : undefined,
              segmentCount: captureResult.captured ? captureResult.segmentIds.length : 0,
              memoryCount: captureResult.captured ? captureResult.memoryIds.length : 0,
              eventCount: captureResult.captured ? captureResult.eventIds.length : 0,
            },
            context: {
              agentId: opts?.agentId,
              sessionKey: opts?.sessionKey,
              toolName: meta.toolName,
              toolCallId: meta.toolCallId,
            },
            config: opts?.config,
            semanticMemoryWriteAttempted: captureResult.captured,
            durableMemoryWriteAttempted: captureResult.captured,
          });
        })
        .catch(() => undefined);
    }
    if (!hookRunner?.hasHooks("tool_result_persist")) {
      return message;
    }
    const out = hookRunner.runToolResultPersist(
      {
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
        message,
        isSynthetic: meta.isSynthetic,
      },
      {
        agentId: opts?.agentId,
        sessionKey: opts?.sessionKey,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
      },
    );
    return out?.message ?? message;
  };

  const guard = installSessionToolResultGuard(sessionManager, {
    sessionKey: opts?.sessionKey,
    transformMessageForPersistence: (message) =>
      applyInputProvenanceToUserMessage(message, opts?.inputProvenance),
    transformToolResultForPersistence: transform,
    allowSyntheticToolResults: opts?.allowSyntheticToolResults,
    allowedToolNames: opts?.allowedToolNames,
    beforeMessageWriteHook: beforeMessageWrite,
    maxToolResultChars:
      typeof opts?.contextWindowTokens === "number"
        ? resolveLiveToolResultMaxChars({
            contextWindowTokens: opts.contextWindowTokens,
            cfg: opts.config,
            agentId: opts.agentId,
          })
        : undefined,
    stateRoot: opts?.stateRoot,
  });
  (sessionManager as GuardedSessionManager).flushPendingToolResults = guard.flushPendingToolResults;
  (sessionManager as GuardedSessionManager).clearPendingToolResults = guard.clearPendingToolResults;
  return sessionManager as GuardedSessionManager;
}

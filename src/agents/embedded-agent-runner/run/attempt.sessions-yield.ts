/**
 * Handles sessions-yield interruption, persistence, and artifact cleanup.
 */
import type { AssistantMessageEventStreamLike } from "../../../llm/types.js";
import { isTranscriptOnlyOpenClawAssistantMessage } from "../../../shared/transcript-only-openclaw-assistant.js";
import type { AgentMessage } from "../../runtime/index.js";
import { buildAssistantMessageWithZeroUsage } from "../../stream-message-shared.js";
import { log } from "../logger.js";
import { resolveEmbeddedAbortSettleTimeoutMs } from "./attempt.abort-settle-timeout.js";

const SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE = "openclaw.sessions_yield_interrupt";
const SESSIONS_YIELD_CONTEXT_CUSTOM_TYPE = "openclaw.sessions_yield";

const SESSIONS_YIELD_ABORT_SETTLE_TIMEOUT_MS = resolveEmbeddedAbortSettleTimeoutMs();

// Persist a hidden context reminder so the next turn knows why the runner stopped.
function buildSessionsYieldContextMessage(message: string): string {
  return `${message}\n\n[Context: The previous turn ended intentionally via sessions_yield while waiting for a follow-up event.]`;
}

export async function waitForSessionsYieldAbortSettle(params: {
  settlePromise: Promise<void> | null;
  runId: string;
  sessionId: string;
}): Promise<void> {
  if (!params.settlePromise) {
    return;
  }

  let timeout: NodeJS.Timeout | undefined;
  const outcome = await Promise.race([
    params.settlePromise
      .then(() => "settled" as const)
      .catch((err: unknown) => {
        log.warn(
          `sessions_yield abort settle failed: runId=${params.runId} sessionId=${params.sessionId} err=${String(err)}`,
        );
        return "errored" as const;
      }),
    new Promise<"timed_out">((resolve) => {
      timeout = setTimeout(() => resolve("timed_out"), SESSIONS_YIELD_ABORT_SETTLE_TIMEOUT_MS);
    }),
  ]);
  if (timeout) {
    clearTimeout(timeout);
  }
  if (outcome === "timed_out") {
    log.warn(
      `sessions_yield abort settle timed out: runId=${params.runId} sessionId=${params.sessionId} timeoutMs=${SESSIONS_YIELD_ABORT_SETTLE_TIMEOUT_MS}`,
    );
  }
}

// Yield aborts the active loop mechanically, but reports a native successful
// stop so lifecycle consumers do not confuse the handoff with cancellation.
export function createYieldAbortedResponse(model: {
  api?: string;
  provider?: string;
  id?: string;
}): AssistantMessageEventStreamLike {
  const message = buildAssistantMessageWithZeroUsage({
    model: {
      api: model.api ?? "",
      provider: model.provider ?? "",
      id: model.id ?? "",
    },
    content: [{ type: "text" as const, text: "" }],
    stopReason: "stop",
  });
  return {
    async *[Symbol.asyncIterator]() {},
    result: async () => message,
  };
}

// Queue a hidden steering message so agent runtime injects it before the next
// LLM call once the current assistant turn finishes executing its tool calls.
export function queueSessionsYieldInterruptMessage(activeSession: {
  agent: { steer: (message: AgentMessage) => void };
}) {
  activeSession.agent.steer({
    role: "custom",
    customType: SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE,
    content: "[sessions_yield interrupt]",
    display: false,
    details: { source: "sessions_yield" },
    timestamp: Date.now(),
  });
}

// Append the caller-provided yield payload as a hidden session message once the run is idle.
export async function persistSessionsYieldContextMessage(
  activeSession: {
    sendCustomMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details?: Record<string, unknown>;
      },
      options?: { triggerTurn?: boolean },
    ) => Promise<void>;
  },
  message: string,
) {
  await activeSession.sendCustomMessage(
    {
      customType: SESSIONS_YIELD_CONTEXT_CUSTOM_TYPE,
      content: buildSessionsYieldContextMessage(message),
      display: false,
      details: { source: "sessions_yield", message },
    },
    { triggerTurn: false },
  );
}

function isEmptyYieldAssistantArtifact(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as {
    role?: unknown;
    stopReason?: unknown;
    content?: unknown;
  };
  if (
    candidate.role !== "assistant" ||
    (candidate.stopReason !== "stop" && candidate.stopReason !== "aborted") ||
    !Array.isArray(candidate.content)
  ) {
    return false;
  }
  return candidate.content.every((part) => {
    if (!part || typeof part !== "object") {
      return false;
    }
    const content = part as { type?: unknown; text?: unknown };
    return content.type === "text" && typeof content.text === "string" && !content.text.trim();
  });
}

// Remove the synthetic yield interrupt and empty assistant artifact from the transcript.
export function stripSessionsYieldArtifacts(activeSession: {
  messages: AgentMessage[];
  agent: { state: { messages: AgentMessage[] } };
  sessionManager?: unknown;
}) {
  const strippedMessages = activeSession.messages.slice();
  while (strippedMessages.length > 0) {
    const last = strippedMessages.at(-1) as
      | AgentMessage
      | { role?: string; customType?: string; stopReason?: string };
    if (isEmptyYieldAssistantArtifact(last)) {
      strippedMessages.pop();
      continue;
    }
    if (
      last?.role === "custom" &&
      "customType" in last &&
      last.customType === SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE
    ) {
      strippedMessages.pop();
      continue;
    }
    break;
  }
  if (strippedMessages.length !== activeSession.messages.length) {
    activeSession.agent.state.messages = strippedMessages;
  }

  const sessionManager = activeSession.sessionManager as
    | {
        removeTrailingEntries?: (
          predicate: (entry: {
            type?: string;
            message?: {
              role?: string;
              stopReason?: string;
              content?: unknown;
              provider?: string;
              model?: string;
            };
            customType?: string;
          }) => boolean,
          options?: {
            preserveTrailing?: (entry: {
              type?: string;
              message?: {
                role?: string;
                provider?: string;
                model?: string;
              };
            }) => boolean;
          },
        ) => number;
      }
    | undefined;
  if (typeof sessionManager?.removeTrailingEntries !== "function") {
    return;
  }

  sessionManager.removeTrailingEntries(
    (entry) => {
      const isYieldAssistant =
        entry.type === "message" && isEmptyYieldAssistantArtifact(entry.message);
      const isYieldInterruptMessage =
        entry.type === "custom_message" &&
        entry.customType === SESSIONS_YIELD_INTERRUPT_CUSTOM_TYPE;
      return isYieldAssistant || isYieldInterruptMessage;
    },
    {
      preserveTrailing: (entry) =>
        entry.type === "custom" ||
        entry.type === "label" ||
        entry.type === "session_info" ||
        (entry.type === "message" && isTranscriptOnlyOpenClawAssistantMessage(entry.message)),
    },
  );
}

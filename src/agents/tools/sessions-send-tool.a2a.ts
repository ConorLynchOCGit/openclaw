import crypto from "node:crypto";
import type { CallGatewayOptions } from "../../gateway/call.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { readLatestAssistantReply, waitForAgentRun } from "../run-wait.js";
import { runAgentStep } from "./agent-step.js";
import { resolveAnnounceTarget } from "./sessions-announce-target.js";
import {
  buildAgentToAgentAnnounceContext,
  buildAgentToAgentReplyContext,
  isAnnounceSkip,
  isReplySkip,
} from "./sessions-send-helpers.js";

const log = createSubsystemLogger("agents/sessions-send");

type GatewayCaller = <T = unknown>(opts: CallGatewayOptions) => Promise<T>;

type RequesterSurfaceMessage = {
  label: string;
  message: string;
};

const defaultSessionsSendA2ADeps = {
  callGateway: async <T = unknown>(opts: CallGatewayOptions): Promise<T> => {
    const { callGateway } = await import("../../gateway/call.js");
    return callGateway<T>(opts);
  },
};

let sessionsSendA2ADeps: {
  callGateway: GatewayCaller;
} = defaultSessionsSendA2ADeps;

function buildDelegatedFailureMessage(params: {
  displayKey: string;
  failureClass:
    | "child_run_failed"
    | "child_run_timeout"
    | "child_result_unavailable"
    | "announce_generation_failed";
  error?: string;
}): RequesterSurfaceMessage {
  switch (params.failureClass) {
    case "child_run_failed":
      return {
        label: "Delegated agent failed",
        message: [
          `Delegated agent failed (${params.failureClass}).`,
          `Session: ${params.displayKey}`,
          params.error ? `Error: ${params.error}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "child_run_timeout":
      return {
        label: "Delegated agent timed out",
        message: [
          `Delegated agent timed out (${params.failureClass}).`,
          `Session: ${params.displayKey}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "announce_generation_failed":
      return {
        label: "Delegated delivery failed",
        message: [
          `Delegated result was available, but auto-report generation failed (${params.failureClass}).`,
          `Session: ${params.displayKey}`,
          "Next step: inspect the session directly with sessions_history or session_status.",
        ].join("\n"),
      };
    case "child_result_unavailable":
    default:
      return {
        label: "Delegated result unavailable",
        message: [
          `Delegated run completed, but no assistant result was available to surface (${params.failureClass}).`,
          `Session: ${params.displayKey}`,
        ].join("\n"),
      };
  }
}

function buildDelegatedRawFallbackMessage(params: {
  displayKey: string;
  reply: string;
}): RequesterSurfaceMessage {
  return {
    label: "Delegated result",
    message: [
      "Auto-announce formatting failed (announce_generation_failed); showing the delegated result directly.",
      `Session: ${params.displayKey}`,
      "",
      params.reply,
    ].join("\n"),
  };
}

async function injectRequesterTranscriptMessage(params: {
  requesterSessionKey?: string;
  message: RequesterSurfaceMessage;
}): Promise<boolean> {
  if (!params.requesterSessionKey) {
    return false;
  }
  try {
    await sessionsSendA2ADeps.callGateway({
      method: "chat.inject",
      params: {
        sessionKey: params.requesterSessionKey,
        message: params.message.message,
        label: params.message.label,
      },
      timeoutMs: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function deliverRequesterSurfaceMessage(params: {
  requesterSessionKey?: string;
  announceTarget: Awaited<ReturnType<typeof resolveAnnounceTarget>>;
  message: RequesterSurfaceMessage;
  runContextId: string;
}) {
  const injected = await injectRequesterTranscriptMessage({
    requesterSessionKey: params.requesterSessionKey,
    message: params.message,
  });
  if (!injected && params.requesterSessionKey) {
    log.warn("sessions_send transcript inject failed", {
      runId: params.runContextId,
      sessionKey: params.requesterSessionKey,
      label: params.message.label,
    });
  }

  const shouldSendToChannel = Boolean(
    params.announceTarget &&
    (!injected ||
      (params.announceTarget?.channel &&
        params.announceTarget.channel !== "webchat" &&
        params.announceTarget.channel !== INTERNAL_MESSAGE_CHANNEL)),
  );
  if (!shouldSendToChannel || !params.announceTarget) {
    return;
  }

  try {
    await sessionsSendA2ADeps.callGateway({
      method: "send",
      params: {
        to: params.announceTarget.to,
        message: params.message.message.trim(),
        channel: params.announceTarget.channel,
        accountId: params.announceTarget.accountId,
        threadId: params.announceTarget.threadId,
        idempotencyKey: crypto.randomUUID(),
      },
      timeoutMs: 10_000,
    });
  } catch (err) {
    log.warn("sessions_send announce delivery failed", {
      runId: params.runContextId,
      channel: params.announceTarget.channel,
      to: params.announceTarget.to,
      error: formatErrorMessage(err),
    });
  }
}

export async function runSessionsSendA2AFlow(params: {
  targetSessionKey: string;
  displayKey: string;
  message: string;
  announceTimeoutMs: number;
  maxPingPongTurns: number;
  requesterSessionKey?: string;
  requesterChannel?: GatewayMessageChannel;
  roundOneReply?: string;
  waitRunId?: string;
}) {
  const runContextId = params.waitRunId ?? "unknown";
  try {
    let primaryReply = params.roundOneReply;
    let latestReply = params.roundOneReply;
    let waitStatus: "ok" | "timeout" | "error" | "pending" | undefined;
    let waitError: string | undefined;
    if (!primaryReply && params.waitRunId) {
      const wait = await waitForAgentRun({
        runId: params.waitRunId,
        timeoutMs: Math.min(params.announceTimeoutMs, 60_000),
        callGateway: sessionsSendA2ADeps.callGateway,
      });
      waitStatus = wait.status;
      waitError = wait.error;
      if (wait.status === "ok") {
        primaryReply = await readLatestAssistantReply({
          sessionKey: params.targetSessionKey,
        });
        latestReply = primaryReply;
      }
    }
    const announceTarget = await resolveAnnounceTarget({
      sessionKey: params.targetSessionKey,
      displayKey: params.displayKey,
    });

    if (!latestReply) {
      const failureMessage =
        waitStatus === "timeout"
          ? buildDelegatedFailureMessage({
              displayKey: params.displayKey,
              failureClass: "child_run_timeout",
              error: waitError,
            })
          : waitStatus === "error"
            ? buildDelegatedFailureMessage({
                displayKey: params.displayKey,
                failureClass: "child_run_failed",
                error: waitError,
              })
            : buildDelegatedFailureMessage({
                displayKey: params.displayKey,
                failureClass: "child_result_unavailable",
                error: waitError,
              });
      await deliverRequesterSurfaceMessage({
        requesterSessionKey: params.requesterSessionKey,
        announceTarget,
        message: failureMessage,
        runContextId,
      });
      return;
    }
    const targetChannel = announceTarget?.channel ?? "unknown";

    if (
      params.maxPingPongTurns > 0 &&
      params.requesterSessionKey &&
      params.requesterSessionKey !== params.targetSessionKey
    ) {
      let currentSessionKey = params.requesterSessionKey;
      let nextSessionKey = params.targetSessionKey;
      let incomingMessage = latestReply;
      for (let turn = 1; turn <= params.maxPingPongTurns; turn += 1) {
        const currentRole =
          currentSessionKey === params.requesterSessionKey ? "requester" : "target";
        const replyPrompt = buildAgentToAgentReplyContext({
          requesterSessionKey: params.requesterSessionKey,
          requesterChannel: params.requesterChannel,
          targetSessionKey: params.displayKey,
          targetChannel,
          currentRole,
          turn,
          maxTurns: params.maxPingPongTurns,
        });
        const replyText = await runAgentStep({
          sessionKey: currentSessionKey,
          message: incomingMessage,
          extraSystemPrompt: replyPrompt,
          timeoutMs: params.announceTimeoutMs,
          lane: AGENT_LANE_NESTED,
          sourceSessionKey: nextSessionKey,
          sourceChannel:
            nextSessionKey === params.requesterSessionKey ? params.requesterChannel : targetChannel,
          sourceTool: "sessions_send",
        });
        if (!replyText || isReplySkip(replyText)) {
          break;
        }
        latestReply = replyText;
        incomingMessage = replyText;
        const swap = currentSessionKey;
        currentSessionKey = nextSessionKey;
        nextSessionKey = swap;
      }
    }

    const announcePrompt = buildAgentToAgentAnnounceContext({
      requesterSessionKey: params.requesterSessionKey,
      requesterChannel: params.requesterChannel,
      targetSessionKey: params.displayKey,
      targetChannel,
      originalMessage: params.message,
      roundOneReply: primaryReply,
      latestReply,
    });
    const announceReply = await runAgentStep({
      sessionKey: params.targetSessionKey,
      message: "Agent-to-agent announce step.",
      extraSystemPrompt: announcePrompt,
      timeoutMs: params.announceTimeoutMs,
      lane: AGENT_LANE_NESTED,
      sourceSessionKey: params.requesterSessionKey,
      sourceChannel: params.requesterChannel,
      sourceTool: "sessions_send",
    });
    if (announceReply && announceReply.trim() && !isAnnounceSkip(announceReply)) {
      await deliverRequesterSurfaceMessage({
        requesterSessionKey: params.requesterSessionKey,
        announceTarget,
        message: {
          label: "Delegated result",
          message: announceReply.trim(),
        },
        runContextId,
      });
      return;
    }

    const rawFallback =
      normalizeOptionalString(primaryReply) ?? normalizeOptionalString(latestReply);
    if (rawFallback) {
      await deliverRequesterSurfaceMessage({
        requesterSessionKey: params.requesterSessionKey,
        announceTarget,
        message: buildDelegatedRawFallbackMessage({
          displayKey: params.displayKey,
          reply: rawFallback,
        }),
        runContextId,
      });
      return;
    }

    await deliverRequesterSurfaceMessage({
      requesterSessionKey: params.requesterSessionKey,
      announceTarget,
      message: buildDelegatedFailureMessage({
        displayKey: params.displayKey,
        failureClass: "announce_generation_failed",
      }),
      runContextId,
    });
  } catch (err) {
    log.warn("sessions_send announce flow failed", {
      runId: runContextId,
      error: formatErrorMessage(err),
    });
  }
}

export const __testing = {
  setDepsForTest(overrides?: Partial<{ callGateway: GatewayCaller }>) {
    sessionsSendA2ADeps = overrides
      ? {
          ...defaultSessionsSendA2ADeps,
          ...overrides,
        }
      : defaultSessionsSendA2ADeps;
  },
};

import { enqueueCommandInLane } from "../../process/command-queue.js";
import { DefaultAgentRuntimeCore } from "../agent-runtime-core.js";
import { agentRuntimeInvocationFromEmbeddedParams } from "../agent-runtime-invocation.js";
import { resolveGlobalLane, resolveSessionLane } from "./lanes.js";
import type { RunEmbeddedPiAgentParams } from "./run/params.js";
import type { EmbeddedPiRunResult } from "./types.js";

function abortErrorFromSignal(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }
  const error =
    reason !== undefined
      ? new Error("Operation aborted", { cause: reason })
      : new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortErrorFromSignal(signal);
  }
}

function emitEmbeddedRunStartTiming(
  params: RunEmbeddedPiAgentParams,
  label: string,
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  if (process.env.OPENCLAW_NODE_AGENT_START_TIMING === "1") {
    process.stderr.write(
      `${JSON.stringify({
        event: "embedded_run_start_timing",
        label,
        elapsedMs: Date.now() - startedAt,
        ...details,
      })}\n`,
    );
  }
  void params.onAgentEvent?.({
    stream: "node-agent",
    data: {
      eventType: "embedded_run_start_timing",
      stage: label,
      elapsedMs: Date.now() - startedAt,
      ...details,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutationAllowed: false,
    },
  });
}

export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const runStartedAt = Date.now();
  const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
  const globalLane = resolveGlobalLane(params.lane);
  const enqueueGlobal =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
  const enqueueSession =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(sessionLane, task, opts));

  throwIfAborted(params.abortSignal);
  emitEmbeddedRunStartTiming(params, "before_session_lane_enqueue", runStartedAt, {
    sessionLane,
    globalLane,
    schedulingMode: "command_queue",
  });

  return await enqueueSession(() => {
    throwIfAborted(params.abortSignal);
    emitEmbeddedRunStartTiming(params, "entered_session_lane", runStartedAt, {
      sessionLane,
      globalLane,
      schedulingMode: "command_queue",
    });
    emitEmbeddedRunStartTiming(params, "before_global_lane_enqueue", runStartedAt, {
      sessionLane,
      globalLane,
      schedulingMode: "command_queue",
    });
    return enqueueGlobal(async () => {
      throwIfAborted(params.abortSignal);
      emitEmbeddedRunStartTiming(params, "entered_global_lane", runStartedAt, {
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        schedulingMode: "command_queue",
      });
      return await new DefaultAgentRuntimeCore().run({
        invocation: agentRuntimeInvocationFromEmbeddedParams({ params }),
      });
    });
  });
}

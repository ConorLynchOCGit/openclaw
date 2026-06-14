import {
  NativeExecutionSessionWorkerAdapter,
  NATIVE_EXECUTION_SESSION_QUEUE,
  RuntimeWorkerSupervisor,
  buildRuntimeExecutionEventData,
  buildWorkQueueExecutionEligibilityReadModel,
  collectSharedExecutionFinishEvidence,
  finishSharedExecution,
  type JsonValue,
  type NativeExecutionSessionWorkerRunResult,
  type RuntimeJobRepository,
  type SharedExecutionEvidence,
  type SharedExecutionFinishResult,
  type WorkQueueRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import {
  createNodeFinishTool,
  type NodeFinish,
} from "../../extensions/execution-platform/src/workflows/node-finish-tool.js";
import type { AgentTurnEnvelopePolicy } from "../agents/agent-turn.js";
import type { OpenClawAcceptedAgentRun } from "../agents/openclaw-agent-runtime-contracts.js";
import type { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";
import { commitAcceptedNativeExecutionJob } from "./native-execution-start-service.js";

export type GatewayNativeExecutionSessionRunResult = {
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  status: string;
  runtimeJobId: string | null;
  sessionId: string | null;
  agentProfile: string | null;
  workerId: string;
  reasonCodes: string[];
};

export type GatewayNativeExecutionSessionLaunchResult = {
  status: "scheduled" | "not_configured";
  workerId: string | null;
  queueName: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type GatewayNativeExecutionSessionLaunchInput = {
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  workerId: string;
  queueName: string;
};

export type GatewayNativeExecutionSessionLaunchScheduler = (
  input: GatewayNativeExecutionSessionLaunchInput,
) => Promise<GatewayNativeExecutionSessionLaunchResult> | GatewayNativeExecutionSessionLaunchResult;

const NATIVE_EXECUTION_AGENT_LANE = "native-execution";

const UNSAFE_RUNTIME_EVENT_EXTRA_KEYS = new Set([
  "rawPrompt",
  "rawResponse",
  "rawProviderLog",
  "rawToolLog",
  "rawCommandLog",
  "prompt",
  "messages",
  "tools",
  "providerBody",
  "requestBody",
  "responseBody",
  "output",
  "details",
  "stdout",
  "stderr",
  "command",
  "resultText",
]);

function mapNativeNodeFinishStatus(
  status: NodeFinish["status"],
): "completed" | "blocked" | "needs_review" {
  return status === "needs_escalation" ? "needs_review" : status;
}

function runtimeJobEventRef(params: { runtimeJobId: string; eventId: string }): string {
  return `runtime-job://${params.runtimeJobId}/event/${params.eventId}`;
}

function runtimeJobArtifactRef(params: { runtimeJobId: string; artifactId: string }): string {
  return `runtime-job://${params.runtimeJobId}/artifact/${params.artifactId}`;
}

function uniqueRefs(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ).slice(0, 80);
}

function boundedRuntimeEventText(value: string | null | undefined, maxChars = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxChars) : null;
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function booleanFromRecord(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function numberFromRecord(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeRuntimeEventExtra(input: Record<string, unknown>): Record<string, JsonValue> {
  const extra: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || UNSAFE_RUNTIME_EVENT_EXTRA_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "string") {
      extra[key] = boundedRuntimeEventText(value, 1_000);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      extra[key] = value as JsonValue;
      continue;
    }
    if (Array.isArray(value)) {
      extra[key] = value
        .flatMap((entry) =>
          typeof entry === "string" ? [boundedRuntimeEventText(entry, 1_000)] : [],
        )
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 80);
    }
  }
  return extra;
}

export function classifyNativeAgentRuntimeEvent(input: {
  runtimeJobId: string;
  sessionId: string;
  event: { stream: string; data: Record<string, unknown> };
}): { eventType: string; data: Record<string, JsonValue> } | null {
  if (input.event.stream === "agent-runtime-core") {
    const phase = stringFromRecord(input.event.data, "phase");
    return {
      eventType: "execution.launch.timing",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "launch_timing_recorded",
        extra: safeRuntimeEventExtra({
          sourceEventType: "agent_runtime_core_phase",
          stage: phase,
          phase,
          component: stringFromRecord(input.event.data, "component"),
          status: stringFromRecord(input.event.data, "status"),
          requestShape: stringFromRecord(input.event.data, "requestShape"),
          promptProfile: stringFromRecord(input.event.data, "promptProfile"),
          runEnvironmentOwner: stringFromRecord(input.event.data, "runEnvironmentOwner"),
          resolvedWorkspace: stringFromRecord(input.event.data, "resolvedWorkspace"),
          workspaceFallbackUsed: booleanFromRecord(input.event.data, "workspaceFallbackUsed"),
          modelsJsonStatus: stringFromRecord(input.event.data, "modelsJsonStatus"),
          runtimePluginsLoaded: booleanFromRecord(input.event.data, "runtimePluginsLoaded"),
          runtimePluginsStatus: stringFromRecord(input.event.data, "runtimePluginsStatus"),
          contextPressureOwner: stringFromRecord(input.event.data, "contextPressureOwner"),
          modelAuthOwner: stringFromRecord(input.event.data, "modelAuthOwner"),
          modelRegistryStatus: stringFromRecord(input.event.data, "modelRegistryStatus"),
          authProfileCount: numberFromRecord(input.event.data, "authProfileCount"),
          profileCandidateCount: numberFromRecord(input.event.data, "profileCandidateCount"),
          contextWindowTokens: numberFromRecord(input.event.data, "contextWindowTokens"),
          providerClientOwner: stringFromRecord(input.event.data, "providerClientOwner"),
          adapter: stringFromRecord(input.event.data, "adapter"),
          providerLeaseId: stringFromRecord(input.event.data, "providerLeaseId"),
          providerTransportKind: stringFromRecord(input.event.data, "providerTransportKind"),
          providerHarnessId: stringFromRecord(input.event.data, "providerHarnessId"),
          providerFallbackAllowed: booleanFromRecord(input.event.data, "providerFallbackAllowed"),
          stopReason: stringFromRecord(input.event.data, "stopReason"),
          errorKind: stringFromRecord(input.event.data, "errorKind"),
          payloadCount: numberFromRecord(input.event.data, "payloadCount"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (input.event.stream !== "node-agent") {
    return null;
  }
  const eventType = stringFromRecord(input.event.data, "eventType");
  if (eventType === "node_agent_native_task_result") {
    const childSessionId = stringFromRecord(input.event.data, "childSessionKey");
    const status = stringFromRecord(input.event.data, "status");
    const failed =
      status !== null && status !== "completed" && status !== "ok" && status !== "accepted";
    return {
      eventType: failed ? "execution.child.failed" : "execution.child.completed",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: failed ? "child_session_failed" : "child_session_completed",
        childSessionId,
        childRelation: childSessionId ? "blocking" : null,
        extra: safeRuntimeEventExtra({
          sourceEventType: eventType,
          taskRef: stringFromRecord(input.event.data, "taskRef"),
          requestedAgentId: stringFromRecord(input.event.data, "requestedAgentId"),
          childRunId: stringFromRecord(input.event.data, "childRunId"),
          childProvider: stringFromRecord(input.event.data, "childProvider"),
          childModel: stringFromRecord(input.event.data, "childModel"),
          status,
          foreground: booleanFromRecord(input.event.data, "foreground"),
          resultDeliveredToParentContext: booleanFromRecord(
            input.event.data,
            "resultDeliveredToParentContext",
          ),
          resultDeliveryStatus: stringFromRecord(input.event.data, "resultDeliveryStatus"),
          childProgressOutcome: stringFromRecord(input.event.data, "childProgressOutcome"),
          criticDecision: stringFromRecord(input.event.data, "criticDecision"),
          criticDecisionValid: booleanFromRecord(input.event.data, "criticDecisionValid"),
          childIdentityVerified: booleanFromRecord(input.event.data, "childIdentityVerified"),
          childResultRef: stringFromRecord(input.event.data, "childResultRef"),
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (eventType === "session_launch") {
    return {
      eventType: "execution.agent.launch",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "agent_launch_recorded",
        extra: safeRuntimeEventExtra({
          sourceEventType: eventType,
          agentId: stringFromRecord(input.event.data, "agentId"),
          admissionStatus: stringFromRecord(input.event.data, "admissionStatus"),
          blockerKind: stringFromRecord(input.event.data, "blockerKind"),
          provider: stringFromRecord(input.event.data, "provider"),
          model: stringFromRecord(input.event.data, "model"),
          reasoningLevel: stringFromRecord(input.event.data, "reasoningLevel"),
          thinkingLevel: stringFromRecord(input.event.data, "thinkingLevel"),
          promptHashMatched: booleanFromRecord(input.event.data, "promptHashMatched"),
          persisted: booleanFromRecord(input.event.data, "persisted"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (eventType === "embedded_run_start_timing") {
    return {
      eventType: "execution.launch.timing",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "launch_timing_recorded",
        extra: safeRuntimeEventExtra({
          sourceEventType: eventType,
          stage: stringFromRecord(input.event.data, "stage"),
          elapsedMs: numberFromRecord(input.event.data, "elapsedMs"),
          sessionLane: stringFromRecord(input.event.data, "sessionLane"),
          globalLane: stringFromRecord(input.event.data, "globalLane"),
          provider: stringFromRecord(input.event.data, "provider"),
          model:
            stringFromRecord(input.event.data, "modelId") ??
            stringFromRecord(input.event.data, "model"),
          agentId: stringFromRecord(input.event.data, "agentId"),
          errorName: stringFromRecord(input.event.data, "errorName"),
          errorMessage: boundedRuntimeEventText(
            stringFromRecord(input.event.data, "errorMessage"),
            500,
          ),
          reasoningLevel: stringFromRecord(input.event.data, "reasoningLevel"),
          thinkingLevel: stringFromRecord(input.event.data, "thinkLevel"),
          schedulingMode: stringFromRecord(input.event.data, "schedulingMode"),
          runLoopIterations: numberFromRecord(input.event.data, "runLoopIterations"),
          modelFound: booleanFromRecord(input.event.data, "modelFound"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (eventType === "node_agent_provider_request_diagnostics") {
    return {
      eventType: "execution.provider.request",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "provider_request_recorded",
        extra: safeRuntimeEventExtra({
          sourceEventType: eventType,
          agentId: stringFromRecord(input.event.data, "agentId"),
          provider: stringFromRecord(input.event.data, "provider"),
          model: stringFromRecord(input.event.data, "model"),
          api: stringFromRecord(input.event.data, "api"),
          attempt: numberFromRecord(input.event.data, "attempt"),
          reasoning: stringFromRecord(input.event.data, "reasoning"),
          reasoningEffort: stringFromRecord(input.event.data, "reasoning_effort"),
          includeReasoning: booleanFromRecord(input.event.data, "include_reasoning"),
          parallelToolCalls: booleanFromRecord(input.event.data, "parallel_tool_calls"),
          toolChoice: stringFromRecord(input.event.data, "tool_choice"),
          maxTokens: numberFromRecord(input.event.data, "max_tokens"),
          temperature: numberFromRecord(input.event.data, "temperature"),
          stream: booleanFromRecord(input.event.data, "stream"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (eventType === "node_agent_provider_wait_lock_handoff") {
    return {
      eventType: "execution.provider.wait_lock_handoff",
      data: buildRuntimeExecutionEventData({
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "provider_wait_lock_handoff_recorded",
        extra: safeRuntimeEventExtra({
          sourceEventType: eventType,
          agentId: stringFromRecord(input.event.data, "agentId"),
          phase: stringFromRecord(input.event.data, "phase"),
          method: stringFromRecord(input.event.data, "method"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        }),
      }),
    };
  }
  if (eventType !== "node_agent_tool_result") {
    return null;
  }
  const toolName = stringFromRecord(input.event.data, "toolName");
  if (!toolName || toolName === "node_finish") {
    return null;
  }
  const agentId = stringFromRecord(input.event.data, "agentId");
  const mutatingAction = booleanFromRecord(input.event.data, "mutatingAction") === true;
  const validationAction = agentId === "execution-validation-scout";
  const criticAction = agentId === "execution-critic";
  const eventKind = mutatingAction
    ? "mutation_recorded"
    : validationAction
      ? "validation_recorded"
      : criticAction
        ? "critic_recorded"
        : "tool_call_recorded";
  const runtimeEventType = mutatingAction
    ? "execution.mutation.recorded"
    : validationAction
      ? "execution.validation.recorded"
      : criticAction
        ? "execution.critic.recorded"
        : "execution.tool.result";
  return {
    eventType: runtimeEventType,
    data: buildRuntimeExecutionEventData({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      eventKind,
      extra: safeRuntimeEventExtra({
        sourceEventType: eventType,
        toolResultRef: stringFromRecord(input.event.data, "toolResultRef"),
        runId: stringFromRecord(input.event.data, "runId"),
        agentId,
        requestedAgentId: validationAction || criticAction ? agentId : null,
        toolName,
        toolCallId: stringFromRecord(input.event.data, "toolCallId"),
        status: stringFromRecord(input.event.data, "status"),
        isError: booleanFromRecord(input.event.data, "isError"),
        mutatingAction,
        changedFiles: stringArrayFromRecord(input.event.data, "changedFilePaths"),
        changedFilePaths: stringArrayFromRecord(input.event.data, "changedFilePaths"),
        addedFilePaths: stringArrayFromRecord(input.event.data, "addedFilePaths"),
        modifiedFilePaths: stringArrayFromRecord(input.event.data, "modifiedFilePaths"),
        deletedFilePaths: stringArrayFromRecord(input.event.data, "deletedFilePaths"),
        diagnosticSummaries: stringArrayFromRecord(input.event.data, "diagnosticSummaries"),
        diffAvailable: booleanFromRecord(input.event.data, "diffAvailable"),
        diffByteCount: numberFromRecord(input.event.data, "diffByteCount"),
        firstChangedLine: numberFromRecord(input.event.data, "firstChangedLine"),
        todoActiveItem: boundedRuntimeEventText(
          stringFromRecord(input.event.data, "todoActiveItem"),
          500,
        ),
        finishAccepted: booleanFromRecord(input.event.data, "finishAccepted"),
        workQueueLifecycleMutationAllowed: false,
      }),
    }),
  };
}

async function recordNativeAgentRuntimeEvent(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  sessionId: string;
  event: { stream: string; data: Record<string, unknown> };
}): Promise<void> {
  const classified = classifyNativeAgentRuntimeEvent(input);
  if (!classified) {
    return;
  }
  await input.runtimeJobs.recordEvent({
    jobId: input.runtimeJobId,
    eventType: classified.eventType,
    data: classified.data,
  });
}

export async function recordNativeLaunchTimingEvent(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  sessionId: string;
  stage: string;
  startedAtMs: number;
  extra?: Record<string, unknown>;
}): Promise<void> {
  await input.runtimeJobs.recordEvent({
    jobId: input.runtimeJobId,
    eventType: "execution.launch.timing",
    data: buildRuntimeExecutionEventData({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      eventKind: "launch_timing_recorded",
      extra: safeRuntimeEventExtra({
        sourceEventType: "native_execution_launch_timing",
        stage: input.stage,
        elapsedMs: Date.now() - input.startedAtMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutationAllowed: false,
        ...input.extra,
      }),
    }),
  });
}

async function collectNativeTurnEvidence(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
}): Promise<SharedExecutionEvidence> {
  const events = await input.runtimeJobs.listEvents(input.runtimeJobId, 1_000);
  const artifacts = await input.runtimeJobs.listArtifacts(input.runtimeJobId, { limit: 1_000 });
  return collectSharedExecutionFinishEvidence({
    runtimeJobId: input.runtimeJobId,
    events,
    artifacts,
  });
}

async function reduceNativeExecutionTurn(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  finish: NodeFinish | null;
  sharedFinish: SharedExecutionFinishResult | null;
  finishArtifactRef: string | null;
  runStopReason: string | null;
  runErrorKind: string | null;
}): Promise<NativeExecutionSessionWorkerRunResult> {
  const evidence = input.sharedFinish?.evidence ?? (await collectNativeTurnEvidence(input));
  const finishEventRef = input.sharedFinish
    ? runtimeJobEventRef({
        runtimeJobId: input.runtimeJobId,
        eventId: input.sharedFinish.event.eventId,
      })
    : null;
  const artifactRefs = uniqueRefs([input.finishArtifactRef, ...evidence.artifactRefs]);
  const evidenceRefs = uniqueRefs([finishEventRef, ...evidence.evidenceRefs]);
  const finishStatus = input.finish ? mapNativeNodeFinishStatus(input.finish.status) : null;
  const hasAcceptedFinish = Boolean(input.sharedFinish?.accepted && input.finish && finishStatus);
  const hasOpenBlockingChild = evidence.openBlockingChildSessionIds.length > 0;
  const hasFailedBlockingChild = evidence.failedBlockingChildSessionIds.length > 0;
  const status: NativeExecutionSessionWorkerRunResult["status"] = hasAcceptedFinish
    ? finishStatus!
    : hasOpenBlockingChild && !hasFailedBlockingChild
      ? "deferred"
      : "needs_review";
  const decision = hasAcceptedFinish
    ? `accepted_finish:${status}`
    : hasFailedBlockingChild
      ? "needs_review_failed_blocking_child"
      : hasOpenBlockingChild
        ? "wait_on_blocking_child"
        : input.finish
          ? "needs_review_rejected_finish"
          : "needs_review_no_required_closeout";
  const reasonCodes = uniqueRefs([
    "native_execution_turn_reduced_by_runtime_job_envelope",
    `native_execution_turn_reducer_decision:${decision}`,
    hasAcceptedFinish ? "native_execution_session_finished_through_shared_finish" : null,
    hasAcceptedFinish && status ? `native_execution_session_finish_status:${status}` : null,
    hasOpenBlockingChild ? "native_execution_turn_waiting_for_blocking_child" : null,
    hasFailedBlockingChild ? "native_execution_turn_failed_blocking_child" : null,
    input.finish && !hasAcceptedFinish ? "native_execution_session_shared_finish_rejected" : null,
    !input.finish && !hasOpenBlockingChild ? "native_execution_session_finish_not_called" : null,
    input.runStopReason ? `embedded_stop_reason:${input.runStopReason}` : null,
    input.runErrorKind ? `embedded_error:${input.runErrorKind}` : null,
    ...(input.sharedFinish?.reasonCodes ?? []),
    ...evidence.reasonCodes,
  ]);
  const summary =
    hasAcceptedFinish && input.finish
      ? input.finish.summary
      : hasFailedBlockingChild
        ? `Native execution turn ended with failed blocking child session(s): ${evidence.failedBlockingChildSessionIds.join(", ")}.`
        : hasOpenBlockingChild
          ? `Native execution turn started blocking child session(s) and is waiting for completion: ${evidence.openBlockingChildSessionIds.join(", ")}.`
          : input.finish
            ? "Native execution session finish was rejected by shared runtime evidence closure."
            : "Native execution session ended without a node_finish tool call.";
  await input.runtimeJobs.recordEvent({
    jobId: input.runtimeJobId,
    eventType: "execution.turn.reduced",
    data: buildRuntimeExecutionEventData({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      eventKind: "turn_reduced",
      extra: {
        decision,
        status,
        finishObserved: Boolean(input.finish),
        finishAccepted: Boolean(input.sharedFinish?.accepted),
        finishEventRef,
        finishArtifactRef: input.finishArtifactRef,
        evidenceRefs,
        artifactRefs,
        openBlockingChildSessionIds: evidence.openBlockingChildSessionIds,
        failedBlockingChildSessionIds: evidence.failedBlockingChildSessionIds,
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutationAllowed: false,
      },
    }),
  });
  return {
    status,
    summary,
    sessionId: input.sessionId,
    agentProfile: input.agentProfile,
    artifactRefs,
    completedWorkEvidenceRefs: evidenceRefs,
    reasonCodes,
    ...(status === "deferred" ? { retryDelayMs: 10_000 } : {}),
    result: {
      status,
      decision,
      sessionId: input.sessionId,
      agentProfile: input.agentProfile,
      finishObserved: Boolean(input.finish),
      finishEventRef,
      finishArtifactRef: input.finishArtifactRef,
      evidenceRefs,
      artifactRefs,
      openBlockingChildSessionIds: evidence.openBlockingChildSessionIds,
      failedBlockingChildSessionIds: evidence.failedBlockingChildSessionIds,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export async function runNativeExecutionSessionRuntimeJob(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  agentRuntime: OpenClawAgentRuntime;
  runtimeJobId?: string;
  workerId: string;
  queueName?: string | null;
  launchNativeExecutionSession?: GatewayNativeExecutionSessionLaunchScheduler;
}): Promise<GatewayNativeExecutionSessionRunResult> {
  let claimedSessionId: string | null = null;
  let claimedAgentProfile: string | null = null;
  const workerAdapter = new NativeExecutionSessionWorkerAdapter({
    runtimeJobs: input.runtimeJobs,
    runner: {
      async run({ job, payload, taskMessage }) {
        claimedSessionId = payload.session.sessionId;
        claimedAgentProfile = payload.session.agentProfile;
        const launchStartedAtMs = Date.now();
        const recordLaunchTiming = async (
          stage: string,
          extra?: Record<string, unknown>,
        ): Promise<void> => {
          try {
            await recordNativeLaunchTimingEvent({
              runtimeJobs: input.runtimeJobs,
              runtimeJobId: job.jobId,
              sessionId: payload.session.sessionId,
              stage,
              startedAtMs: launchStartedAtMs,
              extra,
            });
          } catch {
            // Launch timing is diagnostic evidence only. It must not interrupt execution.
          }
        };
        await recordLaunchTiming("runner_entered", {
          agentProfile: payload.session.agentProfile,
          parentSessionId: payload.session.parentSessionId,
          childRelation: payload.session.childRelation,
        });
        const accepted: OpenClawAcceptedAgentRun = {
          artifactKind: "openclaw.accepted_agent_run",
          schemaVersion: "openclaw.accepted-agent-run.v1",
          runtimeGenerationId: payload.runtimeGenerationId,
          agentId: payload.agentId,
          envelope: payload.envelope,
          policyRef: payload.policyRef,
          sessionId: payload.session.sessionId,
          parentSessionId: payload.session.parentSessionId,
          childRelation: payload.session.childRelation,
          request: {
            objective: payload.objective,
            refs: payload.refs,
            constraints: payload.constraints,
            validationSignal: payload.validationSignal,
          },
          taskMessage,
          runRequest: payload.runRequest as unknown as OpenClawAcceptedAgentRun["runRequest"],
          idempotencyScope: job.idempotencyScope,
          idempotencyKey: job.idempotencyKey,
          metadata: {
            configSnapshotId: "",
            catalogSnapshotId: "",
            promptProfileHash: "",
            toolPolicyHash: "",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          secretsStored: false,
        };
        const profile = input.agentRuntime.profile(accepted.agentId);
        const allowedChildAgentIds = profile.allowedChildAgentIds;
        const parentToolNames = profile.parentToolNames;
        await recordLaunchTiming("runtime_generation_resolved", {
          agentId: accepted.agentId,
          runtimeGenerationId: accepted.runtimeGenerationId,
          providerCapabilityId: profile.providerCapability.capabilityId,
          providerTransportKind: profile.providerCapability.transportKind,
          providerFallbackAllowed: profile.providerCapability.fallbackAllowed,
          modelRef: profile.model.requestedRef,
          admittedModelRef: profile.model.canonicalRef,
          modelResolutionSource: profile.model.resolutionSource,
          thinkingLevel: profile.thinkingLevel,
          reasoningLevel: profile.reasoningLevel,
          runtimeWorkspaceDir: profile.roots.runtimeWorkspaceDir,
          canonicalSourceRoot: profile.roots.canonicalSourceRoot,
          transcriptRoot: profile.roots.transcriptRoot,
          artifactRoot: profile.roots.artifactRoot,
          allowedChildAgentCount: allowedChildAgentIds.length,
          parentToolCount: parentToolNames.length,
        });
        const capturedFinish: { value: NodeFinish | null } = { value: null };
        let finishArtifactRef: string | null = null;
        const latestSharedFinish: { value: SharedExecutionFinishResult | null } = { value: null };
        const finishTool = createNodeFinishTool({
          nodeRunId: payload.session.sessionId,
          onSharedFinish: async (finish) => {
            latestSharedFinish.value = await finishSharedExecution({
              runtimeJobs: input.runtimeJobs,
              runtimeJobId: job.jobId,
              sessionId: payload.session.sessionId,
              status: mapNativeNodeFinishStatus(finish.status),
              summary: finish.summary,
              blockerKind: finish.blockerKind,
              reason: finish.reason,
              requiredEvidenceKinds: [],
            });
            return latestSharedFinish.value;
          },
          onFinish: async (finish) => {
            capturedFinish.value = finish;
            const artifact = await input.runtimeJobs.attachArtifact({
              jobId: job.jobId,
              artifactType: "execution.native_execution_finish",
              storageKind: "metadata",
              uri: `runtime-job://${job.jobId}/native-execution/${encodeURIComponent(
                payload.session.sessionId,
              )}/finish`,
              contentType: "application/json",
              metadata: {
                status: finish.status,
                summary: finish.summary.slice(0, 1_000),
                blockerKind: finish.blockerKind ?? null,
                evidenceRefCount: finish.evidenceRefs.length,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                workQueueLifecycleMutated: false,
              },
            });
            finishArtifactRef = runtimeJobArtifactRef({
              runtimeJobId: job.jobId,
              artifactId: artifact.artifactId,
            });
          },
        });
        await recordLaunchTiming("before_embedded_agent", {
          bootstrapContextMode: "lightweight",
          bootstrapContextRunKind: "default",
          agentLane: NATIVE_EXECUTION_AGENT_LANE,
        });
        const runAbortController = new AbortController();
        const cancelPoll = setInterval(() => {
          void input.runtimeJobs
            .getJob(job.jobId)
            .then((latestJob) => {
              if (latestJob?.state !== "canceled" || runAbortController.signal.aborted) {
                return;
              }
              runAbortController.abort(new Error("Native execution runtime job was canceled."));
              void recordLaunchTiming("runtime_job_cancel_observed", {
                runtimeJobState: latestJob.state,
              });
            })
            .catch(() => {
              // Cancellation polling is best-effort. The RuntimeJob state remains
              // authoritative even if this diagnostic poll fails.
            });
        }, 1_000);
        cancelPoll.unref?.();
        let runResult;
        try {
          const onAgentEvent = (evt: { stream: string; data: Record<string, unknown> }) => {
            void recordNativeAgentRuntimeEvent({
              runtimeJobs: input.runtimeJobs,
              runtimeJobId: job.jobId,
              sessionId: payload.session.sessionId,
              event: evt,
            }).catch(() => {
              // Event recording must not interrupt the active model turn. Missing evidence
              // is caught by node_finish/shared-finish rejection instead.
            });
          };
          const nativeExecutionSession: NonNullable<
            AgentTurnEnvelopePolicy["nativeExecutionSession"]
          > = {
            enabled: true,
            readWorkQueueEligibility: async (eligibilityInput) =>
              buildWorkQueueExecutionEligibilityReadModel({
                workQueue: input.workQueue,
                runtimeJobs: input.runtimeJobs,
                resultLimit: eligibilityInput.limit,
              }),
            startExecutionSession: async (request) => {
              const childQueueName = NATIVE_EXECUTION_SESSION_QUEUE;
              const childAccepted = input.agentRuntime.acceptNativeExecutionSession({
                request,
                runtime: {
                  parentRuntimeJobId: job.jobId,
                  parentSessionId: payload.session.sessionId,
                  childRelation: "blocking",
                  queueName: childQueueName,
                  workItemId: job.workItemId,
                  idempotencyScope: `native-execution-child:${job.jobId}`,
                },
                envelope: "child_agent",
              });
              const result = await commitAcceptedNativeExecutionJob({
                runtimeJobs: input.runtimeJobs,
                accepted: childAccepted,
                runtime: {
                  parentRuntimeJobId: job.jobId,
                  parentSessionId: payload.session.sessionId,
                  childRelation: "blocking",
                  queueName: childQueueName,
                  workItemId: job.workItemId,
                  idempotencyScope: `native-execution-child:${job.jobId}`,
                },
              });
              await input.runtimeJobs.recordEvent({
                jobId: job.jobId,
                eventType: "execution.child.started",
                data: buildRuntimeExecutionEventData({
                  runtimeJobId: job.jobId,
                  sessionId: payload.session.sessionId,
                  eventKind: "child_session_started",
                  childSessionId: result.sessionId,
                  childRelation: "blocking",
                  extra: {
                    childRuntimeJobId: result.runtimeJobId,
                    childAgentProfile: result.agentProfile,
                    sourceToolName: "start_execution_session",
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                    workQueueLifecycleMutationAllowed: false,
                  },
                }),
              });
              const childWorkerId = `${input.workerId}:child`;
              let launch: GatewayNativeExecutionSessionLaunchResult;
              if (input.launchNativeExecutionSession) {
                await recordNativeLaunchTimingEvent({
                  runtimeJobs: input.runtimeJobs,
                  runtimeJobId: result.runtimeJobId,
                  sessionId: result.sessionId,
                  stage: "runtime_worker_dispatch_scheduled",
                  startedAtMs: Date.now(),
                  extra: {
                    sourceEventType: "native_execution_child_launch_timing",
                    executionClass: "native_runtime_job",
                    schedulerClass: "runtime_worker_supervisor",
                    agentId: result.agentProfile,
                    workerId: childWorkerId,
                    queueName: childQueueName,
                    parentRuntimeJobId: job.jobId,
                    parentSessionId: payload.session.sessionId,
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  },
                });
                launch = await input.launchNativeExecutionSession({
                  runtimeJobId: result.runtimeJobId,
                  sessionId: result.sessionId,
                  agentProfile: result.agentProfile,
                  workerId: childWorkerId,
                  queueName: childQueueName,
                });
              } else {
                launch = {
                  status: "not_configured",
                  workerId: null,
                  queueName: childQueueName,
                  reasonCodes: ["native_execution_child_launch_scheduler_not_configured"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawLogsStored: false,
                  workQueueLifecycleMutated: false,
                };
              }
              return {
                status: result.status,
                runtimeJobId: result.runtimeJobId,
                sessionId: result.sessionId,
                agentProfile: result.agentProfile,
                eventType: result.event.eventType,
                runStatus: launch.status,
                runCompleted: false,
                runReasonCodes: launch.reasonCodes.slice(0, 12),
              };
            },
          };
          runResult = await input.agentRuntime.runAcceptedNativeExecution({
            accepted,
            runtimeJobId: job.jobId,
            abortSignal: runAbortController.signal,
            nativeRuntimeTools: [finishTool],
            onAgentEvent,
            nativeExecutionSession,
            onExecutorEvent: async (event) => {
              await recordLaunchTiming(event.phase, {
                executionClass: event.executionClass,
                schedulerClass: event.schedulerClass,
                requestShape: event.requestShape,
                executorElapsedMs: event.elapsedMs,
                agentId: event.agentId,
                errorName: event.errorName,
                errorMessage: event.errorMessage,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                workQueueLifecycleMutationAllowed: false,
              });
            },
            ...(allowedChildAgentIds.length > 0
              ? {
                  nodeAgentNativeTaskMode: {
                    enabled: true,
                    allowedAgentIds: allowedChildAgentIds,
                    parentToolNames,
                  },
                }
              : {}),
          });
        } catch (error) {
          if (!runAbortController.signal.aborted && error && typeof error === "object") {
            const existingReasonCodes = Array.isArray(
              (error as { runtimeNeedsReviewReasonCodes?: unknown }).runtimeNeedsReviewReasonCodes,
            )
              ? (
                  (error as { runtimeNeedsReviewReasonCodes?: unknown })
                    .runtimeNeedsReviewReasonCodes as unknown[]
                ).filter(
                  (code): code is string => typeof code === "string" && code.trim().length > 0,
                )
              : [];
            (error as { runtimeNeedsReviewReasonCodes?: string[] }).runtimeNeedsReviewReasonCodes =
              uniqueRefs([
                ...existingReasonCodes,
                "native_execution_agent_core_failed_before_terminal_finish",
              ]);
          }
          throw error;
        } finally {
          clearInterval(cancelPoll);
        }
        await recordLaunchTiming("embedded_agent_completed", {
          stopReason: runResult.meta.stopReason,
          errorKind: runResult.meta.error?.kind,
        });
        return await reduceNativeExecutionTurn({
          runtimeJobs: input.runtimeJobs,
          runtimeJobId: job.jobId,
          sessionId: payload.session.sessionId,
          agentProfile: payload.session.agentProfile,
          finish: capturedFinish.value,
          sharedFinish: latestSharedFinish.value,
          finishArtifactRef,
          runStopReason:
            typeof runResult.meta.stopReason === "string" ? runResult.meta.stopReason : null,
          runErrorKind:
            typeof runResult.meta.error?.kind === "string" ? runResult.meta.error.kind : null,
        });
      },
    },
  });
  const supervisorResult = await new RuntimeWorkerSupervisor({
    repository: input.runtimeJobs,
    workerId: input.workerId,
    queueName: input.queueName ?? NATIVE_EXECUTION_SESSION_QUEUE,
    adapters: [workerAdapter],
  }).runNext(input.runtimeJobId ? { runtimeJobId: input.runtimeJobId } : {});
  return {
    claimed: supervisorResult.claimed,
    completed: supervisorResult.completed,
    failed:
      supervisorResult.claimed &&
      !supervisorResult.completed &&
      supervisorResult.status !== "deferred" &&
      supervisorResult.status !== "needs_review" &&
      supervisorResult.status !== "blocked",
    status: supervisorResult.status,
    runtimeJobId: supervisorResult.runtimeJobId,
    sessionId: claimedSessionId,
    agentProfile: claimedAgentProfile,
    workerId: input.workerId,
    reasonCodes: supervisorResult.reasonCodes,
  };
}

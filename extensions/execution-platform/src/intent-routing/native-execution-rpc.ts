import { createHash } from "node:crypto";
import {
  buildConversationRoutingContext,
  buildStructuredModelIntentRouterRequest,
  buildWorkflowSummaryIndex,
  compileChildWorkflowHandoff,
  compileFrontDoorRequest,
  compileMultiIntentPlan,
  enforceActionSemantics,
  evaluateRouterEscalationPolicy,
  buildRouterFrontDoorToolProtocolResult,
  normalizeIntakeRouteContract,
  invokeRouterFrontDoorRuntimeTool,
  ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
  NoopRoutingTelemetryStore,
  parseCanonicalRouterOutput,
  RuntimeArtifactRoutingTelemetryStore,
  runCheapDeterministicFastPath,
  runClarificationGate,
  selectWorkflowSummaryCandidates,
  StructuredModelIntentRouter,
  validateIntentFrontDoorDecision,
  type ClarificationGateDecision,
  type FrontDoorCompileResult,
  type FrontDoorSourcePromptRef,
  type IntentValidationDecision,
  type MultiIntentPlanCompileDecision,
  type RouterEscalationDecision,
  type RoutingTelemetryOutcome,
  type RoutingTelemetryRecord,
  type RoutingTelemetryStore,
  type StructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterResult,
  type CanonicalIntentRoute,
  type RouterFrontDoorToolProtocolResult,
} from "../intent-front-door/index.ts";
import {
  runProtocolPreGate,
  type ProtocolPreGateControlPayload,
} from "../intent-front-door/protocol-pre-gate.ts";
import {
  decidePromptRouterMemoryPolicy,
  type PromptRouterMemoryPolicyDecision,
  type PromptRouterMemoryRouteKind,
} from "../model-memory-runtime/index.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  recordWorkQueueExecutionAction,
  decideWorkQueueExecutionAction,
  type WorkQueueExecutionActionDecision,
  type WorkQueueExecutionActionKind,
} from "../work-queue/execution-actions.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  NATIVE_EXECUTION_SESSION_QUEUE,
  type NativeExecutionRef,
  type StartNativeExecutionSessionInput,
  type StartNativeExecutionSessionResult,
  type StartExecutionSessionVisibleInput,
} from "../workflows/native-agentic-orchestration.ts";
import { applyNativeExecutionControl } from "../workflows/native-execution-control.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import {
  GatewaySubmitDiagnosticsCollector,
  type GatewaySubmitDiagnosticsManifest,
  type GatewaySubmitDiagnosticsPhase,
  type GatewaySubmitDiagnosticsSink,
} from "./gateway-submit-diagnostics.ts";

export type IntentValidatorApprovalRef = {
  approvalId: string;
  approvalKind: string;
  workflowId?: string;
  expiresAt: string;
  revoked?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValueFromRecord(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArrayFromValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 20)
    : [];
}

function nativeSessionIdFromRuntimeJob(job: RuntimeJob): string {
  const payload = asRecord(job.payload);
  const session = asRecord(payload?.session);
  return (
    stringValueFromRecord(session, "sessionId") ??
    stringValueFromRecord(payload, "sessionId") ??
    job.jobId
  );
}

function nativeControlKindFromWorkQueueAction(
  actionKind: WorkQueueExecutionActionKind,
): "pause" | "redirect" | "cancel" | null {
  return actionKind === "pause" || actionKind === "redirect" || actionKind === "cancel"
    ? actionKind
    : null;
}

function numberValueFromRecord(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValueFromRecord(
  record: Record<string, unknown> | null,
  key: string,
): boolean | null {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function boundedStringValueFromRecord(
  record: Record<string, unknown> | null,
  key: string,
  maxChars = 500,
): string | null {
  const value = stringValueFromRecord(record, key);
  return value ? value.slice(0, maxChars) : null;
}

function eventExtraRecord(event: RuntimeJobEvent): Record<string, unknown> | null {
  const data = asRecord(event.data);
  return asRecord(data?.extra) ?? data;
}

function eventErrorRecord(event: RuntimeJobEvent): Record<string, unknown> | null {
  return asRecord(asRecord(event.data)?.error);
}

type NativeExecutionLivePhase =
  | "job_claimed"
  | "scheduler_waiting"
  | "scheduler_entered"
  | "agent_bootstrap"
  | "prepare_run"
  | "run_environment_preparing"
  | "run_environment_prepared"
  | "model_auth_preparing"
  | "model_auth_prepared"
  | "open_session"
  | "before_submit"
  | "provider_preparing"
  | "provider_request"
  | "model_active"
  | "tool_active"
  | "after_provider_turn"
  | "compacting"
  | "finishing"
  | "terminal"
  | "unknown";

function nativeExecutionPhaseForLaunchStage(stage: string | null): NativeExecutionLivePhase | null {
  if (!stage) {
    return null;
  }
  if (stage === "runner_entered") {
    return "job_claimed";
  }
  if (
    stage === "runtime_worker_dispatch_scheduled" ||
    stage === "before_session_lane_enqueue" ||
    stage === "before_global_lane_enqueue"
  ) {
    return "scheduler_waiting";
  }
  if (
    stage === "executor_entered" ||
    stage === "agent_core_starting" ||
    stage === "caller_owned_scheduler_entered" ||
    stage === "entered_session_lane" ||
    stage === "entered_global_lane"
  ) {
    return "scheduler_entered";
  }
  if (
    stage === "interaction_runtime_entered" ||
    stage === "run_interaction_turn" ||
    stage === "config_loaded" ||
    stage === "agent_pack_registry_loaded" ||
    stage === "agent_runtime_resolved" ||
    stage === "before_embedded_agent" ||
    stage === "runtime_plugins_loaded" ||
    stage === "models_json_reused_admitted_runtime" ||
    stage === "models_json_ensure_started" ||
    stage === "models_json_ensured" ||
    stage === "hook_model_selection_resolved" ||
    stage === "model_registry_reused" ||
    stage === "model_registry_discovered" ||
    stage === "model_resolved" ||
    stage === "auth_store_loaded" ||
    stage === "auth_profile_initialized" ||
    stage === "context_runtime_resolved" ||
    stage === "attempt_workspace_ready"
  ) {
    return "agent_bootstrap";
  }
  if (stage === "prepare_run" || stage === "services_prepared") {
    return "prepare_run";
  }
  if (stage === "run_environment_preparing") {
    return "run_environment_preparing";
  }
  if (stage === "run_environment_prepared") {
    return "run_environment_prepared";
  }
  if (stage === "model_auth_preparing") {
    return "model_auth_preparing";
  }
  if (stage === "model_auth_prepared" || stage === "model_auth_runtime_applied") {
    return "model_auth_prepared";
  }
  if (stage === "open_session") {
    return "open_session";
  }
  if (stage === "before_submit") {
    return "before_submit";
  }
  if (stage === "after_provider_turn") {
    return "after_provider_turn";
  }
  if (stage === "finishing") {
    return "finishing";
  }
  if (
    stage === "provider_auth_rechecked" ||
    stage === "provider_auth_recheck_failed" ||
    stage === "provider_turn_entering" ||
    stage === "provider_capability_entered" ||
    stage === "provider_client_starting" ||
    stage === "provider_client_ready" ||
    stage === "thread_binding_started" ||
    stage === "thread_binding_ready"
  ) {
    return "provider_preparing";
  }
  if (stage === "provider_request_started") {
    return "provider_request";
  }
  if (stage === "model_stream_started") {
    return "model_active";
  }
  if (
    stage === "tool_call_started" ||
    stage === "tool_call_completed" ||
    stage === "tool_call_failed"
  ) {
    return "tool_active";
  }
  if (stage === "model_stream_completed" || stage === "agent_turn_completed") {
    return "after_provider_turn";
  }
  if (stage === "agent_turn_failed") {
    return "terminal";
  }
  if (stage === "agent_core_completed" || stage === "embedded_agent_completed") {
    return "finishing";
  }
  if (stage === "agent_core_failed" || stage === "runtime_job_cancel_observed") {
    return "terminal";
  }
  if (stage === "runtime_worker_dispatch_failed") {
    return "terminal";
  }
  return null;
}

function nativeExecutionPhaseForEvent(event: RuntimeJobEvent): NativeExecutionLivePhase | null {
  if (event.eventType === "execution.launch.timing") {
    return nativeExecutionPhaseForLaunchStage(
      stringValueFromRecord(eventExtraRecord(event), "stage"),
    );
  }
  if (event.eventType === "execution.agent.launch") {
    return "model_active";
  }
  if (event.eventType === "execution.provider.request") {
    return "provider_request";
  }
  if (event.eventType.includes("compaction") || event.eventType.includes("context_pressure")) {
    return "compacting";
  }
  if (event.eventType.includes(".tool.") || event.eventType === "execution.tool.recorded") {
    return "tool_active";
  }
  if (
    event.eventType === "execution.mutation.recorded" ||
    event.eventType === "execution.validation.recorded" ||
    event.eventType === "execution.critic.recorded"
  ) {
    return "tool_active";
  }
  if (event.eventType === "execution.finish.recorded" || event.eventType.includes("finish")) {
    return "finishing";
  }
  return null;
}

function compactNativeExecutionEvent(event: RuntimeJobEvent): JsonValue {
  const data = asRecord(event.data);
  const extra = eventExtraRecord(event);
  const error = eventErrorRecord(event);
  const stage = stringValueFromRecord(extra, "stage");
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventTime: event.eventTime.toISOString(),
    workerId: event.workerId,
    leasePresent: Boolean(event.leaseId),
    eventKind: stringValueFromRecord(data, "eventKind"),
    stage,
    currentPhase:
      nativeExecutionPhaseForEvent(event) ??
      stringValueFromRecord(extra, "currentPhase") ??
      stringValueFromRecord(extra, "phase"),
    elapsedMs: numberValueFromRecord(extra, "elapsedMs"),
    executorElapsedMs: numberValueFromRecord(extra, "executorElapsedMs"),
    executionClass: stringValueFromRecord(extra, "executionClass"),
    schedulerClass: stringValueFromRecord(extra, "schedulerClass"),
    schedulingMode: stringValueFromRecord(extra, "schedulingMode"),
    sessionLane: stringValueFromRecord(extra, "sessionLane"),
    globalLane: stringValueFromRecord(extra, "globalLane"),
    queuedAhead: numberValueFromRecord(extra, "queuedAhead"),
    waitMs: numberValueFromRecord(extra, "waitMs"),
    agentId: stringValueFromRecord(extra, "agentId"),
    provider: stringValueFromRecord(extra, "provider"),
    model: stringValueFromRecord(extra, "model"),
    providerLeaseId: stringValueFromRecord(extra, "providerLeaseId"),
    providerTransportKind: stringValueFromRecord(extra, "providerTransportKind"),
    providerHarnessId: stringValueFromRecord(extra, "providerHarnessId"),
    providerFallbackAllowed: booleanValueFromRecord(extra, "providerFallbackAllowed"),
    toolName: stringValueFromRecord(extra, "toolName"),
    status: stringValueFromRecord(extra, "status"),
    runtimeGenerationId: stringValueFromRecord(extra, "runtimeGenerationId"),
    configSnapshotId: stringValueFromRecord(extra, "configSnapshotId"),
    catalogSnapshotId: stringValueFromRecord(extra, "catalogSnapshotId"),
    errorCode: boundedStringValueFromRecord(error, "code", 200),
    errorName: boundedStringValueFromRecord(extra, "errorName", 200),
    errorMessage:
      boundedStringValueFromRecord(extra, "errorMessage") ??
      boundedStringValueFromRecord(error, "message"),
    rawPromptStored: booleanValueFromRecord(data, "rawPromptStored") ?? false,
    rawResponseStored: booleanValueFromRecord(data, "rawResponseStored") ?? false,
    rawProviderLogStored: booleanValueFromRecord(data, "rawProviderLogStored") ?? false,
    rawToolLogStored: booleanValueFromRecord(data, "rawToolLogStored") ?? false,
  };
}

function compactNativeExecutionRuntimeJob(job: RuntimeJob | null): JsonValue {
  if (!job) {
    return null;
  }
  const payload = asRecord(job.payload);
  const runRequest = asRecord(payload?.runRequest);
  const modelProfile = asRecord(runRequest?.modelProfile);
  const runMetadata = asRecord(runRequest?.metadata);
  const result = asRecord(job.result);
  const error = asRecord(job.error);
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    queueName: job.queueName,
    state: job.state,
    workerId: job.workerId,
    workItemId: job.workItemId,
    attempts: job.attempts,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    canceledAt: job.canceledAt?.toISOString() ?? null,
    payloadKeys: payload ? Object.keys(payload).toSorted().slice(0, 80) : [],
    resultKeys: result ? Object.keys(result).toSorted().slice(0, 80) : [],
    errorKeys: error ? Object.keys(error).toSorted().slice(0, 80) : [],
    errorCode: boundedStringValueFromRecord(error, "code", 200),
    errorMessage: boundedStringValueFromRecord(error, "message"),
    runtimeGenerationId: boundedStringValueFromRecord(payload, "runtimeGenerationId", 240),
    agentId: boundedStringValueFromRecord(payload, "agentId", 160),
    envelope: boundedStringValueFromRecord(payload, "envelope", 80),
    policyRef: boundedStringValueFromRecord(payload, "policyRef", 200),
    configSnapshotId: boundedStringValueFromRecord(runMetadata, "configSnapshotId", 300),
    catalogSnapshotId: boundedStringValueFromRecord(runMetadata, "catalogSnapshotId", 300),
    resolvedAgentModelIdentity: compactModelProfile(modelProfile),
    requestParameterSummary: compactModelRequestParameters(modelProfile),
    promptProfileHash: boundedStringValueFromRecord(runMetadata, "promptProfileHash", 120),
    toolPolicyHash: boundedStringValueFromRecord(runMetadata, "toolPolicyHash", 120),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function compactModelProfile(model: Record<string, unknown> | null): JsonValue {
  return model
    ? {
        provider: boundedStringValueFromRecord(model, "provider", 120),
        modelId: boundedStringValueFromRecord(model, "model", 160),
      }
    : null;
}

function compactModelRequestParameters(model: Record<string, unknown> | null): JsonValue {
  return model
    ? {
        thinking: boundedStringValueFromRecord(model, "thinkingLevel", 80),
        reasoning: boundedStringValueFromRecord(model, "reasoningLevel", 80),
      }
    : null;
}

function compactProviderRuntimeError(error: Record<string, unknown> | null): JsonValue {
  return error
    ? {
        failedPhase: boundedStringValueFromRecord(error, "failedPhase", 160),
        provider: boundedStringValueFromRecord(error, "provider", 120),
        model: boundedStringValueFromRecord(error, "model", 160),
        transportKind: boundedStringValueFromRecord(error, "transportKind", 120),
        errorCode: boundedStringValueFromRecord(error, "errorCode", 200),
        errorMessage: boundedStringValueFromRecord(error, "errorMessage", 500),
      }
    : null;
}

function compactNativeExecutionPreflightResult(input: {
  value: unknown;
  statusCode?: number;
}): NativeExecutionPreflightSessionResult {
  const value = asRecord(input.value);
  const accepted = value?.accepted === true;
  const providerError = asRecord(value?.error);
  const reasonCodes = stringArrayFromValue(value?.reasonCodes).slice(0, 40);
  return {
    artifactKind: "native_execution_preflight_session_result",
    accepted,
    status: accepted ? "accepted" : "rejected",
    statusCode: input.statusCode ?? (accepted ? 200 : 400),
    runtimeGenerationId: boundedStringValueFromRecord(value, "runtimeGenerationId", 240),
    providerRuntimeError: compactProviderRuntimeError(providerError),
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["runtime_generation_acceptance"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

const NON_PROGRESS_EVENT_TYPES = new Set([
  "job.lease_renewed",
  "runtime_worker.supervisor_heartbeat",
]);

function isMeaningfulNativeExecutionProgress(event: RuntimeJobEvent): boolean {
  if (NON_PROGRESS_EVENT_TYPES.has(event.eventType)) {
    return false;
  }
  return true;
}

function summarizeNativeExecutionLiveStatus(input: {
  job: RuntimeJob | null;
  events: RuntimeJobEvent[];
}): JsonValue {
  const payload = asRecord(input.job?.payload);
  const runRequest = asRecord(payload?.runRequest);
  const modelProfile = asRecord(runRequest?.modelProfile);
  const runMetadata = asRecord(runRequest?.metadata);
  const eventCounts: Record<string, number> = {};
  const launchStages: JsonValue[] = [];
  let latestMeaningfulEvent: RuntimeJobEvent | null = null;
  let latestLaunchStage: string | null = null;
  let latestLaunchPhase: NativeExecutionLivePhase | null = null;
  let latestPhase: NativeExecutionLivePhase | null = null;
  let modelActivitySeen = false;
  let providerRequestSeen = false;
  let providerPreparingSeen = false;
  let agentLaunchSeen = false;
  let toolActivitySeen = false;
  let mutationSeen = false;
  let validationSeen = false;
  let finishSeen = false;
  let latestErrorEvent: RuntimeJobEvent | null = null;
  for (const event of input.events) {
    eventCounts[event.eventType] = (eventCounts[event.eventType] ?? 0) + 1;
    const extra = eventExtraRecord(event);
    const error = eventErrorRecord(event);
    if (
      boundedStringValueFromRecord(extra, "errorName", 200) ||
      boundedStringValueFromRecord(extra, "errorMessage") ||
      boundedStringValueFromRecord(error, "code", 200) ||
      boundedStringValueFromRecord(error, "message")
    ) {
      latestErrorEvent = event;
    }
    if (isMeaningfulNativeExecutionProgress(event)) {
      latestMeaningfulEvent = event;
    }
    if (event.eventType === "execution.launch.timing") {
      const stage = stringValueFromRecord(extra, "stage");
      const phase = nativeExecutionPhaseForLaunchStage(stage);
      latestLaunchStage = stage ?? latestLaunchStage;
      latestLaunchPhase = phase ?? latestLaunchPhase;
      latestPhase = phase ?? latestPhase;
      if (phase === "provider_preparing") {
        providerPreparingSeen = true;
      }
      if (phase === "provider_request") {
        providerRequestSeen = true;
        modelActivitySeen = true;
      }
      if (phase === "model_active") {
        providerRequestSeen = true;
        modelActivitySeen = true;
      }
      if (phase === "tool_active") {
        toolActivitySeen = true;
        modelActivitySeen = true;
      }
      if (phase === "finishing" || phase === "terminal") {
        finishSeen = true;
      }
      launchStages.push({
        stage,
        phase,
        elapsedMs: numberValueFromRecord(extra, "elapsedMs"),
        executorElapsedMs: numberValueFromRecord(extra, "executorElapsedMs"),
        executionClass: stringValueFromRecord(extra, "executionClass"),
        schedulerClass: stringValueFromRecord(extra, "schedulerClass"),
        schedulingMode: stringValueFromRecord(extra, "schedulingMode"),
        sessionLane: stringValueFromRecord(extra, "sessionLane"),
        globalLane: stringValueFromRecord(extra, "globalLane"),
        eventTime: event.eventTime.toISOString(),
      });
    }
    if (event.eventType === "execution.agent.launch") {
      agentLaunchSeen = true;
      latestPhase = "agent_bootstrap";
    }
    if (event.eventType === "execution.provider.request") {
      providerRequestSeen = true;
      modelActivitySeen = true;
      latestPhase = "provider_request";
    }
    if (event.eventType.includes(".tool.") || event.eventType === "execution.tool.recorded") {
      toolActivitySeen = true;
      modelActivitySeen = true;
      latestPhase = "tool_active";
    }
    if (event.eventType === "execution.mutation.recorded") {
      mutationSeen = true;
      modelActivitySeen = true;
      latestPhase = "tool_active";
    }
    if (event.eventType === "execution.validation.recorded") {
      validationSeen = true;
      modelActivitySeen = true;
      latestPhase = "tool_active";
    }
    if (event.eventType === "execution.finish.recorded" || event.eventType.includes("finish")) {
      finishSeen = true;
      modelActivitySeen = true;
      latestPhase = "finishing";
    }
  }
  const nowMs = Date.now();
  const latestMeaningfulEventAgeMs = latestMeaningfulEvent
    ? Math.max(0, nowMs - latestMeaningfulEvent.eventTime.getTime())
    : null;
  const compactLatestErrorEvent = latestErrorEvent
    ? asRecord(compactNativeExecutionEvent(latestErrorEvent))
    : null;
  const jobError = asRecord(input.job?.error);
  let latestError: JsonValue = null;
  if (compactLatestErrorEvent) {
    latestError = {
      eventId: boundedStringValueFromRecord(compactLatestErrorEvent, "eventId", 200),
      eventType: boundedStringValueFromRecord(compactLatestErrorEvent, "eventType", 200),
      stage: boundedStringValueFromRecord(compactLatestErrorEvent, "stage", 160),
      currentPhase: boundedStringValueFromRecord(compactLatestErrorEvent, "currentPhase", 160),
      errorCode: boundedStringValueFromRecord(compactLatestErrorEvent, "errorCode", 200),
      errorName: boundedStringValueFromRecord(compactLatestErrorEvent, "errorName", 200),
      errorMessage: boundedStringValueFromRecord(compactLatestErrorEvent, "errorMessage", 500),
    };
  } else if (jobError) {
    latestError = {
      errorCode: boundedStringValueFromRecord(jobError, "code", 200),
      errorMessage: boundedStringValueFromRecord(jobError, "message", 500),
    };
  }
  return {
    runtimeJobId: input.job?.jobId ?? null,
    runtimeJobState: input.job?.state ?? null,
    runtimeGenerationId: boundedStringValueFromRecord(payload, "runtimeGenerationId", 240),
    agentId: boundedStringValueFromRecord(payload, "agentId", 160),
    envelope: boundedStringValueFromRecord(payload, "envelope", 80),
    policyRef: boundedStringValueFromRecord(payload, "policyRef", 200),
    configSnapshotId: boundedStringValueFromRecord(runMetadata, "configSnapshotId", 300),
    catalogSnapshotId: boundedStringValueFromRecord(runMetadata, "catalogSnapshotId", 300),
    resolvedAgentModelIdentity: compactModelProfile(modelProfile),
    requestParameterSummary: compactModelRequestParameters(modelProfile),
    promptProfileHash: boundedStringValueFromRecord(runMetadata, "promptProfileHash", 120),
    toolPolicyHash: boundedStringValueFromRecord(runMetadata, "toolPolicyHash", 120),
    currentPhase:
      input.job?.state && ["succeeded", "failed", "canceled", "timed_out"].includes(input.job.state)
        ? "terminal"
        : (latestPhase ?? latestLaunchPhase ?? "unknown"),
    latestLaunchPhase,
    modelActivitySeen,
    providerRequestSeen,
    providerPreparingSeen,
    agentLaunchSeen,
    toolActivitySeen,
    mutationSeen,
    validationSeen,
    finishSeen,
    eventCounts,
    launchStages: launchStages.slice(-40),
    diagnostics: {
      latestStageLabel: latestLaunchStage,
      latestMeaningfulEventType: latestMeaningfulEvent?.eventType ?? null,
      latestError,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    latestMeaningfulEvent: latestMeaningfulEvent
      ? compactNativeExecutionEvent(latestMeaningfulEvent)
      : null,
    latestMeaningfulEventAgeMs,
    latestEvents: input.events.slice(-20).map(compactNativeExecutionEvent),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export type NativeExecutionRpcAuth = {
  actorId: string;
  authenticated: boolean;
  role: "operator" | "admin" | "service";
  sessionId?: string | null;
  sourceRoute?: "ux" | "terminal" | "work_queue" | "agent_handoff" | "http" | "service" | null;
};

export type NativeExecutionSubmitRequest = {
  prompt: string;
  auth: NativeExecutionRpcAuth;
  workItemId?: string | null;
  approvalRefs?: IntentValidatorApprovalRef[];
  sourceRoute?: NativeExecutionRpcAuth["sourceRoute"];
  uiControl?: ProtocolPreGateControlPayload | null;
  sourcePromptRef?: Omit<FrontDoorSourcePromptRef, "promptHash" | "promptLength"> | null;
  intakeRouteContract?: unknown;
};

export type NativeExecutionStartSessionRequest = {
  request: StartExecutionSessionVisibleInput;
  auth: NativeExecutionRpcAuth;
  workItemId?: string | null;
  queueName?: string | null;
  agentProfile?: string | null;
  idempotencyKey?: string | null;
  idempotencyScope?: string | null;
};

export type NativeExecutionPreflightSessionResult = {
  artifactKind: "native_execution_preflight_session_result";
  accepted: boolean;
  status: "accepted" | "rejected";
  statusCode: number;
  runtimeGenerationId: string | null;
  providerRuntimeError: JsonValue;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionStartSessionResult = {
  artifactKind: "native_execution_start_session_result";
  accepted: boolean;
  status: "accepted" | "rejected";
  statusCode: number;
  runtimeJobId: string | null;
  sessionId: string | null;
  agentProfile: string | null;
  jobType: string | null;
  queueName: string | null;
  startStatus: string | null;
  eventType: string | null;
  launch: NativeExecutionStartSessionLaunchStatus;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionStartSessionLaunchStatus = {
  status: "not_configured" | "scheduled";
  workerId: string | null;
  queueName: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionStartSessionLaunchInput = {
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  queueName: string;
  workerId: string;
};

export type NativeExecutionSubmitResult = {
  artifactKind: "native_execution_submit_result";
  accepted: boolean;
  status: "accepted" | "rejected";
  statusCode: number;
  runtimeJobId: string | null;
  sessionId: string | null;
  agentProfile: string | null;
  nativeExecutionLaunch: NativeExecutionStartSessionLaunchStatus | null;
  routeDecision: null;
  validation: null;
  compiledRequest: null;
  frontDoorRouterResult: StructuredModelIntentRouterResult | null;
  frontDoorEscalation: RouterEscalationDecision | null;
  frontDoorValidation: IntentValidationDecision | null;
  frontDoorClarification: ClarificationGateDecision | null;
  frontDoorCompiledRequest: FrontDoorCompileResult | null;
  frontDoorMultiIntentPlan: MultiIntentPlanCompileDecision | null;
  frontDoorMemoryPolicy: PromptRouterMemoryPolicyDecision | null;
  frontDoorSubmitDiagnostics: FrontDoorSubmitMemoryDiagnostic[] | null;
  frontDoorSubmitDiagnosticsManifest: GatewaySubmitDiagnosticsManifest | null;
  frontDoorSubmitDiagnosticsArtifactRef: string | null;
  workflowId: string | null;
  jobType: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type FrontDoorSubmitMemoryDiagnostic = GatewaySubmitDiagnosticsPhase;

export type NativeExecutionRpcDependencies = {
  runtimeJobs: RuntimeJobRepository;
  runtimeToolKernel?: RuntimeToolKernel;
  workQueue?: WorkQueueRepository;
  registry?: WorkflowRegistry;
  structuredRouterProvider?: StructuredModelIntentRouterProvider;
  routingTelemetryStore?: RoutingTelemetryStore;
  submitDiagnosticsSink?: GatewaySubmitDiagnosticsSink;
  nativeReadiness?: () => Promise<unknown>;
  preflightExecutionSession?: (input: StartNativeExecutionSessionInput) => Promise<unknown>;
  startExecutionSession?: (
    input: StartNativeExecutionSessionInput,
  ) => Promise<StartNativeExecutionSessionResult>;
  launchNativeExecutionSession?: (input: NativeExecutionStartSessionLaunchInput) => Promise<void>;
  queueName?: string;
};

function shortHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function hashPrompt(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function summarizePrompt(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 600);
}

type FrontDoorCompiledRuntimeRequest = Extract<
  FrontDoorCompileResult,
  { artifactKind: "front_door_compiled_runtime_job_request" }
>;

function sourcePromptRefUri(
  sourcePromptRef: FrontDoorCompiledRuntimeRequest["sourcePromptRef"],
): string | null {
  if (!sourcePromptRef) {
    return null;
  }
  if (sourcePromptRef.refKind === "gateway_chat_transcript") {
    const session = sourcePromptRef.sessionId ?? sourcePromptRef.sessionKey ?? "unknown-session";
    const run = sourcePromptRef.runId ?? "unknown-run";
    return `gateway-chat-transcript://${session}/${run}`;
  }
  return `native-submit://${sourcePromptRef.promptHash.slice(0, 32)}`;
}

function buildNativeExecutionRefsFromFrontDoorCompiled(
  compiled: FrontDoorCompiledRuntimeRequest,
): NativeExecutionRef[] {
  const refs: NativeExecutionRef[] = [
    {
      ref: `runtime-job://${compiled.requestId}/execution/front-door/native-handoff`,
      type: "artifact",
      kind: "front_door_native_handoff",
      source: "native_execution_submit",
    },
  ];
  const sourcePrompt = sourcePromptRefUri(compiled.sourcePromptRef);
  if (sourcePrompt) {
    refs.push({
      ref: sourcePrompt,
      type: "prompt",
      kind: compiled.sourcePromptRef?.refKind ?? "source_prompt",
      source: "front_door_submit",
    });
  }
  if (compiled.workQueueLink.workItemId) {
    refs.push({
      ref: `work-queue://${compiled.workQueueLink.workItemId}`,
      type: "work_queue_item",
      kind: "source_work_item",
      source: "front_door_submit",
    });
  }
  for (const target of compiled.targetSubjectRefs.slice(0, 20)) {
    refs.push({
      ref: target.targetRef,
      type: "target_subject",
      kind: target.targetKind,
      source: "front_door_router",
    });
  }
  for (const authorityRef of compiled.authorityRefs.slice(0, 10)) {
    refs.push({
      ref: authorityRef,
      type: "authority",
      kind: "authority_ref",
      source: "front_door_router",
    });
  }
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = JSON.stringify(ref);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildNativeFrontDoorHandoffArtifact(input: {
  compiled: FrontDoorCompiledRuntimeRequest;
  nativeRequest: StartExecutionSessionVisibleInput;
}): JsonValue {
  return {
    artifactKind: "execution.front_door.native_handoff",
    schemaVersion: "openclaw.front-door.native-handoff.v1",
    objective: input.nativeRequest.objective,
    refs: input.nativeRequest.refs as unknown as JsonValue,
    constraints: input.nativeRequest.constraints as unknown as JsonValue,
    validationSignal: input.nativeRequest.validationSignal ?? null,
    routingContext: {
      frontDoorWorkflowHint: input.compiled.workflowId,
      executorWorkflowHint: input.compiled.executorWorkflowId,
      subjectWorkflowHints: input.compiled.subjectWorkflowIds,
      requestedCapabilities: input.compiled.requestedCapabilities,
      targetSubjectRefs: input.compiled.targetSubjectRefs as unknown as JsonValue,
      authorityRefs: input.compiled.authorityRefs,
      approvalRefs: input.compiled.approvalRefs,
      sourcePromptRef: input.compiled.sourcePromptRef as unknown as JsonValue,
      promptHash: input.compiled.promptHash,
      promptLength: input.compiled.sourcePromptRef?.promptLength ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    actions: input.compiled.compiledActions.map((action) => ({
      action: action.action,
      objectSummary: action.objectSummary,
      source: action.source,
      confidence: action.confidence,
    })) as unknown as JsonValue,
    auditArtifactRefs: [
      `runtime-job://${input.compiled.requestId}/execution/front-door/router-result`,
      `runtime-job://${input.compiled.requestId}/execution/front-door/validation`,
      `runtime-job://${input.compiled.requestId}/execution/front-door/compiled-request`,
      `runtime-job://${input.compiled.requestId}/execution/front-door/memory-policy`,
    ],
    notes: [
      "This is the model-facing native execution handoff.",
      "Front-door workflow fields are routing hints only, not a required legacy workflow runner.",
      "Use native session tools, child sessions, validation, and shared finish evidence closure.",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function buildNativeExecutionRequestFromFrontDoorCompiled(
  compiled: FrontDoorCompiledRuntimeRequest,
): StartExecutionSessionVisibleInput {
  const actionSummary = compiled.compiledActions
    .map((action) => `${action.action}: ${action.objectSummary}`)
    .slice(0, 12);
  const constraints = [
    `Front-door workflow hint: ${compiled.workflowId}. Treat this as routing context, not a required legacy workflow runner.`,
    "Execute through native OpenClaw session tools, native child sessions/handoffs, and shared finish evidence closure.",
    "Treat front-door compile/router artifacts as audit evidence, not as required model-facing workflow inputs.",
    ...compiled.constraints
      .map((constraint) => `${constraint.constraintKind}: ${constraint.objectSummary}`)
      .slice(0, 20),
  ];
  return {
    objective: [
      compiled.objectiveSummary,
      actionSummary.length > 0 ? `Requested actions: ${actionSummary.join("; ")}` : null,
    ]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .join("\n\n")
      .slice(0, 8_000),
    refs: buildNativeExecutionRefsFromFrontDoorCompiled(compiled),
    constraints,
    validationSignal:
      "Validation is required before finish. Use the native execution session's domain tools and linked front-door artifacts to choose focused validation.",
  };
}

function jsonBytes(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
}

function summarizeActionSeparationRouterOutput(result: StructuredModelIntentRouterResult): string {
  const output = result.output;
  return JSON.stringify({
    route: output?.route ?? null,
    workflowId: output?.workflowId ?? null,
    jobType: output?.jobType ?? null,
    responseMode: output?.responseMode ?? null,
    executeNow: output?.executeNow ?? null,
    objectiveSummary: output?.objectiveSummary?.slice(0, 400) ?? "",
    requestedActions:
      output?.requestedActions
        ?.map((action) => ({
          action: action.action,
          objectSummary: action.objectSummary.slice(0, 160),
          confidence: action.confidence,
        }))
        .slice(0, 12) ?? [],
    negatedActions:
      output?.negatedActions
        ?.map((action) => ({
          action: action.action,
          objectSummary: action.objectSummary.slice(0, 160),
          confidence: action.confidence,
        }))
        .slice(0, 12) ?? [],
    conditionalActions:
      output?.conditionalActions
        ?.map((action) => ({
          action: action.action,
          objectSummary: action.objectSummary.slice(0, 160),
          confidence: action.confidence,
        }))
        .slice(0, 12) ?? [],
    sideEffectClass: output?.sideEffectClass ?? null,
    riskClass: output?.riskClass ?? null,
    reasonCodes: output?.reasonCodes?.slice(0, 12) ?? [],
    routerReasonCodes: result.metadata.reasonCodes.slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
  });
}

function buildActionSeparationRepairRequest(input: {
  originalRequest: ReturnType<typeof buildStructuredModelIntentRouterRequest>;
  originalPrompt: string;
  currentResult: StructuredModelIntentRouterResult;
  actionSemantics: ReturnType<typeof enforceActionSemantics>;
}): ReturnType<typeof buildStructuredModelIntentRouterRequest> {
  const currentRouterSummary = summarizeActionSeparationRouterOutput(input.currentResult);
  const actionSemanticsSummary = JSON.stringify({
    outcome: input.actionSemantics.outcome,
    reasonCodes: input.actionSemantics.reasonCodes.slice(0, 20),
    blockedActions: input.actionSemantics.blockedActions
      .map((action) => action.action)
      .slice(0, 12),
    negatedActions: input.actionSemantics.negatedActions
      .map((action) => action.action)
      .slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const repairContext = buildConversationRoutingContext({
    ...input.originalRequest.conversationContext,
    recentContextSummary: [
      input.originalRequest.conversationContext.recentContextSummary,
      `Action separation router summary: ${currentRouterSummary}`,
      `Action semantics summary: ${actionSemanticsSummary}`,
    ]
      .filter(Boolean)
      .join(" "),
    reasonCodes: [
      ...input.originalRequest.conversationContext.reasonCodes,
      "action_separation_repair_attempted",
      "requested_negated_conditional_action_review",
    ],
  });
  return buildStructuredModelIntentRouterRequest({
    promptHash: input.originalRequest.promptHash,
    volatilePromptText: JSON.stringify({
      repairTask:
        "Re-emit CanonicalRouterOutput with requestedActions, negatedActions, conditionalActions, and constraints separated by role. requestedActions are only the actions needed for the primary outcome. If the user wants an action under one scope but forbids it under another scope, keep the wanted action in requestedActions and move the forbidden scope into constraints; do not leave the same action category in negatedActions unless the primary outcome itself is truly contradictory. negatedActions and conditionalActions are constraints on that outcome and must not duplicate primary work. If the primary outcome itself remains contradictory after separation, return clarification_required.",
      originalPrompt: input.originalPrompt,
      currentRouterOutput: JSON.parse(currentRouterSummary),
      actionSemantics: JSON.parse(actionSemanticsSummary),
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    promptSummary: input.originalRequest.promptSummary,
    conversationContext: repairContext,
    workflowCandidateSelection: {
      workflowRegistryVersion: input.originalRequest.workflowRegistryVersion,
      candidates: input.originalRequest.workflowSummaries,
      reasonCodes: ["action_separation_repair_reuses_workflow_candidates"],
      finalRouteDecisionMade: false,
      authorityGranted: false,
      runtimeJobCreated: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    authoritySnapshotRefs: input.originalRequest.authoritySnapshotRefs,
    authoritySnapshotVersion: input.originalRequest.authoritySnapshotVersion,
    routerModelPolicyRef: input.originalRequest.routerModelPolicyRef,
    routerConfigVersion: `${input.originalRequest.routerConfigVersion}:action-separation-repair`,
    sourceRoute: input.originalRequest.sourceRoute,
    requestId: `${input.originalRequest.requestId}:action-separation-repair`,
    sessionId: input.originalRequest.sessionId,
    intakeRouteContract: input.originalRequest.intakeRouteContract,
    reasonCodes: [
      ...input.originalRequest.reasonCodes,
      "action_separation_repair_attempted",
      "requested_and_negated_action_conflict",
    ],
    maxWorkflowCandidates: input.originalRequest.workflowSummaries.length,
  });
}

function actionSemanticsNeedsModelRepair(
  actionSemantics: ReturnType<typeof enforceActionSemantics>,
): boolean {
  return actionSemantics.reasonCodes.some((reason) => reason.includes("conflicts_with_negation"));
}

function collectAuthorityProfiles(registry: WorkflowRegistry): string[] {
  return [
    ...new Set(
      registry.workflows.flatMap((workflow) => [
        workflow.defaultAuthorityProfile,
        ...workflow.supportedAuthorityProfiles,
      ]),
    ),
  ].filter((profile) => profile.trim().length > 0);
}

function frontDoorTelemetryOutcome(input: {
  validation: IntentValidationDecision | null;
  clarification: ClarificationGateDecision | null;
  compiled: FrontDoorCompileResult | null;
}): RoutingTelemetryOutcome {
  if (input.clarification?.outcome === "clarification_required") {
    return "clarification_required";
  }
  if (input.validation?.outcome === "approval_required") {
    return "approval_required";
  }
  if (input.validation?.outcome === "blocked") {
    return "blocked";
  }
  if (input.validation?.outcome === "needs_review") {
    return "needs_review";
  }
  if (input.compiled?.artifactKind === "front_door_compiled_plan_only") {
    return "chat_status_plan_only";
  }
  if (!input.compiled && input.validation?.outcome === "accepted") {
    return "compile_failed";
  }
  return "accepted";
}

function buildFrontDoorRoutingTelemetryRecord(input: {
  routeDecisionId: string;
  promptHash: string;
  promptSummary: string;
  routed: StructuredModelIntentRouterResult;
  escalation: RouterEscalationDecision | null;
  validation: IntentValidationDecision | null;
  clarification: ClarificationGateDecision | null;
  actionSemantics: ReturnType<typeof enforceActionSemantics> | null;
  compiled: FrontDoorCompileResult | null;
  contextVersion: string;
  authoritySnapshotVersion: string | null;
  authSessionVersion: string;
  artifactRefs?: string[];
}): RoutingTelemetryRecord {
  return {
    artifactKind: "intent_front_door_routing_telemetry_record",
    routeDecisionId: input.routeDecisionId,
    promptHash: input.promptHash,
    promptSummary: input.promptSummary,
    route: input.routed.output?.route ?? null,
    workflowId: input.routed.output?.workflowId ?? null,
    jobType: input.routed.output?.jobType ?? null,
    responseMode: input.routed.output?.responseMode ?? null,
    executeNow: input.routed.output?.executeNow ?? null,
    confidence: input.routed.output?.confidence ?? null,
    modelCandidateRef: input.routed.metadata.modelCandidateId,
    routerConfigVersion: input.routed.routerConfigVersion,
    routerSchemaVersion: input.routed.schemaVersion,
    workflowRegistryVersion: input.routed.metadata.workflowRegistryVersion,
    authoritySnapshotVersion: input.authoritySnapshotVersion,
    authSessionVersion: input.authSessionVersion,
    conversationContextVersion: input.contextVersion,
    validatorOutcome: input.validation?.outcome ?? null,
    escalationOutcome: input.escalation?.outcome ?? null,
    clarificationOutcome: input.clarification?.outcome ?? null,
    actionSemanticsOutcome: input.actionSemantics?.outcome ?? null,
    compilerOutcome: input.compiled?.artifactKind ?? null,
    outcome: frontDoorTelemetryOutcome({
      validation: input.validation,
      clarification: input.clarification,
      compiled: input.compiled,
    }),
    correctionSignal: null,
    reasonCodes: [
      ...input.routed.metadata.reasonCodes,
      ...(input.escalation?.reasonCodes ?? []),
      ...(input.validation?.reasonCodes ?? []),
      ...(input.clarification?.reasonCodes ?? []),
      ...(input.actionSemantics?.reasonCodes ?? []),
    ].slice(0, 40),
    artifactRefs: input.artifactRefs ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function normalizeStructuredSourceRoute(
  route: NativeExecutionRpcAuth["sourceRoute"] | undefined,
): "ux" | "terminal" | "work_queue" | "agent_handoff" | "api" | "service" {
  return route === "http" || !route ? "api" : route;
}

function memoryRouteKindForCanonicalRoute(
  route: CanonicalIntentRoute | null,
): PromptRouterMemoryRouteKind {
  switch (route) {
    case "chat_response":
    case "plan_only":
      return "chat_send";
    case "status_response":
      return "status";
    case "workflow_execution":
    case "multi_workflow_plan":
    case "research_only":
      return "workflow_execution";
    case "work_queue_control":
      return "control";
    case "clarification_required":
      return "clarification";
    case "blocked":
    case "needs_review":
    default:
      return "advanced_intent_front_door";
  }
}

export class NativeExecutionRpcService {
  private readonly registry: WorkflowRegistry;
  private readonly structuredRouterProvider: StructuredModelIntentRouterProvider | null;

  constructor(private readonly dependencies: NativeExecutionRpcDependencies) {
    this.registry = dependencies.registry ?? DEFAULT_EXECUTION_WORKFLOW_REGISTRY;
    this.structuredRouterProvider = dependencies.structuredRouterProvider ?? null;
  }

  async preflightSession(
    request: NativeExecutionStartSessionRequest,
  ): Promise<NativeExecutionPreflightSessionResult> {
    if (!request.auth.authenticated) {
      return {
        artifactKind: "native_execution_preflight_session_result",
        accepted: false,
        status: "rejected",
        statusCode: 401,
        runtimeGenerationId: null,
        providerRuntimeError: null,
        reasonCodes: ["authenticated_operator_required"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const preflight = this.dependencies.preflightExecutionSession;
    if (!preflight) {
      return {
        artifactKind: "native_execution_preflight_session_result",
        accepted: false,
        status: "rejected",
        statusCode: 503,
        runtimeGenerationId: null,
        providerRuntimeError: null,
        reasonCodes: ["runtime_generation_acceptance_not_configured"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    try {
      const agentProfile = request.agentProfile?.trim() || undefined;
      const result = await preflight({
        runtimeJobs: this.dependencies.runtimeJobs,
        request: request.request,
        runtime: {
          queueName: request.queueName?.trim() || NATIVE_EXECUTION_SESSION_QUEUE,
          agentProfile,
          workItemId: request.workItemId?.trim() || null,
          idempotencyScope:
            request.idempotencyScope?.trim() ||
            `native-execution-rpc:${request.workItemId?.trim() || request.auth.sessionId || request.auth.actorId}`,
          idempotencyKey: request.idempotencyKey?.trim() || undefined,
        },
      });
      return compactNativeExecutionPreflightResult({
        value: result,
      });
    } catch (error) {
      return {
        artifactKind: "native_execution_preflight_session_result",
        accepted: false,
        status: "rejected",
        statusCode: 400,
        runtimeGenerationId: null,
        providerRuntimeError: null,
        reasonCodes: [
          "runtime_generation_acceptance_failed",
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
  }

  async nativeReady(auth: NativeExecutionRpcAuth): Promise<JsonValue> {
    if (!auth.authenticated) {
      return {
        artifactKind: "native_execution_readiness_result",
        accepted: false,
        status: "not_ready",
        statusCode: 401,
        reasonCodes: ["authenticated_operator_required"],
        nativeDoctorReadOnly: true,
        providerCatalogRefreshed: false,
        runtimeJobCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      };
    }
    if (!this.dependencies.nativeReadiness) {
      return {
        artifactKind: "native_execution_readiness_result",
        accepted: false,
        status: "not_ready",
        statusCode: 503,
        reasonCodes: ["native_execution_readiness_not_configured"],
        nativeDoctorReadOnly: true,
        providerCatalogRefreshed: false,
        runtimeJobCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      };
    }
    try {
      const result = await this.dependencies.nativeReadiness();
      return result as JsonValue;
    } catch (error) {
      return {
        artifactKind: "native_execution_readiness_result",
        accepted: false,
        status: "not_ready",
        statusCode: 400,
        reasonCodes: [
          "native_execution_readiness_failed",
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        ],
        nativeDoctorReadOnly: true,
        providerCatalogRefreshed: false,
        runtimeJobCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        secretsStored: false,
      };
    }
  }

  private async recordRouterFrontDoorToolProtocol(input: {
    requestId: string;
    promptHash: string;
    promptSummary: string;
    output: NonNullable<StructuredModelIntentRouterResult["output"]>;
    validation: IntentValidationDecision;
    routed: StructuredModelIntentRouterResult;
  }): Promise<RouterFrontDoorToolProtocolResult> {
    const kernel = this.dependencies.runtimeToolKernel;
    if (!kernel) {
      return buildRouterFrontDoorToolProtocolResult({
        requestId: input.requestId,
        promptHash: input.promptHash,
        routerOutput: input.output,
        validation: input.validation,
        toolInvocations: [],
      });
    }
    const toolInvocations = [];
    for (const toolId of ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS) {
      toolInvocations.push(
        await invokeRouterFrontDoorRuntimeTool({
          kernel,
          toolId,
          requestId: input.requestId,
          modelRef: input.routed.metadata.modelCandidateId ?? null,
          providerRef: input.routed.metadata.providerRef ?? null,
          idempotencyKey: `${input.promptHash}:${toolId}`,
          inputHash: input.promptHash,
          inputSummary: `${toolId}: ${input.promptSummary}`,
          metadata: {
            route: input.output.route,
            executorWorkflowId: input.output.executorWorkflowId ?? input.output.workflowId,
            subjectWorkflowIds: input.output.subjectWorkflowIds,
            requestedCapabilities: input.output.requestedCapabilities,
            constraintKinds: input.output.constraints.map(
              (constraint) => constraint.constraintKind,
            ),
            validationOutcome: input.validation.outcome,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        }),
      );
    }
    return buildRouterFrontDoorToolProtocolResult({
      requestId: input.requestId,
      promptHash: input.promptHash,
      routerOutput: input.output,
      validation: input.validation,
      toolInvocations,
    });
  }

  async startSession(
    request: NativeExecutionStartSessionRequest,
  ): Promise<NativeExecutionStartSessionResult> {
    if (!request.auth.authenticated) {
      return this.startSessionResult({
        statusCode: 401,
        reasonCodes: ["authenticated_operator_required"],
      });
    }
    try {
      const startExecutionSession = this.dependencies.startExecutionSession;
      if (!startExecutionSession) {
        return this.startSessionResult({
          statusCode: 503,
          reasonCodes: ["native_execution_start_session_not_configured"],
        });
      }
      const result = await startExecutionSession({
        runtimeJobs: this.dependencies.runtimeJobs,
        request: request.request,
        runtime: {
          queueName: request.queueName?.trim() || NATIVE_EXECUTION_SESSION_QUEUE,
          agentProfile: request.agentProfile?.trim() || undefined,
          workItemId: request.workItemId?.trim() || null,
          idempotencyScope:
            request.idempotencyScope?.trim() ||
            `native-execution-rpc:${request.workItemId?.trim() || request.auth.sessionId || request.auth.actorId}`,
          idempotencyKey: request.idempotencyKey?.trim() || undefined,
        },
      });
      if (this.dependencies.workQueue && request.workItemId?.trim()) {
        await this.dependencies.workQueue.createWorkRun({
          workItemId: request.workItemId.trim(),
          executorKind: "runtime_job",
          runtimeJobId: result.runtimeJobId,
          runState: "running",
          metadata: {
            jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
            nativeExecutionSession: true,
            agentProfile: result.agentProfile,
            sessionId: result.sessionId,
            sourceRoute: request.auth.sourceRoute ?? null,
            workQueueLifecycleMutated: false,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const launch = await this.scheduleNativeExecutionSessionLaunch({
        runtimeJobId: result.runtimeJobId,
        sessionId: result.sessionId,
        agentProfile: result.agentProfile,
        queueName:
          result.runtimeJob.queueName ??
          request.queueName?.trim() ??
          NATIVE_EXECUTION_SESSION_QUEUE,
        workerId: `native-execution-rpc:${request.auth.actorId}`.slice(0, 120),
      });
      return this.startSessionResult({
        accepted: true,
        statusCode: 202,
        runtimeJobId: result.runtimeJobId,
        sessionId: result.sessionId,
        agentProfile: result.agentProfile,
        jobType: result.runtimeJob.jobType,
        queueName: result.runtimeJob.queueName,
        startStatus: result.status,
        eventType: result.event.eventType,
        launch,
        reasonCodes: [`native_execution_session_${result.status}`, ...launch.reasonCodes],
      });
    } catch (error) {
      return this.startSessionResult({
        statusCode: 400,
        reasonCodes: [
          "native_execution_start_session_failed",
          error instanceof Error ? error.message : String(error),
        ],
      });
    }
  }

  private async scheduleNativeExecutionSessionLaunch(
    input: NativeExecutionStartSessionLaunchInput,
  ): Promise<NativeExecutionStartSessionLaunchStatus> {
    const launch = this.dependencies.launchNativeExecutionSession;
    if (!launch) {
      return {
        status: "not_configured",
        workerId: null,
        queueName: input.queueName,
        reasonCodes: ["native_execution_session_launch_not_configured"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    await this.dependencies.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "execution.launch.timing",
      workerId: input.workerId,
      data: {
        schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
        runtimeJobId: input.runtimeJobId,
        sessionId: input.sessionId,
        eventKind: "launch_timing_recorded",
        extra: {
          sourceEventType: "native_execution_launch_timing",
          stage: "runtime_worker_dispatch_scheduled",
          elapsedMs: 0,
          executionClass: "native_runtime_job",
          schedulerClass: "runtime_worker_supervisor",
          agentId: input.agentProfile,
          workerId: input.workerId,
          queueName: input.queueName,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      },
    });
    void launch(input).catch((error) => {
      void this.dependencies.runtimeJobs.recordEvent({
        jobId: input.runtimeJobId,
        eventType: "execution.launch.timing",
        workerId: input.workerId,
        data: {
          schemaVersion: "openclaw.runtime-execution-event-envelope.v1",
          runtimeJobId: input.runtimeJobId,
          sessionId: input.sessionId,
          eventKind: "launch_timing_recorded",
          extra: {
            sourceEventType: "native_execution_launch_timing",
            stage: "runtime_worker_dispatch_failed",
            elapsedMs: 0,
            executionClass: "native_runtime_job",
            schedulerClass: "runtime_worker_supervisor",
            agentId: input.agentProfile,
            workerId: input.workerId,
            queueName: input.queueName,
            errorName: error instanceof Error ? error.name : "Error",
            errorMessage:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutationAllowed: false,
          },
        },
      });
    });
    return {
      status: "scheduled",
      workerId: input.workerId,
      queueName: input.queueName,
      reasonCodes: ["native_execution_session_launch_scheduled"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async submit(request: NativeExecutionSubmitRequest): Promise<NativeExecutionSubmitResult> {
    const submitStartedAt = Date.now();
    const promptHash = hashPrompt(request.prompt);
    const promptSummary = summarizePrompt(request.prompt);
    const submitId = `native-submit-${shortHash(
      `${promptHash}:${request.workItemId ?? request.auth.sessionId ?? request.auth.actorId}`,
    )}`;
    const submitDiagnostics = new GatewaySubmitDiagnosticsCollector(
      {
        submitId,
        promptHash,
        promptLength: request.prompt.length,
        promptByteLength: Buffer.byteLength(request.prompt, "utf8"),
        promptSummary,
        startedAt: submitStartedAt,
      },
      this.dependencies.submitDiagnosticsSink ?? null,
    );
    await submitDiagnostics.record("submit_started", {
      reasonCodes: ["front_door_submit_started"],
    });
    const preGate = runProtocolPreGate({
      text: request.prompt,
      sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? "api",
      auth: {
        authenticated: request.auth.authenticated,
        actorId: request.auth.actorId,
        sessionId: request.auth.sessionId,
      },
      requireAuthentication: true,
      uiControl: request.uiControl,
      sessionId: request.auth.sessionId,
      contentMetadata: {
        hasText: request.prompt.trim().length > 0,
        inputByteLength: Buffer.byteLength(request.prompt, "utf8"),
      },
    });
    await submitDiagnostics.record("protocol_pregate_completed", {
      reasonCodes: preGate.reasonCodes,
    });
    if (preGate.kind === "reject") {
      const diagnostics = await submitDiagnostics.finalize({
        status: "rejected",
        reasonCodes: preGate.reasonCodes,
      });
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: promptSummary,
          contextBudgetRemainingTokens: 0,
        }),
        frontDoorSubmitDiagnostics: diagnostics.body.phases,
        frontDoorSubmitDiagnosticsManifest: diagnostics.manifest,
        frontDoorSubmitDiagnosticsArtifactRef: diagnostics.manifest.manifestArtifactRef,
        reasonCodes: preGate.reasonCodes,
        statusCode: preGate.statusCode,
      });
    }
    if (preGate.kind === "protocol_command") {
      const reasonCodes = [
        "protocol_command_bypassed_execution_submit",
        `protocol_command_${preGate.command}`,
        ...preGate.reasonCodes,
      ];
      const diagnostics = await submitDiagnostics.finalize({
        status: "rejected",
        reasonCodes,
      });
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: promptSummary,
          contextBudgetRemainingTokens: 0,
        }),
        frontDoorSubmitDiagnostics: diagnostics.body.phases,
        frontDoorSubmitDiagnosticsManifest: diagnostics.manifest,
        frontDoorSubmitDiagnosticsArtifactRef: diagnostics.manifest.manifestArtifactRef,
        reasonCodes,
      });
    }
    if (preGate.kind === "ui_control") {
      const reasonCodes = [
        "ui_control_bypassed_execution_submit",
        `ui_control_${preGate.control}`,
        ...preGate.reasonCodes,
      ];
      const diagnostics = await submitDiagnostics.finalize({
        status: "rejected",
        reasonCodes,
      });
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: promptSummary,
          contextBudgetRemainingTokens: 0,
        }),
        frontDoorSubmitDiagnostics: diagnostics.body.phases,
        frontDoorSubmitDiagnosticsManifest: diagnostics.manifest,
        frontDoorSubmitDiagnosticsArtifactRef: diagnostics.manifest.manifestArtifactRef,
        reasonCodes,
      });
    }
    if (this.structuredRouterProvider) {
      return this.submitViaFrontDoor(request, submitDiagnostics);
    }
    const reasonCodes = [
      "structured_model_intent_router_provider_not_configured",
      "front_door_required_for_free_form_execution_submit",
      "legacy_semantic_intent_router_retired",
    ];
    const diagnostics = await submitDiagnostics.finalize({
      status: "rejected",
      reasonCodes,
    });
    return this.submitResult({
      statusCode: 503,
      frontDoorSubmitDiagnostics: diagnostics.body.phases,
      frontDoorSubmitDiagnosticsManifest: diagnostics.manifest,
      frontDoorSubmitDiagnosticsArtifactRef: diagnostics.manifest.manifestArtifactRef,
      reasonCodes,
    });
  }

  private async submitViaFrontDoor(
    request: NativeExecutionSubmitRequest,
    submitDiagnostics: GatewaySubmitDiagnosticsCollector,
  ): Promise<NativeExecutionSubmitResult> {
    const promptHash = submitDiagnostics.promptHash;
    const promptSummary = submitDiagnostics.promptSummary;
    const intakeRouteContract = normalizeIntakeRouteContract(request.intakeRouteContract);
    const recordSubmitDiagnostic = async (
      phase: string,
      extra: Partial<
        Pick<
          FrontDoorSubmitMemoryDiagnostic,
          | "workflowSummaryCount"
          | "workflowSummaryBytes"
          | "conversationContextBytes"
          | "routerPayloadBytes"
          | "candidateCount"
          | "selectedModelRef"
          | "providerRef"
          | "reasonCodes"
        >
      > = {},
    ) => {
      await submitDiagnostics.record(phase, {
        workflowSummaryCount: extra.workflowSummaryCount ?? null,
        workflowSummaryBytes: extra.workflowSummaryBytes ?? null,
        conversationContextBytes: extra.conversationContextBytes ?? null,
        routerPayloadBytes: extra.routerPayloadBytes ?? null,
        candidateCount: extra.candidateCount ?? null,
        selectedModelRef: extra.selectedModelRef ?? null,
        providerRef: extra.providerRef ?? null,
        reasonCodes: extra.reasonCodes ?? [],
      });
    };
    const submitResultWithDiagnostics = async (
      input: Partial<NativeExecutionSubmitResult> = {},
    ): Promise<NativeExecutionSubmitResult> => {
      await submitDiagnostics.record("submit_result_returned", {
        reasonCodes: input.reasonCodes ?? [],
      });
      const diagnostics = await submitDiagnostics.finalize({
        status: input.accepted ? "accepted" : "rejected",
        runtimeJobId: input.runtimeJobId ?? null,
        reasonCodes: input.reasonCodes ?? [],
      });
      return this.submitResult({
        ...input,
        frontDoorSubmitDiagnostics: diagnostics.body.phases,
        frontDoorSubmitDiagnosticsManifest: diagnostics.manifest,
        frontDoorSubmitDiagnosticsArtifactRef: diagnostics.manifest.manifestArtifactRef,
      });
    };
    const sourcePromptRef =
      request.sourcePromptRef ??
      ({
        refKind: "native_submit",
        sessionKey: request.auth.sessionId ?? null,
        sessionId: request.auth.sessionId ?? null,
        runId: null,
        sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
        rawPromptStored: false,
      } satisfies Omit<FrontDoorSourcePromptRef, "promptHash" | "promptLength">);
    const workflowSummaryIndex = buildWorkflowSummaryIndex(this.registry);
    await recordSubmitDiagnostic("workflow_summary_index_built", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      reasonCodes: ["workflow_summary_index_built"],
    });
    const context = buildConversationRoutingContext({
      actorId: request.auth.actorId,
      sessionId: request.auth.sessionId ?? request.auth.actorId,
      sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? "api",
      recentContextSummary: promptSummary,
      workflowRegistryVersion: workflowSummaryIndex.workflowRegistryVersion,
      authoritySnapshots: [
        {
          snapshotId: "native-submit-front-door-authority-snapshot",
          version: `authority:${workflowSummaryIndex.workflowRegistryVersion}`,
          authorityStateRefs: collectAuthorityProfiles(this.registry).map(
            (profile) => `authority://${profile}`,
          ),
          createdAt: new Date().toISOString(),
        },
      ],
      reasonCodes: ["native_submit_front_door_context_built"],
    });
    await recordSubmitDiagnostic("conversation_context_built", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      reasonCodes: ["conversation_context_built"],
    });
    const fastPath = runCheapDeterministicFastPath({
      conversationContext: context,
      promptSummary,
    });
    if (fastPath.finalRouteDecisionMade) {
      return submitResultWithDiagnostics({
        statusCode: 200,
        reasonCodes: fastPath.reasonCodes,
      });
    }

    const candidates = selectWorkflowSummaryCandidates({
      index: workflowSummaryIndex,
      context,
      maxCandidates: 8,
    });
    await recordSubmitDiagnostic("workflow_candidates_selected", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      candidateCount: candidates.candidates.length,
      reasonCodes: ["workflow_candidates_selected"],
    });
    const router = new StructuredModelIntentRouter(this.structuredRouterProvider!);
    const requestId = `native-exec-${shortHash(`${promptHash}:${request.workItemId ?? request.auth.sessionId ?? request.auth.actorId}`)}`;
    const authoritySnapshotVersion = context.authoritySnapshots[0]?.version ?? null;
    const contextVersion = `context:${shortHash(
      `${context.sessionId}:${workflowSummaryIndex.workflowRegistryVersion}:${authoritySnapshotVersion ?? "none"}`,
    )}`;
    const authSessionVersion = `auth:${shortHash(
      `${request.auth.actorId}:${request.auth.sessionId ?? "none"}:${request.auth.role}`,
    )}`;
    const routerRequest = buildStructuredModelIntentRouterRequest({
      promptHash,
      volatilePromptText: request.prompt,
      promptSummary,
      conversationContext: context,
      workflowSummaryIndex,
      workflowCandidateSelection: candidates,
      routerModelPolicyRef: "router-model-policy://intent-front-door/default",
      sourceRoute: normalizeStructuredSourceRoute(request.sourceRoute ?? request.auth.sourceRoute),
      requestId,
      sessionId: request.auth.sessionId ?? request.auth.actorId,
      intakeRouteContract,
      reasonCodes: ["native_submit_front_door_router_request"],
    });
    await recordSubmitDiagnostic("before_router_model_call", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      reasonCodes: ["before_router_model_call"],
    });
    let routed = await router.route(routerRequest);
    await recordSubmitDiagnostic("after_router_model_call", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: routed.metadata.reasonCodes,
    });
    const invalidRouteMemoryPolicy = decidePromptRouterMemoryPolicy({
      routeKind: "advanced_intent_front_door",
      promptHash,
      boundedPromptSummary: promptSummary,
      contextBudgetRemainingTokens: 6_000,
      runtimeStatePresent: false,
    });
    if (!routed.valid || !routed.output) {
      await this.recordFrontDoorRoutingTelemetry({
        record: buildFrontDoorRoutingTelemetryRecord({
          routeDecisionId: `${requestId}:routing`,
          promptHash,
          promptSummary,
          routed,
          escalation: null,
          validation: null,
          clarification: null,
          actionSemantics: null,
          compiled: null,
          contextVersion,
          authoritySnapshotVersion,
          authSessionVersion,
        }),
      });
      return submitResultWithDiagnostics({
        statusCode: 400,
        frontDoorRouterResult: routed,
        frontDoorMemoryPolicy: invalidRouteMemoryPolicy,
        reasonCodes: routed.metadata.reasonCodes,
      });
    }
    const authorityProfiles = collectAuthorityProfiles(this.registry);
    const computeFrontDoorStages = (currentRouted: StructuredModelIntentRouterResult) => {
      const currentOutput = currentRouted.output!;
      const currentMemoryPolicy = decidePromptRouterMemoryPolicy({
        routeKind: memoryRouteKindForCanonicalRoute(currentOutput.route),
        promptHash,
        boundedPromptSummary: promptSummary,
        contextBudgetRemainingTokens: 8_000,
        runtimeStatePresent:
          currentOutput.route !== "chat_response" && currentOutput.route !== "plan_only",
        activeWorkflowRuntimeJobId: currentOutput.route === "workflow_execution" ? requestId : null,
      });
      const currentEscalation = evaluateRouterEscalationPolicy({
        routerOutput: currentOutput,
        schemaValid: currentRouted.valid,
        providerState:
          currentRouted.metadata.degradationState === "rate_limited" ? "rate_limited" : "available",
        authoritySnapshotFresh: true,
        workflowRegistryVersionMatches: true,
      });
      const currentValidation = validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(currentOutput),
        conversationContext: context,
        workflowSummaryIndex,
        auth: {
          authenticated: request.auth.authenticated,
          actorId: request.auth.actorId,
          sessionId: request.auth.sessionId ?? request.auth.actorId,
        },
        authority: {
          snapshotFresh: true,
          supportedAuthorityProfiles: authorityProfiles,
          defaultEnabledAuthorityProfiles: authorityProfiles,
          approvalRefs: request.approvalRefs?.map((approval) => approval.approvalId),
        },
        approvalRefs: request.approvalRefs?.map((approval) => approval.approvalId),
        escalationDecision: currentEscalation,
        strongerRouterResultPresent: true,
        intakeRouteContract,
      });
      const currentActionSemantics = enforceActionSemantics({
        mentionedActions: currentOutput.mentionedActions,
        requestedActions: currentOutput.requestedActions,
        negatedActions: currentOutput.negatedActions,
        conditionalActions: currentOutput.conditionalActions,
        routerReasonCodes: currentOutput.reasonCodes,
      });
      const currentClarification = runClarificationGate({
        routerOutput: currentOutput,
        validation: currentValidation,
        escalationDecision: currentEscalation,
        conversationContext: context,
        actionSemantics: currentActionSemantics,
        requestId,
        sessionId: request.auth.sessionId ?? request.auth.actorId,
        actorId: request.auth.actorId,
        promptHash,
        promptSummary,
      });
      return {
        output: currentOutput,
        frontDoorMemoryPolicy: currentMemoryPolicy,
        escalation: currentEscalation,
        validation: currentValidation,
        actionSemantics: currentActionSemantics,
        clarification: currentClarification,
      };
    };
    let stages = computeFrontDoorStages(routed);
    if (actionSemanticsNeedsModelRepair(stages.actionSemantics)) {
      const repairRequest = buildActionSeparationRepairRequest({
        originalRequest: routerRequest,
        originalPrompt: request.prompt,
        currentResult: routed,
        actionSemantics: stages.actionSemantics,
      });
      await recordSubmitDiagnostic("before_action_semantics_repair_model_call", {
        workflowSummaryCount: workflowSummaryIndex.summaries.length,
        workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
        conversationContextBytes: jsonBytes(context),
        routerPayloadBytes: jsonBytes(repairRequest),
        candidateCount: candidates.candidates.length,
        selectedModelRef: routed.metadata.modelCandidateId,
        providerRef: routed.metadata.providerRef ?? null,
        reasonCodes: ["before_action_semantics_repair_model_call"],
      });
      const repaired = await router.route(repairRequest);
      await recordSubmitDiagnostic("after_action_semantics_repair_model_call", {
        workflowSummaryCount: workflowSummaryIndex.summaries.length,
        workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
        conversationContextBytes: jsonBytes(context),
        routerPayloadBytes: jsonBytes(repairRequest),
        candidateCount: candidates.candidates.length,
        selectedModelRef: repaired.metadata.modelCandidateId,
        providerRef: repaired.metadata.providerRef ?? null,
        reasonCodes: repaired.metadata.reasonCodes,
      });
      if (repaired.valid && repaired.output) {
        routed = repaired;
        stages = computeFrontDoorStages(routed);
      }
    }
    const {
      output,
      frontDoorMemoryPolicy,
      escalation,
      validation,
      actionSemantics,
      clarification,
    } = stages;
    if (clarification.outcome === "clarification_required") {
      await this.recordFrontDoorRoutingTelemetry({
        record: buildFrontDoorRoutingTelemetryRecord({
          routeDecisionId: `${requestId}:routing`,
          promptHash,
          promptSummary,
          routed,
          escalation,
          validation,
          clarification,
          actionSemantics,
          compiled: null,
          contextVersion,
          authoritySnapshotVersion,
          authSessionVersion,
        }),
      });
      return submitResultWithDiagnostics({
        statusCode: 200,
        workflowId: output.workflowId,
        jobType: output.jobType,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorMemoryPolicy,
        reasonCodes: clarification.reasonCodes,
      });
    }
    if (
      output.route === "work_queue_control" ||
      validation.outcome === "approval_required" ||
      validation.outcome === "blocked" ||
      validation.outcome === "needs_review" ||
      actionSemantics.outcome === "blocked" ||
      actionSemantics.outcome === "needs_review"
    ) {
      await this.recordFrontDoorRoutingTelemetry({
        record: buildFrontDoorRoutingTelemetryRecord({
          routeDecisionId: `${requestId}:routing`,
          promptHash,
          promptSummary,
          routed,
          escalation,
          validation,
          clarification,
          actionSemantics,
          compiled: null,
          contextVersion,
          authoritySnapshotVersion,
          authSessionVersion,
        }),
      });
      return submitResultWithDiagnostics({
        statusCode: output.route === "work_queue_control" ? 202 : 400,
        workflowId: output.executorWorkflowId ?? output.workflowId,
        jobType: output.jobType,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorMemoryPolicy,
        reasonCodes: [
          ...validation.reasonCodes,
          ...actionSemantics.reasonCodes,
          ...(output.route === "work_queue_control"
            ? ["work_queue_control_requires_execution_apply_control"]
            : []),
        ],
      });
    }

    const executorWorkflowId = output.executorWorkflowId ?? output.workflowId;
    const workflow = executorWorkflowId
      ? getWorkflowContract(this.registry, executorWorkflowId)
      : null;
    const routerToolProtocol = await this.recordRouterFrontDoorToolProtocol({
      requestId,
      promptHash,
      promptSummary,
      output,
      validation,
      routed,
    });
    if (actionSemantics.blockedActions.length > 0) {
      await this.recordFrontDoorRoutingTelemetry({
        record: buildFrontDoorRoutingTelemetryRecord({
          routeDecisionId: `${requestId}:routing`,
          promptHash,
          promptSummary,
          routed,
          escalation,
          validation,
          clarification,
          actionSemantics,
          compiled: null,
          contextVersion,
          authoritySnapshotVersion,
          authSessionVersion,
        }),
      });
      return submitResultWithDiagnostics({
        statusCode: 400,
        workflowId: output.executorWorkflowId ?? output.workflowId,
        jobType: output.jobType,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorMemoryPolicy,
        reasonCodes: [...validation.reasonCodes, ...actionSemantics.reasonCodes],
      });
    }
    const compiled = compileFrontDoorRequest({
      requestId,
      routerOutput: output,
      validation,
      actionSemantics,
      workflow,
      operator: {
        actorId: request.auth.actorId,
        sessionId: request.auth.sessionId ?? request.auth.actorId,
      },
      promptHash,
      promptSummary,
      sourcePromptRef,
      promptLength: request.prompt.length,
      authorityRefs: authorityProfiles.map((profile) => `authority://${profile}`),
      approvalRefs: request.approvalRefs?.map((approval) => approval.approvalId),
      workItemId: request.workItemId,
      queueName: this.dependencies.queueName,
      idempotencyKey: requestId,
      routerToolProtocol,
    });
    await recordSubmitDiagnostic("front_door_request_compiled", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: [`front_door_request_compiled:${compiled.artifactKind}`],
    });
    if (compiled.artifactKind === "front_door_compiled_plan_only") {
      await this.recordFrontDoorRoutingTelemetry({
        record: buildFrontDoorRoutingTelemetryRecord({
          routeDecisionId: `${requestId}:routing`,
          promptHash,
          promptSummary,
          routed,
          escalation,
          validation,
          clarification,
          actionSemantics,
          compiled,
          contextVersion,
          authoritySnapshotVersion,
          authSessionVersion,
        }),
      });
      return submitResultWithDiagnostics({
        statusCode: 200,
        workflowId: output.workflowId,
        jobType: output.jobType,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorCompiledRequest: compiled,
        frontDoorMemoryPolicy,
        reasonCodes: [
          ...compiled.compiledActions.map((action) => `compiled_action:${action.action}`),
          "front_door_non_runtime_route_compiled",
        ],
      });
    }

    const multiIntentPlan =
      output.route === "multi_workflow_plan"
        ? compileMultiIntentPlan({
            routerOutput: output,
            validation,
            workflowContracts: this.registry.workflows,
            authorityProofRefsByStep: Object.fromEntries(
              output.multiIntentPlan
                .filter((step) => step.authorityProfile)
                .map((step) => [step.order, [`authority://${step.authorityProfile}`]]),
            ),
          })
        : null;
    const childHandoffs =
      workflow && output.childWorkflowRequests.length > 0
        ? output.childWorkflowRequests.map((child) =>
            compileChildWorkflowHandoff({
              registry: this.registry,
              parentWorkflow: workflow,
              request: child,
              parentRuntimeJobId: requestId,
              parentAuthorityProfile: workflow.defaultAuthorityProfile,
            }),
          )
        : [];

    await recordSubmitDiagnostic("native_execution_dispatch_checked", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: ["native_execution_session_dispatch_supersedes_legacy_worker_readiness"],
    });
    await recordSubmitDiagnostic("before_native_execution_session_start", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: ["before_native_execution_session_start"],
    });
    const nativeRequest = buildNativeExecutionRequestFromFrontDoorCompiled(compiled);
    const startExecutionSession = this.dependencies.startExecutionSession;
    if (!startExecutionSession) {
      return submitResultWithDiagnostics({
        statusCode: 503,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorCompiledRequest: compiled,
        frontDoorMemoryPolicy,
        workflowId: compiled.workflowId,
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        reasonCodes: ["native_execution_start_session_not_configured"],
      });
    }
    const started = await startExecutionSession({
      runtimeJobs: this.dependencies.runtimeJobs,
      request: nativeRequest,
      runtime: {
        jobId: requestId,
        queueName: this.dependencies.queueName ?? NATIVE_EXECUTION_SESSION_QUEUE,
        workItemId: request.workItemId ?? null,
        idempotencyScope: `native-front-door:${compiled.workflowId}`,
        idempotencyKey: requestId,
        agentProfile: "execution-orchestrator",
      },
    });
    const job = started.runtimeJob;
    const launch = await this.scheduleNativeExecutionSessionLaunch({
      runtimeJobId: started.runtimeJobId,
      sessionId: started.sessionId,
      agentProfile: started.agentProfile,
      queueName: job.queueName ?? this.dependencies.queueName ?? NATIVE_EXECUTION_SESSION_QUEUE,
      workerId: `native-execution-submit:${request.auth.actorId}`.slice(0, 120),
    });
    await recordSubmitDiagnostic("after_native_execution_session_start", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: [
        "after_native_execution_session_start",
        `native_execution_session_${started.status}`,
        ...launch.reasonCodes,
      ],
    });
    if (this.dependencies.workQueue && request.workItemId?.trim()) {
      const existingTruth = await this.dependencies.workQueue.readWorkItemTruth(request.workItemId);
      if (!existingTruth) {
        await this.dependencies.workQueue.createWorkItem({
          workItemId: request.workItemId,
          itemType: "execution_workflow",
          title: compiled.objectiveSummary,
          metadata: {
            workflowId: compiled.workflowId,
            executorWorkflowId: compiled.executorWorkflowId,
            subjectWorkflowIds: compiled.subjectWorkflowIds,
            targetSubjectRefs: compiled.targetSubjectRefs,
            requestedCapabilities: compiled.requestedCapabilities,
            jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
            frontDoorWorkflowHint: compiled.workflowId,
            route: output.route,
            promptHash: compiled.promptHash,
            sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          actorId: request.auth.actorId,
        });
      }
      await this.dependencies.workQueue.createWorkRun({
        workItemId: request.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: {
          workflowId: compiled.workflowId,
          executorWorkflowId: compiled.executorWorkflowId,
          subjectWorkflowIds: compiled.subjectWorkflowIds,
          targetSubjectRefs: compiled.targetSubjectRefs,
          requestedCapabilities: compiled.requestedCapabilities,
          jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
          frontDoorWorkflowHint: compiled.workflowId,
          nativeExecutionSession: true,
          sessionId: started.sessionId,
          agentProfile: started.agentProfile,
          frontDoorNativeExecutionSubmit: true,
          sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
          workQueueLifecycleMutated: false,
        },
      });
    }
    await recordSubmitDiagnostic("before_front_door_artifact_attachment", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: ["before_front_door_artifact_attachment"],
    });
    await this.attachFrontDoorArtifacts({
      runtimeJobId: job.jobId,
      routed,
      escalation,
      validation,
      actionSemantics,
      clarification,
      compiled,
      nativeHandoff: buildNativeFrontDoorHandoffArtifact({ compiled, nativeRequest }),
      multiIntentPlan,
      childHandoffs,
      memoryPolicy: frontDoorMemoryPolicy,
    });
    await recordSubmitDiagnostic("after_front_door_artifact_attachment", {
      workflowSummaryCount: workflowSummaryIndex.summaries.length,
      workflowSummaryBytes: jsonBytes(workflowSummaryIndex),
      conversationContextBytes: jsonBytes(context),
      routerPayloadBytes: jsonBytes(routerRequest),
      candidateCount: candidates.candidates.length,
      selectedModelRef: routed.metadata.modelCandidateId,
      providerRef: routed.metadata.providerRef ?? null,
      reasonCodes: ["after_front_door_artifact_attachment"],
    });
    const finalReasonCodes = [
      "native_submit_front_door_native_execution_session_started",
      `native_execution_session_${started.status}`,
      ...launch.reasonCodes,
      ...validation.reasonCodes,
      ...actionSemantics.reasonCodes,
    ];
    const diagnostics = await submitDiagnostics.finalize({
      status: "accepted",
      runtimeJobId: job.jobId,
      reasonCodes: finalReasonCodes,
    });
    const diagnosticsArtifact = await this.dependencies.runtimeJobs.attachJsonPayloadArtifact({
      jobId: job.jobId,
      artifactType: "execution.front_door.submit_heap_diagnostics",
      uri: `runtime-job://${job.jobId}/execution/front-door/submit-heap-diagnostics`,
      contentType: "application/json",
      body: diagnostics.body as unknown as JsonValue,
      boundedSummary: `Front-door submit diagnostics for ${diagnostics.manifest.phaseCount} phases.`,
      reasonCodes: diagnostics.manifest.reasonCodes,
      inputCounts: {
        phaseCount: diagnostics.manifest.phaseCount,
        promptByteLength: diagnostics.manifest.promptByteLength,
        workflowSummaryBytes: diagnostics.manifest.maxWorkflowSummaryBytes,
        conversationContextBytes: diagnostics.manifest.maxConversationContextBytes,
        routerPayloadBytes: diagnostics.manifest.maxRouterPayloadBytes,
      },
      outputCounts: {
        bodyByteCount: diagnostics.manifest.bodyByteCount,
        manifestJsonByteCount: diagnostics.manifest.manifestJsonByteCount,
      },
      maxBounds: {
        manifestMaxBytes: 16 * 1024,
      },
      createdBy: "native_execution_rpc.submit",
      metadata: {
        submitDiagnosticsManifest: diagnostics.manifest as unknown as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
      },
    });
    await this.recordFrontDoorRoutingTelemetry({
      runtimeJobId: job.jobId,
      record: buildFrontDoorRoutingTelemetryRecord({
        routeDecisionId: `${requestId}:routing`,
        promptHash,
        promptSummary,
        routed,
        escalation,
        validation,
        clarification,
        actionSemantics,
        compiled,
        contextVersion,
        authoritySnapshotVersion,
        authSessionVersion,
        artifactRefs: [
          `runtime-job://${job.jobId}/execution/front-door/native-handoff`,
          `runtime-job://${job.jobId}/execution/front-door/router-result`,
          `runtime-job://${job.jobId}/execution/front-door/validation`,
          `runtime-job://${job.jobId}/execution/front-door/compiled-request`,
          `runtime-job://${job.jobId}/execution/front-door/memory-policy`,
        ],
      }),
    });
    await this.dependencies.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.front_door_workflow_request_submitted",
      data: {
        workflowId: compiled.workflowId,
        executorWorkflowId: compiled.executorWorkflowId,
        subjectWorkflowIds: compiled.subjectWorkflowIds,
        targetSubjectRefs: compiled.targetSubjectRefs,
        requestedCapabilities: compiled.requestedCapabilities,
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        frontDoorWorkflowHint: compiled.workflowId,
        nativeExecutionSession: true,
        sessionId: started.sessionId,
        agentProfile: started.agentProfile,
        promptHash: compiled.promptHash,
        sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    return this.submitResult({
      accepted: true,
      statusCode: 202,
      runtimeJobId: job.jobId,
      sessionId: started.sessionId,
      agentProfile: started.agentProfile,
      nativeExecutionLaunch: launch,
      workflowId: compiled.workflowId,
      jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
      frontDoorRouterResult: routed,
      frontDoorEscalation: escalation,
      frontDoorValidation: validation,
      frontDoorClarification: clarification,
      frontDoorCompiledRequest: compiled,
      frontDoorMultiIntentPlan: multiIntentPlan,
      frontDoorMemoryPolicy,
      frontDoorSubmitDiagnostics: diagnostics.body.phases,
      frontDoorSubmitDiagnosticsManifest: {
        ...diagnostics.manifest,
        bodyArtifactRef: diagnosticsArtifact.uri,
        manifestArtifactRef: diagnosticsArtifact.uri,
      },
      frontDoorSubmitDiagnosticsArtifactRef: diagnosticsArtifact.uri,
      reasonCodes: finalReasonCodes,
    });
  }

  private async attachFrontDoorArtifacts(input: {
    runtimeJobId: string;
    routed: StructuredModelIntentRouterResult;
    escalation: RouterEscalationDecision;
    validation: IntentValidationDecision;
    actionSemantics: ReturnType<typeof enforceActionSemantics>;
    clarification: ClarificationGateDecision;
    compiled: FrontDoorCompileResult;
    nativeHandoff: JsonValue;
    multiIntentPlan: MultiIntentPlanCompileDecision | null;
    childHandoffs: unknown[];
    memoryPolicy?: PromptRouterMemoryPolicyDecision | null;
  }): Promise<void> {
    const artifacts: Array<{ artifactType: string; uri: string; metadata: JsonValue }> = [
      {
        artifactType: "execution.front_door.router_result",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/router-result`,
        metadata: input.routed as unknown as JsonValue,
      },
      {
        artifactType: "execution.front_door.escalation",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/escalation`,
        metadata: input.escalation as unknown as JsonValue,
      },
      {
        artifactType: "execution.front_door.validation",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/validation`,
        metadata: input.validation as unknown as JsonValue,
      },
      {
        artifactType: "execution.front_door.native_handoff",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/native-handoff`,
        metadata: input.nativeHandoff,
      },
      {
        artifactType: "execution.front_door.action_semantics",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/action-semantics`,
        metadata: input.actionSemantics as unknown as JsonValue,
      },
      {
        artifactType: "execution.front_door.clarification_gate",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/clarification-gate`,
        metadata: input.clarification as unknown as JsonValue,
      },
      {
        artifactType: "execution.front_door.compiled_request",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/compiled-request`,
        metadata: input.compiled as unknown as JsonValue,
      },
    ];
    if (input.multiIntentPlan) {
      artifacts.push({
        artifactType: "execution.front_door.multi_intent_plan",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/multi-intent-plan`,
        metadata: input.multiIntentPlan as unknown as JsonValue,
      });
    }
    if (input.childHandoffs.length > 0) {
      artifacts.push({
        artifactType: "execution.front_door.child_handoffs",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/child-handoffs`,
        metadata: input.childHandoffs as unknown as JsonValue,
      });
    }
    if (input.memoryPolicy) {
      artifacts.push({
        artifactType: "execution.front_door.memory_policy",
        uri: `runtime-job://${input.runtimeJobId}/execution/front-door/memory-policy`,
        metadata: input.memoryPolicy as unknown as JsonValue,
      });
    }
    for (const artifact of artifacts) {
      await this.dependencies.runtimeJobs.attachArtifact({
        jobId: input.runtimeJobId,
        artifactType: artifact.artifactType,
        storageKind: "metadata",
        uri: artifact.uri,
        contentType: "application/json",
        metadata: artifact.metadata,
      });
    }
  }

  private async recordFrontDoorRoutingTelemetry(input: {
    runtimeJobId?: string | null;
    record: RoutingTelemetryRecord;
  }): Promise<void> {
    const store =
      this.dependencies.routingTelemetryStore ??
      (input.runtimeJobId
        ? new RuntimeArtifactRoutingTelemetryStore(
            this.dependencies.runtimeJobs,
            input.runtimeJobId,
          )
        : new NoopRoutingTelemetryStore());
    await store.write(input.record);
  }

  async status(runtimeJobId: string): Promise<JsonValue> {
    const runtimeJob = await this.dependencies.runtimeJobs.getJob(runtimeJobId);
    const events = runtimeJobId
      ? await this.dependencies.runtimeJobs.listRecentEvents(runtimeJobId, 200)
      : [];
    return {
      runtimeJob: compactNativeExecutionRuntimeJob(runtimeJob),
      runtimeJobId,
      runtimeJobState: runtimeJob?.state ?? null,
      live: summarizeNativeExecutionLiveStatus({ job: runtimeJob, events }),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  async applyControl(input: {
    actionKind: WorkQueueExecutionActionKind;
    actionId: string;
    workItemId: string;
    runtimeJobId: string;
    auth: NativeExecutionRpcAuth;
    metadata?: Record<string, JsonValue>;
  }) {
    const decision = decideWorkQueueExecutionAction({
      actionId: input.actionId,
      actionKind: input.actionKind,
      workItemId: input.workItemId,
      runtimeJobId: input.runtimeJobId,
      actorId: input.auth.actorId,
      authenticated: input.auth.authenticated,
      metadata: input.metadata,
    });
    if (decision.accepted) {
      const runtimeJob = await this.dependencies.runtimeJobs.getJob(input.runtimeJobId);
      if (!runtimeJob) {
        const rejected: WorkQueueExecutionActionDecision = {
          ...decision,
          accepted: false,
          status: "rejected",
          runtimeBacked: false,
          reasonCodes: [...decision.reasonCodes, "linked_runtime_job_not_found"],
          workQueueLifecycleMutated: false,
          uiMutationAllowed: false,
        };
        return rejected;
      }
      await recordWorkQueueExecutionAction({
        runtimeJobs: this.dependencies.runtimeJobs,
        runtimeJobId: input.runtimeJobId,
        decision,
      });
      const nativeControlKind = nativeControlKindFromWorkQueueAction(input.actionKind);
      if (nativeControlKind) {
        await applyNativeExecutionControl({
          runtimeJobs: this.dependencies.runtimeJobs,
          runtimeJobId: input.runtimeJobId,
          sessionId: nativeSessionIdFromRuntimeJob(runtimeJob),
          controlKind: nativeControlKind,
          reason:
            stringValueFromRecord(input.metadata ?? null, "reason") ??
            `work_queue_control:${input.actionId}`,
          message: stringValueFromRecord(input.metadata ?? null, "message"),
          redirectMessage:
            stringValueFromRecord(input.metadata ?? null, "redirectMessage") ??
            stringValueFromRecord(input.metadata ?? null, "redirect"),
          actorId: input.auth.actorId,
        });
      } else if (input.actionKind === "cancel") {
        await this.dependencies.runtimeJobs.cancelJob(
          input.runtimeJobId,
          `work_queue_control_cancel:${input.actionId}`,
        );
      }
    }
    return decision;
  }

  async readWorkQueueProjection(workItemId: string): Promise<JsonValue> {
    if (!this.dependencies.workQueue) {
      return { status: "unavailable", reasonCodes: ["work_queue_repository_not_configured"] };
    }
    const model = await buildWorkQueueExecutionReadModel({
      workQueue: this.dependencies.workQueue,
      runtimeJobs: this.dependencies.runtimeJobs,
      workItemId,
    });
    return summarizeWorkQueueExecutionForUi(model);
  }

  async readCloseout(runtimeJobId: string): Promise<JsonValue> {
    const artifacts = await this.dependencies.runtimeJobs.listArtifacts(runtimeJobId, {
      limit: 500,
      order: "desc",
    });
    const events = await this.dependencies.runtimeJobs.listEvents(runtimeJobId, 80);
    const job = await this.dependencies.runtimeJobs.getJob(runtimeJobId);
    const closeoutRefs = artifacts
      .filter(
        (artifact) =>
          artifact.artifactType.includes("closeout") ||
          artifact.artifactType.includes("work_episode") ||
          (artifact.metadata &&
            typeof artifact.metadata === "object" &&
            "closeoutState" in artifact.metadata),
      )
      .map((artifact) => artifact.uri)
      .slice(0, 20);
    const resultReview = artifacts.findLast(
      (artifact) => artifact.artifactType === "agent_team.result_review",
    );
    const workflowHumanCloseout = artifacts.findLast(
      (artifact) => artifact.artifactType === "workflow_review.human_closeout_summary",
    );
    const closeoutCapsuleArtifact = artifacts.findLast(
      (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
    );
    const agentTeamEvidence = artifacts.findLast(
      (artifact) => artifact.artifactType === "agent_team.runtime_evidence",
    );
    const resultReviewRecord =
      resultReview?.metadata && typeof resultReview.metadata === "object"
        ? (resultReview.metadata as Record<string, unknown>)
        : null;
    const humanCloseoutSummary =
      (resultReviewRecord?.humanCloseoutSummary &&
      typeof resultReviewRecord.humanCloseoutSummary === "object"
        ? (resultReviewRecord.humanCloseoutSummary as JsonValue)
        : null) ??
      (workflowHumanCloseout?.metadata && typeof workflowHumanCloseout.metadata === "object"
        ? workflowHumanCloseout.metadata
        : null);
    const agentTeamEvidenceRecord =
      agentTeamEvidence?.metadata && typeof agentTeamEvidence.metadata === "object"
        ? (agentTeamEvidence.metadata as Record<string, unknown>)
        : null;
    const closeoutCapsule =
      closeoutCapsuleArtifact?.metadata && typeof closeoutCapsuleArtifact.metadata === "object"
        ? (closeoutCapsuleArtifact.metadata as JsonValue)
        : null;
    const schedulerProgressEvents = events.filter(
      (event) => event.eventType === "agent_team.scheduler_progress",
    );
    const latestSchedulerProgress = schedulerProgressEvents.at(-1);
    const latestSchedulerProgressData = asRecord(latestSchedulerProgress?.data);
    return {
      runtimeJobId,
      runtimeJobState: job?.state ?? null,
      workflowId:
        stringValueFromRecord(asRecord(job?.payload), "workflowId") ??
        stringValueFromRecord(agentTeamEvidenceRecord, "workflowId"),
      closeoutRefs,
      closeoutState:
        artifacts
          .map((artifact) =>
            artifact.metadata && typeof artifact.metadata === "object"
              ? (artifact.metadata as { closeoutState?: unknown }).closeoutState
              : null,
          )
          .find((state) => typeof state === "string") ?? null,
      closeoutQuality: resultReviewRecord
        ? {
            accepted: resultReviewRecord.accepted === true,
            needsReview: resultReviewRecord.needsReview === true,
            goalSatisfaction:
              typeof resultReviewRecord.goalSatisfaction === "string"
                ? resultReviewRecord.goalSatisfaction
                : null,
            limitations: stringArrayFromValue(resultReviewRecord.limitations),
            requiredFixes: stringArrayFromValue(resultReviewRecord.requiredFixes),
          }
        : null,
      closeoutCapsule,
      humanCloseoutSummary,
      agentTeam: agentTeamEvidenceRecord
        ? {
            teamRunId: stringValueFromRecord(agentTeamEvidenceRecord, "teamRunId"),
            objective: stringValueFromRecord(agentTeamEvidenceRecord, "objective"),
            roster: agentTeamEvidenceRecord.roster ?? [],
            roleAssignments: agentTeamEvidenceRecord.roleAssignments ?? [],
            permissionEvidence: agentTeamEvidenceRecord.permissionEvidence ?? null,
            validationState: stringValueFromRecord(agentTeamEvidenceRecord, "validationState"),
            reviewState: stringValueFromRecord(agentTeamEvidenceRecord, "reviewState"),
            closeoutState: stringValueFromRecord(agentTeamEvidenceRecord, "closeoutState"),
          }
        : null,
      activeGraphProgress: latestSchedulerProgress
        ? {
            state: "present",
            graphId: stringValueFromRecord(latestSchedulerProgressData, "graphId"),
            activeNodeId: stringValueFromRecord(latestSchedulerProgressData, "nodeId"),
            activeNodeKind: stringValueFromRecord(latestSchedulerProgressData, "activeNodeKind"),
            roleId: stringValueFromRecord(latestSchedulerProgressData, "roleId"),
            modelRef: stringValueFromRecord(latestSchedulerProgressData, "modelRef"),
            objective: stringValueFromRecord(latestSchedulerProgressData, "currentObjective"),
            whySelected: stringValueFromRecord(latestSchedulerProgressData, "whyThisNodeWasChosen"),
            currentPhase:
              stringValueFromRecord(latestSchedulerProgressData, "currentPhase") ??
              stringValueFromRecord(latestSchedulerProgressData, "stage"),
            validationState: stringValueFromRecord(latestSchedulerProgressData, "validationState"),
            evidenceProducedRefs: stringArrayFromValue(
              latestSchedulerProgressData?.evidenceProducedRefs,
            ),
            openCommitmentIds: stringArrayFromValue(
              latestSchedulerProgressData?.remainingOpenCommitmentIds,
            ),
            nextDecisionNeeded: stringValueFromRecord(
              latestSchedulerProgressData,
              "nextDecisionNeeded",
            ),
            blockerSummary: stringValueFromRecord(latestSchedulerProgressData, "blockerSummary"),
            eli5Progress: stringValueFromRecord(latestSchedulerProgressData, "eli5Progress"),
            latestProgressEventRefs: schedulerProgressEvents
              .slice(-6)
              .map((event) => `runtime-event://${event.eventId}`),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          }
        : { state: "missing" },
    } as JsonValue;
  }

  private submitResult(
    input: Partial<NativeExecutionSubmitResult> = {},
  ): NativeExecutionSubmitResult {
    return {
      artifactKind: "native_execution_submit_result",
      accepted: false,
      status: input.accepted ? "accepted" : "rejected",
      statusCode: input.accepted ? 202 : 400,
      runtimeJobId: null,
      sessionId: null,
      agentProfile: null,
      nativeExecutionLaunch: null,
      routeDecision: null,
      validation: null,
      compiledRequest: null,
      frontDoorRouterResult: null,
      frontDoorEscalation: null,
      frontDoorValidation: null,
      frontDoorClarification: null,
      frontDoorCompiledRequest: null,
      frontDoorMultiIntentPlan: null,
      frontDoorMemoryPolicy: null,
      frontDoorSubmitDiagnostics: null,
      frontDoorSubmitDiagnosticsManifest: null,
      frontDoorSubmitDiagnosticsArtifactRef: null,
      workflowId: null,
      jobType: null,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }

  private startSessionResult(
    input: Partial<NativeExecutionStartSessionResult> = {},
  ): NativeExecutionStartSessionResult {
    return {
      artifactKind: "native_execution_start_session_result",
      accepted: false,
      status: input.accepted ? "accepted" : "rejected",
      statusCode: input.accepted ? 202 : 400,
      runtimeJobId: null,
      sessionId: null,
      agentProfile: null,
      jobType: null,
      queueName: null,
      startStatus: null,
      eventType: null,
      launch: {
        status: "not_configured",
        workerId: null,
        queueName: null,
        reasonCodes: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }
}

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
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
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
  evaluateWorkflowWorkerExecutionReadiness,
  summarizeWorkflowWorkerExecutionReadiness,
  type WorkflowWorkerAdapterRegistry,
  type WorkflowWorkerExecutionReadiness,
} from "../workers/index.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import { type IntentValidatorApprovalRef } from "./intent-validator.ts";

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
};

export type NativeExecutionSubmitResult = {
  artifactKind: "native_execution_submit_result";
  accepted: boolean;
  status: "accepted" | "rejected";
  statusCode: number;
  runtimeJobId: string | null;
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
  workflowId: string | null;
  jobType: string | null;
  workerContractState: WorkflowWorkerExecutionReadiness["contractState"] | null;
  workerAdapterId: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type NativeExecutionRpcDependencies = {
  runtimeJobs: RuntimeJobRepository;
  runtimeToolKernel?: RuntimeToolKernel;
  workQueue?: WorkQueueRepository;
  registry?: WorkflowRegistry;
  structuredRouterProvider?: StructuredModelIntentRouterProvider;
  routingTelemetryStore?: RoutingTelemetryStore;
  workerAdapterRegistry?: WorkflowWorkerAdapterRegistry;
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

function summarizeBlockedRouterOutput(result: StructuredModelIntentRouterResult): string {
  const output = result.output;
  return JSON.stringify({
    route: output?.route ?? null,
    workflowId: output?.workflowId ?? null,
    jobType: output?.jobType ?? null,
    responseMode: output?.responseMode ?? null,
    executeNow: output?.executeNow ?? null,
    objectiveSummary: output?.objectiveSummary?.slice(0, 400) ?? "",
    requestedActions: output?.requestedActions?.map((action) => action.action).slice(0, 10) ?? [],
    negatedActions: output?.negatedActions?.map((action) => action.action).slice(0, 10) ?? [],
    conditionalActions:
      output?.conditionalActions?.map((action) => action.action).slice(0, 10) ?? [],
    sideEffectClass: output?.sideEffectClass ?? null,
    riskClass: output?.riskClass ?? null,
    reasonCodes: output?.reasonCodes?.slice(0, 12) ?? [],
    routerReasonCodes: result.metadata.reasonCodes.slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
  });
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

function buildBlockedRouteRepairRequest(input: {
  originalRequest: ReturnType<typeof buildStructuredModelIntentRouterRequest>;
  originalPrompt: string;
  firstResult: StructuredModelIntentRouterResult;
}): ReturnType<typeof buildStructuredModelIntentRouterRequest> {
  const firstPassSummary = summarizeBlockedRouterOutput(input.firstResult);
  const repairContext = buildConversationRoutingContext({
    ...input.originalRequest.conversationContext,
    recentContextSummary: [
      input.originalRequest.conversationContext.recentContextSummary,
      `First pass blocked-route summary: ${firstPassSummary}`,
    ]
      .filter(Boolean)
      .join(" "),
    reasonCodes: [
      ...input.originalRequest.conversationContext.reasonCodes,
      "blocked_route_repair_attempted",
      "primary_requested_outcome_constraint_review",
    ],
  });
  return buildStructuredModelIntentRouterRequest({
    promptHash: input.originalRequest.promptHash,
    volatilePromptText: JSON.stringify({
      repairTask:
        "Review whether the first router pass blocked because it treated constraint text, pass criteria, or safety boundaries as the primary requested outcome. Separate the primary outcome from constraints without adding new actions. Return blocked only if the primary requested outcome itself is prohibited. Otherwise return the allowed CanonicalRouterOutput route.",
      originalPrompt: input.originalPrompt,
      firstPassRouterOutput: JSON.parse(firstPassSummary),
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    promptSummary: input.originalRequest.promptSummary,
    conversationContext: repairContext,
    workflowCandidateSelection: {
      workflowRegistryVersion: input.originalRequest.workflowRegistryVersion,
      candidates: input.originalRequest.workflowSummaries,
      reasonCodes: ["blocked_route_repair_reuses_workflow_candidates"],
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
    routerConfigVersion: `${input.originalRequest.routerConfigVersion}:blocked-route-repair`,
    sourceRoute: input.originalRequest.sourceRoute,
    requestId: `${input.originalRequest.requestId}:blocked-route-repair`,
    sessionId: input.originalRequest.sessionId,
    reasonCodes: [
      ...input.originalRequest.reasonCodes,
      "blocked_route_repair_attempted",
      "first_pass_route_blocked",
    ],
    maxWorkflowCandidates: input.originalRequest.workflowSummaries.length,
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
    reasonCodes: [
      ...input.originalRequest.reasonCodes,
      "action_separation_repair_attempted",
      "requested_and_negated_action_conflict",
    ],
    maxWorkflowCandidates: input.originalRequest.workflowSummaries.length,
  });
}

function buildExecutorCapabilityRepairRequest(input: {
  originalRequest: ReturnType<typeof buildStructuredModelIntentRouterRequest>;
  originalPrompt: string;
  currentResult: StructuredModelIntentRouterResult;
  validation: ReturnType<typeof validateIntentFrontDoorDecision>;
}): ReturnType<typeof buildStructuredModelIntentRouterRequest> {
  const currentRouterSummary = summarizeActionSeparationRouterOutput(input.currentResult);
  const validationSummary = JSON.stringify({
    outcome: input.validation.outcome,
    workflowId: input.validation.workflowId,
    reasonCodes: input.validation.reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const repairContext = buildConversationRoutingContext({
    ...input.originalRequest.conversationContext,
    recentContextSummary: [
      input.originalRequest.conversationContext.recentContextSummary,
      `Executor capability validation summary: ${validationSummary}`,
      `Current router output summary: ${currentRouterSummary}`,
    ]
      .filter(Boolean)
      .join(" "),
    reasonCodes: [
      ...input.originalRequest.conversationContext.reasonCodes,
      "executor_capability_repair_attempted",
      "executor_subject_capability_split_review",
    ],
  });
  return buildStructuredModelIntentRouterRequest({
    promptHash: input.originalRequest.promptHash,
    volatilePromptText: JSON.stringify({
      repairTask:
        "Re-emit CanonicalRouterOutput by selecting an executorWorkflowId whose executable capabilities satisfy requestedCapabilities, while preserving mentioned target workflows/systems as subjectWorkflowIds and targetSubjectRefs. Do not rewrite target subjects into executorWorkflowId unless the target workflow itself can execute the requested capabilities. Keep workflowId equal to executorWorkflowId.",
      originalPrompt: input.originalPrompt,
      currentRouterOutput: JSON.parse(currentRouterSummary),
      validation: JSON.parse(validationSummary),
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    promptSummary: input.originalRequest.promptSummary,
    conversationContext: repairContext,
    workflowCandidateSelection: {
      workflowRegistryVersion: input.originalRequest.workflowRegistryVersion,
      candidates: input.originalRequest.workflowSummaries,
      reasonCodes: ["executor_capability_repair_reuses_workflow_candidates"],
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
    routerConfigVersion: `${input.originalRequest.routerConfigVersion}:executor-capability-repair`,
    sourceRoute: input.originalRequest.sourceRoute,
    requestId: `${input.originalRequest.requestId}:executor-capability-repair`,
    sessionId: input.originalRequest.sessionId,
    reasonCodes: [
      ...input.originalRequest.reasonCodes,
      "executor_capability_repair_attempted",
      "executor_selected_without_required_capability",
    ],
    maxWorkflowCandidates: input.originalRequest.workflowSummaries.length,
  });
}

function actionSemanticsNeedsModelRepair(
  actionSemantics: ReturnType<typeof enforceActionSemantics>,
): boolean {
  return actionSemantics.reasonCodes.some((reason) => reason.includes("conflicts_with_negation"));
}

function validationNeedsExecutorCapabilityRepair(
  validation: ReturnType<typeof validateIntentFrontDoorDecision>,
): boolean {
  return validation.reasonCodes.some((reason) =>
    reason.startsWith("executor_capability_unsupported:"),
  );
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

  async submit(request: NativeExecutionSubmitRequest): Promise<NativeExecutionSubmitResult> {
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
    if (preGate.kind === "reject") {
      const promptHash = hashPrompt(request.prompt);
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: summarizePrompt(request.prompt),
          contextBudgetRemainingTokens: 0,
        }),
        reasonCodes: preGate.reasonCodes,
        statusCode: preGate.statusCode,
      });
    }
    if (preGate.kind === "protocol_command") {
      const promptHash = hashPrompt(request.prompt);
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: summarizePrompt(request.prompt),
          contextBudgetRemainingTokens: 0,
        }),
        reasonCodes: [
          "protocol_command_bypassed_execution_submit",
          `protocol_command_${preGate.command}`,
          ...preGate.reasonCodes,
        ],
      });
    }
    if (preGate.kind === "ui_control") {
      const promptHash = hashPrompt(request.prompt);
      return this.submitResult({
        frontDoorMemoryPolicy: decidePromptRouterMemoryPolicy({
          routeKind: "protocol",
          promptHash,
          boundedPromptSummary: summarizePrompt(request.prompt),
          contextBudgetRemainingTokens: 0,
        }),
        reasonCodes: [
          "ui_control_bypassed_execution_submit",
          `ui_control_${preGate.control}`,
          ...preGate.reasonCodes,
        ],
      });
    }
    if (this.structuredRouterProvider) {
      return this.submitViaFrontDoor(request);
    }
    return this.submitResult({
      statusCode: 503,
      reasonCodes: [
        "structured_model_intent_router_provider_not_configured",
        "front_door_required_for_free_form_execution_submit",
        "legacy_semantic_intent_router_retired",
      ],
    });
  }

  private async submitViaFrontDoor(
    request: NativeExecutionSubmitRequest,
  ): Promise<NativeExecutionSubmitResult> {
    const promptHash = hashPrompt(request.prompt);
    const promptSummary = summarizePrompt(request.prompt);
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
    const fastPath = runCheapDeterministicFastPath({
      conversationContext: context,
      promptSummary,
    });
    if (fastPath.finalRouteDecisionMade) {
      return this.submitResult({
        statusCode: 200,
        reasonCodes: fastPath.reasonCodes,
      });
    }

    const candidates = selectWorkflowSummaryCandidates({
      index: workflowSummaryIndex,
      context,
      maxCandidates: 8,
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
      reasonCodes: ["native_submit_front_door_router_request"],
    });
    let routed = await router.route(routerRequest);
    if (routed.valid && routed.output?.route === "blocked") {
      const repairRequest = buildBlockedRouteRepairRequest({
        originalRequest: routerRequest,
        originalPrompt: request.prompt,
        firstResult: routed,
      });
      const repaired = await router.route(repairRequest);
      if (repaired.valid && repaired.output) {
        routed = repaired;
      }
    }
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
      return this.submitResult({
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
      const repaired = await router.route(repairRequest);
      if (repaired.valid && repaired.output) {
        routed = repaired;
        stages = computeFrontDoorStages(routed);
      }
    }
    if (validationNeedsExecutorCapabilityRepair(stages.validation)) {
      const repairRequest = buildExecutorCapabilityRepairRequest({
        originalRequest: routerRequest,
        originalPrompt: request.prompt,
        currentResult: routed,
        validation: stages.validation,
      });
      const repaired = await router.route(repairRequest);
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
      return this.submitResult({
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
      actionSemantics.outcome === "approval_required" ||
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
      return this.submitResult({
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
      return this.submitResult({
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
      return this.submitResult({
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
              parentAuthorityProfile: output.requestedAuthority ?? workflow.defaultAuthorityProfile,
            }),
          )
        : [];

    const workerReadiness = this.evaluateWorkerReadiness({
      workflowId: compiled.workflowId,
      jobType: compiled.jobType,
    });
    if (workerReadiness && !workerReadiness.accepted) {
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
          artifactRefs: ["worker_adapter_registry://execution-readiness"],
        }),
      });
      return this.submitResult({
        statusCode: 409,
        workflowId: compiled.workflowId,
        jobType: compiled.jobType,
        workerContractState: workerReadiness.contractState,
        workerAdapterId: workerReadiness.workerAdapterId,
        frontDoorRouterResult: routed,
        frontDoorEscalation: escalation,
        frontDoorValidation: validation,
        frontDoorClarification: clarification,
        frontDoorCompiledRequest: compiled,
        frontDoorMultiIntentPlan: multiIntentPlan,
        frontDoorMemoryPolicy,
        reasonCodes: workerReadiness.reasonCodes,
      });
    }
    const job = await this.dependencies.runtimeJobs.enqueueJob(compiled.runtimeJobCreateRequest);
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
            jobType: compiled.jobType,
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
          jobType: compiled.jobType,
          frontDoorNativeExecutionSubmit: true,
          sourceRoute: request.sourceRoute ?? request.auth.sourceRoute ?? null,
          workQueueLifecycleMutated: false,
        },
      });
    }
    await this.attachFrontDoorArtifacts({
      runtimeJobId: job.jobId,
      routed,
      escalation,
      validation,
      actionSemantics,
      clarification,
      compiled,
      multiIntentPlan,
      childHandoffs,
      memoryPolicy: frontDoorMemoryPolicy,
    });
    if (workerReadiness) {
      await this.attachWorkerReadinessArtifact(job.jobId, workerReadiness);
    }
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
        jobType: compiled.jobType,
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
      workflowId: compiled.workflowId,
      jobType: compiled.jobType,
      workerContractState: workerReadiness?.contractState ?? null,
      workerAdapterId: workerReadiness?.workerAdapterId ?? null,
      frontDoorRouterResult: routed,
      frontDoorEscalation: escalation,
      frontDoorValidation: validation,
      frontDoorClarification: clarification,
      frontDoorCompiledRequest: compiled,
      frontDoorMultiIntentPlan: multiIntentPlan,
      frontDoorMemoryPolicy,
      reasonCodes: [
        "native_submit_front_door_job_enqueued",
        ...validation.reasonCodes,
        ...actionSemantics.reasonCodes,
      ],
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

  private evaluateWorkerReadiness(input: {
    workflowId: string;
    jobType: string;
  }): WorkflowWorkerExecutionReadiness | null {
    if (!this.dependencies.workerAdapterRegistry) {
      return null;
    }
    return evaluateWorkflowWorkerExecutionReadiness({
      registry: this.dependencies.workerAdapterRegistry,
      workflowId: input.workflowId,
      jobType: input.jobType,
      allowShadow: true,
    });
  }

  private async attachWorkerReadinessArtifact(
    runtimeJobId: string,
    readiness: WorkflowWorkerExecutionReadiness,
  ): Promise<void> {
    await this.dependencies.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution.worker_contract_state",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/execution/worker-contract-state`,
      contentType: "application/json",
      metadata: summarizeWorkflowWorkerExecutionReadiness(readiness),
    });
    await this.dependencies.runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: "execution.worker_dispatch_pending",
      data: summarizeWorkflowWorkerExecutionReadiness(readiness),
    });
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

  async status(runtimeJobId: string): Promise<{ runtimeJob: RuntimeJob | null }> {
    return { runtimeJob: await this.dependencies.runtimeJobs.getJob(runtimeJobId) };
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
      if (input.actionKind === "cancel") {
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
    const artifacts = await this.dependencies.runtimeJobs.listArtifacts(runtimeJobId);
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
      workflowId: null,
      jobType: null,
      workerContractState: null,
      workerAdapterId: null,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }
}

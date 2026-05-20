import {
  CODING_TEAM_PERMISSION_MODEL_ID,
  evaluateCodingTeamPermissionPlan,
  type CodingTeamPermissionActionKind,
  type CodingTeamPermissionPlan,
} from "../authority/coding-team-permission-model.ts";
import type { EnqueueRuntimeJobInput, JsonValue } from "../runtime-job-repository.ts";
import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import type { ActionSemanticsDecision } from "./action-semantics.ts";
import type { IntentValidationDecision } from "./intent-validator.ts";
import type { CanonicalRouterAction, CanonicalRouterOutput } from "./router-schema.ts";
import {
  assertRouterFrontDoorToolProtocolCanCompile,
  type RouterFrontDoorToolProtocolResult,
} from "./router-tool-protocol.ts";

export const FRONT_DOOR_REQUEST_COMPILER_VERSION = "intent-front-door.request-compiler.v1";
export const FRONT_DOOR_PROMPT_SUMMARY_MAX_CHARS = 600;

export type FrontDoorCompiledAction = {
  action: CanonicalRouterAction["action"];
  objectSummary: string;
  confidence: number;
  source: "requested" | "conditional";
};

export type FrontDoorCompiledRuntimeJobRequest = {
  artifactKind: "front_door_compiled_runtime_job_request";
  compilerVersion: typeof FRONT_DOOR_REQUEST_COMPILER_VERSION;
  requestId: string;
  workflowId: string;
  executorWorkflowId: string;
  subjectWorkflowIds: string[];
  targetSubjectRefs: Array<{ targetKind: string; targetRef: string; confidence: number | null }>;
  requestedCapabilities: string[];
  constraints: Array<{ constraintKind: string; objectSummary: string; confidence: number }>;
  jobType: string;
  queueName: string;
  objectiveSummary: string;
  promptHash: string;
  promptSummary: string;
  sourcePromptRef: FrontDoorSourcePromptRef | null;
  compiledActions: FrontDoorCompiledAction[];
  authorityProfile: string;
  authorityRefs: string[];
  approvalRefs: string[];
  permissionDecisionRef: string | null;
  permissionEvidence: FrontDoorPermissionEvidence | null;
  routerToolProtocolRef: string | null;
  routerToolInvocationRefs: string[];
  missionLedgerHandoffRef: string | null;
  roleGraphRefs: string[];
  modelTransportPolicyRefs: string[];
  workQueueLink: { workItemId: string | null; runId: string | null };
  closeoutRequired: true;
  validationRequired: true;
  reviewRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  runtimeJobCreateRequest: EnqueueRuntimeJobInput;
};

export type FrontDoorSourcePromptRef = {
  refKind: "gateway_chat_transcript" | "native_submit";
  promptHash: string;
  promptLength: number;
  sessionKey: string | null;
  sessionId: string | null;
  runId: string | null;
  sourceRoute: string | null;
  rawPromptStored: false;
};

export type FrontDoorPermissionEvidence = {
  permissionModelId: typeof CODING_TEAM_PERMISSION_MODEL_ID;
  decision: CodingTeamPermissionPlan["decision"];
  allowedLocalActionSummaries: string[];
  approvalRequiredActionSummaries: string[];
  blockedActionSummaries: string[];
  needsReviewActionSummaries: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type FrontDoorCompiledPlanOnly = {
  artifactKind: "front_door_compiled_plan_only";
  compilerVersion: typeof FRONT_DOOR_REQUEST_COMPILER_VERSION;
  requestId: string;
  route: "plan_only" | "chat_response" | "status_response";
  objectiveSummary: string;
  promptHash: string;
  promptSummary: string;
  compiledActions: FrontDoorCompiledAction[];
  runtimeJobCreateRequest: null;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type FrontDoorCompileResult = FrontDoorCompiledRuntimeJobRequest | FrontDoorCompiledPlanOnly;

export type FrontDoorRequestCompilerInput = {
  requestId: string;
  routerOutput: CanonicalRouterOutput;
  validation: IntentValidationDecision;
  actionSemantics: ActionSemanticsDecision;
  workflow?: ExecutionWorkflowContract | null;
  operator: { actorId?: string | null; sessionId?: string | null };
  promptHash: string;
  promptSummary: string;
  sourcePromptRef?: Omit<FrontDoorSourcePromptRef, "promptHash" | "promptLength"> | null;
  promptLength?: number | null;
  authorityRefs?: string[];
  approvalRefs?: string[];
  workItemId?: string | null;
  runId?: string | null;
  queueName?: string;
  idempotencyKey?: string;
  routerToolProtocol?: RouterFrontDoorToolProtocolResult | null;
};

export function compileFrontDoorRequest(
  input: FrontDoorRequestCompilerInput,
): FrontDoorCompileResult {
  const output = input.routerOutput;
  const promptSummary = boundText(input.promptSummary, FRONT_DOOR_PROMPT_SUMMARY_MAX_CHARS);
  const sourcePromptRef = input.sourcePromptRef
    ? {
        ...input.sourcePromptRef,
        promptHash: input.promptHash,
        promptLength: Math.max(0, Math.trunc(input.promptLength ?? 0)),
        rawPromptStored: false as const,
      }
    : null;
  assertNoRawStorage(output);
  assertNoLifecycleMutation(input.validation);
  assertRouterFrontDoorToolProtocolCanCompile(input.routerToolProtocol);

  if (
    output.route === "chat_response" ||
    output.route === "status_response" ||
    output.route === "plan_only"
  ) {
    if (
      input.validation.outcome !== "accepted" &&
      input.validation.outcome !== "plan_only_allowed"
    ) {
      throw new Error(
        `cannot compile non-runtime route from validation outcome ${input.validation.outcome}`,
      );
    }
    return {
      artifactKind: "front_door_compiled_plan_only",
      compilerVersion: FRONT_DOOR_REQUEST_COMPILER_VERSION,
      requestId: input.requestId,
      route: output.route,
      objectiveSummary: output.objectiveSummary,
      promptHash: input.promptHash,
      promptSummary,
      compiledActions: compileAllowedActions(input.actionSemantics),
      runtimeJobCreateRequest: null,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  if (input.validation.outcome !== "accepted" || !input.validation.accepted) {
    throw new Error(`cannot compile unaccepted front-door intent: ${input.validation.outcome}`);
  }
  if (input.actionSemantics.outcome !== "actions_allowed") {
    throw new Error(`cannot compile action semantics outcome: ${input.actionSemantics.outcome}`);
  }
  if (input.actionSemantics.blockedActions.length > 0) {
    throw new Error("cannot compile blocked actions");
  }
  if (!input.operator.actorId?.trim() || !input.operator.sessionId?.trim()) {
    throw new Error("operator actor id and session id are required");
  }
  if (!input.workflow) {
    throw new Error("workflow contract is required for runtime compilation");
  }
  const executorWorkflowId = output.executorWorkflowId ?? output.workflowId;
  if (
    executorWorkflowId !== input.workflow.workflowId ||
    (output.workflowId && output.workflowId !== executorWorkflowId) ||
    output.jobType !== input.workflow.jobType
  ) {
    throw new Error("router output workflow does not match workflow contract");
  }

  const compiledActions = compileAllowedActions(input.actionSemantics);
  const queueName = input.queueName ?? "agent-team";
  const authorityProfile = output.requestedAuthority ?? input.workflow.defaultAuthorityProfile;
  const permissionPlan = maybeEvaluateCodingTeamPermissionPlan({
    workflow: input.workflow,
    actions: compiledActions,
    actorRef: input.operator.actorId,
    sessionRef: input.operator.sessionId,
    authorityProfile,
  });
  const permissionEvidence = permissionPlan ? createPermissionEvidence(permissionPlan) : null;
  assertPermissionPlanCanCompile(permissionPlan, input.approvalRefs ?? []);
  const routerToolProtocolRef = input.routerToolProtocol
    ? `router-front-door-tool-protocol://${input.requestId}`
    : null;
  const routerToolInvocationRefs = input.routerToolProtocol?.toolInvocationRefs ?? [];
  const missionLedgerHandoffRef = input.routerToolProtocol?.missionLedgerHandoffRef ?? null;
  const roleGraphRefs = input.workflow.roles.map(
    (role) => `${input.workflow!.workflowId}:${role.roleId}`,
  );
  const modelTransportPolicyRefs = [
    ...input.workflow.transports.map((transport) => transport.transportId),
    ...input.workflow.roles.flatMap((role) => (role.modelPolicyRef ? [role.modelPolicyRef] : [])),
  ];
  const payload = {
    workflowId: input.workflow.workflowId,
    executorWorkflowId: input.workflow.workflowId,
    subjectWorkflowIds: output.subjectWorkflowIds as JsonValue,
    targetSubjectRefs: output.targetSubjectRefs as unknown as JsonValue,
    requestedCapabilities: output.requestedCapabilities as JsonValue,
    constraints: output.constraints as unknown as JsonValue,
    selectedExecutionReason: output.selectedExecutionReason,
    targetSubjectReason: output.targetSubjectReason,
    workflowDisplayName: input.workflow.displayName,
    jobType: input.workflow.jobType,
    objective: output.objectiveSummary,
    objectiveSummary: output.objectiveSummary,
    promptHash: input.promptHash,
    promptSummary,
    sourcePromptRef: sourcePromptRef as JsonValue,
    compiledActions: compiledActions as unknown as JsonValue,
    authorityProfile,
    authorityRefs: (input.authorityRefs ?? []) as JsonValue,
    approvalRefs: (input.approvalRefs ?? []) as JsonValue,
    permissionDecisionRef: permissionPlan
      ? `${permissionPlan.permissionModelId}#${permissionPlan.decision}`
      : null,
    permissionEvidence: permissionEvidence as JsonValue,
    routerToolProtocolRef,
    routerToolInvocationRefs: routerToolInvocationRefs as JsonValue,
    routerToolProtocol: (input.routerToolProtocol ?? null) as unknown as JsonValue,
    missionLedgerHandoffRef,
    roleGraphRefs: roleGraphRefs as JsonValue,
    modelTransportPolicyRefs: modelTransportPolicyRefs as JsonValue,
    closeoutRequired: true,
    validationRequired: true,
    reviewRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    operator: {
      actorId: input.operator.actorId,
      sessionId: input.operator.sessionId,
    },
  } satisfies JsonValue;

  return {
    artifactKind: "front_door_compiled_runtime_job_request",
    compilerVersion: FRONT_DOOR_REQUEST_COMPILER_VERSION,
    requestId: input.requestId,
    workflowId: input.workflow.workflowId,
    executorWorkflowId: input.workflow.workflowId,
    subjectWorkflowIds: output.subjectWorkflowIds,
    targetSubjectRefs: output.targetSubjectRefs.map((ref) => ({
      targetKind: ref.targetKind,
      targetRef: ref.targetRef,
      confidence: ref.confidence ?? null,
    })),
    requestedCapabilities: output.requestedCapabilities,
    constraints: output.constraints,
    jobType: input.workflow.jobType,
    queueName,
    objectiveSummary: output.objectiveSummary,
    promptHash: input.promptHash,
    promptSummary,
    sourcePromptRef,
    compiledActions,
    authorityProfile,
    authorityRefs: input.authorityRefs ?? [],
    approvalRefs: input.approvalRefs ?? [],
    permissionDecisionRef: permissionPlan
      ? `${permissionPlan.permissionModelId}#${permissionPlan.decision}`
      : null,
    permissionEvidence,
    routerToolProtocolRef,
    routerToolInvocationRefs,
    missionLedgerHandoffRef,
    roleGraphRefs,
    modelTransportPolicyRefs,
    workQueueLink: { workItemId: input.workItemId ?? null, runId: input.runId ?? null },
    closeoutRequired: true,
    validationRequired: true,
    reviewRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    runtimeJobCreateRequest: {
      jobId: input.requestId,
      jobType: input.workflow.jobType,
      queueName,
      payload,
      idempotencyScope: `workflow:${input.workflow.workflowId}`,
      idempotencyKey: input.idempotencyKey ?? input.promptHash,
      parentWorkflowId: input.workflow.workflowId,
      workItemId: input.workItemId ?? null,
      maxAttempts: 2,
      leaseTimeoutMs: 60_000,
    },
  };
}

function maybeEvaluateCodingTeamPermissionPlan(input: {
  workflow: ExecutionWorkflowContract;
  actions: FrontDoorCompiledAction[];
  actorRef?: string | null;
  sessionRef?: string | null;
  authorityProfile: string;
}): CodingTeamPermissionPlan | null {
  if (input.workflow.workflowId !== "agent_team.coding") {
    return null;
  }
  return evaluateCodingTeamPermissionPlan({
    workflowId: input.workflow.workflowId,
    actorRef: input.actorRef,
    sessionRef: input.sessionRef,
    authorityProfile: input.authorityProfile,
    actions: input.actions.map((action, index) => ({
      actionId: `${action.source}:${index}:${action.action}`,
      actionKind: mapRouterActionToCodingTeamPermissionAction(action.action),
      boundedSummary: action.objectSummary,
    })),
  });
}

function createPermissionEvidence(plan: CodingTeamPermissionPlan): FrontDoorPermissionEvidence {
  return {
    permissionModelId: plan.permissionModelId,
    decision: plan.decision,
    allowedLocalActionSummaries: plan.allowedLocalActionSummaries,
    approvalRequiredActionSummaries: plan.approvalRequiredActionSummaries,
    blockedActionSummaries: plan.blockedActionSummaries,
    needsReviewActionSummaries: plan.needsReviewActionSummaries,
    reasonCodes: plan.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function assertPermissionPlanCanCompile(
  plan: CodingTeamPermissionPlan | null,
  approvalRefs: string[],
): void {
  if (!plan) {
    return;
  }
  if (plan.decision === "blocked") {
    throw new Error(
      `coding team permission blocked actions rejected: ${plan.reasonCodes.join(",")}`,
    );
  }
  if (plan.decision === "needs_review") {
    throw new Error(`coding team permission needs review: ${plan.reasonCodes.join(",")}`);
  }
  if (plan.decision === "approval_required") {
    const required = plan.actionDecisions.flatMap((decision) => decision.requiredApprovalRefs);
    const missing = required.filter((ref) => !approvalRefs.includes(ref));
    if (missing.length > 0) {
      throw new Error(`coding team permission approval required: ${missing.join(",")}`);
    }
  }
}

function mapRouterActionToCodingTeamPermissionAction(
  action: CanonicalRouterAction["action"],
): CodingTeamPermissionActionKind {
  switch (action) {
    case "chat":
    case "status":
    case "research":
    case "plan":
      return "repo_read";
    case "code_edit":
      return "file_edit";
    case "test":
      return "test_run";
    case "review":
      return "validation_run";
    case "docs_update":
      return "docs_update";
    case "closeout":
      return "closeout_emit";
    case "install_dependency":
      return "install_dependency";
    case "deploy":
      return "production_deploy";
    case "outbound_send":
      return "external_outbound_send";
    case "model_promotion":
      return "model_promotion";
    case "work_queue_control":
      return "work_queue_lifecycle_mutation";
    case "model_eval":
      return "unknown";
    default:
      return "unknown";
  }
}

function compileAllowedActions(input: ActionSemanticsDecision): FrontDoorCompiledAction[] {
  const requested = input.allowedRequestedActions.map((action) =>
    compileAction(action, "requested"),
  );
  const conditional = input.allowedConditionalActions.map((action) =>
    compileAction(action, "conditional"),
  );
  return [...requested, ...conditional];
}

function compileAction(
  action: CanonicalRouterAction,
  source: FrontDoorCompiledAction["source"],
): FrontDoorCompiledAction {
  return {
    action: action.action,
    objectSummary: boundText(action.objectSummary, 300),
    confidence: action.confidence,
    source,
  };
}

function assertNoRawStorage(output: CanonicalRouterOutput): void {
  if (output.rawPromptStored || output.rawResponseStored) {
    throw new Error("raw prompt/response storage rejected by compiler");
  }
}

function assertNoLifecycleMutation(validation: IntentValidationDecision): void {
  if (validation.workQueueLifecycleMutationAllowed) {
    throw new Error("work queue lifecycle mutation rejected by compiler");
  }
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

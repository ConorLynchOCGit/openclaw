import type { EnqueueRuntimeJobInput, JsonValue } from "../runtime-job-repository.ts";
import { createChildWorkflowRequest } from "../workflows/child-workflow-handoff.ts";
import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import type { IntentValidationResult } from "./intent-validator.ts";
import type { ModelAssistedIntentRouterDecision } from "./model-assisted-intent-router.ts";

export type CompiledExecutionRequest = {
  artifactKind: "compiled_execution_workflow_request";
  requestId: string;
  workflowId: string;
  jobType: string;
  queueName: string;
  objectiveSummary: string;
  promptHash: string;
  promptSummary: string;
  compiledInputs: JsonValue;
  authorityProfile: string;
  approvalRefs: string[];
  roleGraphRefs: string[];
  modelTransportPolicyRefs: string[];
  workQueueLink: { workItemId: string | null; runId?: string | null };
  closeoutRequired: true;
  validationRequired: true;
  reviewRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  runtimeJobCreateRequest: EnqueueRuntimeJobInput;
};

function containsArbitraryCommand(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  return /\b(rm -rf|sudo |curl .*\| sh|bash -c|powershell|raw-command-log-marker)\b/u.test(
    serialized,
  );
}

export function compileIntentToRuntimeJobRequest(input: {
  requestId: string;
  routerDecision: ModelAssistedIntentRouterDecision;
  validation: IntentValidationResult;
  workflow: ExecutionWorkflowContract;
  operator: { actorId: string; sessionId?: string | null };
  workItemId?: string | null;
  approvalRefs?: string[];
  queueName?: string;
  idempotencyKey?: string;
}): CompiledExecutionRequest {
  if (!input.validation.accepted) {
    throw new Error(`cannot compile unaccepted intent: ${input.validation.outcome}`);
  }
  if (containsArbitraryCommand(input.validation.routeDecision.compiledInputs)) {
    throw new Error("compiled inputs include arbitrary command content");
  }
  const queueName = input.queueName ?? "agent-team";
  const authorityProfile =
    input.validation.routeDecision.requestedAuthority ?? input.workflow.defaultAuthorityProfile;
  const roleGraphRefs = input.workflow.roles.map(
    (role) => `${input.workflow.workflowId}:${role.roleId}`,
  );
  const modelTransportPolicyRefs = [
    ...input.workflow.transports.map((transport) => transport.transportId),
    ...input.workflow.roles.flatMap((role) => (role.modelPolicyRef ? [role.modelPolicyRef] : [])),
  ];
  const runtimePayload = {
    workflowId: input.workflow.workflowId,
    workflowDisplayName: input.workflow.displayName,
    jobType: input.workflow.jobType,
    objective: input.validation.routeDecision.objectiveSummary,
    objectiveSummary: input.validation.routeDecision.objectiveSummary,
    promptHash: input.routerDecision.promptHash,
    promptSummary: input.routerDecision.promptSummary,
    compiledInputs: input.validation.routeDecision.compiledInputs as JsonValue,
    authorityProfile,
    approvalRefs: input.approvalRefs ?? [],
    roleGraphRefs,
    modelTransportPolicyRefs,
    closeoutRequired: true,
    validationRequired: true,
    reviewRequired: true,
    childWorkflowRequests: createCompiledChildWorkflowRequests({
      compiledInputs: input.validation.routeDecision.compiledInputs as JsonValue,
      workflow: input.workflow,
      parentRuntimeJobId: input.requestId,
      authorityProfile,
    }) as unknown as JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    operator: {
      actorId: input.operator.actorId,
      sessionId: input.operator.sessionId ?? null,
    },
  } satisfies JsonValue;
  const runtimeJobCreateRequest: EnqueueRuntimeJobInput = {
    jobId: input.requestId,
    jobType: input.workflow.jobType,
    queueName,
    payload: runtimePayload,
    idempotencyScope: `workflow:${input.workflow.workflowId}`,
    idempotencyKey: input.idempotencyKey ?? input.routerDecision.promptHash,
    parentWorkflowId: input.workflow.workflowId,
    workItemId: input.workItemId ?? null,
    maxAttempts: 2,
    leaseTimeoutMs: 60_000,
  };
  return {
    artifactKind: "compiled_execution_workflow_request",
    requestId: input.requestId,
    workflowId: input.workflow.workflowId,
    jobType: input.workflow.jobType,
    queueName,
    objectiveSummary: input.validation.routeDecision.objectiveSummary,
    promptHash: input.routerDecision.promptHash,
    promptSummary: input.routerDecision.promptSummary,
    compiledInputs: input.validation.routeDecision.compiledInputs as JsonValue,
    authorityProfile,
    approvalRefs: input.approvalRefs ?? [],
    roleGraphRefs,
    modelTransportPolicyRefs,
    workQueueLink: { workItemId: input.workItemId ?? null },
    closeoutRequired: true,
    validationRequired: true,
    reviewRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    runtimeJobCreateRequest,
  };
}

function createCompiledChildWorkflowRequests(input: {
  compiledInputs: JsonValue;
  workflow: ExecutionWorkflowContract;
  parentRuntimeJobId: string;
  authorityProfile: string;
}): JsonValue[] {
  const value =
    typeof input.compiledInputs === "object" &&
    input.compiledInputs !== null &&
    !Array.isArray(input.compiledInputs) &&
    "childWorkflowRequests" in input.compiledInputs
      ? (input.compiledInputs as { childWorkflowRequests?: unknown }).childWorkflowRequests
      : [];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (request): request is { workflowId: string; requirement?: string } =>
        Boolean(request) &&
        typeof request === "object" &&
        "workflowId" in request &&
        typeof request.workflowId === "string",
    )
    .filter((request) =>
      input.workflow.childWorkflowRefs?.some(
        (ref) => ref.workflowId === request.workflowId && ref.allowed,
      ),
    )
    .slice(0, 5)
    .map((request) =>
      createChildWorkflowRequest({
        parentWorkflowId: input.workflow.workflowId,
        childWorkflowId: request.workflowId,
        parentRuntimeJobId: input.parentRuntimeJobId,
        requestReason: `child workflow requested by ${input.workflow.workflowId}`,
        requestedInputs: { inheritedObjective: true },
        parentAuthorityProfile: input.authorityProfile,
        childRequestedAuthorityProfile:
          request.workflowId === "single_agent.web_research" ? "outbound_readonly" : "read_only",
        optional: request.requirement !== "mandatory",
      }),
    ) as unknown as JsonValue[];
}

import {
  createChildWorkflowRequest,
  validateChildWorkflowRequest,
  type ChildWorkflowRequest,
} from "../workflows/child-workflow-handoff.ts";
import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import { getWorkflowContract, type WorkflowRegistry } from "../workflows/workflow-registry.ts";
import type { CanonicalChildWorkflowRequest } from "./router-schema.ts";

export const CHILD_WORKFLOW_HANDOFF_COMPILER_VERSION =
  "intent-front-door.child-workflow-handoff-compiler.v1";

export type CompiledChildWorkflowHandoff = {
  artifactKind: "front_door_child_workflow_handoff";
  compilerVersion: typeof CHILD_WORKFLOW_HANDOFF_COMPILER_VERSION;
  parentWorkflowId: string;
  childWorkflowId: string;
  parentRuntimeJobId: string | null;
  requirement: "mandatory" | "optional";
  boundedInputSummary: string;
  parentAuthorityProfile: string;
  childRequestedAuthorityProfile: string;
  validationStatus: "accepted" | "blocked" | "needs_review";
  failureBehavior: "block_parent_success" | "continue_if_optional_allowed" | "needs_review";
  request: ChildWorkflowRequest | null;
  projectionRefs: {
    parentWorkflowRef: string;
    childWorkflowRef: string;
    parentRuntimeJobRef: string | null;
  };
  reasonCodes: string[];
  authorityGranted: false;
  runtimeJobCreated: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ChildWorkflowHandoffCompilerInput = {
  registry: WorkflowRegistry;
  parentWorkflow: ExecutionWorkflowContract;
  request: CanonicalChildWorkflowRequest;
  parentRuntimeJobId?: string | null;
  parentAuthorityProfile: string;
  childStatusOverride?: ExecutionWorkflowContract["status"] | null;
  optionalFailureAllowed?: boolean;
};

const PROHIBITED_CHILD_AUTHORITY_PROFILES = new Set([
  "production_deploy",
  "deploy_production",
  "external_outbound_write",
  "production_model_promotion",
]);

export function compileChildWorkflowHandoff(
  input: ChildWorkflowHandoffCompilerInput,
): CompiledChildWorkflowHandoff {
  const reasonCodes: string[] = [];
  const child = getWorkflowContract(input.registry, input.request.childWorkflowId);
  const parentRef = input.parentWorkflow.childWorkflowRefs?.find(
    (ref) => ref.workflowId === input.request.childWorkflowId,
  );
  if (!input.request.boundedInputSummary.trim()) {
    reasonCodes.push("bounded_child_input_summary_required");
  }
  if (!child) {
    reasonCodes.push("child_workflow_not_registered");
  }
  if (!parentRef?.allowed) {
    reasonCodes.push("child_workflow_not_allowed_by_parent_contract");
  }
  const childStatus = input.childStatusOverride ?? child?.status ?? "disabled";
  if (childStatus !== "enabled") {
    reasonCodes.push(`child_workflow_not_enabled:${childStatus}`);
  }
  const childAuthority =
    input.request.requestedAuthority ?? child?.defaultAuthorityProfile ?? "read_only";
  if (PROHIBITED_CHILD_AUTHORITY_PROFILES.has(childAuthority)) {
    reasonCodes.push("parent_cannot_grant_child_high_risk_authority");
  }
  if (input.request.rawPromptStored || input.request.rawResponseStored) {
    reasonCodes.push("child_request_raw_storage_rejected");
  }

  const parentRuntimeJobId =
    input.parentRuntimeJobId ?? `parent-pending:${input.parentWorkflow.workflowId}`;
  const childRequest =
    reasonCodes.length === 0
      ? createChildWorkflowRequest({
          parentWorkflowId: input.parentWorkflow.workflowId,
          childWorkflowId: input.request.childWorkflowId,
          parentRuntimeJobId,
          requestReason: input.request.reasonCodes[0] ?? "front_door_child_workflow_request",
          requestedInputs: {
            boundedInputSummary: boundText(input.request.boundedInputSummary, 600),
            source: "intent_front_door_child_request",
          },
          parentAuthorityProfile: input.parentAuthorityProfile,
          childRequestedAuthorityProfile: childAuthority,
          optional: input.request.requirement === "optional",
        })
      : null;
  if (childRequest) {
    const validation = validateChildWorkflowRequest({
      registry: input.registry,
      request: childRequest,
    });
    reasonCodes.push(...validation.reasonCodes);
  }

  const validationStatus =
    reasonCodes.length === 0 ? "accepted" : child ? "needs_review" : "blocked";
  const optional = input.request.requirement === "optional";
  const optionalCanContinue = optional && input.optionalFailureAllowed === true;
  const failureBehavior =
    validationStatus === "accepted"
      ? optional
        ? "continue_if_optional_allowed"
        : "block_parent_success"
      : optionalCanContinue
        ? "continue_if_optional_allowed"
        : input.request.requirement === "mandatory"
          ? "block_parent_success"
          : "needs_review";

  return {
    artifactKind: "front_door_child_workflow_handoff",
    compilerVersion: CHILD_WORKFLOW_HANDOFF_COMPILER_VERSION,
    parentWorkflowId: input.parentWorkflow.workflowId,
    childWorkflowId: input.request.childWorkflowId,
    parentRuntimeJobId: input.parentRuntimeJobId ?? null,
    requirement: input.request.requirement,
    boundedInputSummary: boundText(input.request.boundedInputSummary, 600),
    parentAuthorityProfile: input.parentAuthorityProfile,
    childRequestedAuthorityProfile: childAuthority,
    validationStatus,
    failureBehavior,
    request: childRequest,
    projectionRefs: {
      parentWorkflowRef: `workflow://${input.parentWorkflow.workflowId}`,
      childWorkflowRef: `workflow://${input.request.childWorkflowId}`,
      parentRuntimeJobRef: input.parentRuntimeJobId
        ? `runtime-job://${input.parentRuntimeJobId}`
        : null,
    },
    reasonCodes: [...new Set(reasonCodes)].slice(0, 40),
    authorityGranted: false,
    runtimeJobCreated: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

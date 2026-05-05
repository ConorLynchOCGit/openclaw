import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import { getWorkflowContract, type WorkflowRegistry } from "./workflow-registry.ts";

export const childWorkflowRequestSchema = z.object({
  artifactKind: z.literal("execution_child_workflow_request"),
  parentWorkflowId: z.string().min(3).max(120),
  childWorkflowId: z.string().min(3).max(120),
  parentRuntimeJobId: z.string().min(1).max(160),
  childRuntimeJobId: z.string().min(1).max(160).nullable(),
  requestReason: z.string().min(1).max(600),
  requestedInputs: z.record(z.string(), z.unknown()),
  authorityBoundary: z.object({
    parentAuthorityProfile: z.string().min(1).max(120),
    childRequestedAuthorityProfile: z.string().min(1).max(120),
    authorityEscalationAllowed: z.literal(false),
  }),
  requiresApproval: z.boolean(),
  approvalKind: z.string().min(1).max(120).nullable(),
  handoffArtifactRefs: z.array(z.string().min(1).max(300)).max(30),
  childCloseoutRequired: z.literal(true),
  parentResumeBehavior: z.enum(["resume_after_child_closeout", "continue_without_optional_child"]),
  failureBehavior: z.enum([
    "retry_child",
    "continue_if_optional",
    "clarification",
    "needs_review",
    "blocked",
  ]),
  rawPromptStored: z.literal(false),
  rawResponseStored: z.literal(false),
});

export type ChildWorkflowRequest = z.infer<typeof childWorkflowRequestSchema>;

export type ChildWorkflowHandoffValidation = {
  accepted: boolean;
  reasonCodes: string[];
  parentWorkflowExists: boolean;
  childWorkflowExists: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function validateChildWorkflowRequest(input: {
  registry: WorkflowRegistry;
  request: ChildWorkflowRequest;
}): ChildWorkflowHandoffValidation {
  const parsed = childWorkflowRequestSchema.safeParse(input.request);
  const reasonCodes = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `child_handoff_schema_${issue.path.join("_") || "root"}`);
  const parent = getWorkflowContract(input.registry, input.request.parentWorkflowId);
  const child = getWorkflowContract(input.registry, input.request.childWorkflowId);
  if (!parent) {
    reasonCodes.push("parent_workflow_not_registered");
  }
  if (!child) {
    reasonCodes.push("child_workflow_not_registered");
  }
  const childRef = parent?.childWorkflowRefs?.find(
    (ref) => ref.workflowId === input.request.childWorkflowId,
  );
  if (parent && !childRef?.allowed) {
    reasonCodes.push("child_workflow_not_allowed_by_parent_contract");
  }
  if (input.request.authorityBoundary.authorityEscalationAllowed) {
    reasonCodes.push("child_authority_escalation_rejected");
  }
  if (input.request.rawPromptStored || input.request.rawResponseStored) {
    reasonCodes.push("child_handoff_raw_content_storage_rejected");
  }
  if (
    input.request.failureBehavior === "continue_if_optional" &&
    childRef?.requiredByDefault === true
  ) {
    reasonCodes.push("mandatory_child_cannot_continue_as_optional");
  }
  return {
    accepted: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 30),
    parentWorkflowExists: Boolean(parent),
    childWorkflowExists: Boolean(child),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function createChildWorkflowRequest(input: {
  parentWorkflowId: string;
  childWorkflowId: string;
  parentRuntimeJobId: string;
  requestReason: string;
  requestedInputs: JsonValue;
  parentAuthorityProfile: string;
  childRequestedAuthorityProfile: string;
  requiresApproval?: boolean;
  approvalKind?: string | null;
  optional?: boolean;
}): ChildWorkflowRequest {
  return {
    artifactKind: "execution_child_workflow_request",
    parentWorkflowId: input.parentWorkflowId,
    childWorkflowId: input.childWorkflowId,
    parentRuntimeJobId: input.parentRuntimeJobId,
    childRuntimeJobId: null,
    requestReason: input.requestReason,
    requestedInputs: input.requestedInputs as Record<string, unknown>,
    authorityBoundary: {
      parentAuthorityProfile: input.parentAuthorityProfile,
      childRequestedAuthorityProfile: input.childRequestedAuthorityProfile,
      authorityEscalationAllowed: false,
    },
    requiresApproval: input.requiresApproval ?? false,
    approvalKind: input.approvalKind ?? null,
    handoffArtifactRefs: [],
    childCloseoutRequired: true,
    parentResumeBehavior: input.optional
      ? "continue_without_optional_child"
      : "resume_after_child_closeout",
    failureBehavior: input.optional ? "continue_if_optional" : "needs_review",
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

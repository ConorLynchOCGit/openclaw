import { z } from "zod";

export const EXECUTION_WORKFLOW_ROUTES = [
  "chat_only",
  "workflow_execution",
  "work_queue_control",
  "clarification_required",
  "blocked",
] as const;

export type ExecutionWorkflowRoute = (typeof EXECUTION_WORKFLOW_ROUTES)[number];
export type ExecutionWorkflowId = string;
export type WorkflowAuthorityProfileRef = string;
export type WorkflowInputSchemaRef = {
  schemaId: string;
  requiredFields: string[];
};
export type WorkflowOutputSchemaRef = {
  schemaId: string;
};
export type AgentRoleContractRef = {
  roleId: string;
  required: boolean;
  authority: "read_only" | "write" | "review" | "test" | "closeout" | "control";
  modelPolicyRef?: string;
};
export type WorkflowGateRef = {
  gateId: string;
  required: boolean;
};
export type ApprovalGateRef = WorkflowGateRef & {
  approvalKind: string;
};
export type ValidationGateRef = WorkflowGateRef & {
  validationKind: string;
};
export type TransportPolicyRef = {
  transportId: string;
  allowed: boolean;
  fallbackOnly?: boolean;
};
export type WorkQueueProjectionContract = {
  projectionId: string;
  genericFields: string[];
  extensionFields: string[];
  lifecycleMutationAllowed: false;
};
export type CloseoutRequirement = {
  required: true;
  closeoutKind: "work_episode_outcome_pack" | "runtime_artifact";
};
export type ChildWorkflowRef = {
  workflowId: ExecutionWorkflowId;
  allowed: boolean;
  requiredByDefault: boolean;
  requestPolicyRef: string;
};

export const executionWorkflowContractSchema = z.object({
  workflowId: z.string().min(3).max(120),
  displayName: z.string().min(1).max(120),
  description: z.string().min(1).max(1_000),
  jobType: z.string().min(3).max(120),
  status: z.enum(["enabled", "disabled", "shadow", "needs_review"]),
  executorKind: z.enum(["single_agent", "team_agent", "workflow"]),
  intentPatterns: z.object({
    examples: z.array(z.string().min(1).max(300)).min(1).max(20),
    negativeExamples: z.array(z.string().min(1).max(300)).max(20),
    routingHints: z.array(z.string().min(1).max(300)).min(1).max(20),
  }),
  inputSchema: z.object({
    schemaId: z.string().min(1).max(120),
    requiredFields: z.array(z.string().min(1).max(80)).max(50),
  }),
  outputSchema: z
    .object({
      schemaId: z.string().min(1).max(120),
    })
    .optional(),
  defaultAuthorityProfile: z.string().min(1).max(120),
  supportedAuthorityProfiles: z.array(z.string().min(1).max(120)).min(1).max(30),
  roles: z
    .array(
      z.object({
        roleId: z.string().min(1).max(120),
        required: z.boolean(),
        authority: z.enum(["read_only", "write", "review", "test", "closeout", "control"]),
        modelPolicyRef: z.string().min(1).max(120).optional(),
      }),
    )
    .max(50),
  transports: z
    .array(
      z.object({
        transportId: z.string().min(1).max(120),
        allowed: z.boolean(),
        fallbackOnly: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(30),
  preflightGates: z
    .array(z.object({ gateId: z.string().min(1).max(120), required: z.boolean() }))
    .max(50),
  approvalGates: z
    .array(
      z.object({
        gateId: z.string().min(1).max(120),
        required: z.boolean(),
        approvalKind: z.string().min(1).max(120),
      }),
    )
    .max(50),
  validationGates: z
    .array(
      z.object({
        gateId: z.string().min(1).max(120),
        required: z.boolean(),
        validationKind: z.string().min(1).max(120),
      }),
    )
    .max(50),
  childWorkflowRefs: z
    .array(
      z.object({
        workflowId: z.string().min(3).max(120),
        allowed: z.boolean(),
        requiredByDefault: z.boolean(),
        requestPolicyRef: z.string().min(1).max(120),
      }),
    )
    .max(30)
    .optional(),
  closeoutRequirement: z.object({
    required: z.literal(true),
    closeoutKind: z.enum(["work_episode_outcome_pack", "runtime_artifact"]),
  }),
  workQueueProjection: z.object({
    projectionId: z.string().min(1).max(120),
    genericFields: z.array(z.string().min(1).max(120)).min(1).max(80),
    extensionFields: z.array(z.string().min(1).max(120)).max(80),
    lifecycleMutationAllowed: z.literal(false),
  }),
  storagePolicy: z.object({
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
  }),
  productionSideEffectPolicy: z.object({
    productionDeployAllowed: z.literal(false),
    externalOutboundWriteAllowed: z.literal(false),
    productionModelPromotionAllowed: z.literal(false),
  }),
});

export type ExecutionWorkflowContract = z.infer<typeof executionWorkflowContractSchema>;

export type WorkflowContractValidation = {
  valid: boolean;
  reasonCodes: string[];
};

export function validateExecutionWorkflowContract(
  contract: ExecutionWorkflowContract,
): WorkflowContractValidation {
  const parsed = executionWorkflowContractSchema.safeParse(contract);
  const reasonCodes = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `contract_schema_${issue.path.join("_") || "root"}`);
  if (
    !contract.supportedAuthorityProfiles.includes(contract.defaultAuthorityProfile) &&
    !reasonCodes.includes("default_authority_profile_not_supported")
  ) {
    reasonCodes.push("default_authority_profile_not_supported");
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function createWorkflowContractRouterSummary(contract: ExecutionWorkflowContract): {
  workflowId: string;
  displayName: string;
  description: string;
  jobType: string;
  status: ExecutionWorkflowContract["status"];
  executorKind: ExecutionWorkflowContract["executorKind"];
  examples: string[];
  negativeExamples: string[];
  routingHints: string[];
  defaultAuthorityProfile: string;
  supportedAuthorityProfiles: string[];
} {
  return {
    workflowId: contract.workflowId,
    displayName: contract.displayName,
    description: contract.description.slice(0, 1_000),
    jobType: contract.jobType,
    status: contract.status,
    executorKind: contract.executorKind,
    examples: contract.intentPatterns.examples.slice(0, 10),
    negativeExamples: contract.intentPatterns.negativeExamples.slice(0, 10),
    routingHints: contract.intentPatterns.routingHints.slice(0, 10),
    defaultAuthorityProfile: contract.defaultAuthorityProfile,
    supportedAuthorityProfiles: contract.supportedAuthorityProfiles.slice(0, 20),
  };
}

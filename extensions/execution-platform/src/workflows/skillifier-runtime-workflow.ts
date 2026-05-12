import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const SKILLIFIER_WORKFLOW_ID = "workflow.skillifier";
export const SKILLIFIER_RUNTIME_JOB_TYPE = "executor.skillifier";

export const skillifierRuntimeWorkflowContract: ExecutionWorkflowContract = {
  workflowId: SKILLIFIER_WORKFLOW_ID,
  displayName: "Skillifier Runtime",
  description:
    "Turns bounded Closeout Capsule opportunity seeds into reviewed skill candidate or skill edit proposal artifacts through runtime jobs.",
  jobType: SKILLIFIER_RUNTIME_JOB_TYPE,
  status: "enabled",
  executorKind: "workflow",
  intentPatterns: {
    examples: [
      "Review closeout opportunity seeds and create a bounded skill candidate.",
      "Turn this Closeout Capsule skill-edit seed into a reviewed proposal.",
      "Reject duplicate or low-value skill opportunities with model-authored rationale.",
    ],
    negativeExamples: [
      "Directly edit arbitrary source files without a skill boundary.",
      "Install a new dependency.",
      "Deploy the skill change to production.",
      "Mutate Work Queue lifecycle from skill metadata.",
    ],
    routingHints: [
      "Use for Skillifier candidate creation, skill edit proposals, and opportunity review.",
      "Inputs must be bounded refs to Closeout Capsules, opportunity seeds, target skills, and project context.",
      "Model-task middleware owns model-authored usefulness and draft judgment.",
      "DB-operation middleware owns durable candidate/projection write evidence.",
      "Runtime jobs remain lifecycle truth and Work Queue only projects/readbacks state.",
    ],
  },
  inputSchema: {
    schemaId: "workflow_skillifier_runtime_input.v1",
    requiredFields: ["opportunitySeedRefs", "closeoutCapsuleRefs", "requestedOutcome"],
  },
  outputSchema: {
    schemaId: "workflow_skillifier_runtime_result.v1",
  },
  defaultAuthorityProfile: "local_yolo",
  supportedAuthorityProfiles: ["read_only", "local_yolo"],
  roles: [
    {
      roleId: "skillifier_reviewer",
      required: true,
      authority: "review",
      modelPolicyRef: "model-task.skillifier.structured-json",
    },
    {
      roleId: "skill_candidate_writer",
      required: true,
      authority: "write",
      modelPolicyRef: "model-task.skillifier.structured-json",
    },
    {
      roleId: "observability_scribe",
      required: true,
      authority: "closeout",
    },
  ],
  transports: [
    { transportId: "model_task_middleware", allowed: true },
    { transportId: "db_operation_middleware", allowed: true },
    { transportId: "runtime_worker_supervisor", allowed: true },
  ],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "bounded_closeout_seed_refs_available", required: true },
    { gateId: "skill_boundary_validated", required: true },
  ],
  approvalGates: [
    {
      gateId: "skill_file_apply_review_gate",
      required: false,
      approvalKind: "skill_file_apply",
    },
  ],
  validationGates: [
    {
      gateId: "skill_candidate_schema_validation",
      required: true,
      validationKind: "skillifier_candidate_schema",
    },
    {
      gateId: "model_authored_quality_review",
      required: true,
      validationKind: "model_authored_skill_candidate_review",
    },
  ],
  permissionModel: {
    permissionModelId: "skillifier-runtime.permission.v1",
    summary:
      "Skillifier can create bounded candidate/edit proposal artifacts and Work Queue readback refs; it cannot grant authority, deploy, send, promote models, mutate lifecycle, or invisibly edit skills.",
    allowedLocalActionKinds: [
      "read_bounded_closeout_refs",
      "create_skill_candidate_artifact",
      "create_skill_edit_proposal_artifact",
      "record_model_task_ref",
      "record_db_operation_ref",
      "record_closeout_ref",
    ],
    approvalRequiredActionKinds: ["apply_skill_file_change"],
    blockedActionKinds: [
      "deploy",
      "outbound_send",
      "model_promotion",
      "dependency_install",
      "work_queue_lifecycle_mutation",
      "authority_grant",
      "raw_prompt_or_response_storage",
    ],
  },
  closeoutRequirement: {
    required: true,
    closeoutKind: "work_episode_outcome_pack",
  },
  workQueueProjection: {
    projectionId: "workflow_skillifier_work_queue_projection.v1",
    genericFields: [
      "route",
      "workflowId",
      "workflowDisplayName",
      "jobType",
      "runtimeJobId",
      "authorityProfile",
      "approvalState",
      "workflowStatus",
      "validationState",
      "reviewState",
      "closeoutState",
      "blockerReasonCodes",
    ],
    extensionFields: [
      "skillifierRuntimeJobId",
      "opportunitySeedRef",
      "closeoutCapsuleRef",
      "candidateType",
      "targetSkillRef",
      "modelTaskRefs",
      "dbOperationRefs",
      "skillCandidateRefs",
      "candidateReviewState",
      "candidateApplyState",
      "eli5Progress",
    ],
    lifecycleMutationAllowed: false,
  },
  storagePolicy: {
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
  },
  productionSideEffectPolicy: {
    productionDeployAllowed: false,
    externalOutboundWriteAllowed: false,
    productionModelPromotionAllowed: false,
  },
};

export type SkillifierRuntimeWorkflowPayload = {
  workflowId: typeof SKILLIFIER_WORKFLOW_ID;
  opportunitySeedRefs: string[];
  closeoutCapsuleRefs: string[];
  sourceArtifactRefs: string[];
  targetSkillRefs: string[];
  requestedOutcome:
    | "create_candidate"
    | "edit_candidate"
    | "review_candidate"
    | "reject"
    | "needs_review";
  ownerConstraintRefs: string[];
  modelPolicyRefs: string[];
  workerPolicyRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

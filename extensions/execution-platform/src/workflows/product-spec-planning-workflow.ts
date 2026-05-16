import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const PRODUCT_SPEC_PLANNING_WORKFLOW_ID = "agent_team.product_spec_planning";

export const productSpecPlanningWorkflowContract: ExecutionWorkflowContract = {
  workflowId: PRODUCT_SPEC_PLANNING_WORKFLOW_ID,
  displayName: "Product And Spec Planning",
  description:
    "Routes bounded product/spec planning requests to a planning workflow that can produce plan-only outputs or child action graph proposals without executing them automatically.",
  jobType: "executor.workflow",
  status: "enabled",
  executorKind: "workflow",
  intentPatterns: {
    examples: [
      "Turn this product idea into a spec and child action graph proposal.",
      "Plan the owner-facing workflow for this feature before implementation.",
      "Create a product/spec planning output with proposed follow-up actions.",
    ],
    negativeExamples: [
      "Make the code edits now.",
      "Deploy this feature.",
      "Send this externally.",
      "Promote this model.",
    ],
    routingHints: [
      "Use for product planning, product/spec planning, feature-slice design, and implementation-plan proposals.",
      "Use plan_only when the owner asks for a plan or spec without execution.",
      "Use child_action_graph_proposal when the owner asks for proposed follow-up action items.",
      "Does not execute child proposals without a separate compile/approval boundary.",
    ],
  },
  inputSchema: {
    schemaId: "agent_team_product_spec_planning_input.v1",
    requiredFields: ["objectiveSummary"],
  },
  outputSchema: {
    schemaId: "agent_team_product_spec_planning_result.v1",
  },
  defaultAuthorityProfile: "read_only",
  supportedAuthorityProfiles: ["read_only"],
  roles: [
    {
      roleId: "planner",
      required: true,
      authority: "read_only",
      modelPolicyRef: "model-policy://product-spec-planning/planner-gpt-5.5",
    },
    { roleId: "reviewer", required: true, authority: "review" },
    { roleId: "observability_scribe", required: true, authority: "closeout" },
  ],
  transports: [
    { transportId: "codex_app_server", allowed: true },
    { transportId: "openrouter_model_lane", allowed: true, fallbackOnly: true },
  ],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "bounded_planning_scope", required: true },
  ],
  approvalGates: [
    {
      gateId: "child_action_compile_approval",
      required: false,
      approvalKind: "child_action_graph_compile",
    },
  ],
  validationGates: [
    { gateId: "planning_contract_validation", required: true, validationKind: "schema" },
    { gateId: "proposal_boundary_review", required: true, validationKind: "no_auto_execution" },
  ],
  childWorkflowRefs: [
    {
      workflowId: "agent_team.coding",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "product-spec-coding-followup-proposal.v1",
    },
    {
      workflowId: "single_agent.web_research",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "product-spec-research-followup-proposal.v1",
    },
    {
      workflowId: "workflow.docs_skills",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "product-spec-docs-skills-followup-proposal.v1",
    },
  ],
  permissionModel: {
    permissionModelId: "permission-model://agent_team.product_spec_planning/read-only.v1",
    summary:
      "Product/Spec Planning can create bounded plan/proposal artifacts and Work Queue readback refs, but cannot execute child actions, grant authority, deploy, send outbound messages, or mutate lifecycle directly.",
    allowedLocalActionKinds: ["plan", "review", "propose_child_actions", "closeout"],
    approvalRequiredActionKinds: ["compile_child_action_graph", "create_runtime_jobs"],
    blockedActionKinds: ["deploy", "outbound_send", "model_promotion", "authority_grant"],
  },
  closeoutRequirement: {
    required: true,
    closeoutKind: "runtime_artifact",
  },
  workQueueProjection: {
    projectionId: "agent_team_product_spec_planning_work_queue_projection.v1",
    genericFields: [
      "route",
      "workflowId",
      "workflowDisplayName",
      "jobType",
      "runtimeJobId",
      "authorityProfile",
      "workflowStatus",
      "validationState",
      "reviewState",
      "closeoutState",
      "blockerReasonCodes",
    ],
    extensionFields: [
      "planningMode",
      "planningOutputKind",
      "planningWorkflowRefs",
      "childActionProposalRefs",
      "humanDecisionRefs",
      "validationRefs",
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

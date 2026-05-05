import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const ARCHITECTURE_WORKFLOW_ID = "agent_team.architecture";

export const architectureWorkflowContract: ExecutionWorkflowContract = {
  workflowId: ARCHITECTURE_WORKFLOW_ID,
  displayName: "Architecture And Spec Team",
  description:
    "Routes bounded architecture, planning, and technical-spec requests to a spec-writing team that can request web research through child workflow handoff.",
  jobType: "executor.agent_team",
  status: "enabled",
  executorKind: "team_agent",
  intentPatterns: {
    examples: [
      "Plan the architecture for a new skill execution workflow and research current docs if needed.",
      "Write a technical spec for adding workflow contracts.",
      "Have the architect design the execution pathway for this feature.",
      "Create an implementation plan before coding starts.",
    ],
    negativeExamples: [
      "Make this code edit now.",
      "Deploy this to production.",
      "Cancel runtime job abc.",
      "Research current pricing without planning output.",
    ],
    routingHints: [
      "Use for planning, architecture, technical specifications, and implementation plans.",
      "Can request single_agent.web_research when current external facts are needed.",
      "Produces bounded spec/plan artifacts and does not write code directly.",
      "Route follow-on code edits through agent_team.coding.",
    ],
  },
  inputSchema: {
    schemaId: "agent_team_architecture_input.v1",
    requiredFields: ["objectiveSummary"],
  },
  outputSchema: {
    schemaId: "agent_team_architecture_result.v1",
  },
  defaultAuthorityProfile: "read_only",
  supportedAuthorityProfiles: ["read_only", "local_yolo"],
  roles: [
    { roleId: "orchestrator", required: true, authority: "control" },
    { roleId: "technical_spec_writer", required: true, authority: "read_only" },
    { roleId: "reviewer", required: true, authority: "review" },
    { roleId: "observability_scribe", required: true, authority: "closeout" },
  ],
  transports: [
    { transportId: "local_codex", allowed: true },
    { transportId: "openrouter_model_lane", allowed: true, fallbackOnly: true },
  ],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "bounded_spec_scope", required: true },
  ],
  approvalGates: [],
  validationGates: [
    { gateId: "spec_review", required: true, validationKind: "technical_spec_review" },
    { gateId: "research_handoff_review", required: false, validationKind: "child_workflow_review" },
  ],
  childWorkflowRefs: [
    {
      workflowId: "single_agent.web_research",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "research-routing-policy.v1",
    },
    {
      workflowId: "agent_team.coding",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "coding-followup-handoff.v1",
    },
  ],
  closeoutRequirement: {
    required: true,
    closeoutKind: "runtime_artifact",
  },
  workQueueProjection: {
    projectionId: "agent_team_architecture_work_queue_projection.v1",
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
      "specArtifactRefs",
      "childWorkflowRefs",
      "researchRequirement",
      "handoffState",
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

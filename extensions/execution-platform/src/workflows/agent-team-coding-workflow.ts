import { AGENT_TEAM_JOB_TYPE } from "../codex-bridge/agent-team-runtime-evidence.ts";
import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const AGENT_TEAM_CODING_WORKFLOW_ID = "agent_team.coding";

export const agentTeamCodingWorkflowContract: ExecutionWorkflowContract = {
  workflowId: AGENT_TEAM_CODING_WORKFLOW_ID,
  displayName: "Coding Agent Team",
  description:
    "Routes bounded natural-language coding, test, review, docs, and closeout requests to the Execution Platform agent-team runner.",
  jobType: AGENT_TEAM_JOB_TYPE,
  status: "enabled",
  executorKind: "team_agent",
  intentPatterns: {
    examples: [
      "Have the coding team fix the failing Work Queue read-model test and close it out.",
      "Use the team to add tests for the execution router.",
      "Run the agent team on this small docs update.",
      "Make a small code change and close it out.",
    ],
    negativeExamples: [
      "What is the current status?",
      "Cancel runtime job abc.",
      "Deploy this to production.",
      "Research current pricing without code changes.",
    ],
    routingHints: [
      "Use for bounded code, test, docs, review, or refactor work.",
      "Require context scout before implementation.",
      "Use one write-authority lane at a time.",
      "Use V4 Pro only for test_engineer.",
    ],
  },
  inputSchema: {
    schemaId: "agent_team_coding_input.v1",
    requiredFields: ["objectiveSummary"],
  },
  outputSchema: {
    schemaId: "agent_team_coding_result.v1",
  },
  defaultAuthorityProfile: "local_yolo",
  supportedAuthorityProfiles: [
    "read_only",
    "local_yolo",
    "rebuild",
    "install_dependency",
    "outbound_readonly",
    "deploy_dry_run",
    "model_promotion_dry_run",
  ],
  roles: [
    { roleId: "orchestrator", required: true, authority: "control" },
    { roleId: "context_scout", required: true, authority: "read_only" },
    { roleId: "implementation_engineer", required: true, authority: "write" },
    {
      roleId: "test_engineer",
      required: true,
      authority: "test",
      modelPolicyRef: "deepseek-v4-pro-test-engineer-only",
    },
    { roleId: "security_privacy_reviewer", required: false, authority: "review" },
    { roleId: "result_reviewer", required: true, authority: "review" },
    { roleId: "observability_scribe", required: true, authority: "closeout" },
  ],
  transports: [
    { transportId: "local_codex", allowed: true },
    { transportId: "openrouter_model_lane", allowed: true },
    { transportId: "acp_endpoint", allowed: true, fallbackOnly: true },
  ],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "context_scout_before_write", required: true },
    { gateId: "model_roster_enforced", required: true },
  ],
  approvalGates: [
    { gateId: "install_dependency_approval", required: true, approvalKind: "install_dependency" },
    { gateId: "outbound_approval", required: true, approvalKind: "outbound_readonly" },
    { gateId: "deploy_dry_run_approval", required: true, approvalKind: "deploy_dry_run" },
    {
      gateId: "model_promotion_dry_run_approval",
      required: true,
      approvalKind: "model_promotion_dry_run",
    },
  ],
  validationGates: [
    { gateId: "focused_validation", required: true, validationKind: "focused_tests" },
    { gateId: "security_review", required: true, validationKind: "security_privacy_review" },
    { gateId: "result_review", required: true, validationKind: "qualitative_result_review" },
  ],
  childWorkflowRefs: [
    {
      workflowId: "single_agent.web_research",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "research-routing-policy.v1",
    },
  ],
  closeoutRequirement: {
    required: true,
    closeoutKind: "work_episode_outcome_pack",
  },
  workQueueProjection: {
    projectionId: "agent_team_coding_work_queue_projection.v1",
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
      "agentTeamRunId",
      "activeRole",
      "completedRoles",
      "pendingRoles",
      "handoffState",
      "modelReadiness",
      "securityReviewState",
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

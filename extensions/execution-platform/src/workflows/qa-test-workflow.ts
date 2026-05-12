import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const QA_TEST_WORKFLOW_ID = "agent_team.qa_test";

export const qaTestWorkflowContract: ExecutionWorkflowContract = {
  workflowId: QA_TEST_WORKFLOW_ID,
  displayName: "QA And Test Review Team",
  description:
    "Routes bounded quality-assurance, regression-test, validation, and review requests to a test-focused team without production side effects.",
  jobType: "executor.agent_team",
  status: "enabled",
  executorKind: "team_agent",
  intentPatterns: {
    examples: [
      "Review the new Work Queue tests and identify missing regression coverage.",
      "Run focused validation for this workflow and summarize failures.",
      "Have QA verify the prompt-router negative cases.",
      "Create a test plan for the coding-team closeout surface.",
    ],
    negativeExamples: [
      "Deploy this to production.",
      "Send the release note externally.",
      "Promote this model.",
      "Cancel runtime job abc.",
    ],
    routingHints: [
      "Use for bounded QA, regression-test review, validation planning, and failure triage.",
      "May request agent_team.coding only for follow-up implementation handoff.",
      "Does not own Work Queue lifecycle.",
      "Does not deploy, send outbound messages, install dependencies, or promote models.",
    ],
  },
  inputSchema: {
    schemaId: "agent_team_qa_test_input.v1",
    requiredFields: ["objectiveSummary"],
  },
  outputSchema: {
    schemaId: "agent_team_qa_test_result.v1",
  },
  defaultAuthorityProfile: "local_yolo",
  supportedAuthorityProfiles: ["read_only", "local_yolo"],
  roles: [
    { roleId: "qa_test_reviewer", required: true, authority: "test" },
    { roleId: "failure_triage_reviewer", required: true, authority: "review" },
    { roleId: "observability_scribe", required: true, authority: "closeout" },
  ],
  transports: [{ transportId: "local_codex", allowed: true }],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "bounded_validation_scope", required: true },
  ],
  approvalGates: [],
  validationGates: [
    { gateId: "test_plan_review", required: true, validationKind: "qa_test_review" },
    { gateId: "no_false_success_review", required: true, validationKind: "closeout_review" },
  ],
  childWorkflowRefs: [
    {
      workflowId: "agent_team.coding",
      allowed: true,
      requiredByDefault: false,
      requestPolicyRef: "qa-followup-coding-handoff.v1",
    },
  ],
  closeoutRequirement: {
    required: true,
    closeoutKind: "runtime_artifact",
  },
  workQueueProjection: {
    projectionId: "agent_team_qa_test_work_queue_projection.v1",
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
      "testPlanRefs",
      "validationRunRefs",
      "failureTriageRefs",
      "followupWorkflowRefs",
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

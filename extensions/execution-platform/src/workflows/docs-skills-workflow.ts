import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const DOCS_SKILLS_WORKFLOW_ID = "workflow.docs_skills";

export const docsSkillsWorkflowContract: ExecutionWorkflowContract = {
  workflowId: DOCS_SKILLS_WORKFLOW_ID,
  displayName: "Docs And Skills Workflow",
  description:
    "Routes bounded documentation, runbook, skill, and role-doc updates through a generic workflow contract.",
  jobType: "executor.workflow",
  status: "enabled",
  executorKind: "workflow",
  intentPatterns: {
    examples: [
      "Update the execution-platform runbook.",
      "Document this workflow-contract decision.",
      "Revise the docs/skills writer role guidance.",
      "Add a bounded skill note for safe bridge validation.",
    ],
    negativeExamples: [
      "Make a broad code refactor.",
      "Deploy this to production.",
      "Research current pricing only.",
      "Cancel runtime job abc.",
    ],
    routingHints: [
      "Use for bounded docs, runbook, skill, and role-documentation work.",
      "Can request single_agent.web_research when current external documentation is needed.",
      "Does not own Work Queue lifecycle.",
      "Requires closeout and artifact refs.",
    ],
  },
  inputSchema: {
    schemaId: "workflow_docs_skills_input.v1",
    requiredFields: ["objectiveSummary"],
  },
  outputSchema: {
    schemaId: "workflow_docs_skills_result.v1",
  },
  defaultAuthorityProfile: "local_yolo",
  supportedAuthorityProfiles: ["read_only", "local_yolo"],
  roles: [
    { roleId: "docs_skills_writer", required: true, authority: "write" },
    { roleId: "reviewer", required: true, authority: "review" },
    { roleId: "observability_scribe", required: true, authority: "closeout" },
  ],
  transports: [{ transportId: "local_codex", allowed: true }],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "docs_scope_bounded", required: true },
  ],
  approvalGates: [],
  validationGates: [
    { gateId: "docs_diff_check", required: true, validationKind: "docs_diff_review" },
    { gateId: "format_check", required: true, validationKind: "format_check" },
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
    projectionId: "workflow_docs_skills_work_queue_projection.v1",
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
    extensionFields: ["docsPaths", "skillRefs", "childWorkflowRefs", "docsDiffState"],
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

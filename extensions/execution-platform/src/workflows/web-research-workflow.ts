import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const WEB_RESEARCH_WORKFLOW_ID = "single_agent.web_research";

export const webResearchWorkflowContract: ExecutionWorkflowContract = {
  workflowId: WEB_RESEARCH_WORKFLOW_ID,
  displayName: "Web Research Agent",
  description:
    "Routes bounded, read-only, citation-backed research requests through the approved Execution Platform research workflow.",
  jobType: "executor.single_agent",
  status: "enabled",
  executorKind: "single_agent",
  intentPatterns: {
    examples: [
      "Research current Supabase pricing.",
      "Look up current OpenAI API docs for structured outputs.",
      "Find current browser support for this API.",
      "Verify the latest provider model availability before planning.",
    ],
    negativeExamples: [
      "Deploy this.",
      "Send this email.",
      "Scrape and store this full website.",
      "Buy this product.",
    ],
    routingHints: [
      "Use for bounded current-fact research with citations.",
      "Use when the user asks to research, search, browse, verify, or look up current information.",
      "Store source refs, hashes, bounded summaries, and retrieval timestamps only.",
      "Do not store raw pages, raw prompts, raw responses, transcripts, or secrets.",
    ],
  },
  inputSchema: {
    schemaId: "single_agent_web_research_input.v1",
    requiredFields: ["objectiveSummary", "querySummary"],
  },
  outputSchema: {
    schemaId: "single_agent_web_research_result.v1",
  },
  defaultAuthorityProfile: "outbound_readonly",
  supportedAuthorityProfiles: ["read_only", "outbound_readonly"],
  roles: [{ roleId: "web_researcher", required: true, authority: "read_only" }],
  transports: [
    { transportId: "web_research_runtime", allowed: true },
    { transportId: "local_codex", allowed: true, fallbackOnly: true },
  ],
  preflightGates: [
    { gateId: "runtime_truth_available", required: true },
    { gateId: "source_scope_bounded", required: true },
    { gateId: "raw_page_storage_blocked", required: true },
  ],
  approvalGates: [
    { gateId: "outbound_readonly_authority", required: true, approvalKind: "outbound_readonly" },
  ],
  validationGates: [
    { gateId: "citation_refs_present", required: true, validationKind: "citation_review" },
    { gateId: "bounded_summary_present", required: true, validationKind: "bounded_summary_review" },
  ],
  childWorkflowRefs: [],
  closeoutRequirement: {
    required: true,
    closeoutKind: "runtime_artifact",
  },
  workQueueProjection: {
    projectionId: "single_agent_web_research_work_queue_projection.v1",
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
      "querySummary",
      "sourceCount",
      "citationRefs",
      "confidence",
      "freshnessRequirements",
      "researchBlockerReasonCodes",
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

import { describe, expect, it } from "vitest";
import {
  evaluateWorkflowEvidenceProfile,
  listWorkflowEvidenceProfiles,
  validateActionGraphProposal,
  validateCompileReadinessValidation,
  validateHumanPlanningDecision,
  validateResearchBrief,
  validateWorkflowPlanningCapsuleEvidence,
  workflowEvidenceProfileForWorkflow,
} from "./workflow-evidence-profile.ts";

const safety = {
  rawPromptStored: false as const,
  rawResponseStored: false as const,
  rawLogsStored: false as const,
};

describe("workflow evidence profiles", () => {
  it("requires coding-team workflow evidence before clean success", () => {
    const accepted = evaluateWorkflowEvidenceProfile({
      workflowId: "agent_team.coding",
      runtimeJobId: "coding-job",
      workItemId: "coding-work-item",
      closeoutSource: "model",
      evidenceClassRefs: {
        runtime_graph: ["runtime-graph://graph-1"],
        scheduler_tool_trace: ["runtime-tool://scheduler.select_next_node/invocation-1"],
        worker_tool_trace: ["runtime-tool://worker.invoke/invocation-1"],
        source_change: ["repo://extensions/execution-platform/src/example.ts#sha256:abc"],
        validation: ["validation://pnpm-test-file"],
        review: ["review://reviewer/model-run-1"],
        closeout: ["closeout://capsule-1"],
        work_queue_readback: ["work-queue://coding-work-item/readback"],
      },
      ...safety,
    });

    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedEvidenceClasses).toEqual(
      expect.arrayContaining(["source_change", "validation", "review", "closeout"]),
    );
  });

  it("rejects generic workflow fallback as clean success even with model closeout", () => {
    const rejected = evaluateWorkflowEvidenceProfile({
      workflowId: "workflow.unknown",
      runtimeJobId: "generic-job",
      closeoutSource: "model",
      evidenceClassRefs: {
        closeout: ["closeout://capsule-1"],
        work_queue_readback: ["work-queue://generic/readback"],
      },
      ...safety,
    });

    expect(rejected.status).toBe("needs_review");
    expect(rejected.reasonCodes).toContain("workflow_profile_clean_success_not_allowed");
  });

  it("rejects degraded or missing closeout for profile-gated workflows", () => {
    const rejected = evaluateWorkflowEvidenceProfile({
      workflowId: "agent_team.coding",
      runtimeJobId: "coding-job",
      closeoutSource: "degraded_system_fallback",
      evidenceClassRefs: {
        runtime_graph: ["runtime-graph://graph-1"],
        scheduler_tool_trace: ["runtime-tool://scheduler.select_next_node/invocation-1"],
        worker_tool_trace: ["runtime-tool://worker.invoke/invocation-1"],
        source_change: ["repo://extensions/execution-platform/src/example.ts#sha256:abc"],
        validation: ["validation://pnpm-test-file"],
        review: ["review://reviewer/model-run-1"],
        closeout: ["closeout://capsule-1"],
        work_queue_readback: ["work-queue://coding-work-item/readback"],
      },
      ...safety,
    });

    expect(rejected.status).toBe("needs_review");
    expect(rejected.reasonCodes).toContain("model_authored_closeout_required_before_success");
  });

  it("fails raw-storage claims instead of accepting profile evidence", () => {
    const rejected = evaluateWorkflowEvidenceProfile({
      workflowId: "agent_team.coding",
      runtimeJobId: "coding-job",
      closeoutSource: "model",
      evidenceClassRefs: {},
      rawPromptStored: true as false,
      rawResponseStored: false,
      rawLogsStored: false,
    });

    expect(rejected.status).toBe("failed");
    expect(rejected.reasonCodes).toContain("workflow_evidence_profile_raw_storage_rejected");
  });

  it("keeps workflow profiles canonical and bounded", () => {
    const profiles = listWorkflowEvidenceProfiles();
    expect(profiles.map((profile) => profile.workflowId)).toEqual(
      expect.arrayContaining([
        "agent_team.coding",
        "agent_team.product_spec_planning",
        "single_agent.web_research",
        "workflow.web_research",
        "workflow.docs_skills",
        "workflow.qa_test",
        "workflow.architecture",
        "workflow.design",
        "workflow.marketing",
      ]),
    );
    expect(
      workflowEvidenceProfileForWorkflow("single_agent.web_research").cleanSuccessAllowed,
    ).toBe(true);
    expect(workflowEvidenceProfileForWorkflow("unknown.workflow").cleanSuccessAllowed).toBe(false);
  });

  it("validates product/spec planning artifact contracts without raw storage", () => {
    expect(
      validateResearchBrief({
        artifactKind: "research_brief",
        briefId: "brief-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "model",
        lifecycle: "accepted",
        validationState: "valid",
        topicRef: "topic://product-spec",
        findingRefs: ["research://finding-1"],
        limitationRefs: [],
        revisionRef: null,
        supersededByBriefId: null,
        ...safety,
      }),
    ).toMatchObject({ valid: true });

    expect(
      validateWorkflowPlanningCapsuleEvidence({
        artifactKind: "planning_capsule",
        capsuleId: "capsule-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "model",
        lifecycle: "accepted",
        validationState: "valid",
        planRefs: ["planning://capsule/plan"],
        dependencyRefs: ["runtime-work-graph://graph/edge-1"],
        limitationRefs: [],
        revisionRef: null,
        supersededByCapsuleId: null,
        ...safety,
      }),
    ).toMatchObject({ valid: true });

    expect(
      validateHumanPlanningDecision({
        artifactKind: "human_decision",
        decisionId: "decision-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "human",
        lifecycle: "paused",
        validationState: "pending",
        decisionPromptRef: "human-task://decision-1/prompt",
        boundedOptionsRef: "human-task://decision-1/options",
        pauseRef: "human-task://decision-1/pause",
        resumeRef: null,
        decisionRationaleRef: null,
        rawOwnerResponseStored: false,
        revisionRef: null,
        supersededByDecisionId: null,
        ...safety,
      }),
    ).toMatchObject({ valid: true });

    expect(
      validateActionGraphProposal({
        artifactKind: "action_graph_proposal",
        proposalId: "proposal-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "model",
        lifecycle: "submitted",
        validationState: "pending",
        compileReadinessRef: "compile-readiness://proposal-1",
        childExecutionAutoStart: false,
        nodeProposalRefs: ["runtime-work-graph://graph/node-1"],
        edgeProposalRefs: [],
        limitationRefs: [],
        revisionRef: null,
        supersededByProposalId: null,
        ...safety,
      }),
    ).toMatchObject({ valid: true });

    expect(
      validateCompileReadinessValidation({
        artifactKind: "compile_readiness",
        validationId: "compile-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "runtime",
        lifecycle: "failed",
        validationState: "invalid",
        proposalRef: "action-graph-proposal://proposal-1",
        valid: false,
        invalidReasons: ["missing_edge_bindings"],
        checkedNodeRefs: ["runtime-work-graph://graph/node-1"],
        checkedEdgeRefs: [],
        limitationRefs: [],
        revisionRef: null,
        supersededByValidationId: null,
        ...safety,
      }),
    ).toMatchObject({ valid: true });
  });

  it("rejects raw storage, unsafe human decision storage, and auto-start action proposals", () => {
    expect(
      validateResearchBrief({
        artifactKind: "research_brief",
        briefId: "brief-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "model",
        lifecycle: "accepted",
        validationState: "valid",
        topicRef: "topic://product-spec",
        findingRefs: [],
        limitationRefs: [],
        revisionRef: null,
        supersededByBriefId: null,
        rawPromptStored: true,
        rawResponseStored: false,
        rawLogsStored: false,
      }),
    ).toMatchObject({
      valid: false,
      reasonCodes: expect.arrayContaining(["research_brief_raw_prompt_storage_forbidden"]),
    });

    expect(
      validateHumanPlanningDecision({
        artifactKind: "human_decision",
        decisionId: "decision-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "human",
        lifecycle: "resumed",
        validationState: "valid",
        decisionPromptRef: "human-task://decision-1/prompt",
        boundedOptionsRef: "human-task://decision-1/options",
        pauseRef: "human-task://decision-1/pause",
        resumeRef: "human-task://decision-1/resume",
        decisionRationaleRef: null,
        rawOwnerResponseStored: true,
        revisionRef: null,
        supersededByDecisionId: null,
        ...safety,
      }),
    ).toMatchObject({
      valid: false,
      reasonCodes: expect.arrayContaining([
        "human_planning_decision_raw_owner_response_storage_forbidden",
      ]),
    });

    expect(
      validateActionGraphProposal({
        artifactKind: "action_graph_proposal",
        proposalId: "proposal-1",
        workflowId: "agent_team.product_spec_planning",
        runtimeJobId: "job-1",
        authority: "model",
        lifecycle: "submitted",
        validationState: "pending",
        compileReadinessRef: "compile-readiness://proposal-1",
        childExecutionAutoStart: true,
        nodeProposalRefs: ["runtime-work-graph://graph/node-1"],
        edgeProposalRefs: [],
        limitationRefs: [],
        revisionRef: null,
        supersededByProposalId: null,
        ...safety,
      }),
    ).toMatchObject({
      valid: false,
      reasonCodes: expect.arrayContaining([
        "action_graph_proposal_child_execution_auto_start_must_be_false",
      ]),
    });
  });
});

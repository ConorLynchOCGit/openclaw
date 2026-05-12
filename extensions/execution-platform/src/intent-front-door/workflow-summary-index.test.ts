import { describe, expect, it } from "vitest";
import { agentTeamCodingWorkflowContract } from "../workflows/agent-team-coding-workflow.ts";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import {
  WORKFLOW_SUMMARY_DEFAULT_MAX_TOTAL_CHARS,
  buildWorkflowSummaryIndex,
  computeWorkflowRegistryVersion,
  createWorkflowSummaryIndexEntry,
  selectWorkflowSummaryCandidates,
} from "./workflow-summary-index.ts";

describe("WorkflowSummaryIndex", () => {
  it("returns bounded summaries for the registered workflow contracts", () => {
    const index = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
      generatedAt: "2026-05-05T00:00:00.000Z",
    });

    expect(index.artifactKind).toBe("workflow_summary_index");
    expect(index.summaries.length).toBeGreaterThanOrEqual(4);
    expect(index.workflowRegistryVersion).toMatch(/^workflow-registry:/u);
    expect(index.rawPromptStored).toBe(false);
    expect(index.rawResponseStored).toBe(false);
    expect(index.workQueueLifecycleMutationAllowed).toBe(false);

    for (const summary of index.summaries) {
      expect(summary.descriptionSummary.length).toBeLessThanOrEqual(360);
      expect(summary.positiveExamples.length).toBeLessThanOrEqual(4);
      expect(summary.negativeExamples.length).toBeLessThanOrEqual(4);
      expect(summary.workQueueProjectionSummary.lifecycleMutationAllowed).toBe(false);
      expect(summary.rawStoragePolicy).toEqual({
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
      });
    }
  });

  it("summarizes coding workflow boundaries without granting route authority", () => {
    const entry = createWorkflowSummaryIndexEntry(agentTeamCodingWorkflowContract);

    expect(entry.workflowId).toBe("agent_team.coding");
    expect(entry.jobType).toBe("executor.agent_team");
    expect(entry.executorKind).toBe("team_agent");
    expect(entry.supportedAuthorityProfiles).toContain("local_yolo");
    expect(entry.modelTransportPolicyRefs.roleModelPolicyRefs).toContain(
      "deepseek-v4-pro-test-engineer-only",
    );
    expect(entry.childWorkflowSupportSummary.childWorkflowIds).toContain(
      "single_agent.web_research",
    );
    expect(entry.workQueueProjectionSummary.lifecycleMutationAllowed).toBe(false);
  });

  it("includes the registered non-coding workflows when present", () => {
    const ids = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY).summaries.map(
      (summary) => summary.workflowId,
    );

    expect(ids).toContain("single_agent.web_research");
    expect(ids).toContain("agent_team.architecture");
    expect(ids).toContain("workflow.docs_skills");
  });

  it("marks disabled workflows and does not treat them as executable candidates by default", () => {
    const disabled = {
      ...agentTeamCodingWorkflowContract,
      workflowId: "agent_team.disabled_fixture",
      status: "disabled" as const,
    };
    const index = buildWorkflowSummaryIndex({
      artifactKind: "execution_workflow_registry",
      workflows: [disabled, agentTeamCodingWorkflowContract],
    });

    const disabledSummary = index.summaries.find(
      (summary) => summary.workflowId === "agent_team.disabled_fixture",
    );
    expect(disabledSummary).toMatchObject({ status: "disabled", executable: false });

    const selection = selectWorkflowSummaryCandidates({ index });
    expect(selection.candidates.map((candidate) => candidate.workflowId)).not.toContain(
      "agent_team.disabled_fixture",
    );
  });

  it("caps candidate count and serialized size", () => {
    const index = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);

    expect(selectWorkflowSummaryCandidates({ index, maxCandidates: 1 }).candidates).toHaveLength(1);
    const sizeBounded = selectWorkflowSummaryCandidates({
      index,
      maxTotalChars: Math.min(1_000, WORKFLOW_SUMMARY_DEFAULT_MAX_TOTAL_CHARS),
    });
    expect(sizeBounded.reasonCodes).toContain("candidate_selection_metadata_only");
    expect(sizeBounded.candidates.length).toBeLessThanOrEqual(index.summaries.length);
  });

  it("changes version when workflow set or summary version inputs change", () => {
    const coding = createWorkflowSummaryIndexEntry(agentTeamCodingWorkflowContract);
    const version = computeWorkflowRegistryVersion([coding]);
    const changedVersion = computeWorkflowRegistryVersion([
      { ...coding, workflowId: "agent_team.coding_changed" },
    ]);

    expect(version).not.toBe(changedVersion);
  });

  it("does not expose raw content or decide the final route", () => {
    const index = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const selection = selectWorkflowSummaryCandidates({
      index,
      explicitWorkflowIds: ["agent_team.coding"],
    });
    const serialized = JSON.stringify(selection);

    expect(serialized).not.toContain("secretValue");
    expect(serialized).not.toContain("internal instructions");
    expect(selection.finalRouteDecisionMade).toBe(false);
    expect(selection.authorityGranted).toBe(false);
    expect(selection.runtimeJobCreated).toBe(false);
    expect(selection.workQueueLifecycleMutationAllowed).toBe(false);
  });
});

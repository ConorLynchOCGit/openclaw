import { describe, expect, it } from "vitest";
import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import { projectCloseoutCapsuleOpportunitySeedsViaDbOperation } from "./proactivity-work-queue.ts";

function capsule(): CloseoutCapsule {
  return {
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: "execution-platform.closeout-capsule.v1",
    capsuleId: "capsule-1",
    createdAt: "2026-05-09T00:00:00.000Z",
    modelRef: "openai-codex/gpt-5.4",
    humanReport: {
      source: "model",
      reportMarkdown: "## Closeout\n\nUseful model-authored closeout.",
      eli5Progress: "We made a useful improvement.",
      limitations: [],
    },
    structuredSummary: {
      taskSuccess: "satisfied",
      qualityAssessment: "Good bounded output.",
      workflowFitAssessment: "Workflow fit was correct.",
      agentModelFitAssessment: "Model fit was correct.",
      missingWork: [],
      validationSummary: "Tests passed.",
      riskSummary: "No raw storage.",
      opportunitySeedIds: ["seed-1"],
    },
    roleCloseouts: [],
    opportunitySeeds: [
      {
        seedId: "seed-1",
        kind: "new_skill_candidate",
        title: "Improve memory runtime proof",
        rationale: "The closeout identified a reusable proof pattern.",
        recommendedNextStep: "Create a bounded skill candidate.",
        evidenceRefs: ["runtime-job://job-1/closeout"],
        confidence: "high",
      },
      {
        seedId: "seed-1-extra-follow-up",
        kind: "follow_up_work_item",
        title: "Follow up memory runtime proof",
        rationale: "A second opportunity from the same capsule should receive a distinct id.",
        recommendedNextStep: "Create a follow-up work item.",
        evidenceRefs: ["runtime-job://job-1/closeout"],
        confidence: "medium",
      },
      {
        seedId: "seed-2",
        kind: "no_op",
        title: "No follow-up",
        rationale: "No-op seed.",
        recommendedNextStep: "Skip.",
        evidenceRefs: [],
        confidence: "low",
      },
    ],
    factualRefs: {
      runtimeJobId: "job-1",
      teamRunId: null,
      workflowId: "workflow.docs_skills",
      status: "succeeded",
      roles: [],
      fileRefs: [],
      artifactRefs: [],
      validationRefs: [],
      runtimeEventRefs: [],
    },
    safetyFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      workQueueLifecycleMutatedDirectly: false,
      authorityGrantedByCloseout: false,
      runtimeJobCreatedByCloseout: false,
    },
  };
}

describe("closeout capsule opportunity projection through DB-operation evidence", () => {
  it("requires DB-operation middleware evidence", async () => {
    const result = await projectCloseoutCapsuleOpportunitySeedsViaDbOperation({
      workQueue: {} as never,
      capsule: capsule(),
      dbOperationEvidence: { dbOperationRefs: [] },
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain(
      "db_operation_middleware_evidence_required_for_opportunity_projection",
    );
  });

  it("projects eligible seeds idempotently and skips no-op seeds", async () => {
    const created: Array<{ workItemId: string; metadata: unknown }> = [];
    const workQueue = {
      readWorkItemTruth: async () => null,
      createWorkItem: async (input: { workItemId: string; metadata: unknown }) => {
        created.push(input);
      },
    };

    const result = await projectCloseoutCapsuleOpportunitySeedsViaDbOperation({
      workQueue: workQueue as never,
      capsule: capsule(),
      dbOperationEvidence: {
        dbOperationRefs: ["runtime-job://db-job/db-operation/metadata"],
        modelTaskRefs: ["runtime-job://model-job/model-task/validation"],
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.createdWorkItemIds).toHaveLength(2);
    expect(new Set(result.createdWorkItemIds).size).toBe(2);
    expect(result.skippedSeedIds).toEqual(["seed-2"]);
    expect(created[0]?.metadata).toMatchObject({
      projectionBoundary: "db_operation_middleware",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
  });
});

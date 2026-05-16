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
    const versions: unknown[] = [];
    const artifacts: unknown[] = [];
    const workQueue = {
      readWorkItemTruth: async () => null,
      createWorkItem: async (input: { workItemId: string; metadata: unknown }) => {
        created.push(input);
      },
      createWorkItemVersion: async (input: unknown) => {
        versions.push(input);
        return {
          versionId: "version-1",
          workItemId: "work-item-1",
          versionNumber: 1,
          versionState: "draft",
          title: "Planning Capsule",
          body: "{}",
          artifactMetadata: {},
          createdAt: new Date(),
          finalizedAt: null,
        };
      },
      attachArtifactReference: async (input: unknown) => {
        artifacts.push(input);
        return {
          artifactId: "artifact-1",
          workItemId: "work-item-1",
          versionId: "version-1",
          artifactType: "execution_platform.planning_capsule",
          storageKind: "metadata",
          uri: "work-queue://work-item-1/planning-capsule/planning-from-seed-1",
          contentType: "application/json",
          sizeBytes: null,
          sha256: "sha256:capsule",
          metadata: { capsuleId: "planning-from-seed-1" },
          createdAt: new Date(),
        };
      },
    };

    const result = await projectCloseoutCapsuleOpportunitySeedsViaDbOperation({
      workQueue: workQueue as never,
      capsule: capsule(),
      dbOperationEvidence: {
        dbOperationRefs: ["runtime-job://db-job/db-operation/metadata"],
        modelTaskRefs: ["runtime-job://model-job/model-task/validation"],
      },
      qualityReviewsBySeedId: {
        "seed-1": {
          source: "model",
          usefulness: "useful",
          specificity: "specific",
          ownerFit: "high",
          reviewRef: "runtime-job://job-1/model-task/opportunity-review/seed-1",
          limitations: [],
          recommendedQueueKind: "new_skill_candidate",
        },
        "seed-1-extra-follow-up": {
          source: "model",
          usefulness: "needs_review",
          specificity: "mixed",
          ownerFit: "medium",
          reviewRef: "runtime-job://job-1/model-task/opportunity-review/seed-1-extra-follow-up",
          limitations: ["Owner should confirm priority."],
          recommendedQueueKind: "follow_up_work_item",
        },
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.createdWorkItemIds).toHaveLength(2);
    expect(result.planningCapsuleRefs).toHaveLength(2);
    expect(result.reasonCodes).toContain(
      "accepted_opportunity_seeds_unpacked_to_planning_capsules",
    );
    expect(new Set(result.createdWorkItemIds).size).toBe(2);
    expect(result.skippedSeedIds).toEqual(["seed-2"]);
    expect(versions).toHaveLength(2);
    expect(artifacts).toHaveLength(2);
    expect(created[0]?.metadata).toMatchObject({
      projectionBoundary: "db_operation_middleware",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      qualityReviewState: "model_reviewed_useful",
      qualityReview: {
        usefulness: "useful",
        reviewRef: "runtime-job://job-1/model-task/opportunity-review/seed-1",
      },
    });
  });

  it("skips model-reviewed stale or generic seeds instead of creating noisy queue items", async () => {
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
      },
      qualityReviewsBySeedId: {
        "seed-1": {
          source: "model",
          usefulness: "too_generic",
          specificity: "too_broad",
          ownerFit: "low",
          reviewRef: "runtime-job://job-1/model-task/opportunity-review/seed-1",
          limitations: ["The candidate is too generic to queue."],
        },
        "seed-1-extra-follow-up": {
          source: "model",
          usefulness: "stale",
          specificity: "mixed",
          ownerFit: "low",
          reviewRef: "runtime-job://job-1/model-task/opportunity-review/seed-1-extra-follow-up",
          limitations: ["Superseded by later work."],
        },
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.createdWorkItemIds).toEqual([]);
    expect(result.skippedSeedIds).toEqual(["seed-1", "seed-1-extra-follow-up", "seed-2"]);
    expect(created).toEqual([]);
  });
});

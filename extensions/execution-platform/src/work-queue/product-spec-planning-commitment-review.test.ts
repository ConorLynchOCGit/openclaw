import { describe, expect, it } from "vitest";
import { createProductSpecPlanningCommitmentReviewArtifact } from "./product-spec-planning-commitment-review.ts";

describe("product/spec planning commitment review artifact", () => {
  it("classifies commitments with concrete evidence refs and exact remaining gaps", () => {
    const fullRefs = [
      "runtime-job://native-exec/codex-direct-main-repo/diff/main-repo-change-1",
      "runtime-job://native-exec/runtime-work-graph/scheduler-implementation/impl",
      "runtime-job://native-exec/product-spec-planning/contract",
      "repo://extensions/execution-platform/src/work-queue/product-spec-planning-commitment-review.test.ts",
      "docs://specs/runtime-work-graph.md",
      "runtime-job://native-exec/codex-direct-main-repo/validation",
      "runtime-job://native-exec/runtime-work-graph/live-proof/product-spec-planning-live-ux",
    ];
    const artifact = createProductSpecPlanningCommitmentReviewArtifact({
      runId: "product-spec-planning-comprehensive-implementation-mp72nd5u",
      reviewedAt: "2026-05-15T00:00:00.000Z",
      workflowSelected: "agent_team.product_spec_planning",
      schedulerNodeOrder: [],
      planningProofRefs: [],
      researchRequired: null,
      researchBriefRefs: [],
      planningCapsuleRefs: [],
      humanDecisionRefs: [],
      actionGraphProposalRefs: [],
      proposedChildActionRefs: [],
      compileValidationRefs: [],
      closeoutRefs: [],
      childActionsExecuted: null,
      runtimeJobsCreatedForProposedChildren: null,
      workQueueLifecycleMutated: false,
      rawStorageObserved: false,
      implementationDiffRefs: [],
      validationArtifacts: [],
      blockingCommitments: [
        {
          commitmentId: "satisfied",
          status: "satisfied",
          acceptedEvidenceRefs: fullRefs,
          remainingWork: [],
        },
        {
          commitmentId: "partial",
          status: "satisfied",
          acceptedEvidenceRefs: fullRefs.filter(
            (ref) => !ref.startsWith("docs://") && !ref.includes("live-proof"),
          ),
          remainingWork: ["Owner review must confirm the missing proof artifact."],
        },
        {
          commitmentId: "unsatisfied",
          status: "unsatisfied",
          acceptedEvidenceRefs: [],
          remainingWork: ["Run the live proof and attach validation evidence."],
        },
      ],
    });

    expect(artifact.statusCounts).toEqual({
      satisfied: 1,
      partiallySatisfied: 1,
      unsatisfied: 1,
    });
    expect(artifact.commitments.map((commitment) => commitment.satisfactionStatus)).toEqual([
      "satisfied",
      "partially_satisfied",
      "unsatisfied",
    ]);
    expect(artifact.commitments[1]?.exactRemainingGaps).toEqual(
      expect.arrayContaining([
        "Missing documentation/spec/status evidence ref.",
        "Missing live UX/runtime proof evidence ref.",
      ]),
    );
    expect(artifact.commitments[2]?.exactRemainingGaps).toContain(
      "No accepted evidence refs were provided.",
    );
    expect(artifact.rawPromptStored).toBe(false);
    expect(artifact.workQueueLifecycleMutationAllowed).toBe(false);
  });
});

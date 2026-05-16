import { describe, expect, it } from "vitest";
import { createProductSpecPlanningProofReviewArtifact } from "./product-spec-planning-proof-review.ts";

const COMMAND =
  "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts";
const RUN_ID = "product-spec-planning-comprehensive-implementation-mp72nd5u";
const DIFF_REF =
  "runtime-job://native-exec-1270cbacf0968e19/codex-direct-main-repo/diff/main-repo-change-f0f53fe6-ac99-4590-8f05-d39b61131da6";
const COMPILE_REF =
  "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/validation/compile-runtime-plan";
const WORKFLOW_REF =
  "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/scheduler-implementation/impl-product-spec-planning-production-upgrade";
const CONTRACT_REF = "runtime-job://native-exec-1270cbacf0968e19/product-spec-planning/contract";
const TEST_REF =
  "repo://extensions/execution-platform/src/work-queue/product-spec-planning-proof-review.test.ts";
const DOC_REF = "docs://specs/runtime-work-graph.md";
const LIVE_PROOF_REF =
  "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/live-proof/product-spec-planning-live-ux";
const REVIEW_REF = "review://product-spec-planning/proof-review";

function baseInput(): Parameters<typeof createProductSpecPlanningProofReviewArtifact>[0] {
  return {
    runId: RUN_ID,
    reviewedAt: "2026-05-15T00:00:00.000Z",
    workflowSelected: "agent_team.product_spec_planning",
    schedulerNodeOrder: [
      "planning_orchestrator",
      "web_research",
      "planning_capsule_draft",
      "action_graph_proposal",
      "compile_runtime_plan",
      "planning_closeout",
    ],
    planningProofRefs: [WORKFLOW_REF],
    researchRequired: true,
    researchBriefRefs: [
      "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/web-research/research-brief",
    ],
    planningCapsuleRefs: [
      "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/planning-capsule/v1",
    ],
    humanDecisionRefs: [
      "owner-decision://product-spec-planning/default-child-action-graph-proposal",
    ],
    actionGraphProposalRefs: [
      "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/action-graph/proposal",
    ],
    proposedChildActionRefs: [
      "action-graph-proposal://product-spec-planning/research",
      "action-graph-proposal://product-spec-planning/implementation",
    ],
    compileValidationRefs: [COMPILE_REF],
    closeoutRefs: [
      "runtime-job://native-exec-1270cbacf0968e19/runtime-work-graph/planning-closeout/model-closeout",
    ],
    childActionsExecuted: false,
    runtimeJobsCreatedForProposedChildren: false,
    workQueueLifecycleMutated: false,
    rawStorageObserved: false,
    implementationDiffRefs: [DIFF_REF],
    validationArtifacts: [
      {
        artifactType: "agent_team.dynamic_validation",
        uri: COMPILE_REF,
        metadata: {
          status: "passed",
          commandRef: COMMAND,
          rawCommandLogsStored: false,
        },
      },
    ],
    blockingCommitments: [
      {
        commitmentId: "commitment-workflow-runtime-proof",
        status: "satisfied",
        commitmentText: "Product/Spec Planning must be scheduler-backed and owner-readable.",
        acceptedEvidenceRefs: [
          DIFF_REF,
          WORKFLOW_REF,
          CONTRACT_REF,
          TEST_REF,
          DOC_REF,
          COMPILE_REF,
          LIVE_PROOF_REF,
          REVIEW_REF,
        ],
        remainingWork: [],
      },
      {
        commitmentId: "commitment-contract-tests-docs-validation",
        status: "satisfied",
        commitmentText:
          "Repository diffs, contracts, tests, docs, and validation output must be closure-mapped.",
        acceptedEvidenceRefs: [
          DIFF_REF,
          WORKFLOW_REF,
          CONTRACT_REF,
          TEST_REF,
          DOC_REF,
          COMPILE_REF,
          LIVE_PROOF_REF,
        ],
        remainingWork: [],
      },
      {
        commitmentId: "commitment-proof-child-actions-not-executed",
        status: "satisfied",
        commitmentText:
          "Live proof must explicitly state proposed child actions were not executed.",
        acceptedEvidenceRefs: [
          DIFF_REF,
          WORKFLOW_REF,
          CONTRACT_REF,
          TEST_REF,
          DOC_REF,
          COMPILE_REF,
          LIVE_PROOF_REF,
        ],
        remainingWork: [],
      },
    ],
    validationCommandResult: {
      command: COMMAND,
      status: "passed",
      validationRef: "runtime-job://native-exec-1270cbacf0968e19/codex-direct-main-repo/validation",
      boundedSummary: "Focused Work Queue execution read model validation passed.",
      completedAt: "2026-05-15T00:00:00.000Z",
    },
  };
}

describe("product/spec planning proof review artifact", () => {
  it("maps blocking commitments and confirms proposed children stayed unexecuted", () => {
    const artifact = createProductSpecPlanningProofReviewArtifact(baseInput());

    expect(artifact.workflowSelected).toBe("agent_team.product_spec_planning");
    expect(artifact.schedulerGraphBehavior).toMatchObject({
      planningOrchestratorFirst: true,
      webResearchCalled: true,
    });
    expect(artifact.missionCommitmentEvidence[0]).toMatchObject({
      commitmentId: "commitment-workflow-runtime-proof",
      changedFileRefs: expect.arrayContaining([DIFF_REF, TEST_REF]),
      validationRefs: [COMPILE_REF],
      reviewRefs: [REVIEW_REF],
    });
    expect(artifact.proposedChildActionsExecution).toMatchObject({
      result: "confirmed_not_executed",
      childActionsExecuted: false,
      runtimeJobsCreatedForProposedChildren: false,
    });
    expect(artifact.closureValidation).toMatchObject({
      requiredBlockingCommitmentCount: 3,
      observedBlockingCommitmentCount: 3,
      allThreeBlockingCommitmentsMapped: true,
      proposedChildActionsNotExecutedDuringProof: true,
      validationCommandStatus: "passed",
    });
    expect(artifact.closureValidation.commitments).toHaveLength(3);
    expect(
      artifact.closureValidation.commitments.every((commitment) => commitment.closureReady),
    ).toBe(true);
    expect(artifact.focusedValidationResult).toMatchObject({
      status: "passed",
      command: COMMAND,
    });
    expect(artifact.boundaryFlags).toMatchObject({
      rawStorageObserved: false,
      workQueueLifecycleMutated: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("denies non-execution proof if proposed child runtime jobs were created", () => {
    const artifact = createProductSpecPlanningProofReviewArtifact({
      ...baseInput(),
      runId: "product-spec-planning-proof-denied",
      researchRequired: false,
      researchBriefRefs: [],
      schedulerNodeOrder: ["planning_orchestrator", "action_graph_proposal"],
      runtimeJobsCreatedForProposedChildren: true,
    });

    expect(artifact.proposedChildActionsExecution.result).toBe("denied_executed");
    expect(artifact.proposedChildActionsExecution.reasonCodes).toContain(
      "product_spec_planning_runtime_jobs_created_for_proposed_children",
    );
  });
});

import { describe, expect, it } from "vitest";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import {
  createWorkflowCompletionReviewFromCloseout,
  evaluateWorkflowCompletionReviewGate,
} from "./workflow-completion-review.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";
import { evaluateWorkflowEvidenceProfile } from "./workflow-evidence-profile.ts";

const safety = {
  rawPromptStored: false as const,
  rawResponseStored: false as const,
  rawLogsStored: false as const,
};

function acceptedProfile() {
  return evaluateWorkflowEvidenceProfile({
    workflowId: "agent_team.coding",
    runtimeJobId: "runtime-job-1",
    closeoutSource: "model",
    evidenceClassRefs: {
      runtime_graph: ["runtime-graph://graph-1"],
      scheduler_tool_trace: ["runtime-tool://scheduler.select_next_node/invocation-1"],
      worker_tool_trace: ["runtime-tool://worker.invoke/invocation-1"],
      source_change: ["repo://file.ts#hash"],
      validation: ["validation://test"],
      review: ["review://review"],
      closeout: ["closeout://capsule-1"],
      work_queue_readback: ["work-queue://item/readback"],
    },
    ...safety,
  });
}

describe("workflow completion review", () => {
  it("accepts only model-authored closeout evidence tied to profile and required refs", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
    const closeoutCapsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: "runtime-job-1",
      workflowId: "agent_team.coding",
    });
    const review = createWorkflowCompletionReviewFromCloseout({
      definition,
      runtimeJobId: "runtime-job-1",
      closeoutCapsule,
      workflowEvidenceProfile: acceptedProfile(),
      profileEvaluationRef: "runtime-job://runtime-job-1/artifact/profile",
      missionLedgerRefs: ["runtime-job://runtime-job-1/artifact/ledger"],
      runtimeGraphRefs: ["runtime-graph://graph-1"],
      runtimeToolTraceRefs: ["runtime-tool://worker.invoke/invocation-1"],
      validationRefs: ["validation://test"],
      reviewRefs: ["review://review"],
      closeoutRefs: ["closeout://capsule-1"],
      workQueueReadbackRefs: ["work-queue://item/readback"],
      limitations: [],
    });

    expect(review.outcome).toBe("accepted");
    expect(
      evaluateWorkflowCompletionReviewGate({
        definition,
        review,
        requiredEvidenceRefs: ["runtime-graph://graph-1", "closeout://capsule-1"],
        completionReviewRef: "runtime-job://runtime-job-1/artifact/completion-review",
      }),
    ).toMatchObject({
      accepted: true,
      outcome: "accepted",
    });
  });

  it("blocks final success when required completion-review refs are missing", () => {
    const definition = requireCanonicalWorkflowDefinition("agent_team.coding");

    expect(
      evaluateWorkflowCompletionReviewGate({
        definition,
        review: null,
        requiredEvidenceRefs: ["runtime-graph://graph-1"],
        completionReviewRef: null,
      }),
    ).toMatchObject({
      accepted: false,
      outcome: "missing",
      reasonCodes: ["workflow_completion_review_missing"],
    });
  });
});

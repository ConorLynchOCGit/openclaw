import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkflowDefinition } from "./workflow-definition.ts";
import type { WorkflowEvidenceProfileEvaluation } from "./workflow-evidence-profile.ts";

export const WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE = "execution.workflow_completion_review";

export type WorkflowCompletionReviewOutcome = "accepted" | "needs_review" | "failed";

export type WorkflowCompletionReview = {
  artifactKind: "workflow_completion_review";
  reviewId: string;
  workflowId: string;
  definitionId: string;
  runtimeJobId: string;
  source: "model_authored_closeout_capsule";
  outcome: WorkflowCompletionReviewOutcome;
  humanReadableAssessment: string;
  whyAcceptedOrNot: string;
  missingHardening: string[];
  compatibilityFallbackConcerns: string[];
  proofShapedConcerns: string[];
  recommendedImmediateNextAction: string;
  confidence: "low" | "medium" | "high";
  evidenceRefs: string[];
  deepCompletionQuestion: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type WorkflowCompletionReviewGate = {
  artifactKind: "workflow_completion_review_gate";
  accepted: boolean;
  outcome: WorkflowCompletionReviewOutcome | "missing";
  reasonCodes: string[];
  missingEvidenceRefs: string[];
  completionReviewRef: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function boundedList(values: readonly string[], maxItems = 20): string[] {
  return values
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
    .slice(0, maxItems);
}

export function createWorkflowCompletionReviewFromCloseout(input: {
  definition: WorkflowDefinition;
  runtimeJobId: string;
  closeoutCapsule: CloseoutCapsule;
  workflowEvidenceProfile: WorkflowEvidenceProfileEvaluation;
  profileEvaluationRef: string;
  missionLedgerRefs: string[];
  runtimeGraphRefs: string[];
  runtimeToolTraceRefs: string[];
  validationRefs: string[];
  reviewRefs: string[];
  closeoutRefs: string[];
  workQueueReadbackRefs: string[];
  limitations: string[];
}): WorkflowCompletionReview {
  const modelAccepted =
    input.closeoutCapsule.humanReport.source === "model" &&
    input.closeoutCapsule.structuredSummary.taskSuccess === "satisfied" &&
    input.workflowEvidenceProfile.accepted;
  const evidenceRefs = boundedList([
    input.profileEvaluationRef,
    ...input.runtimeGraphRefs,
    ...input.closeoutRefs,
    ...input.workQueueReadbackRefs,
    ...input.validationRefs,
    ...input.reviewRefs,
    ...input.missionLedgerRefs,
    ...input.runtimeToolTraceRefs,
  ]);
  const missingHardening = boundedList(
    [
      ...input.closeoutCapsule.structuredSummary.missingWork,
      ...input.limitations,
      ...(input.workflowEvidenceProfile.missingEvidenceClasses.length > 0
        ? input.workflowEvidenceProfile.missingEvidenceClasses.map(
            (evidenceClass) => `missing workflow evidence: ${evidenceClass}`,
          )
        : []),
    ],
    12,
  );
  return {
    artifactKind: "workflow_completion_review",
    reviewId: `workflow-completion-review-${input.runtimeJobId}-${input.closeoutCapsule.capsuleId}`,
    workflowId: input.definition.workflowId,
    definitionId: input.definition.definitionId,
    runtimeJobId: input.runtimeJobId,
    source: "model_authored_closeout_capsule",
    outcome: modelAccepted && missingHardening.length === 0 ? "accepted" : "needs_review",
    humanReadableAssessment: input.closeoutCapsule.structuredSummary.qualityAssessment.slice(
      0,
      1_000,
    ),
    whyAcceptedOrNot:
      modelAccepted && missingHardening.length === 0
        ? "The model-authored closeout marked the task satisfied and the workflow evidence profile was accepted."
        : "The model-authored closeout or workflow evidence profile still records missing work, limitations, or insufficient evidence.",
    missingHardening,
    compatibilityFallbackConcerns: input.workflowEvidenceProfile.reasonCodes
      .filter((reason) => reason.includes("fallback") || reason.includes("compat"))
      .slice(0, 8),
    proofShapedConcerns: input.workflowEvidenceProfile.reasonCodes
      .filter((reason) => reason.includes("proof") || reason.includes("generic"))
      .slice(0, 8),
    recommendedImmediateNextAction:
      modelAccepted && missingHardening.length === 0
        ? "Move to the next Work Queue item."
        : "Continue hardening or terminalize needs_review with the missing evidence listed here.",
    confidence: modelAccepted && missingHardening.length === 0 ? "high" : "medium",
    evidenceRefs,
    deepCompletionQuestion: input.definition.completionReviewPolicy.deepCompletionQuestion,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function evaluateWorkflowCompletionReviewGate(input: {
  definition: WorkflowDefinition;
  review: WorkflowCompletionReview | null;
  requiredEvidenceRefs: string[];
  completionReviewRef: string | null;
}): WorkflowCompletionReviewGate {
  if (!input.definition.completionReviewPolicy.required) {
    return {
      artifactKind: "workflow_completion_review_gate",
      accepted: true,
      outcome: "accepted",
      reasonCodes: ["workflow_completion_review_not_required"],
      missingEvidenceRefs: [],
      completionReviewRef: input.completionReviewRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  if (!input.review) {
    return {
      artifactKind: "workflow_completion_review_gate",
      accepted: false,
      outcome: "missing",
      reasonCodes: ["workflow_completion_review_missing"],
      missingEvidenceRefs: input.requiredEvidenceRefs.slice(0, 20),
      completionReviewRef: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const knownRefs = new Set(input.review.evidenceRefs);
  const missingEvidenceRefs = input.requiredEvidenceRefs
    .filter((ref) => ref.trim().length > 0 && !knownRefs.has(ref))
    .slice(0, 20);
  const accepted = input.review.outcome === "accepted" && missingEvidenceRefs.length === 0;
  return {
    artifactKind: "workflow_completion_review_gate",
    accepted,
    outcome: input.review.outcome,
    reasonCodes: [
      ...(accepted
        ? ["workflow_completion_review_accepted"]
        : ["workflow_completion_review_not_accepted"]),
      ...(missingEvidenceRefs.length > 0
        ? ["workflow_completion_review_missing_required_refs"]
        : []),
    ],
    missingEvidenceRefs,
    completionReviewRef: input.completionReviewRef,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function workflowCompletionReviewArtifactMetadata(
  review: WorkflowCompletionReview,
): JsonValue {
  return review as unknown as JsonValue;
}

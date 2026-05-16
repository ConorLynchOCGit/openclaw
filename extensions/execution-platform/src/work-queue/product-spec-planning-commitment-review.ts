import type {
  ProductSpecPlanningBlockingMissionCommitment,
  ProductSpecPlanningProofReviewInput,
} from "./product-spec-planning-proof-review.ts";

export const PRODUCT_SPEC_PLANNING_COMMITMENT_REVIEW_ARTIFACT_KIND =
  "product_spec_planning_commitment_review_artifact" as const;
export const PRODUCT_SPEC_PLANNING_COMMITMENT_REVIEW_ARTIFACT_VERSION = "v1" as const;

export type ProductSpecPlanningCommitmentReviewStatus =
  | "satisfied"
  | "partially_satisfied"
  | "unsatisfied";

type CommitmentEvidenceRefs = {
  implementationRefs: string[];
  workflowWiringRefs: string[];
  contractRefs: string[];
  testRefs: string[];
  documentationRefs: string[];
  validationRefs: string[];
  liveProofRefs: string[];
  reviewRefs: string[];
  otherEvidenceRefs: string[];
};

const REQUIRED_EVIDENCE_CLASSES = [
  "implementation",
  "workflow_wiring",
  "contract",
  "test",
  "documentation",
  "validation",
  "live_proof",
] as const;

function boundedUnique(values: readonly string[], limit = 40): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function isImplementationRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("repo://") ||
    normalized.startsWith("diff://") ||
    normalized.startsWith("main-repo-change://") ||
    normalized.includes("/diff/") ||
    normalized.includes("/source-edit/") ||
    normalized.includes("/changed-file/")
  );
}

function isWorkflowWiringRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("workflow") ||
    normalized.includes("runtime-work-graph") ||
    normalized.includes("scheduler") ||
    normalized.includes("capability") ||
    normalized.includes("registry") ||
    normalized.includes("front-door") ||
    normalized.includes("router") ||
    normalized.includes("compile-runtime-plan")
  );
}

function isContractRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("contract") ||
    normalized.includes("research-brief") ||
    normalized.includes("planning-capsule") ||
    normalized.includes("human-decision") ||
    normalized.includes("action-graph") ||
    normalized.includes("closeout")
  );
}

function isTestRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes(".test.") ||
    normalized.startsWith("test://") ||
    normalized.includes("test:file") ||
    normalized.includes("vitest") ||
    normalized.includes("pnpm test")
  );
}

function isDocumentationRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("docs://") ||
    normalized.includes("/docs/") ||
    normalized.includes("specs/") ||
    normalized.includes("status.md") ||
    normalized.includes("current_slice.md") ||
    normalized.includes("decisions.md") ||
    normalized.includes("roadmap.md") ||
    normalized.includes("runbook")
  );
}

function isValidationRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("validation://") ||
    normalized.includes("/validation/") ||
    normalized.endsWith("/validation")
  );
}

function isLiveProofRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("live-proof") ||
    normalized.includes("live_ux") ||
    normalized.includes("live-ux") ||
    normalized.includes("ux-proof") ||
    normalized.includes("runtime-proof")
  );
}

function isReviewRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return normalized.startsWith("review://") || normalized.includes("/review/");
}

function classifyEvidenceRefs(refs: readonly string[]): CommitmentEvidenceRefs {
  const acceptedEvidenceRefs = boundedUnique(refs, 80);
  const implementationRefs = acceptedEvidenceRefs.filter(isImplementationRef);
  const workflowWiringRefs = acceptedEvidenceRefs.filter(isWorkflowWiringRef);
  const contractRefs = acceptedEvidenceRefs.filter(isContractRef);
  const testRefs = acceptedEvidenceRefs.filter(isTestRef);
  const documentationRefs = acceptedEvidenceRefs.filter(isDocumentationRef);
  const validationRefs = acceptedEvidenceRefs.filter(isValidationRef);
  const liveProofRefs = acceptedEvidenceRefs.filter(isLiveProofRef);
  const reviewRefs = acceptedEvidenceRefs.filter(isReviewRef);
  const classifiedRefs = new Set([
    ...implementationRefs,
    ...workflowWiringRefs,
    ...contractRefs,
    ...testRefs,
    ...documentationRefs,
    ...validationRefs,
    ...liveProofRefs,
    ...reviewRefs,
  ]);
  return {
    implementationRefs,
    workflowWiringRefs,
    contractRefs,
    testRefs,
    documentationRefs,
    validationRefs,
    liveProofRefs,
    reviewRefs,
    otherEvidenceRefs: acceptedEvidenceRefs.filter((ref) => !classifiedRefs.has(ref)),
  };
}

function missingEvidenceClasses(evidenceRefs: CommitmentEvidenceRefs): string[] {
  return REQUIRED_EVIDENCE_CLASSES.filter((evidenceClass) => {
    switch (evidenceClass) {
      case "implementation":
        return evidenceRefs.implementationRefs.length === 0;
      case "workflow_wiring":
        return evidenceRefs.workflowWiringRefs.length === 0;
      case "contract":
        return evidenceRefs.contractRefs.length === 0;
      case "test":
        return evidenceRefs.testRefs.length === 0;
      case "documentation":
        return evidenceRefs.documentationRefs.length === 0;
      case "validation":
        return evidenceRefs.validationRefs.length === 0;
      case "live_proof":
        return evidenceRefs.liveProofRefs.length === 0;
      default:
        return true;
    }
  });
}

function evidenceGap(evidenceClass: string): string {
  switch (evidenceClass) {
    case "implementation":
      return "Missing repository implementation or diff evidence ref.";
    case "workflow_wiring":
      return "Missing workflow registry, scheduler, router, or capability wiring evidence ref.";
    case "contract":
      return "Missing Product/Spec Planning contract artifact evidence ref.";
    case "test":
      return "Missing focused test evidence ref.";
    case "documentation":
      return "Missing documentation/spec/status evidence ref.";
    case "validation":
      return "Missing validation output evidence ref.";
    case "live_proof":
      return "Missing live UX/runtime proof evidence ref.";
    default:
      return `Missing ${evidenceClass} evidence ref.`;
  }
}

function reviewCommitment(commitment: ProductSpecPlanningBlockingMissionCommitment) {
  const sourceStatus = commitment.status ?? "unknown";
  const acceptedEvidenceRefs = boundedUnique(commitment.acceptedEvidenceRefs ?? [], 80);
  const evidenceRefs = classifyEvidenceRefs(acceptedEvidenceRefs);
  const missingClasses = missingEvidenceClasses(evidenceRefs);
  const remainingWork = boundedUnique(commitment.remainingWork ?? [], 20);
  const sourceAccepted = sourceStatus === "satisfied" || sourceStatus === "accepted";
  const sourcePartial =
    sourceStatus === "partially_satisfied" ||
    sourceStatus === "partial" ||
    sourceStatus === "pending" ||
    sourceStatus === "needs_review";
  const sourceDenied =
    sourceStatus === "unsatisfied" ||
    sourceStatus === "failed" ||
    sourceStatus === "rejected" ||
    sourceStatus === "blocked";
  const exactRemainingGaps = boundedUnique(
    [
      ...remainingWork,
      ...missingClasses.map(evidenceGap),
      ...(acceptedEvidenceRefs.length === 0 ? ["No accepted evidence refs were provided."] : []),
      ...(sourceDenied || (!sourceAccepted && !sourcePartial)
        ? [`Mission ledger status is ${sourceStatus}.`]
        : []),
    ],
    30,
  );
  const satisfactionStatus: ProductSpecPlanningCommitmentReviewStatus =
    sourceAccepted && exactRemainingGaps.length === 0
      ? "satisfied"
      : acceptedEvidenceRefs.length > 0 || sourceAccepted || sourcePartial
        ? "partially_satisfied"
        : "unsatisfied";
  return {
    commitmentId: commitment.commitmentId,
    commitmentText: commitment.commitmentText ?? null,
    sourceStatus,
    satisfactionStatus,
    acceptedEvidenceRefs,
    evidenceRefs,
    missingEvidenceClasses: missingClasses,
    exactRemainingGaps,
    reasonCodes: boundedUnique(
      [
        `product_spec_planning_commitment_review_${satisfactionStatus}:${commitment.commitmentId}`,
        ...missingClasses.map(
          (missing) =>
            `product_spec_planning_commitment_review_missing_${missing}:${commitment.commitmentId}`,
        ),
        ...(exactRemainingGaps.length > 0
          ? [`product_spec_planning_commitment_review_remaining_gaps:${commitment.commitmentId}`]
          : []),
      ],
      20,
    ),
  };
}

export type ProductSpecPlanningCommitmentReviewArtifact = ReturnType<
  typeof createProductSpecPlanningCommitmentReviewArtifact
>;

export function createProductSpecPlanningCommitmentReviewArtifact(
  input: ProductSpecPlanningProofReviewInput,
) {
  const commitments = input.blockingCommitments.map(reviewCommitment);
  const satisfiedCount = commitments.filter(
    (commitment) => commitment.satisfactionStatus === "satisfied",
  ).length;
  const partiallySatisfiedCount = commitments.filter(
    (commitment) => commitment.satisfactionStatus === "partially_satisfied",
  ).length;
  const unsatisfiedCount = commitments.filter(
    (commitment) => commitment.satisfactionStatus === "unsatisfied",
  ).length;
  const allSatisfied = commitments.length > 0 && satisfiedCount === commitments.length;
  return {
    artifactKind: PRODUCT_SPEC_PLANNING_COMMITMENT_REVIEW_ARTIFACT_KIND,
    artifactVersion: PRODUCT_SPEC_PLANNING_COMMITMENT_REVIEW_ARTIFACT_VERSION,
    runId: input.runId,
    reviewedAt: input.reviewedAt,
    workflowSelected: input.workflowSelected,
    status: allSatisfied
      ? ("accepted" as const)
      : partiallySatisfiedCount > 0
        ? ("needs_review" as const)
        : ("rejected" as const),
    commitmentCount: commitments.length,
    statusCounts: {
      satisfied: satisfiedCount,
      partiallySatisfied: partiallySatisfiedCount,
      unsatisfied: unsatisfiedCount,
    },
    satisfiedCount,
    partiallySatisfiedCount,
    unsatisfiedCount,
    commitments,
    reasonCodes: boundedUnique(
      [
        allSatisfied
          ? "product_spec_planning_commitment_review_all_satisfied"
          : "product_spec_planning_commitment_review_needs_more_evidence",
        ...(commitments.length === 0
          ? ["product_spec_planning_commitment_review_no_commitments"]
          : []),
        ...commitments.flatMap((commitment) => commitment.reasonCodes),
      ],
      80,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

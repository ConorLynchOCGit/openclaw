import type { CodexParityValidationAccounting } from "./codex-parity-validation-accounting.ts";
import type { MainRepoChangeManifest } from "./main-repo-change-evidence.ts";

export type CodexParityReviewDecision = {
  status: "accepted" | "needs_review" | "rejected";
  reviewerModelRef: string;
  reviewRef: string;
  boundedSummary: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type CodexParitySourceAcceptanceDecision = {
  artifactKind: "codex_parity_source_acceptance_decision";
  status: "allowed" | "blocked";
  changedFileRefs: string[];
  validationAccepted: boolean;
  reviewAccepted: boolean;
  sourceEditEvidenceAccepted: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export function decideCodexParitySourceAcceptance(input: {
  diff: MainRepoChangeManifest;
  validation: CodexParityValidationAccounting;
  review: CodexParityReviewDecision;
  unsafeFlags?: string[];
}): CodexParitySourceAcceptanceDecision {
  const changedFileRefs = input.diff.changedFiles.map((file) => file.fileRef);
  const sourceEditEvidenceAccepted =
    input.diff.evidenceStatus === "accepted" && changedFileRefs.length > 0;
  const validationAccepted = input.validation.allRequiredValidationAccepted;
  const reviewAccepted = input.review.status === "accepted";
  const unsafeFlags = input.unsafeFlags ?? [];
  const reasonCodes = [
    ...(!sourceEditEvidenceAccepted ? ["source_edit_evidence_missing"] : []),
    ...(!validationAccepted ? ["validation_not_accepted"] : []),
    ...(!reviewAccepted ? [`review_${input.review.status}`] : []),
    ...unsafeFlags.map((flag) => `unsafe_flag:${flag}`),
    ...(sourceEditEvidenceAccepted &&
    validationAccepted &&
    reviewAccepted &&
    unsafeFlags.length === 0
      ? ["codex_parity_direct_main_repo_source_accepted"]
      : []),
  ];
  const status =
    sourceEditEvidenceAccepted && validationAccepted && reviewAccepted && unsafeFlags.length === 0
      ? "allowed"
      : "blocked";
  return {
    artifactKind: "codex_parity_source_acceptance_decision",
    status,
    changedFileRefs,
    validationAccepted,
    reviewAccepted,
    sourceEditEvidenceAccepted,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function createAcceptedCodexParityReview(input: {
  reviewerModelRef?: string;
  reviewRef: string;
  boundedSummary: string;
  reasonCodes?: string[];
}): CodexParityReviewDecision {
  return {
    status: "accepted",
    reviewerModelRef: input.reviewerModelRef ?? "model://reviewer/policy-selected",
    reviewRef: input.reviewRef,
    boundedSummary: input.boundedSummary.trim().slice(0, 800),
    reasonCodes: input.reasonCodes ?? ["model_reviewer_accepted_bounded_evidence"],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

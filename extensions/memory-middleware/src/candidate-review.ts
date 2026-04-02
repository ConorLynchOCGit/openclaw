import type {
  CandidateReviewInput,
  CandidateReviewResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CandidateReviewPort = {
  review(input: CandidateReviewInput): Promise<CandidateReviewResult>;
};

export function createCandidateReviewPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-only"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): CandidateReviewPort {
  const mode = params.mode;

  if (mode === "disabled") {
    return {
      async review() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate review mode is not enabled",
        };
      },
    };
  }

  return {
    review: (input) => params.db.queries.reviewCandidate(input),
  };
}

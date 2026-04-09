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
  enabled: boolean;
}): CandidateReviewPort {
  if (!params.enabled) {
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

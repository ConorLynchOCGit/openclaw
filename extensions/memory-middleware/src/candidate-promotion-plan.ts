import type {
  CandidatePromotionPlanInput,
  CandidatePromotionPlanResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CandidatePromotionPlanPort = {
  plan(input: CandidatePromotionPlanInput): Promise<CandidatePromotionPlanResult>;
};

export function createCandidatePromotionPlanPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): CandidatePromotionPlanPort {
  const mode = params.mode;

  if (mode === "disabled") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate promotion planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planCandidatePromotion(input),
  };
}

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
  enabled: boolean;
}): CandidatePromotionPlanPort {
  if (!params.enabled) {
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

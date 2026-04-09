import type {
  MemoryMiddlewareDb,
  SkillCandidateProcurementPlanInput,
  SkillCandidateProcurementPlanResult,
} from "./db/runtime.js";

export type SkillCandidateProcurementPlanPort = {
  plan(input: SkillCandidateProcurementPlanInput): Promise<SkillCandidateProcurementPlanResult>;
};

export function createSkillCandidateProcurementPlanPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidateProcurementPlanPort {
  if (!params.enabled) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate procurement planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidateProcurement(input),
  };
}

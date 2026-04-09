import type {
  MemoryMiddlewareDb,
  SkillCandidatePlanInput,
  SkillCandidatePlanResult,
} from "./db/runtime.js";

export type SkillCandidatePlanPort = {
  plan(input: SkillCandidatePlanInput): Promise<SkillCandidatePlanResult>;
};

export function createSkillCandidatePlanPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidatePlanPort {
  if (!params.enabled) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidate(input),
  };
}

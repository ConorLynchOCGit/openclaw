import type {
  MemoryMiddlewareDb,
  SkillCandidateApprovalPlanInput,
  SkillCandidateApprovalPlanResult,
} from "./db/runtime.js";

export type SkillCandidateApprovalPlanPort = {
  plan(input: SkillCandidateApprovalPlanInput): Promise<SkillCandidateApprovalPlanResult>;
};

export function createSkillCandidateApprovalPlanPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidateApprovalPlanPort {
  if (!params.enabled) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate approval planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidateApproval(input),
  };
}

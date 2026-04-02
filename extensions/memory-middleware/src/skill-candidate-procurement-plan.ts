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
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateProcurementPlanPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement" &&
    mode !== "candidate-only"
  ) {
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

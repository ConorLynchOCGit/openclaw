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
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateApprovalPlanPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "candidate-only"
  ) {
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

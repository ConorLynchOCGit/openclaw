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
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidatePlanPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill" &&
    mode !== "candidate-only"
  ) {
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

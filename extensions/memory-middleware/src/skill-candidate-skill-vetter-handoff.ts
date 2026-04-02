import type {
  MemoryMiddlewareDb,
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffResult,
} from "./db/runtime.js";

export type SkillCandidateSkillVetterHandoffPort = {
  plan(
    input: SkillCandidateSkillVetterHandoffInput,
  ): Promise<SkillCandidateSkillVetterHandoffResult>;
};

export function createSkillCandidateSkillVetterHandoffPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateSkillVetterHandoffPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "candidate-only"
  ) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate Skill Vetter handoff mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidateSkillVetterHandoff(input),
  };
}

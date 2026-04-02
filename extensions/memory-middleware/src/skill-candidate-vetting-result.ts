import type {
  MemoryMiddlewareDb,
  SkillCandidateVettingResultInput,
  SkillCandidateVettingResultRecordResult,
} from "./db/runtime.js";

export type SkillCandidateVettingResultPort = {
  create(input: SkillCandidateVettingResultInput): Promise<SkillCandidateVettingResultRecordResult>;
};

export function createSkillCandidateVettingResultPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateVettingResultPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "candidate-only"
  ) {
    return {
      async create() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate vetting-result mode is not enabled",
        };
      },
    };
  }

  return {
    create: (input) => params.db.queries.createSkillCandidateVettingResult(input),
  };
}

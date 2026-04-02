import type {
  MemoryMiddlewareDb,
  SkillCandidateCreateInput,
  SkillCandidateCreateResult,
} from "./db/runtime.js";

export type SkillCandidatePort = {
  create(input: SkillCandidateCreateInput): Promise<SkillCandidateCreateResult>;
};

export function createSkillCandidatePort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidatePort {
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
      async create() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate creation mode is not enabled",
        };
      },
    };
  }

  return {
    create: (input) => params.db.queries.createSkillCandidate(input),
  };
}

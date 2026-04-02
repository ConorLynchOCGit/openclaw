import type {
  MemoryMiddlewareDb,
  SkillCandidateApproveInput,
  SkillCandidateApproveResult,
} from "./db/runtime.js";

export type SkillCandidateApprovalPort = {
  approve(input: SkillCandidateApproveInput): Promise<SkillCandidateApproveResult>;
};

export function createSkillCandidateApprovalPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateApprovalPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "candidate-only"
  ) {
    return {
      async approve() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate approval mode is not enabled",
        };
      },
    };
  }

  return {
    approve: (input) => params.db.queries.approveSkillCandidate(input),
  };
}

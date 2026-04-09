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
  enabled: boolean;
}): SkillCandidateApprovalPort {
  if (!params.enabled) {
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

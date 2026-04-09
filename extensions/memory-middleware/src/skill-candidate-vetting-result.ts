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
  enabled: boolean;
}): SkillCandidateVettingResultPort {
  if (!params.enabled) {
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

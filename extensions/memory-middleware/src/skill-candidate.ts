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
  enabled: boolean;
}): SkillCandidatePort {
  if (!params.enabled) {
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

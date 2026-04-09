import type {
  MemoryMiddlewareDb,
  SkillCandidateInstallRecordInput,
  SkillCandidateInstallRecordResult,
} from "./db/runtime.js";

export type SkillCandidateInstallRecordPort = {
  create(input: SkillCandidateInstallRecordInput): Promise<SkillCandidateInstallRecordResult>;
};

export function createSkillCandidateInstallRecordPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidateInstallRecordPort {
  if (!params.enabled) {
    return {
      async create() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate install record mode is not enabled",
        };
      },
    };
  }

  return {
    create: (input) => params.db.queries.createSkillCandidateInstallRecord(input),
  };
}

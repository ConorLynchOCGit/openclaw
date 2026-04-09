import type {
  MemoryMiddlewareDb,
  SkillCandidateProcurementRecordInput,
  SkillCandidateProcurementRecordResult,
} from "./db/runtime.js";

export type SkillCandidateProcurementRecordPort = {
  create(
    input: SkillCandidateProcurementRecordInput,
  ): Promise<SkillCandidateProcurementRecordResult>;
};

export function createSkillCandidateProcurementRecordPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidateProcurementRecordPort {
  if (!params.enabled) {
    return {
      async create() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate procurement record mode is not enabled",
        };
      },
    };
  }

  return {
    create: (input) => params.db.queries.createSkillCandidateProcurementRecord(input),
  };
}

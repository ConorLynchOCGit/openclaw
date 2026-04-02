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
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateProcurementRecordPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement" &&
    mode !== "candidate-only"
  ) {
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

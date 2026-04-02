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
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateInstallRecordPort {
  const mode = params.mode;

  if (
    mode !== "candidate-only" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  ) {
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

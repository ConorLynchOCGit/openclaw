import type {
  MemoryMiddlewareDb,
  SkillCandidateInstallHandoffInput,
  SkillCandidateInstallHandoffResult,
} from "./db/runtime.js";

export type SkillCandidateInstallHandoffPort = {
  plan(input: SkillCandidateInstallHandoffInput): Promise<SkillCandidateInstallHandoffResult>;
};

export function createSkillCandidateInstallHandoffPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): SkillCandidateInstallHandoffPort {
  const mode = params.mode;

  if (
    mode !== "candidate-only" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
  ) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate install handoff mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidateInstallHandoff(input),
  };
}

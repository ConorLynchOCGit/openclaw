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
  enabled: boolean;
}): SkillCandidateInstallHandoffPort {
  if (!params.enabled) {
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

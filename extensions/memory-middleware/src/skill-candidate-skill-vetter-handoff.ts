import type {
  MemoryMiddlewareDb,
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffResult,
} from "./db/runtime.js";

export type SkillCandidateSkillVetterHandoffPort = {
  plan(
    input: SkillCandidateSkillVetterHandoffInput,
  ): Promise<SkillCandidateSkillVetterHandoffResult>;
};

export function createSkillCandidateSkillVetterHandoffPort(params: {
  db: MemoryMiddlewareDb;
  enabled: boolean;
}): SkillCandidateSkillVetterHandoffPort {
  if (!params.enabled) {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "skill-candidate Skill Vetter handoff mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planSkillCandidateSkillVetterHandoff(input),
  };
}

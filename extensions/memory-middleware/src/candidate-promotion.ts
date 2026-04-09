import type {
  CandidateMemoryPromotionInput,
  CandidateMemoryPromotionResult,
  CandidateProcedurePromotionInput,
  CandidateProcedurePromotionResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CandidatePromotionPort = {
  promoteToMemory(input: CandidateMemoryPromotionInput): Promise<CandidateMemoryPromotionResult>;
  promoteToProcedureDraft(
    input: CandidateProcedurePromotionInput,
  ): Promise<CandidateProcedurePromotionResult>;
};

export function createCandidatePromotionPort(params: {
  db: MemoryMiddlewareDb;
  memoryPromotionEnabled: boolean;
  procedureDraftPromotionEnabled: boolean;
}): CandidatePromotionPort {
  if (!params.memoryPromotionEnabled && !params.procedureDraftPromotionEnabled) {
    return {
      async promoteToMemory() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate memory promotion mode is not enabled",
        };
      },
      async promoteToProcedureDraft() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate procedure promotion mode is not enabled",
        };
      },
    };
  }

  return {
    async promoteToMemory(input) {
      if (!params.memoryPromotionEnabled) {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate memory promotion mode is not enabled",
        };
      }
      return params.db.queries.promoteCandidateToMemory(input);
    },
    async promoteToProcedureDraft(input) {
      if (!params.procedureDraftPromotionEnabled) {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate procedure promotion mode is not enabled",
        };
      }

      return params.db.queries.promoteCandidateToProcedureDraft(input);
    },
  };
}

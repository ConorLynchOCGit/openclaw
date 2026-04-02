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
  mode:
    | "disabled"
    | "submit-review-promote-memory"
    | "submit-review-promote-memory-procedure"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): CandidatePromotionPort {
  const mode = params.mode;

  if (mode === "disabled") {
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
    promoteToMemory: (input) => params.db.queries.promoteCandidateToMemory(input),
    async promoteToProcedureDraft(input) {
      if (
        mode !==
          "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
        mode !==
          "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
        mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
        mode !== "submit-review-promote-memory-procedure-validate-skill-procurement" &&
        mode !== "submit-review-promote-memory-procedure-validate-skill" &&
        mode !== "submit-review-promote-memory-procedure-validate" &&
        mode !== "submit-review-promote-memory-procedure" &&
        mode !== "candidate-only"
      ) {
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

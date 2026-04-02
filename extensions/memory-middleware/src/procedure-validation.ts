import type {
  MemoryMiddlewareDb,
  ProcedureValidationInput,
  ProcedureValidationResult,
} from "./db/runtime.js";

export type ProcedureValidationPort = {
  validate(input: ProcedureValidationInput): Promise<ProcedureValidationResult>;
};

export function createProcedureValidationPort(params: {
  db: MemoryMiddlewareDb;
  mode:
    | "disabled"
    | "submit-review-promote-memory-procedure-validate"
    | "submit-review-promote-memory-procedure-validate-skill"
    | "submit-review-promote-memory-procedure-validate-skill-procurement"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval"
    | "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install"
    | "candidate-only";
}): ProcedureValidationPort {
  const mode = params.mode;

  if (
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval" &&
    mode !==
      "submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement-vetting" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill-procurement" &&
    mode !== "submit-review-promote-memory-procedure-validate-skill" &&
    mode !== "submit-review-promote-memory-procedure-validate" &&
    mode !== "candidate-only"
  ) {
    return {
      async validate() {
        return {
          accepted: false,
          status: "disabled",
          reason: "procedure validation mode is not enabled",
        };
      },
    };
  }

  return {
    validate: (input) => params.db.queries.validateProcedure(input),
  };
}

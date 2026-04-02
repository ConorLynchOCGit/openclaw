import type {
  MemoryMiddlewareDb,
  ProcedureValidationPlanInput,
  ProcedureValidationPlanResult,
} from "./db/runtime.js";

export type ProcedureValidationPlanPort = {
  plan(input: ProcedureValidationPlanInput): Promise<ProcedureValidationPlanResult>;
};

export function createProcedureValidationPlanPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): ProcedureValidationPlanPort {
  const mode = params.mode;

  if (mode !== "candidate-only") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "procedure validation planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planProcedureValidation(input),
  };
}

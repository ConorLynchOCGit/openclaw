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
  enabled: boolean;
}): ProcedureValidationPort {
  if (!params.enabled) {
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

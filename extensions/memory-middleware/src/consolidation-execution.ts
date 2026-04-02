import type {
  ConsolidationExecuteInput,
  ConsolidationExecuteResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type ConsolidationExecutionPort = {
  execute(input: ConsolidationExecuteInput): Promise<ConsolidationExecuteResult>;
};

export function createConsolidationExecutionPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): ConsolidationExecutionPort {
  if (params.mode !== "candidate-only") {
    return {
      async execute() {
        return {
          accepted: false,
          status: "disabled",
          reason: "consolidation execution mode is not enabled",
        };
      },
    };
  }

  return {
    execute: (input) => params.db.queries.executeConsolidation(input),
  };
}

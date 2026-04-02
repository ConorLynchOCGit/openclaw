import type {
  DriftCheckExecuteInput,
  DriftCheckExecuteResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type DriftCheckExecutionPort = {
  execute(input: DriftCheckExecuteInput): Promise<DriftCheckExecuteResult>;
};

export function createDriftCheckExecutionPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): DriftCheckExecutionPort {
  if (params.mode !== "candidate-only") {
    return {
      async execute() {
        return {
          accepted: false,
          status: "disabled",
          reason: "drift-check execution mode is not enabled",
        };
      },
    };
  }

  return {
    execute: (input) => params.db.queries.executeDriftCheck(input),
  };
}

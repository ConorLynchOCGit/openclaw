import type {
  FullCompactionFallbackExecuteInput,
  FullCompactionFallbackExecuteResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type FullCompactionFallbackPort = {
  execute(input: FullCompactionFallbackExecuteInput): Promise<FullCompactionFallbackExecuteResult>;
};

export function createFullCompactionFallbackPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): FullCompactionFallbackPort {
  if (params.mode !== "candidate-only") {
    return {
      async execute() {
        return {
          accepted: false,
          status: "disabled",
          reason: "full compaction fallback mode is not enabled",
        };
      },
    };
  }

  return {
    execute: (input) => params.db.queries.executeFullCompactionFallback(input),
  };
}

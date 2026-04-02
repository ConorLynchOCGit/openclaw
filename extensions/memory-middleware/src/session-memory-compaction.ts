import type {
  MemoryMiddlewareDb,
  SessionMemoryCompactExecuteInput,
  SessionMemoryCompactExecuteResult,
} from "./db/runtime.js";

export type SessionMemoryCompactionPort = {
  execute(input: SessionMemoryCompactExecuteInput): Promise<SessionMemoryCompactExecuteResult>;
};

export function createSessionMemoryCompactionPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): SessionMemoryCompactionPort {
  if (params.mode !== "candidate-only") {
    return {
      async execute() {
        return {
          accepted: false,
          status: "disabled",
          reason: "session-memory compaction mode is not enabled",
        };
      },
    };
  }

  return {
    execute: (input) => params.db.queries.executeSessionMemoryCompaction(input),
  };
}

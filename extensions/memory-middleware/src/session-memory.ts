import type {
  MemoryMiddlewareDb,
  SessionMemoryGetInput,
  SessionMemoryGetResult,
  SessionMemoryUpdateInput,
  SessionMemoryUpdateResult,
} from "./db/runtime.js";

export type SessionMemoryPort = {
  get(input: SessionMemoryGetInput): Promise<SessionMemoryGetResult>;
  update(input: SessionMemoryUpdateInput): Promise<SessionMemoryUpdateResult>;
};

export function createSessionMemoryPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): SessionMemoryPort {
  if (params.mode !== "candidate-only") {
    return {
      async get() {
        return {
          accepted: false,
          status: "disabled",
          reason: "session-memory mode is not enabled",
        };
      },
      async update() {
        return {
          accepted: false,
          status: "disabled",
          reason: "session-memory mode is not enabled",
        };
      },
    };
  }

  return {
    get: (input) => params.db.queries.getSessionMemory(input),
    update: (input) => params.db.queries.updateSessionMemory(input),
  };
}

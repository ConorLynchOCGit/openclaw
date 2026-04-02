import type {
  MemoryMiddlewareDb,
  MemoryProactivePlanInput,
  MemoryProactivePlanResult,
} from "./db/runtime.js";

export type ProactivePlanningPort = {
  plan(input: MemoryProactivePlanInput): Promise<MemoryProactivePlanResult>;
};

export function createProactivePlanningPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): ProactivePlanningPort {
  if (params.mode !== "candidate-only") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "proactive planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planProactivity(input),
  };
}

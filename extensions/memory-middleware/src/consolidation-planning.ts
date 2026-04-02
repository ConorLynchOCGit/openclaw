import type {
  ConsolidationPlanInput,
  ConsolidationPlanResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type ConsolidationPlanningPort = {
  plan(input: ConsolidationPlanInput): Promise<ConsolidationPlanResult>;
};

export function createConsolidationPlanningPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): ConsolidationPlanningPort {
  if (params.mode !== "candidate-only") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "consolidation planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planConsolidation(input),
  };
}

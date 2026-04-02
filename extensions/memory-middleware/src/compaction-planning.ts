import type {
  CompactionPlanInput,
  CompactionPlanResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CompactionPlanningPort = {
  plan(input: CompactionPlanInput): Promise<CompactionPlanResult>;
};

export function createCompactionPlanningPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): CompactionPlanningPort {
  if (params.mode !== "candidate-only") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "compaction planning mode is not enabled",
        };
      },
    };
  }

  return {
    plan: (input) => params.db.queries.planCompaction(input),
  };
}

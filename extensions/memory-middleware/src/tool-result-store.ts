import type {
  MemoryMiddlewareDb,
  ToolResultGetInput,
  ToolResultGetResult,
  ToolResultMicrocompactExecuteInput,
  ToolResultMicrocompactExecuteResult,
  ToolResultMicrocompactPlanInput,
  ToolResultMicrocompactPlanResult,
  ToolResultPersistInput,
  ToolResultPersistResult,
} from "./db/runtime.js";

export type ToolResultStorePort = {
  persist(input: ToolResultPersistInput): Promise<ToolResultPersistResult>;
  get(input: ToolResultGetInput): Promise<ToolResultGetResult>;
  planMicrocompaction(
    input: ToolResultMicrocompactPlanInput,
  ): Promise<ToolResultMicrocompactPlanResult>;
  executeMicrocompaction(
    input: ToolResultMicrocompactExecuteInput,
  ): Promise<ToolResultMicrocompactExecuteResult>;
};

export function createToolResultStorePort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): ToolResultStorePort {
  if (params.mode !== "candidate-only") {
    return {
      async persist() {
        return {
          accepted: false,
          status: "disabled",
          reason: "tool-result persistence mode is not enabled",
        };
      },
      async get() {
        return {
          accepted: false,
          status: "disabled",
          reason: "tool-result persistence mode is not enabled",
        };
      },
      async planMicrocompaction() {
        return {
          accepted: false,
          status: "disabled",
          reason: "tool-result microcompaction mode is not enabled",
        };
      },
      async executeMicrocompaction() {
        return {
          accepted: false,
          status: "disabled",
          reason: "tool-result microcompaction mode is not enabled",
        };
      },
    };
  }

  return {
    persist: (input) => params.db.queries.persistToolResult(input),
    get: (input) => params.db.queries.getToolResult(input),
    planMicrocompaction: (input) => params.db.queries.planToolResultMicrocompaction(input),
    executeMicrocompaction: (input) => params.db.queries.executeToolResultMicrocompaction(input),
  };
}

import type {
  MemoryMiddlewareDb,
  MemoryObjectGetInput,
  MemoryObjectGetResult,
  MemoryObjectListInput,
  MemoryObjectListResult,
  MemoryObjectSearchBasicInput,
  MemoryObjectSearchBasicResult,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchSemanticInput,
  MemoryObjectSearchSemanticResult,
} from "./db/runtime.js";

export type MemoryObjectQueryPort = {
  get(input: MemoryObjectGetInput): Promise<MemoryObjectGetResult>;
  list(input: MemoryObjectListInput): Promise<MemoryObjectListResult>;
  searchBasic(input: MemoryObjectSearchBasicInput): Promise<MemoryObjectSearchBasicResult>;
  searchHybrid(input: MemoryObjectSearchHybridInput): Promise<MemoryObjectSearchHybridResult>;
  searchSemantic(input: MemoryObjectSearchSemanticInput): Promise<MemoryObjectSearchSemanticResult>;
};

export function createMemoryObjectQueryPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "read-only" | "candidate-only";
}): MemoryObjectQueryPort {
  const mode = params.mode;

  if (mode === "disabled") {
    return {
      async get() {
        return {
          accepted: false,
          status: "disabled",
          reason: "memory object query mode is not enabled",
        };
      },
      async list() {
        return {
          accepted: false,
          status: "disabled",
          reason: "memory object query mode is not enabled",
        };
      },
      async searchBasic() {
        return {
          accepted: false,
          status: "disabled",
          reason: "memory object query mode is not enabled",
        };
      },
      async searchHybrid() {
        return {
          accepted: false,
          status: "disabled",
          reason: "memory object query mode is not enabled",
        };
      },
      async searchSemantic() {
        return {
          accepted: false,
          status: "disabled",
          reason: "memory object query mode is not enabled",
        };
      },
    };
  }

  return {
    get: (input) => params.db.queries.getMemoryObject(input),
    list: (input) => params.db.queries.listMemoryObjects(input),
    searchBasic: (input) => params.db.queries.searchMemoryObjectsBasic(input),
    searchHybrid: (input) => params.db.queries.searchMemoryObjectsHybrid(input),
    searchSemantic: (input) => params.db.queries.searchMemoryObjectsSemantic(input),
  };
}

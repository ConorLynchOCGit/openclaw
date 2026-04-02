import type {
  CandidateGetInput,
  CandidateGetResult,
  CandidateListInput,
  CandidateListResult,
  MemoryMiddlewareDb,
} from "./db/runtime.js";

export type CandidateQueryPort = {
  list(input: CandidateListInput): Promise<CandidateListResult>;
  get(input: CandidateGetInput): Promise<CandidateGetResult>;
};

export function createCandidateQueryPort(params: {
  db: MemoryMiddlewareDb;
  mode: "disabled" | "candidate-only";
}): CandidateQueryPort {
  const mode = params.mode;

  if (mode !== "candidate-only") {
    return {
      async list() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate query mode is not enabled",
        };
      },
      async get() {
        return {
          accepted: false,
          status: "disabled",
          reason: "candidate query mode is not enabled",
        };
      },
    };
  }

  return {
    list: (input) => params.db.queries.listCandidates(input),
    get: (input) => params.db.queries.getCandidate(input),
  };
}

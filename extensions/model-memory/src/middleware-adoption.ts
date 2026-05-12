export const MODEL_MEMORY_MIDDLEWARE_ADOPTION_VERSION = "model-memory.middleware-adoption.v1";

export type MemoryMiddlewareKind = "model_task" | "script_job" | "db_operation";

export type MemoryMiddlewareEvidence = {
  feature:
    | "capture"
    | "retrieval_context"
    | "context_budget"
    | "skillifier"
    | "proactivity"
    | "opportunity_seed_consumption";
  modelTaskRefs: string[];
  scriptJobRefs: string[];
  dbOperationRefs: string[];
  approvedDirectRepositoryRefs: string[];
  unapprovedDirectModelRefs: string[];
  unapprovedDirectDbRefs: string[];
  unapprovedDirectScriptRefs: string[];
  rawTranscriptStored: boolean;
  rawPromptStored: boolean;
  rawResponseStored: boolean;
  rawProviderLogStored: boolean;
  rawToolLogStored: boolean;
  rawCommandLogStored: boolean;
  rawDbRowsStored: boolean;
  workQueueLifecycleMutated: boolean;
};

export type MemoryMiddlewareAdoptionResult = {
  artifactKind: "model_memory_middleware_adoption_result";
  adoptionVersion: typeof MODEL_MEMORY_MIDDLEWARE_ADOPTION_VERSION;
  feature: MemoryMiddlewareEvidence["feature"];
  status: "passed" | "needs_review" | "blocked";
  accepted: boolean;
  requiredMiddlewareKinds: MemoryMiddlewareKind[];
  observedMiddlewareKinds: MemoryMiddlewareKind[];
  approvedDirectRepositoryRefs: string[];
  reasonCodes: string[];
  rawTranscriptStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type ContextBudgetEvidence = {
  sessionId: string;
  agentId: string;
  maxTokens: number;
  estimatedTokens: number;
  retrievalPackTokens: number;
  stableMemoryTokens: number;
  volatileTurnTokens: number;
  toolResultTokens: number;
  automaticTrimOrCompactionApplied: boolean;
  compactCommandBlockedByOverLimit: boolean;
  rawTranscriptStored: boolean;
};

export type ContextBudgetResult = {
  artifactKind: "model_memory_context_budget_result";
  adoptionVersion: typeof MODEL_MEMORY_MIDDLEWARE_ADOPTION_VERSION;
  accepted: boolean;
  status: "passed" | "needs_review" | "blocked";
  sessionId: string;
  agentId: string;
  maxTokens: number;
  estimatedTokens: number;
  reasonCodes: string[];
  rawTranscriptStored: false;
  workQueueLifecycleMutated: false;
};

const FEATURE_REQUIREMENTS: Record<MemoryMiddlewareEvidence["feature"], MemoryMiddlewareKind[]> = {
  capture: ["model_task", "db_operation"],
  retrieval_context: ["model_task", "db_operation"],
  context_budget: [],
  skillifier: ["model_task", "db_operation"],
  proactivity: ["model_task", "db_operation"],
  opportunity_seed_consumption: ["db_operation"],
};

export function evaluateModelMemoryMiddlewareAdoption(
  evidence: MemoryMiddlewareEvidence,
): MemoryMiddlewareAdoptionResult {
  const requiredMiddlewareKinds = FEATURE_REQUIREMENTS[evidence.feature];
  const observedMiddlewareKinds: MemoryMiddlewareKind[] = [
    ...(evidence.modelTaskRefs.length > 0 ? (["model_task"] as const) : []),
    ...(evidence.scriptJobRefs.length > 0 ? (["script_job"] as const) : []),
    ...(evidence.dbOperationRefs.length > 0 ? (["db_operation"] as const) : []),
  ];
  const missing = requiredMiddlewareKinds.filter((kind) => !observedMiddlewareKinds.includes(kind));
  const reasonCodes = [
    ...missing.map((kind) => `required_middleware_missing:${kind}`),
    ...(evidence.approvedDirectRepositoryRefs.length > 0
      ? ["approved_direct_repository_exception_present"]
      : []),
    ...(evidence.unapprovedDirectModelRefs.length > 0
      ? ["unapproved_direct_model_path_detected"]
      : []),
    ...(evidence.unapprovedDirectDbRefs.length > 0 ? ["unapproved_direct_db_path_detected"] : []),
    ...(evidence.unapprovedDirectScriptRefs.length > 0
      ? ["unapproved_direct_script_path_detected"]
      : []),
    ...(evidence.rawTranscriptStored ||
    evidence.rawPromptStored ||
    evidence.rawResponseStored ||
    evidence.rawProviderLogStored ||
    evidence.rawToolLogStored ||
    evidence.rawCommandLogStored ||
    evidence.rawDbRowsStored
      ? ["raw_storage_flag_detected"]
      : []),
    ...(evidence.workQueueLifecycleMutated ? ["work_queue_lifecycle_mutated"] : []),
  ];
  const hardBlocked = reasonCodes.some((reason) =>
    [
      "unapproved_direct_model_path_detected",
      "unapproved_direct_db_path_detected",
      "unapproved_direct_script_path_detected",
      "raw_storage_flag_detected",
      "work_queue_lifecycle_mutated",
    ].includes(reason),
  );
  const accepted = missing.length === 0 && !hardBlocked;
  return {
    artifactKind: "model_memory_middleware_adoption_result",
    adoptionVersion: MODEL_MEMORY_MIDDLEWARE_ADOPTION_VERSION,
    feature: evidence.feature,
    status: accepted ? "passed" : hardBlocked ? "blocked" : "needs_review",
    accepted,
    requiredMiddlewareKinds,
    observedMiddlewareKinds,
    approvedDirectRepositoryRefs: evidence.approvedDirectRepositoryRefs.slice(0, 20),
    reasonCodes: accepted
      ? ["model_memory_middleware_adoption_passed"]
      : [...new Set(reasonCodes)].slice(0, 40),
    rawTranscriptStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function evaluateContextBudget(evidence: ContextBudgetEvidence): ContextBudgetResult {
  const reasonCodes = [
    ...(evidence.estimatedTokens <= evidence.maxTokens ? [] : ["context_budget_exceeded"]),
    ...(evidence.estimatedTokens > evidence.maxTokens && !evidence.automaticTrimOrCompactionApplied
      ? ["automatic_trim_or_compaction_missing"]
      : []),
    ...(evidence.compactCommandBlockedByOverLimit ? ["compact_command_blocked_by_over_limit"] : []),
    ...(evidence.rawTranscriptStored ? ["raw_transcript_storage_flag_detected"] : []),
  ];
  const hardBlocked = reasonCodes.includes("raw_transcript_storage_flag_detected");
  const accepted = reasonCodes.length === 0;
  return {
    artifactKind: "model_memory_context_budget_result",
    adoptionVersion: MODEL_MEMORY_MIDDLEWARE_ADOPTION_VERSION,
    accepted,
    status: accepted ? "passed" : hardBlocked ? "blocked" : "needs_review",
    sessionId: evidence.sessionId,
    agentId: evidence.agentId,
    maxTokens: evidence.maxTokens,
    estimatedTokens: evidence.estimatedTokens,
    reasonCodes: accepted ? ["context_budget_passed"] : reasonCodes,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function completeMemoryMiddlewareEvidence(
  feature: MemoryMiddlewareEvidence["feature"],
): MemoryMiddlewareEvidence {
  return {
    feature,
    modelTaskRefs: FEATURE_REQUIREMENTS[feature].includes("model_task")
      ? [`runtime-job://model-memory/${feature}/model-task/validation`]
      : [],
    scriptJobRefs: [],
    dbOperationRefs: FEATURE_REQUIREMENTS[feature].includes("db_operation")
      ? [`runtime-job://model-memory/${feature}/db-operation/metadata`]
      : [],
    approvedDirectRepositoryRefs: [],
    unapprovedDirectModelRefs: [],
    unapprovedDirectDbRefs: [],
    unapprovedDirectScriptRefs: [],
    rawTranscriptStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

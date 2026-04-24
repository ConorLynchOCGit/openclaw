export const MEMORY_INGESTION_PATHS = [
  "document_ingest",
  "ordinary_turn_capture",
  "tool_result_capture",
  "daily_recovery",
  "bootstrap_import",
  "memory_file_import",
  "capture_replay_inspection",
  "heartbeat_proactive_capture",
] as const;

export type MemoryIngestionPath = (typeof MEMORY_INGESTION_PATHS)[number];

export const MEMORY_INGESTION_FAILURE_CLASSES = [
  "provider_credit",
  "provider_empty_response",
  "provider_connection",
  "provider_json_boundary",
  "extraction_repair",
  "capture_routing_repair",
  "canonicalization",
  "db_persistence",
  "pool_pressure",
  "permission",
  "runtime_dirty_persistence",
  "timeout",
  "other",
] as const;

export type MemoryIngestionFailureClass = (typeof MEMORY_INGESTION_FAILURE_CLASSES)[number];

export type MemoryIngestionStage =
  | "source_intake"
  | "source_fingerprint"
  | "privacy_gate"
  | "capture_routing"
  | "provider_boundary"
  | "prompt_plan"
  | "extraction"
  | "extraction_repair"
  | "execution"
  | "parse_boundary"
  | "semantic_contract_boundary"
  | "canonicalization_boundary"
  | "reconciliation_boundary"
  | "admission_validation"
  | "candidate_quarantine"
  | "persistence_boundary"
  | "edge_endpoint_validation"
  | "runtime_dirty"
  | "provider_scorecard"
  | "integrity_audit"
  | "projection_refresh"
  | "closeout_report"
  | "telemetry";

export type MemoryIngestionProviderCapability = {
  provider: string;
  model: string;
  strictSchema: boolean;
  jsonMode: boolean;
  cache: boolean;
  cacheMetrics: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  knownEmptyResponseRate?: number;
  knownJsonFailureRate?: number;
  fallbackEligible: boolean;
  disabledReason?: string;
};

export type MemoryIngestionBudget = {
  maxUsd?: number;
  spentUsd?: number;
  maxUncachedInputTokens?: number;
  uncachedInputTokens?: number;
  maxFailedUsd?: number;
  failedUsd?: number;
};

export type ProviderBoundaryDecision =
  | {
      ok: true;
      provider: string;
      model: string;
      strictSchema: boolean;
      cache: boolean;
    }
  | {
      ok: false;
      failureClass: MemoryIngestionFailureClass;
      reason: string;
      retryable: false;
      resumeBlocked?: "provider_credit";
    };

export type MemoryIngestionRetryDecision =
  | { retry: true; reason: string; useAlternateProvider: boolean; reduceConcurrency: boolean }
  | { retry: false; reason: string };

export type MemoryPromptPlan = {
  path: MemoryIngestionPath;
  contractName: string;
  staticPrefixHash: string;
  dynamicTailHash: string;
  estimatedInputTokens: number;
  expectedOutputTokens: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  cacheEligible: boolean;
};

export type MemoryModelCallTelemetry = {
  model: string;
  provider: string;
  resolvedModel?: string;
  contractName: string;
  promptTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  prefixHash?: string;
  schemaHash?: string;
  promptCacheKey?: string;
};

export type MemoryPromptCacheHealthReport = {
  totalCalls: number;
  cacheableCalls: number;
  cacheHits: number;
  cacheHitRate: number;
  totalPromptTokens: number;
  totalCachedTokens: number;
  cachedTokenPercentage: number;
  averageCachedTokensPerCall: number;
  averageLatencyMsCached?: number;
  averageLatencyMsUncached?: number;
};

export type MemoryIngestionCandidateType =
  | "preference"
  | "directive"
  | "project_fact"
  | "procedure"
  | "source_ref"
  | "decision"
  | "episode"
  | "tool_result_fact"
  | "bootstrap_file_hash"
  | "daily_note_fact";

export type MemoryIngestionCandidateRef = {
  sourceId: string;
  segmentId: string;
  evidenceQuote?: string;
  startChar?: number;
  endChar?: number;
};

export type MemoryIngestionCandidate = {
  candidateId: string;
  candidateType: MemoryIngestionCandidateType;
  canonicalText: string;
  scope: "global" | "workspace" | "project" | "session" | "unknown";
  status?: "active" | "inactive" | "conflicted" | "quarantined";
  sourceRefs: MemoryIngestionCandidateRef[];
};

export type CandidateValidationErrorCode =
  | "missing_canonical_text"
  | "invalid_scope"
  | "invalid_source_ref"
  | "invalid_evidence"
  | "invalid_status"
  | "unsupported_payload_shape";

export type CandidateValidationError = {
  code: CandidateValidationErrorCode;
  message: string;
};

export type CandidateQuarantineRecord = {
  candidateId: string;
  candidateType: MemoryIngestionCandidateType | "unknown";
  failureClass: Extract<MemoryIngestionFailureClass, "extraction_repair" | "canonicalization">;
  errors: CandidateValidationError[];
  sourceRefs: MemoryIngestionCandidateRef[];
};

export type DeferredMemoryEdge<T extends { from_memory_id: string; to_memory_id: string }> = {
  edge: T;
  reason: string;
};

export type MemoryIngestionQuarantineReportRecord = {
  source_id?: string;
  source_hash?: string;
  candidate_id?: string;
  candidate_type?: MemoryIngestionCandidateType | "unknown";
  memory_id?: string;
  event_id?: string;
  edge_id?: string;
  failure_class: MemoryIngestionFailureClass;
  failure_stage: MemoryIngestionStage;
  validation_reason: string;
  provider?: string;
  model?: string;
  schema?: string;
  source_refs?: Array<{
    source_id: string;
    segment_id: string;
    start_char?: number;
    end_char?: number;
  }>;
};

export type MemoryIngestionCloseoutReport = {
  schema_version: "memory_ingestion_closeout.v1";
  generated_at: string;
  path: MemoryIngestionPath;
  trace_id?: string;
  run_id?: string;
  source_id?: string;
  source_hash?: string;
  job_id?: string;
  counts: {
    telemetry_events: number;
    candidates_extracted: number;
    candidates_valid: number;
    candidates_repaired: number;
    candidates_deferred: number;
    candidates_quarantined: number;
    candidates_admitted: number;
    candidates_rejected: number;
    edges_deferred: number;
    failures: number;
    skipped: number;
  };
  failure_class_breakdown: Partial<Record<MemoryIngestionFailureClass, number>>;
  quarantined: MemoryIngestionQuarantineReportRecord[];
  provider_scorecard_refs: Array<{
    provider?: string;
    model?: string;
    contract?: string;
    scorecard_path?: string;
    status?: string;
  }>;
  integrity_audit_refs: Array<{
    report_path?: string;
    finding_count?: number;
    status?: string;
  }>;
  dirty_state?: {
    status: "marked" | "deferred" | "failed" | "not_required";
    reason?: string;
  };
  no_dark_data_scan: {
    passed: true;
    scanned_fields: string[];
  };
  retention: {
    storage: "runtime_state_artifact";
    cleanup: "runtime-state JSON/JSONL rotation and artifact pruning";
  };
};

export type MemoryIngestionTelemetryEvent = {
  schema_version: "memory_ingestion_telemetry.v1";
  path: MemoryIngestionPath;
  stage: MemoryIngestionStage;
  status: "started" | "completed" | "failed" | "skipped" | "quarantined";
  failure_class?: MemoryIngestionFailureClass;
  retry_count?: number;
  candidate_counts?: {
    extracted?: number;
    valid?: number;
    repaired?: number;
    quarantined?: number;
    admitted?: number;
    rejected?: number;
  };
  cost?: {
    input_tokens?: number;
    cached_tokens?: number;
    cache_write_tokens?: number;
    uncached_input_tokens?: number;
    output_tokens?: number;
    estimated_usd?: number;
  };
  ids?: Record<string, string[]>;
  circuit_breaker_reason?: string;
};

export type MemoryIngestionPipelineStageResult = {
  status: "completed" | "skipped" | "quarantined";
  telemetry?: Partial<MemoryIngestionTelemetryEvent>;
};

export type MemoryIngestionPipelineStage = {
  stage: MemoryIngestionStage;
  run: () => Promise<MemoryIngestionPipelineStageResult> | MemoryIngestionPipelineStageResult;
};

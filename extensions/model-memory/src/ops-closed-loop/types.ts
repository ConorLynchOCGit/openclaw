export type ClosedLoopConsumer =
  | "provenance_attachment"
  | "dedupe"
  | "reconciliation"
  | "admission_gate"
  | "retrieval_quality"
  | "compaction_safety"
  | "session_flush"
  | "conflict_resolution"
  | "cron_recommendation"
  | "hook_health";

export type MemoryOpsSignalType =
  | "context_ingest_index"
  | "prompt_assembly_audit"
  | "tool_result_proof"
  | "source_span_verified"
  | "file_hash_observed"
  | "compaction_boundary"
  | "session_command_boundary"
  | "session_end_boundary"
  | "memory_injection_observed"
  | "memory_retrieval_observed"
  | "duplicate_hash_observed"
  | "source_authority_observed"
  | "conflict_observed"
  | "supersession_observed"
  | "recommendation_generated";

export type MemoryOpsSeverity = "debug" | "info" | "warning" | "action_required" | "critical";

export type MemoryOpsSignalRetentionPolicy =
  | "ephemeral"
  | "aggregate_only"
  | "until_candidate_resolved"
  | "until_memory_superseded"
  | "bounded_audit";

export type MemoryOpsSignal = {
  signal_id: string;
  schema_version: "memory_ops_signal.v1";
  signal_type: MemoryOpsSignalType;
  consumers: ClosedLoopConsumer[];
  created_at: string;
  observed_at: string;
  tenant_id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  session_id?: string | null;
  session_key?: string | null;
  run_id?: string | null;
  related_evidence_ids?: string[];
  related_candidate_ids?: string[];
  related_memory_ids?: string[];
  related_source_ids?: string[];
  severity: MemoryOpsSeverity;
  payload: Record<string, unknown>;
  retention: {
    policy: MemoryOpsSignalRetentionPolicy;
    ttl_seconds?: number | null;
  };
  privacy: {
    contains_raw_text: boolean;
    contains_user_content: boolean;
    contains_prompt_content: boolean;
    contains_secret: boolean;
    redacted: boolean;
  };
  usage_contract: {
    used_by: ClosedLoopConsumer[];
    action: string;
    recommendation_template_id?: string | null;
  };
};

export type RecommendationSeverity = "info" | "warning" | "action_required" | "critical";

export type RecommendationStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export type MemoryOpsRecommendationCategory =
  | "capture_gap"
  | "retrieval_miss"
  | "bad_injection"
  | "stale_memory"
  | "conflict_unresolved"
  | "superseded_memory_injected"
  | "compaction_risk"
  | "session_flush_failed"
  | "dedupe_failure"
  | "procedure_leakage"
  | "provenance_gap"
  | "source_span_failure"
  | "file_watcher_gap"
  | "hook_health";

export type MemoryOpsRecommendation = {
  recommendation_id: string;
  schema_version: "memory_ops_recommendation.v1";
  created_at: string;
  severity: RecommendationSeverity;
  status: RecommendationStatus;
  title: string;
  summary: string;
  evidence_signal_ids: string[];
  related_memory_ids?: string[];
  related_candidate_ids?: string[];
  related_session_ids?: string[];
  related_hook_names?: string[];
  category: MemoryOpsRecommendationCategory;
  recommended_action: string;
  suggested_command?: string | null;
  auto_fix_available: boolean;
  auto_fix_enabled: boolean;
  safe_to_auto_fix: boolean;
};

export type MemoryOpsRecordResult =
  | { persisted: true; path: string }
  | { persisted: false; reason: string };

export interface MemoryOpsEventSink {
  recordSignal(signal: MemoryOpsSignal): Promise<void>;
  recordRecommendation(recommendation: MemoryOpsRecommendation): Promise<void>;
  markRecommendationResolved(id: string, reason: string): Promise<void>;
}

export interface MemoryStateReader {
  getMemoryStatus(memoryId: string): Promise<{
    memory_id: string;
    status: "active" | "superseded" | "conflicted" | "quarantined" | "deleted";
    kind?: string | null;
    artifact_type?: string | null;
    scope?: Record<string, unknown>;
  } | null>;
  getCandidateStatus(candidateId: string): Promise<Record<string, unknown> | null>;
  findEvidenceByHash(hash: string): Promise<Array<{ evidence_id: string; source_type: string }>>;
}

export interface MemoryOpsActionSink {
  requestBatchFlush(params: {
    session_id?: string | null;
    session_key?: string | null;
    reason: string;
    from_index?: number | null;
    to_index?: number | null;
  }): Promise<{ ok: boolean; error?: string }>;
  verifySourceSpan(params: {
    candidate_id?: string;
    memory_id?: string;
    source_id: string;
    start_char?: number;
    end_char?: number;
    start_line?: number;
    end_line?: number;
  }): Promise<{ ok: boolean; reason?: string }>;
}

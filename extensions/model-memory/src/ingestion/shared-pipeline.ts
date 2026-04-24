import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

export function classifyMemoryIngestionFailure(message: string): MemoryIngestionFailureClass {
  const normalized = message.toLowerCase();
  if (
    (normalized.includes("runtime_dirty") ||
      normalized.includes("runtime dirty") ||
      normalized.includes("runtime-dirty")) &&
    (normalized.includes("eacces") ||
      normalized.includes("eperm") ||
      normalized.includes("permission denied") ||
      normalized.includes("read-only") ||
      normalized.includes("readonly"))
  ) {
    return "runtime_dirty_persistence";
  }
  if (
    normalized.includes("eacces") ||
    normalized.includes("eperm") ||
    normalized.includes("permission denied") ||
    normalized.includes("operation not permitted")
  ) {
    return "permission";
  }
  if (
    normalized.includes("402") ||
    normalized.includes("insufficient credits") ||
    normalized.includes("provider_credit") ||
    normalized.includes("budget exceeded")
  ) {
    return "provider_credit";
  }
  if (
    normalized.includes("provider_response missing text content") ||
    normalized.includes("missing text content in model response") ||
    normalized.includes("empty response") ||
    normalized.includes("non-text response")
  ) {
    return "provider_empty_response";
  }
  if (
    normalized.includes("connection terminated") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network")
  ) {
    return "provider_connection";
  }
  if (
    normalized.includes("expected ',' or '}'") ||
    normalized.includes("expected property name") ||
    normalized.includes("unexpected token") ||
    normalized.includes("unterminated string") ||
    normalized.includes("unexpected non-whitespace character") ||
    normalized.includes("bad control character") ||
    normalized.includes("provider_json_boundary") ||
    normalized.includes("jsonmodeloutputerror") ||
    normalized.includes("invalid json")
  ) {
    return "provider_json_boundary";
  }
  if (
    normalized.includes("capture routing repair") ||
    normalized.includes("capture_routing_repair")
  ) {
    return "capture_routing_repair";
  }
  if (
    normalized.includes("extraction repair") ||
    normalized.includes("atomic_extraction_repair") ||
    normalized.includes("composite_extraction_repair") ||
    normalized.includes("extraction_repair")
  ) {
    return "extraction_repair";
  }
  if (
    normalized.includes("canonicalization produced invalid output") ||
    normalized.includes("canonicalization_invalid_output") ||
    normalized.includes("invalid mmv2 canonicalization repair")
  ) {
    return "canonicalization";
  }
  if (
    normalized.includes("foreign key") ||
    normalized.includes("violates") ||
    normalized.includes("db_persistence")
  ) {
    return "db_persistence";
  }
  if (
    normalized.includes("pool pressure") ||
    normalized.includes("pool_pressure") ||
    normalized.includes("connection pool pressure") ||
    normalized.includes("db pool pressure")
  ) {
    return "pool_pressure";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "timeout";
  }
  return "other";
}

export function isMemoryIngestionProviderBoundaryFailure(
  failureClass: MemoryIngestionFailureClass,
): boolean {
  return (
    failureClass === "provider_credit" ||
    failureClass === "provider_empty_response" ||
    failureClass === "provider_connection" ||
    failureClass === "provider_json_boundary"
  );
}

function hasBudgetExceeded(budget: MemoryIngestionBudget | undefined): boolean {
  if (!budget) {
    return false;
  }
  return (
    (budget.maxUsd !== undefined && (budget.spentUsd ?? 0) >= budget.maxUsd) ||
    (budget.maxUncachedInputTokens !== undefined &&
      (budget.uncachedInputTokens ?? 0) >= budget.maxUncachedInputTokens) ||
    (budget.maxFailedUsd !== undefined && (budget.failedUsd ?? 0) >= budget.maxFailedUsd)
  );
}

export function evaluateProviderBoundary(input: {
  capability: MemoryIngestionProviderCapability;
  requiresStrictSchema?: boolean;
  requiresCache?: boolean;
  budget?: MemoryIngestionBudget;
}): ProviderBoundaryDecision {
  const { capability } = input;
  if (capability.disabledReason) {
    return {
      ok: false,
      failureClass: "provider_connection",
      reason: capability.disabledReason,
      retryable: false,
    };
  }
  if (hasBudgetExceeded(input.budget)) {
    return {
      ok: false,
      failureClass: "provider_credit",
      reason: "provider budget ceiling reached before ingestion work",
      retryable: false,
      resumeBlocked: "provider_credit",
    };
  }
  if (input.requiresStrictSchema === true && !capability.strictSchema) {
    return {
      ok: false,
      failureClass: "provider_json_boundary",
      reason: `${capability.provider}/${capability.model} does not support strict structured output`,
      retryable: false,
    };
  }
  if (input.requiresCache === true && !capability.cache) {
    return {
      ok: false,
      failureClass: "provider_connection",
      reason: `${capability.provider}/${capability.model} does not support required prompt caching`,
      retryable: false,
    };
  }
  return {
    ok: true,
    provider: capability.provider,
    model: capability.model,
    strictSchema: capability.strictSchema,
    cache: capability.cache,
  };
}

export type MemoryIngestionRetryDecision =
  | { retry: true; reason: string; useAlternateProvider: boolean; reduceConcurrency: boolean }
  | { retry: false; reason: string };

export function decideMemoryIngestionRetry(input: {
  failureClass: MemoryIngestionFailureClass;
  priorAttempts: number;
  maxEmptyResponseRetries?: number;
  maxConnectionRetries?: number;
  maxJsonSyntaxRepairAttempts?: number;
  providerHealthy?: boolean;
  alternateProviderVerified?: boolean;
}): MemoryIngestionRetryDecision {
  if (input.failureClass === "provider_credit") {
    return { retry: false, reason: "provider_credit is a hard-stop class" };
  }
  if (input.failureClass === "provider_empty_response") {
    const cap = input.maxEmptyResponseRetries ?? 1;
    if (input.priorAttempts < cap && input.providerHealthy !== false) {
      return {
        retry: true,
        reason: "empty provider response retry within strict cap",
        useAlternateProvider: false,
        reduceConcurrency: false,
      };
    }
    if (input.alternateProviderVerified === true) {
      return {
        retry: true,
        reason: "empty provider response fallback to verified structured-output provider",
        useAlternateProvider: true,
        reduceConcurrency: false,
      };
    }
    return { retry: false, reason: "empty provider response retry cap reached" };
  }
  if (input.failureClass === "provider_connection") {
    const cap = input.maxConnectionRetries ?? 2;
    return input.priorAttempts < cap
      ? {
          retry: true,
          reason: "transient provider connection retry with jitter/backoff",
          useAlternateProvider: false,
          reduceConcurrency: true,
        }
      : { retry: false, reason: "provider connection retry cap reached" };
  }
  if (input.failureClass === "pool_pressure") {
    const cap = input.maxConnectionRetries ?? 2;
    return input.priorAttempts < cap
      ? {
          retry: true,
          reason: "database pool pressure retry with reduced background concurrency",
          useAlternateProvider: false,
          reduceConcurrency: true,
        }
      : { retry: false, reason: "database pool pressure retry cap reached" };
  }
  if (input.failureClass === "provider_json_boundary") {
    const cap = input.maxJsonSyntaxRepairAttempts ?? 1;
    return input.priorAttempts < cap
      ? {
          retry: true,
          reason: "one syntax-boundary repair attempt",
          useAlternateProvider: false,
          reduceConcurrency: false,
        }
      : { retry: false, reason: "JSON repair cap reached; quarantine instead" };
  }
  return { retry: false, reason: `${input.failureClass} is not retryable by execution replay` };
}

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

function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildMemoryPromptCacheHealthReport(
  calls: MemoryModelCallTelemetry[],
): MemoryPromptCacheHealthReport {
  const cacheableCalls = calls.filter((call) => call.promptCacheKey || call.prefixHash);
  const cacheHits = calls.filter((call) => (call.cachedTokens ?? 0) > 0);
  const totalPromptTokens = calls.reduce((sum, call) => sum + (call.promptTokens ?? 0), 0);
  const totalCachedTokens = calls.reduce((sum, call) => sum + (call.cachedTokens ?? 0), 0);
  const cachedLatencies = calls
    .filter((call) => (call.cachedTokens ?? 0) > 0 && call.latencyMs !== undefined)
    .map((call) => call.latencyMs as number);
  const uncachedLatencies = calls
    .filter((call) => (call.cachedTokens ?? 0) === 0 && call.latencyMs !== undefined)
    .map((call) => call.latencyMs as number);
  return {
    totalCalls: calls.length,
    cacheableCalls: cacheableCalls.length,
    cacheHits: cacheHits.length,
    cacheHitRate: cacheableCalls.length > 0 ? cacheHits.length / cacheableCalls.length : 0,
    totalPromptTokens,
    totalCachedTokens,
    cachedTokenPercentage: totalPromptTokens > 0 ? totalCachedTokens / totalPromptTokens : 0,
    averageCachedTokensPerCall: calls.length > 0 ? totalCachedTokens / calls.length : 0,
    averageLatencyMsCached: average(cachedLatencies),
    averageLatencyMsUncached: average(uncachedLatencies),
  };
}

function stableHash(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256")
    .update(text ?? "")
    .digest("hex");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildMemoryPromptPlan(input: {
  path: MemoryIngestionPath;
  contractName: string;
  staticPrefix: string;
  dynamicSourceTail: string;
  expectedOutputTokens: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  cacheEligible?: boolean;
}): MemoryPromptPlan {
  return {
    path: input.path,
    contractName: input.contractName,
    staticPrefixHash: stableHash(input.staticPrefix),
    dynamicTailHash: stableHash(input.dynamicSourceTail),
    estimatedInputTokens:
      estimateTokens(input.staticPrefix) + estimateTokens(input.dynamicSourceTail),
    expectedOutputTokens: input.expectedOutputTokens,
    maxContextTokens: input.maxContextTokens,
    maxOutputTokens: input.maxOutputTokens,
    cacheEligible: input.cacheEligible ?? true,
  };
}

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

const VALID_SCOPES = new Set<MemoryIngestionCandidate["scope"]>([
  "global",
  "workspace",
  "project",
  "session",
  "unknown",
]);

const VALID_STATUSES = new Set<NonNullable<MemoryIngestionCandidate["status"]>>([
  "active",
  "inactive",
  "conflicted",
  "quarantined",
]);

export function validateMemoryIngestionCandidate(
  candidate: MemoryIngestionCandidate,
): CandidateValidationError[] {
  const errors: CandidateValidationError[] = [];
  if (candidate.canonicalText.trim().length === 0) {
    errors.push({
      code: "missing_canonical_text",
      message: "canonical text is required",
    });
  }
  if (!VALID_SCOPES.has(candidate.scope)) {
    errors.push({
      code: "invalid_scope",
      message: `scope ${candidate.scope} is not supported`,
    });
  }
  if (candidate.status !== undefined && !VALID_STATUSES.has(candidate.status)) {
    errors.push({
      code: "invalid_status",
      message: `status ${candidate.status} is not supported`,
    });
  }
  if (candidate.sourceRefs.length === 0) {
    errors.push({
      code: "invalid_source_ref",
      message: "at least one source ref is required",
    });
  }
  for (const ref of candidate.sourceRefs) {
    if (!ref.sourceId || !ref.segmentId) {
      errors.push({
        code: "invalid_source_ref",
        message: "source refs require sourceId and segmentId",
      });
    }
    if (ref.evidenceQuote !== undefined && ref.evidenceQuote.trim().length === 0) {
      errors.push({
        code: "invalid_evidence",
        message: "evidence quote cannot be blank when provided",
      });
    }
  }
  return errors;
}

export function partitionMemoryIngestionCandidates(candidates: MemoryIngestionCandidate[]): {
  validCandidates: MemoryIngestionCandidate[];
  quarantinedCandidates: CandidateQuarantineRecord[];
} {
  const validCandidates: MemoryIngestionCandidate[] = [];
  const quarantinedCandidates: CandidateQuarantineRecord[] = [];
  for (const candidate of candidates) {
    const errors = validateMemoryIngestionCandidate(candidate);
    if (errors.length === 0) {
      validCandidates.push(candidate);
    } else {
      quarantinedCandidates.push({
        candidateId: candidate.candidateId,
        candidateType: candidate.candidateType,
        failureClass: errors.some((error) => error.code === "missing_canonical_text")
          ? "canonicalization"
          : "extraction_repair",
        errors,
        sourceRefs: candidate.sourceRefs,
      });
    }
  }
  return { validCandidates, quarantinedCandidates };
}

export function buildCandidateRepairPayload(input: {
  candidate: MemoryIngestionCandidate;
  validationErrors: CandidateValidationError[];
}): {
  candidate_id: string;
  candidate_type: MemoryIngestionCandidateType;
  canonical_text: string;
  source_refs: MemoryIngestionCandidateRef[];
  validation_errors: CandidateValidationError[];
} {
  return {
    candidate_id: input.candidate.candidateId,
    candidate_type: input.candidate.candidateType,
    canonical_text: input.candidate.canonicalText,
    source_refs: input.candidate.sourceRefs,
    validation_errors: input.validationErrors,
  };
}

export type DeferredMemoryEdge<T extends { from_memory_id: string; to_memory_id: string }> = {
  edge: T;
  reason: string;
};

export function partitionMemoryEdgesByKnownEndpoints<
  T extends { from_memory_id: string; to_memory_id: string },
>(input: {
  edges: T[];
  knownMemoryIds: ReadonlySet<string>;
}): {
  validEdges: T[];
  deferredEdges: Array<DeferredMemoryEdge<T>>;
} {
  const validEdges: T[] = [];
  const deferredEdges: Array<DeferredMemoryEdge<T>> = [];
  for (const edge of input.edges) {
    const missingEndpointIds = [edge.from_memory_id, edge.to_memory_id].filter(
      (endpointId) => !input.knownMemoryIds.has(endpointId),
    );
    if (missingEndpointIds.length > 0) {
      deferredEdges.push({
        edge,
        reason: `missing endpoint memory id(s): ${missingEndpointIds.join(", ")}`,
      });
    } else {
      validEdges.push(edge);
    }
  }
  return { validEdges, deferredEdges };
}

function redactSourceRefsForReport(
  refs: MemoryIngestionCandidateRef[],
): MemoryIngestionQuarantineReportRecord["source_refs"] {
  return refs.map((ref) => ({
    source_id: ref.sourceId,
    segment_id: ref.segmentId,
    ...(typeof ref.startChar === "number" ? { start_char: ref.startChar } : {}),
    ...(typeof ref.endChar === "number" ? { end_char: ref.endChar } : {}),
  }));
}

function summarizeCandidateErrors(errors: CandidateValidationError[]): string {
  return errors.map((error) => error.code).join(",") || "candidate_validation_failed";
}

export function buildCandidateQuarantineReportRecords(input: {
  sourceId?: string;
  sourceHash?: string;
  provider?: string;
  model?: string;
  schema?: string;
  quarantinedCandidates?: CandidateQuarantineRecord[];
  deferredCandidates?: Array<{
    memoryId?: string;
    reason: string;
  }>;
  deferredEdges?: Array<{
    edgeId?: string;
    fromMemoryId?: string;
    toMemoryId?: string;
    reason: string;
  }>;
}): MemoryIngestionQuarantineReportRecord[] {
  const candidateRecords = (input.quarantinedCandidates ?? []).map((candidate) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    candidate_id: candidate.candidateId,
    candidate_type: candidate.candidateType,
    failure_class: candidate.failureClass,
    failure_stage: "candidate_quarantine" as const,
    validation_reason: summarizeCandidateErrors(candidate.errors),
    provider: input.provider,
    model: input.model,
    schema: input.schema,
    source_refs: redactSourceRefsForReport(candidate.sourceRefs),
  }));
  const deferredCandidateRecords = (input.deferredCandidates ?? []).map((candidate) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    memory_id: candidate.memoryId,
    failure_class: "db_persistence" as const,
    failure_stage: "persistence_boundary" as const,
    validation_reason: candidate.reason,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
  }));
  const edgeRecords = (input.deferredEdges ?? []).map((edge) => ({
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    edge_id: edge.edgeId,
    memory_id: [edge.fromMemoryId, edge.toMemoryId].filter(Boolean).join("->") || undefined,
    failure_class: "db_persistence" as const,
    failure_stage: "edge_endpoint_validation" as const,
    validation_reason: edge.reason,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
  }));
  return [...candidateRecords, ...deferredCandidateRecords, ...edgeRecords].map((record) =>
    assertMemoryIngestionReportRecordHasNoDarkData(record),
  );
}

function countFailuresByClass(
  events: MemoryIngestionTelemetryEvent[],
): Partial<Record<MemoryIngestionFailureClass, number>> {
  const counts: Partial<Record<MemoryIngestionFailureClass, number>> = {};
  for (const event of events) {
    if (!event.failure_class) {
      continue;
    }
    counts[event.failure_class] = (counts[event.failure_class] ?? 0) + 1;
  }
  return counts;
}

function sumCandidateCount(
  events: MemoryIngestionTelemetryEvent[],
  key: keyof NonNullable<MemoryIngestionTelemetryEvent["candidate_counts"]>,
): number {
  return events.reduce((sum, event) => sum + (event.candidate_counts?.[key] ?? 0), 0);
}

function sanitizeReportFileId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "closeout";
}

function assertMemoryIngestionReportRecordHasNoDarkData<T>(record: T): T {
  assertNoDarkDataValue(record, "report");
  return record;
}

export function buildMemoryIngestionCloseoutReport(input: {
  path: MemoryIngestionPath;
  runId?: string;
  sourceId?: string;
  sourceHash?: string;
  jobId?: string;
  telemetryEvents?: MemoryIngestionTelemetryEvent[];
  quarantinedCandidates?: CandidateQuarantineRecord[];
  deferredCandidates?: Array<{
    memoryId?: string;
    reason: string;
  }>;
  deferredEdges?: Array<{
    edgeId?: string;
    fromMemoryId?: string;
    toMemoryId?: string;
    reason: string;
  }>;
  providerScorecards?: MemoryIngestionCloseoutReport["provider_scorecard_refs"];
  integrityAudits?: MemoryIngestionCloseoutReport["integrity_audit_refs"];
  dirtyState?: MemoryIngestionCloseoutReport["dirty_state"];
  provider?: string;
  model?: string;
  schema?: string;
  generatedAt?: Date;
}): MemoryIngestionCloseoutReport {
  const telemetryEvents = input.telemetryEvents ?? [];
  const quarantined = buildCandidateQuarantineReportRecords({
    sourceId: input.sourceId,
    sourceHash: input.sourceHash,
    provider: input.provider,
    model: input.model,
    schema: input.schema,
    quarantinedCandidates: input.quarantinedCandidates,
    deferredCandidates: input.deferredCandidates,
    deferredEdges: input.deferredEdges,
  });
  const report: MemoryIngestionCloseoutReport = {
    schema_version: "memory_ingestion_closeout.v1",
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    path: input.path,
    run_id: input.runId,
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    job_id: input.jobId,
    counts: {
      telemetry_events: telemetryEvents.length,
      candidates_extracted: sumCandidateCount(telemetryEvents, "extracted"),
      candidates_valid: sumCandidateCount(telemetryEvents, "valid"),
      candidates_repaired: sumCandidateCount(telemetryEvents, "repaired"),
      candidates_deferred: input.deferredCandidates?.length ?? 0,
      candidates_quarantined:
        sumCandidateCount(telemetryEvents, "quarantined") +
        (input.quarantinedCandidates?.length ?? 0),
      candidates_admitted: sumCandidateCount(telemetryEvents, "admitted"),
      candidates_rejected: sumCandidateCount(telemetryEvents, "rejected"),
      edges_deferred: input.deferredEdges?.length ?? 0,
      failures: telemetryEvents.filter((event) => event.status === "failed").length,
      skipped: telemetryEvents.filter((event) => event.status === "skipped").length,
    },
    failure_class_breakdown: countFailuresByClass(telemetryEvents),
    quarantined,
    provider_scorecard_refs: input.providerScorecards ?? [],
    integrity_audit_refs: input.integrityAudits ?? [],
    dirty_state: input.dirtyState,
    no_dark_data_scan: {
      passed: true,
      scanned_fields: [
        "ids",
        "counts",
        "failure_classes",
        "quarantine_records",
        "provider_scorecard_refs",
        "integrity_audit_refs",
      ],
    },
    retention: {
      storage: "runtime_state_artifact",
      cleanup: "runtime-state JSON/JSONL rotation and artifact pruning",
    },
  };
  return assertMemoryIngestionReportRecordHasNoDarkData(report);
}

export async function writeMemoryIngestionCloseoutReport(input: {
  report: MemoryIngestionCloseoutReport;
  artifactDir: string;
}): Promise<{ path: string; contentHash: string }> {
  await fs.mkdir(input.artifactDir, { recursive: true });
  const reportId = sanitizeReportFileId(
    input.report.run_id ?? input.report.job_id ?? input.report.source_id ?? input.report.path,
  );
  const reportPath = path.join(input.artifactDir, `${reportId}.closeout.json`);
  const serialized = `${JSON.stringify(input.report, null, 2)}\n`;
  await fs.writeFile(reportPath, serialized, "utf8");
  return {
    path: reportPath,
    contentHash: stableHash(serialized),
  };
}

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

function assertNoDarkDataValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkDataValue(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/gu, "").toLowerCase();
    if (
      normalizedKey === "rawprompt" ||
      normalizedKey === "prompttext" ||
      normalizedKey === "fulltranscript" ||
      normalizedKey === "transcript" ||
      normalizedKey === "rawtoollog" ||
      normalizedKey === "secret" ||
      normalizedKey === "privatephrase"
    ) {
      throw new Error(`memory ingestion telemetry rejected dark-data field: ${path}.${key}`);
    }
    assertNoDarkDataValue(nested, `${path}.${key}`);
  }
}

export function assertMemoryIngestionTelemetryHasNoDarkData(
  event: MemoryIngestionTelemetryEvent,
): MemoryIngestionTelemetryEvent {
  assertNoDarkDataValue(event, "event");
  return event;
}

export function createMemoryIngestionTelemetryEvent(
  input: Omit<MemoryIngestionTelemetryEvent, "schema_version">,
): MemoryIngestionTelemetryEvent {
  return assertMemoryIngestionTelemetryHasNoDarkData({
    schema_version: "memory_ingestion_telemetry.v1",
    ...input,
  });
}

export type MemoryIngestionPipelineStageResult = {
  status: "completed" | "skipped" | "quarantined";
  telemetry?: Partial<MemoryIngestionTelemetryEvent>;
};

export type MemoryIngestionPipelineStage = {
  stage: MemoryIngestionStage;
  run: () => Promise<MemoryIngestionPipelineStageResult> | MemoryIngestionPipelineStageResult;
};

export class MemoryIngestionPipeline {
  constructor(
    private readonly input: {
      path: MemoryIngestionPath;
      emitTelemetry?: (event: MemoryIngestionTelemetryEvent) => void | Promise<void>;
    },
  ) {}

  async run(stages: MemoryIngestionPipelineStage[]): Promise<MemoryIngestionTelemetryEvent[]> {
    const emitted: MemoryIngestionTelemetryEvent[] = [];
    const emit = async (event: MemoryIngestionTelemetryEvent) => {
      emitted.push(event);
      await this.input.emitTelemetry?.(event);
    };

    for (const stage of stages) {
      await emit(
        createMemoryIngestionTelemetryEvent({
          path: this.input.path,
          stage: stage.stage,
          status: "started",
        }),
      );
      try {
        const result = await stage.run();
        await emit(
          createMemoryIngestionTelemetryEvent({
            path: this.input.path,
            stage: stage.stage,
            status: result.status,
            ...result.telemetry,
          }),
        );
      } catch (error) {
        await emit(
          createMemoryIngestionFailureTelemetry({
            path: this.input.path,
            stage: stage.stage,
            error,
          }),
        );
        throw error;
      }
    }

    return emitted;
  }
}

export function createMemoryIngestionFailureTelemetry(input: {
  path: MemoryIngestionPath;
  stage: MemoryIngestionStage;
  error: unknown;
}): MemoryIngestionTelemetryEvent {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return createMemoryIngestionTelemetryEvent({
    path: input.path,
    stage: input.stage,
    status: "failed",
    failure_class: classifyMemoryIngestionFailure(message),
  });
}

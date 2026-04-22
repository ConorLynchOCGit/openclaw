import { createHash } from "node:crypto";

export const MEMORY_INGESTION_PATHS = [
  "document_ingest",
  "ordinary_turn_capture",
  "tool_result_capture",
  "daily_recovery",
  "bootstrap_import",
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
  "timeout",
  "other",
] as const;

export type MemoryIngestionFailureClass = (typeof MEMORY_INGESTION_FAILURE_CLASSES)[number];

export type MemoryIngestionStage =
  | "provider_boundary"
  | "prompt_plan"
  | "execution"
  | "parse_boundary"
  | "semantic_contract_boundary"
  | "canonicalization_boundary"
  | "reconciliation_boundary"
  | "persistence_boundary"
  | "projection_refresh"
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

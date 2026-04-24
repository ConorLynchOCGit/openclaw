import type {
  MemoryIngestionBudget,
  MemoryIngestionFailureClass,
  MemoryIngestionProviderCapability,
  MemoryIngestionRetryDecision,
  ProviderBoundaryDecision,
} from "./types.ts";

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

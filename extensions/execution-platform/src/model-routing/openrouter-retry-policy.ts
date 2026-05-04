export type OpenRouterRetryReasonCode =
  | "openrouter_http_429"
  | "openrouter_http_retryable"
  | "openrouter_network_timeout"
  | "openrouter_network_error"
  | "openrouter_no_content";

export type OpenRouterRetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  rateLimitCooldownMs: number;
  timeoutMs: number;
};

export type OpenRouterRetryAttemptEvidence = {
  attempt: number;
  reasonCode: OpenRouterRetryReasonCode | null;
  httpStatus: number | null;
  cooldownMs: number;
  latencyMs: number;
};

export type OpenRouterRetryEvidence = {
  artifactKind: "openrouter_retry_evidence";
  provider: "openrouter";
  modelId: string;
  perModelCooldownKey: string;
  attemptCount: number;
  retryReasonCodes: OpenRouterRetryReasonCode[];
  cooldownAppliedMs: number;
  finalStatus: "succeeded" | "failed" | "needs_review";
  totalLatencyMs: number;
  attempts: OpenRouterRetryAttemptEvidence[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderPayloadStored: false;
};

export const DEFAULT_OPENROUTER_RETRY_POLICY: OpenRouterRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 750,
  maxDelayMs: 8_000,
  jitterMs: 250,
  rateLimitCooldownMs: 4_000,
  timeoutMs: 45_000,
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function retryReasonForOpenRouter(input: {
  httpStatus?: number | null;
  errorReasonCode?: string | null;
  noContent?: boolean;
  networkError?: boolean;
  timeout?: boolean;
}): OpenRouterRetryReasonCode | null {
  if (input.timeout) {
    return "openrouter_network_timeout";
  }
  if (input.networkError) {
    return "openrouter_network_error";
  }
  if (input.httpStatus === 429 || input.errorReasonCode === "openrouter_http_429") {
    return "openrouter_http_429";
  }
  if (typeof input.httpStatus === "number" && RETRYABLE_HTTP_STATUSES.has(input.httpStatus)) {
    return "openrouter_http_retryable";
  }
  if (input.noContent || input.errorReasonCode === "openrouter_no_content") {
    return "openrouter_no_content";
  }
  return null;
}

export function shouldRetryOpenRouter(input: {
  attempt: number;
  reasonCode: OpenRouterRetryReasonCode | null;
  policy?: Partial<OpenRouterRetryPolicy>;
}): boolean {
  const policy = { ...DEFAULT_OPENROUTER_RETRY_POLICY, ...input.policy };
  return input.reasonCode !== null && input.attempt < policy.maxAttempts;
}

export function openRouterRetryDelayMs(input: {
  attempt: number;
  reasonCode: OpenRouterRetryReasonCode | null;
  policy?: Partial<OpenRouterRetryPolicy>;
  jitterSeed?: number;
}): number {
  const policy = { ...DEFAULT_OPENROUTER_RETRY_POLICY, ...input.policy };
  if (!input.reasonCode) {
    return 0;
  }
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * 2 ** Math.max(0, input.attempt - 1),
  );
  const rateLimitCooldown =
    input.reasonCode === "openrouter_http_429" ? policy.rateLimitCooldownMs : 0;
  const jitter =
    policy.jitterMs > 0 ? Math.abs(input.jitterSeed ?? input.attempt * 97) % policy.jitterMs : 0;
  return Math.min(
    policy.maxDelayMs + policy.rateLimitCooldownMs,
    exponential + rateLimitCooldown + jitter,
  );
}

export function createOpenRouterRetryEvidence(input: {
  modelId: string;
  finalStatus: OpenRouterRetryEvidence["finalStatus"];
  attempts: OpenRouterRetryAttemptEvidence[];
}): OpenRouterRetryEvidence {
  return {
    artifactKind: "openrouter_retry_evidence",
    provider: "openrouter",
    modelId: input.modelId,
    perModelCooldownKey: `openrouter:${input.modelId}`,
    attemptCount: input.attempts.length,
    retryReasonCodes: [
      ...new Set(
        input.attempts
          .map((attempt) => attempt.reasonCode)
          .filter((reason): reason is OpenRouterRetryReasonCode => reason !== null),
      ),
    ],
    cooldownAppliedMs: input.attempts.reduce((sum, attempt) => sum + attempt.cooldownMs, 0),
    finalStatus: input.finalStatus,
    totalLatencyMs: input.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0),
    attempts: input.attempts.slice(0, 8),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderPayloadStored: false,
  };
}

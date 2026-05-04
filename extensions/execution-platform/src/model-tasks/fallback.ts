import type { JsonValue } from "../runtime-job-repository.ts";

export const MODEL_TASK_FALLBACK_FAILURE_KINDS = [
  "provider_failure",
  "timeout",
  "rate_limit",
  "transport_error",
  "schema_validation_failure",
  "valid_judgment_rejected",
] as const;

export type ModelTaskFallbackFailureKind = (typeof MODEL_TASK_FALLBACK_FAILURE_KINDS)[number];

export type ModelTaskFallbackClassification = {
  failureKind: ModelTaskFallbackFailureKind;
  fallbackEligible: boolean;
  executeFallback: false;
  reason: string;
  evidence?: JsonValue;
};

const FALLBACK_ELIGIBLE_KINDS = new Set<ModelTaskFallbackFailureKind>([
  "provider_failure",
  "timeout",
  "rate_limit",
  "transport_error",
  "schema_validation_failure",
]);

export function classifyModelTaskFallback(input: {
  failureKind: ModelTaskFallbackFailureKind;
  evidence?: JsonValue;
}): ModelTaskFallbackClassification {
  const fallbackEligible = FALLBACK_ELIGIBLE_KINDS.has(input.failureKind);
  return {
    failureKind: input.failureKind,
    fallbackEligible,
    executeFallback: false,
    reason: fallbackEligible
      ? `${input.failureKind} is eligible for provider fallback classification`
      : "valid model judgments are not fallback-eligible solely because they are unwanted",
    evidence: input.evidence,
  };
}

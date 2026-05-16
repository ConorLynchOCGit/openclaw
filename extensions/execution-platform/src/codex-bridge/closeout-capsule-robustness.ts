import { CloseoutCapsuleHumanReportSchema, CloseoutCapsuleSchema } from "./closeout-capsule.ts";

type CloseoutRuntimeOutcome =
  | "succeeded"
  | "failed_before_implementation"
  | "failed_after_implementation"
  | "needs_review_missing_validation"
  | "needs_review_missing_changed_files"
  | "validation_failed_then_repaired"
  | "partial_completion"
  | "human_decision_pending"
  | "human_decision_resumed"
  | "provider_unavailable"
  | "closeout_model_timeout";

export type CloseoutCapsuleRobustnessInput = {
  capsule: unknown;
  runtimeJobId: string;
  runtimeOutcome: CloseoutRuntimeOutcome;
  runtimeJobState: "pending" | "running" | "succeeded" | "failed" | "canceled" | "timed_out";
  implementationRequired?: boolean;
  changedFileRefs?: string[];
  validationRefs?: string[];
  validationState?: "passed" | "failed" | "missing" | "skipped" | "repaired";
  closeoutModelStartedAt?: string | null;
  closeoutModelCompletedAt?: string | null;
  closeoutModelLatencyMs?: number | null;
  closeoutModelRef?: string | null;
  closeoutReasoningEffort?: string | null;
  closeoutMaxOutputTokens?: number | null;
};

export type CloseoutCapsuleRobustnessReview = {
  artifactKind: "closeout_capsule_robustness_review";
  state: "accepted" | "needs_review" | "blocked";
  humanReportState: "accepted" | "missing" | "unbounded_or_invalid";
  strictCapsuleState: "accepted" | "needs_repair" | "missing";
  opportunitySeedState: "accepted" | "needs_repair" | "not_required";
  runtimeEvidenceState: "accepted" | "needs_review" | "blocked";
  closeoutTiming: {
    modelRef: string | null;
    reasoningEffort: string | null;
    maxOutputTokens: number | null;
    startedAt: string | null;
    completedAt: string | null;
    latencyMs: number | null;
  };
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

function hasUsefulHumanReport(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const capsule = value as Record<string, unknown>;
  return CloseoutCapsuleHumanReportSchema.safeParse(capsule.humanReport).success;
}

export function evaluateCloseoutCapsuleRobustness(
  input: CloseoutCapsuleRobustnessInput,
): CloseoutCapsuleRobustnessReview {
  const strict = CloseoutCapsuleSchema.safeParse(input.capsule);
  const humanReportAccepted = strict.success || hasUsefulHumanReport(input.capsule);
  const implementationEvidenceMissing =
    input.implementationRequired === true && (input.changedFileRefs?.length ?? 0) === 0;
  const validationEvidenceMissing =
    ["succeeded", "validation_failed_then_repaired", "partial_completion"].includes(
      input.runtimeOutcome,
    ) && (input.validationRefs?.length ?? 0) === 0;
  const validationStillFailed =
    input.runtimeOutcome === "validation_failed_then_repaired" &&
    input.validationState !== "repaired" &&
    input.validationState !== "passed";
  const closeoutTimedOut = input.runtimeOutcome === "closeout_model_timeout";
  const providerUnavailable = input.runtimeOutcome === "provider_unavailable";
  const missingHumanDecision =
    input.runtimeOutcome === "human_decision_pending" && input.runtimeJobState !== "running";
  const reasonCodes = [
    ...(humanReportAccepted ? [] : ["closeout_human_report_missing_or_invalid"]),
    ...(strict.success ? [] : ["closeout_capsule_strict_schema_needs_repair"]),
    ...(implementationEvidenceMissing ? ["implementation_changed_file_evidence_missing"] : []),
    ...(validationEvidenceMissing ? ["runtime_validation_evidence_missing"] : []),
    ...(validationStillFailed ? ["validation_repair_evidence_missing"] : []),
    ...(closeoutTimedOut ? ["closeout_model_timeout"] : []),
    ...(providerUnavailable ? ["provider_unavailable_closeout_needs_review"] : []),
    ...(missingHumanDecision ? ["human_decision_pending_state_mismatch"] : []),
  ];
  const runtimeEvidenceBlocked = !humanReportAccepted || closeoutTimedOut;
  const runtimeEvidenceNeedsReview =
    implementationEvidenceMissing ||
    validationEvidenceMissing ||
    validationStillFailed ||
    providerUnavailable ||
    missingHumanDecision;
  const state = runtimeEvidenceBlocked
    ? "blocked"
    : runtimeEvidenceNeedsReview || !strict.success
      ? "needs_review"
      : "accepted";
  return {
    artifactKind: "closeout_capsule_robustness_review",
    state,
    humanReportState: humanReportAccepted ? "accepted" : "missing",
    strictCapsuleState: strict.success ? "accepted" : input.capsule ? "needs_repair" : "missing",
    opportunitySeedState: strict.success
      ? "accepted"
      : humanReportAccepted
        ? "needs_repair"
        : "not_required",
    runtimeEvidenceState: runtimeEvidenceBlocked
      ? "blocked"
      : runtimeEvidenceNeedsReview
        ? "needs_review"
        : "accepted",
    closeoutTiming: {
      modelRef: input.closeoutModelRef ?? null,
      reasoningEffort: input.closeoutReasoningEffort ?? null,
      maxOutputTokens: input.closeoutMaxOutputTokens ?? null,
      startedAt: input.closeoutModelStartedAt ?? null,
      completedAt: input.closeoutModelCompletedAt ?? null,
      latencyMs: input.closeoutModelLatencyMs ?? null,
    },
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

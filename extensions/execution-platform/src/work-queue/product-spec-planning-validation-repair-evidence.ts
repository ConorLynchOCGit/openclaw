const FORCED_FAILURE_HINTS = ["forced-repair-proof"] as const;
const FAILURE_HINTS = ["failed", "failure"] as const;
const REPAIR_HINTS = ["repair-rerun", "accepted", "passed"] as const;
const STRICT_REPAIR_VALIDATION_HINTS = ["repair-rerun", "accepted"] as const;
const FAILURE_REASON_CODE_HINTS = [
  "controlled_parity_proof_injection",
  "controlled_parity_proof_injected_failure",
  "validation_failed",
  "validation_failure",
  "failed validation ref:",
] as const;
const REPAIR_COMPLETION_REASON_HINTS = [
  "repair_completed",
  "repair_applied",
  "repair_worker_completed",
  "repair_rerun_passed",
] as const;
const REPAIR_VALIDATION_EVIDENCE_REASON_HINTS = ["validation_evidence_adequate"] as const;
const INVALID_NO_OP_REPAIR_REASON_CODE =
  "invalid_no_op_repair_for_failed_validation_corrected" as const;

function includesAnyHint(ref: string, hints: readonly string[]): boolean {
  const normalized = ref.trim().toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

export type ProductSpecPlanningValidationRepairEvidence = {
  hasFailureAttemptRef: boolean;
  hasRepairAttemptRef: boolean;
  hasBothFailureAndRepairRefs: boolean;
  boundedValidationRefs: string[];
  reasonCodes: string[];
};

export type ProductSpecPlanningValidationRepairEvidenceArtifact = {
  artifactType?: string | null;
  uri?: string | null;
  metadata?: Record<string, unknown> | null;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRepairCompletionReasonCode(reasonCode: string): boolean {
  const normalized = reasonCode.trim().toLowerCase();
  return REPAIR_COMPLETION_REASON_HINTS.some((hint) => normalized.includes(hint));
}

function isFailureReasonCode(reasonCode: string): boolean {
  const normalized = reasonCode.trim().toLowerCase();
  return FAILURE_REASON_CODE_HINTS.some((hint) => normalized.includes(hint));
}

function isRepairValidationEvidenceReasonCode(reasonCode: string): boolean {
  const normalized = reasonCode.trim().toLowerCase();
  return REPAIR_VALIDATION_EVIDENCE_REASON_HINTS.some((hint) => normalized.includes(hint));
}

function isInvalidNoOpRepairReasonCode(reasonCode: string): boolean {
  return reasonCode.trim().toLowerCase() === INVALID_NO_OP_REPAIR_REASON_CODE;
}

function hasLinkedPassedValidationRef(input: {
  validationRefs: string[];
  passedValidationRefs: Set<string>;
}): boolean {
  for (const validationRef of input.validationRefs) {
    const normalized = validationRef.trim();
    if (!normalized) {
      continue;
    }
    if (input.passedValidationRefs.has(normalized)) {
      return true;
    }
  }
  return false;
}

export function summarizeProductSpecPlanningValidationRepairEvidence(input: {
  validationRefs?: string[];
  artifacts?: ProductSpecPlanningValidationRepairEvidenceArtifact[];
  maxRefs?: number;
}): ProductSpecPlanningValidationRepairEvidence {
  const requestedMaxRefs = Number.isFinite(input.maxRefs)
    ? Math.floor(input.maxRefs as number)
    : 20;
  const maxRefs = Math.min(30, Math.max(1, requestedMaxRefs));
  const artifacts = input.artifacts ?? [];
  const boundedValidationRefs = Array.from(
    new Set(
      [
        ...(input.validationRefs ?? []),
        ...artifacts.flatMap((artifact) => [
          artifact.uri ?? "",
          ...stringArray(artifact.metadata?.validationRefs),
        ]),
      ]
        .map((ref) => ref.trim())
        .filter((ref) => ref.length > 0),
    ),
  ).slice(0, maxRefs);
  const validationArtifacts = artifacts.filter(
    (artifact) => artifact.artifactType === "agent_team.dynamic_validation",
  );
  const repairArtifacts = artifacts.filter(
    (artifact) => artifact.artifactType === "agent_team.dynamic_validation_repair_loop",
  );
  const passedValidationRefs = new Set(
    validationArtifacts
      .filter((artifact) => stringValue(artifact.metadata?.status)?.toLowerCase() === "passed")
      .map((artifact) => artifact.uri?.trim() ?? "")
      .filter((ref) => ref.length > 0),
  );
  const metadataRepairValidationPass = validationArtifacts.some((artifact) => {
    const metadata = artifact.metadata ?? {};
    const status = stringValue(metadata.status)?.toLowerCase();
    if (status !== "passed") {
      return false;
    }
    const reasonCodes = stringArray(metadata.reasonCodes);
    return (
      includesAnyHint(artifact.uri ?? "", REPAIR_HINTS) ||
      reasonCodes.some(isRepairCompletionReasonCode)
    );
  });
  const metadataStrictRepairValidationPass = validationArtifacts.some((artifact) => {
    const metadata = artifact.metadata ?? {};
    const status = stringValue(metadata.status)?.toLowerCase();
    if (status !== "passed") {
      return false;
    }
    const reasonCodes = stringArray(metadata.reasonCodes);
    return (
      includesAnyHint(artifact.uri ?? "", STRICT_REPAIR_VALIDATION_HINTS) ||
      reasonCodes.some(isRepairCompletionReasonCode)
    );
  });
  const metadataFailure = [...validationArtifacts, ...repairArtifacts].some((artifact) => {
    const metadata = artifact.metadata ?? {};
    const reasonCodes = stringArray(metadata.reasonCodes);
    return (
      stringValue(metadata.status) === "failed" ||
      stringValue(metadata.proofMode) === "forced_validation_failure_once" ||
      Boolean(stringValue(metadata.boundedFailureSummary)) ||
      reasonCodes.some(isFailureReasonCode)
    );
  });
  const metadataRepairRequiresStrictPass = repairArtifacts.some((artifact) =>
    stringArray(artifact.metadata?.reasonCodes).some(isInvalidNoOpRepairReasonCode),
  );
  const metadataRepair =
    repairArtifacts.some((artifact) => {
      const metadata = artifact.metadata ?? {};
      const repairReasonCodes = stringArray(metadata.reasonCodes);
      const invalidNoOpRepairCorrection = repairReasonCodes.some(isInvalidNoOpRepairReasonCode);
      const repairAttemptCount = numberValue(metadata.repairAttemptCount) ?? 0;
      if (invalidNoOpRepairCorrection) {
        return (
          repairReasonCodes.some(isRepairValidationEvidenceReasonCode) ||
          metadataStrictRepairValidationPass ||
          hasLinkedPassedValidationRef({
            validationRefs: stringArray(metadata.validationRefs),
            passedValidationRefs,
          })
        );
      }
      return (
        stringValue(metadata.finalState) === "passed" ||
        repairAttemptCount > 0 ||
        repairReasonCodes.some(isRepairCompletionReasonCode)
      );
    }) ||
    (metadataRepairRequiresStrictPass
      ? metadataStrictRepairValidationPass
      : metadataRepairValidationPass);
  const hasInvalidNoOpRepairCorrection = repairArtifacts.some((artifact) =>
    stringArray(artifact.metadata?.reasonCodes).some(isInvalidNoOpRepairReasonCode),
  );
  const legacyFailure = boundedValidationRefs.some(
    (ref) => includesAnyHint(ref, FORCED_FAILURE_HINTS) || includesAnyHint(ref, FAILURE_HINTS),
  );
  const legacyRepair =
    !metadataRepair &&
    !hasInvalidNoOpRepairCorrection &&
    boundedValidationRefs.some((ref) => includesAnyHint(ref, REPAIR_HINTS));
  const hasFailureAttemptRef = metadataFailure || legacyFailure;
  const hasRepairAttemptRef = metadataRepair || legacyRepair;

  const reasonCodes: string[] = [];
  if (boundedValidationRefs.length === 0) {
    reasonCodes.push("product_spec_planning_validation_refs_missing");
  }
  if (metadataFailure) {
    reasonCodes.push("validation_failure_recorded_from_metadata");
  } else if (legacyFailure) {
    reasonCodes.push("validation_failure_inferred_from_legacy_ref");
  }
  if (metadataRepair) {
    reasonCodes.push("validation_repair_recorded_from_metadata");
  } else if (legacyRepair) {
    reasonCodes.push("validation_repair_inferred_from_legacy_ref");
  }
  if (hasFailureAttemptRef && !hasRepairAttemptRef) {
    reasonCodes.push("product_spec_planning_validation_repair_missing_after_failure");
  }
  if (!hasFailureAttemptRef && hasRepairAttemptRef) {
    reasonCodes.push("product_spec_planning_validation_failure_ref_missing");
  }
  if (hasInvalidNoOpRepairCorrection && !hasRepairAttemptRef) {
    reasonCodes.push("product_spec_planning_invalid_no_op_repair_needs_real_repair_evidence");
  }
  if (hasFailureAttemptRef && hasRepairAttemptRef) {
    reasonCodes.push("validation_failure_classified");
    reasonCodes.push("product_spec_planning_validation_repair_observed");
  }
  for (const artifact of repairArtifacts) {
    for (const reasonCode of stringArray(artifact.metadata?.reasonCodes)) {
      reasonCodes.push(reasonCode);
    }
  }

  return {
    hasFailureAttemptRef,
    hasRepairAttemptRef,
    hasBothFailureAndRepairRefs: hasFailureAttemptRef && hasRepairAttemptRef,
    boundedValidationRefs,
    reasonCodes: Array.from(new Set(reasonCodes)).slice(0, 20),
  };
}

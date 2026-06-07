import type { RuntimeEvidenceKind } from "./runtime-evidence-kind.ts";

export const RUNTIME_VALIDATION_PHASES = [
  "preflight_validation",
  "pre_proof_validation",
  "pre_execution_validation",
  "worker_post_edit_validation",
  "post_action_validation",
  "integration_validation",
  "final_proof_validation",
  "review_validation",
  "closeout_validation",
  "diagnostic_validation",
] as const;

export type RuntimeValidationPhase = (typeof RUNTIME_VALIDATION_PHASES)[number];

export type ValidationPhaseCompatibilityStatus =
  | "compatible"
  | "incompatible"
  | "not_closure_capable";

export type ValidationPhaseCompatibility = {
  artifactKind: "runtime_validation_phase_compatibility";
  validationPhase: RuntimeValidationPhase;
  status: ValidationPhaseCompatibilityStatus;
  compatibleForMissionLedger: boolean;
  compatibleForCloseout: boolean;
  compatibleForImplementationEvidence: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export function isRuntimeValidationPhase(value: unknown): value is RuntimeValidationPhase {
  return typeof value === "string" && RUNTIME_VALIDATION_PHASES.includes(value as never);
}

export function normalizeRuntimeValidationPhase(value: unknown): RuntimeValidationPhase | null {
  return isRuntimeValidationPhase(value) ? value : null;
}

export function defaultValidationPhaseForEvidenceKind(
  evidenceKind: RuntimeEvidenceKind,
): RuntimeValidationPhase {
  if (
    evidenceKind === "source_change" ||
    evidenceKind === "test_validation" ||
    evidenceKind === "docs"
  ) {
    return "worker_post_edit_validation";
  }
  if (evidenceKind === "review" || evidenceKind === "readback") {
    return "review_validation";
  }
  if (evidenceKind === "closeout") {
    return "closeout_validation";
  }
  if (
    evidenceKind === "research_brief" ||
    evidenceKind === "planning_capsule" ||
    evidenceKind === "action_graph_proposal" ||
    evidenceKind === "compile_readiness" ||
    evidenceKind === "human_decision"
  ) {
    return "pre_execution_validation";
  }
  return "diagnostic_validation";
}

export function validationPhaseRequirementsForEvidenceKinds(
  evidenceKinds: readonly string[] | undefined,
): RuntimeValidationPhase[] {
  const phases = new Set<RuntimeValidationPhase>();
  for (const evidenceKind of evidenceKinds ?? []) {
    if (
      evidenceKind === "source_change" ||
      evidenceKind === "test_validation" ||
      evidenceKind === "docs"
    ) {
      phases.add("worker_post_edit_validation");
    } else if (evidenceKind === "review" || evidenceKind === "readback") {
      phases.add("review_validation");
    } else if (evidenceKind === "closeout") {
      phases.add("closeout_validation");
    } else if (
      evidenceKind === "research_brief" ||
      evidenceKind === "planning_capsule" ||
      evidenceKind === "action_graph_proposal" ||
      evidenceKind === "compile_readiness" ||
      evidenceKind === "human_decision"
    ) {
      phases.add("pre_execution_validation");
    }
  }
  return [...phases];
}

export function evaluateEvidenceClaimValidationPhase(input: {
  evidenceKind: RuntimeEvidenceKind;
  validationPhase: RuntimeValidationPhase;
  validationRefs?: readonly string[];
  changedFileRefs?: readonly string[];
  nodeKind?: string | null;
}): ValidationPhaseCompatibility {
  const reasonCodes: string[] = [`validation_phase:${input.validationPhase}`];
  let compatibleForMissionLedger = false;
  let compatibleForCloseout = false;
  let compatibleForImplementationEvidence = false;

  if (
    input.validationPhase === "preflight_validation" ||
    input.validationPhase === "pre_proof_validation"
  ) {
    reasonCodes.push("validation_phase_pre_proof_non_closing");
  }
  if (input.validationPhase === "diagnostic_validation") {
    reasonCodes.push("validation_phase_diagnostic_non_closing");
  }

  const changedFileCount = input.changedFileRefs?.length ?? 0;
  const validationRefCount = input.validationRefs?.length ?? 0;

  if (input.evidenceKind === "source_change") {
    if (
      input.validationPhase !== "worker_post_edit_validation" &&
      input.validationPhase !== "post_action_validation"
    ) {
      reasonCodes.push("validation_phase_source_change_requires_worker_post_edit_validation");
    } else if (changedFileCount === 0) {
      reasonCodes.push("validation_phase_source_change_requires_changed_file_refs");
    } else {
      compatibleForMissionLedger = true;
      compatibleForImplementationEvidence = true;
      reasonCodes.push("validation_phase_source_change_compatible");
    }
  } else if (input.evidenceKind === "test_validation") {
    if (
      input.validationPhase !== "worker_post_edit_validation" &&
      input.validationPhase !== "post_action_validation" &&
      input.validationPhase !== "integration_validation" &&
      input.validationPhase !== "final_proof_validation"
    ) {
      reasonCodes.push("validation_phase_test_validation_requires_post_work_validation");
    } else if (changedFileCount === 0) {
      reasonCodes.push("validation_phase_test_validation_requires_changed_file_refs");
    } else if (validationRefCount === 0) {
      reasonCodes.push("validation_phase_test_validation_requires_validation_refs");
    } else {
      compatibleForMissionLedger = true;
      compatibleForImplementationEvidence = true;
      reasonCodes.push("validation_phase_test_validation_compatible");
    }
  } else if (input.evidenceKind === "docs") {
    if (
      input.validationPhase !== "worker_post_edit_validation" &&
      input.validationPhase !== "post_action_validation"
    ) {
      reasonCodes.push("validation_phase_docs_requires_worker_post_edit_validation");
    } else if (changedFileCount === 0) {
      reasonCodes.push("validation_phase_docs_requires_changed_file_refs");
    } else {
      compatibleForMissionLedger = true;
      compatibleForImplementationEvidence = true;
      reasonCodes.push("validation_phase_docs_compatible");
    }
  } else if (input.evidenceKind === "review") {
    if (
      input.validationPhase === "review_validation" ||
      input.validationPhase === "integration_validation"
    ) {
      compatibleForMissionLedger = true;
      reasonCodes.push("validation_phase_review_compatible");
    } else {
      reasonCodes.push("validation_phase_review_requires_review_validation");
    }
  } else if (input.evidenceKind === "readback") {
    if (
      input.validationPhase === "review_validation" ||
      input.validationPhase === "closeout_validation" ||
      input.validationPhase === "final_proof_validation"
    ) {
      compatibleForMissionLedger = true;
      reasonCodes.push("validation_phase_readback_compatible");
    } else {
      reasonCodes.push("validation_phase_readback_requires_review_or_closeout_validation");
    }
  } else if (input.evidenceKind === "closeout") {
    if (
      input.validationPhase === "closeout_validation" ||
      input.validationPhase === "final_proof_validation"
    ) {
      compatibleForMissionLedger = true;
      compatibleForCloseout = true;
      reasonCodes.push("validation_phase_closeout_compatible");
    } else {
      reasonCodes.push("validation_phase_closeout_requires_closeout_validation");
    }
  } else if (
    input.evidenceKind === "research_brief" ||
    input.evidenceKind === "planning_capsule" ||
    input.evidenceKind === "action_graph_proposal" ||
    input.evidenceKind === "compile_readiness" ||
    input.evidenceKind === "human_decision"
  ) {
    if (
      input.validationPhase === "pre_execution_validation" ||
      input.validationPhase === "preflight_validation" ||
      input.validationPhase === "review_validation" ||
      input.validationPhase === "integration_validation" ||
      input.validationPhase === "final_proof_validation" ||
      input.validationPhase === "closeout_validation"
    ) {
      compatibleForMissionLedger = true;
      reasonCodes.push("validation_phase_semantic_artifact_compatible");
    } else {
      reasonCodes.push("validation_phase_semantic_artifact_requires_non_proof_phase");
    }
  } else {
    reasonCodes.push("validation_phase_evidence_kind_not_closure_capable");
  }

  if (
    input.nodeKind === "closeout" &&
    (input.evidenceKind === "source_change" ||
      input.evidenceKind === "test_validation" ||
      input.evidenceKind === "docs")
  ) {
    compatibleForMissionLedger = false;
    compatibleForImplementationEvidence = false;
    reasonCodes.push(`validation_phase_closeout_node_cannot_satisfy_${input.evidenceKind}`);
  }

  const status: ValidationPhaseCompatibilityStatus = compatibleForMissionLedger
    ? "compatible"
    : input.evidenceKind === "artifact" || input.evidenceKind === "other"
      ? "not_closure_capable"
      : "incompatible";

  return {
    artifactKind: "runtime_validation_phase_compatibility",
    validationPhase: input.validationPhase,
    status,
    compatibleForMissionLedger,
    compatibleForCloseout,
    compatibleForImplementationEvidence,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

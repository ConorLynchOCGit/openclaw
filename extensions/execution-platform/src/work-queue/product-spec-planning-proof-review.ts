import {
  summarizeProductSpecPlanningValidationRepairEvidence,
  type ProductSpecPlanningValidationRepairEvidenceArtifact,
} from "./product-spec-planning-validation-repair-evidence.ts";

export const PRODUCT_SPEC_PLANNING_PROOF_REVIEW_ARTIFACT_KIND =
  "product_spec_planning_validation_artifact" as const;
export const PRODUCT_SPEC_PLANNING_PROOF_REVIEW_ARTIFACT_VERSION = "v1" as const;

const RAW_STORAGE_FLAG_KEYS = [
  "rawPromptStored",
  "rawResponseStored",
  "rawLogsStored",
  "rawCommandLogsStored",
  "rawTranscriptStored",
  "rawPageStored",
  "rawProviderLogStored",
  "rawToolLogStored",
  "rawDbRowsStored",
  "secretsStored",
  "hiddenReasoningStored",
] as const;

export type ProductSpecPlanningBlockingMissionCommitment = {
  commitmentId: string;
  status?: string | null;
  commitmentText?: string | null;
  acceptedEvidenceRefs?: string[];
  remainingWork?: string[];
};

export type ProductSpecPlanningCommitmentSatisfactionStatus =
  | "satisfied"
  | "partially_satisfied"
  | "unsatisfied";

export type ProductSpecPlanningValidationCommandResult = {
  command: string;
  status: "passed" | "failed" | "blocked" | "not_run";
  validationRef?: string | null;
  boundedSummary?: string | null;
  completedAt?: string | null;
};

export type ProductSpecPlanningProofReviewInput = {
  runId: string;
  reviewedAt: string;
  workflowSelected: string | null;
  schedulerNodeOrder: string[];
  planningProofRefs: string[];
  researchRequired: boolean | null;
  researchBriefRefs: string[];
  planningCapsuleRefs: string[];
  humanDecisionRefs: string[];
  actionGraphProposalRefs: string[];
  proposedChildActionRefs: string[];
  compileValidationRefs: string[];
  closeoutRefs: string[];
  childActionsExecuted: boolean | null;
  runtimeJobsCreatedForProposedChildren: boolean | null;
  workQueueLifecycleMutated: boolean | null;
  rawStorageObserved: boolean | null;
  implementationDiffRefs: string[];
  validationArtifacts: ProductSpecPlanningValidationRepairEvidenceArtifact[];
  blockingCommitments: ProductSpecPlanningBlockingMissionCommitment[];
  validationCommandResult?: ProductSpecPlanningValidationCommandResult | null;
};

export type ProductSpecPlanningProofReviewArtifact = ReturnType<
  typeof createProductSpecPlanningProofReviewArtifact
>;

type ProductSpecPlanningLedgerEvidenceRefs = {
  implementationRefs: string[];
  workflowWiringRefs: string[];
  contractRefs: string[];
  testRefs: string[];
  documentationRefs: string[];
  validationRefs: string[];
  liveProofRefs: string[];
  reviewRefs: string[];
  otherEvidenceRefs: string[];
};

const REQUIRED_LEDGER_EVIDENCE_CLASSES = [
  "implementation",
  "workflow_wiring",
  "contract",
  "test",
  "documentation",
  "validation",
  "live_proof",
] as const;

function boundedUniqueStringValues(values: readonly string[], limit = 30): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function isSourceEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("repo://") ||
    normalized.startsWith("diff://") ||
    normalized.startsWith("main-repo-change://") ||
    normalized.includes("/diff/") ||
    normalized.includes("/source-edit/") ||
    normalized.includes("/changed-file/")
  );
}

function isValidationEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return normalized.startsWith("validation://") || normalized.includes("/validation/");
}

function isReviewEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return normalized.startsWith("review://") || normalized.includes("/review/");
}

function isWorkflowWiringEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("workflow") ||
    normalized.includes("runtime-work-graph") ||
    normalized.includes("scheduler") ||
    normalized.includes("capability") ||
    normalized.includes("registry") ||
    normalized.includes("front-door") ||
    normalized.includes("router") ||
    normalized.includes("compile-runtime-plan")
  );
}

function isContractEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("contract") ||
    normalized.includes("research-brief") ||
    normalized.includes("planning-capsule") ||
    normalized.includes("human-decision") ||
    normalized.includes("action-graph") ||
    normalized.includes("closeout")
  );
}

function isTestEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes(".test.") ||
    normalized.startsWith("test://") ||
    normalized.includes("test:file") ||
    normalized.includes("vitest") ||
    normalized.includes("pnpm test")
  );
}

function isDocsEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("docs://") ||
    normalized.includes("/docs/") ||
    normalized.includes("specs/") ||
    normalized.includes("status.md") ||
    normalized.includes("current_slice.md") ||
    normalized.includes("decisions.md") ||
    normalized.includes("roadmap.md") ||
    normalized.includes("runbook")
  );
}

function isLiveProofEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("live-proof") ||
    normalized.includes("live_ux") ||
    normalized.includes("live-ux") ||
    normalized.includes("ux-proof") ||
    normalized.includes("runtime-proof")
  );
}

function ledgerEvidenceRefs(refs: readonly string[]): ProductSpecPlanningLedgerEvidenceRefs {
  const acceptedEvidenceRefs = boundedUniqueStringValues(refs, 60);
  const implementationRefs = acceptedEvidenceRefs.filter(isSourceEvidenceRef);
  const workflowWiringRefs = acceptedEvidenceRefs.filter(isWorkflowWiringEvidenceRef);
  const contractRefs = acceptedEvidenceRefs.filter(isContractEvidenceRef);
  const testRefs = acceptedEvidenceRefs.filter(isTestEvidenceRef);
  const documentationRefs = acceptedEvidenceRefs.filter(isDocsEvidenceRef);
  const validationRefs = acceptedEvidenceRefs.filter(isValidationEvidenceRef);
  const liveProofRefs = acceptedEvidenceRefs.filter(isLiveProofEvidenceRef);
  const reviewRefs = acceptedEvidenceRefs.filter(isReviewEvidenceRef);
  const classifiedRefs = new Set([
    ...implementationRefs,
    ...workflowWiringRefs,
    ...contractRefs,
    ...testRefs,
    ...documentationRefs,
    ...validationRefs,
    ...liveProofRefs,
    ...reviewRefs,
  ]);
  return {
    implementationRefs,
    workflowWiringRefs,
    contractRefs,
    testRefs,
    documentationRefs,
    validationRefs,
    liveProofRefs,
    reviewRefs,
    otherEvidenceRefs: acceptedEvidenceRefs.filter((ref) => !classifiedRefs.has(ref)),
  };
}

function missingRequiredLedgerEvidenceClasses(
  evidenceRefs: ProductSpecPlanningLedgerEvidenceRefs,
): string[] {
  return REQUIRED_LEDGER_EVIDENCE_CLASSES.filter((evidenceClass) => {
    switch (evidenceClass) {
      case "implementation":
        return evidenceRefs.implementationRefs.length === 0;
      case "workflow_wiring":
        return evidenceRefs.workflowWiringRefs.length === 0;
      case "contract":
        return evidenceRefs.contractRefs.length === 0;
      case "test":
        return evidenceRefs.testRefs.length === 0;
      case "documentation":
        return evidenceRefs.documentationRefs.length === 0;
      case "validation":
        return evidenceRefs.validationRefs.length === 0;
      case "live_proof":
        return evidenceRefs.liveProofRefs.length === 0;
    }
    return true;
  });
}

function metadataHasTruthyFlag(
  artifact: ProductSpecPlanningValidationRepairEvidenceArtifact,
  flagKeys: readonly string[],
): boolean {
  const metadata = artifact.metadata ?? {};
  return flagKeys.some((flagKey) => metadata[flagKey] === true);
}

function proofNonExecutionResult(input: ProductSpecPlanningProofReviewInput): {
  result: "confirmed_not_executed" | "denied_executed" | "insufficient_evidence";
  childActionsExecuted: boolean | null;
  runtimeJobsCreatedForProposedChildren: boolean | null;
  evidenceRefs: string[];
  reasonCodes: string[];
} {
  const evidenceRefs = boundedUniqueStringValues([
    ...input.actionGraphProposalRefs,
    ...input.proposedChildActionRefs,
    ...input.compileValidationRefs,
    ...input.planningProofRefs,
  ]);
  const reasonCodes: string[] = [];
  if (input.actionGraphProposalRefs.length === 0) {
    reasonCodes.push("product_spec_planning_action_graph_proposal_ref_missing");
  }
  if (input.proposedChildActionRefs.length === 0) {
    reasonCodes.push("product_spec_planning_proposed_child_action_refs_missing");
  }
  if (input.compileValidationRefs.length === 0) {
    reasonCodes.push("product_spec_planning_compile_validation_ref_missing");
  }
  if (input.childActionsExecuted === true) {
    reasonCodes.push("product_spec_planning_proposed_children_executed");
  }
  if (input.runtimeJobsCreatedForProposedChildren === true) {
    reasonCodes.push("product_spec_planning_runtime_jobs_created_for_proposed_children");
  }
  if (input.childActionsExecuted === true || input.runtimeJobsCreatedForProposedChildren === true) {
    return {
      result: "denied_executed",
      childActionsExecuted: input.childActionsExecuted,
      runtimeJobsCreatedForProposedChildren: input.runtimeJobsCreatedForProposedChildren,
      evidenceRefs,
      reasonCodes,
    };
  }
  if (
    input.childActionsExecuted === false &&
    input.runtimeJobsCreatedForProposedChildren === false &&
    input.actionGraphProposalRefs.length > 0 &&
    input.proposedChildActionRefs.length > 0 &&
    input.compileValidationRefs.length > 0
  ) {
    reasonCodes.push("product_spec_planning_proposal_compile_boundary_confirmed");
    reasonCodes.push("product_spec_planning_proposed_children_not_executed");
    return {
      result: "confirmed_not_executed",
      childActionsExecuted: false,
      runtimeJobsCreatedForProposedChildren: false,
      evidenceRefs,
      reasonCodes,
    };
  }
  reasonCodes.push("product_spec_planning_child_execution_boundary_evidence_incomplete");
  return {
    result: "insufficient_evidence",
    childActionsExecuted: input.childActionsExecuted,
    runtimeJobsCreatedForProposedChildren: input.runtimeJobsCreatedForProposedChildren,
    evidenceRefs,
    reasonCodes,
  };
}

function missionCommitmentEvidence(commitment: ProductSpecPlanningBlockingMissionCommitment) {
  const acceptedEvidenceRefs = boundedUniqueStringValues(commitment.acceptedEvidenceRefs ?? [], 40);
  const changedFileRefs = acceptedEvidenceRefs.filter(isSourceEvidenceRef);
  const validationRefs = acceptedEvidenceRefs.filter(isValidationEvidenceRef);
  const reviewRefs = acceptedEvidenceRefs.filter(isReviewEvidenceRef);
  const otherEvidenceRefs = acceptedEvidenceRefs.filter(
    (ref) =>
      !isSourceEvidenceRef(ref) && !isValidationEvidenceRef(ref) && !isReviewEvidenceRef(ref),
  );
  const evidenceState =
    acceptedEvidenceRefs.length === 0
      ? "missing"
      : commitment.status === "satisfied" || commitment.status === "accepted"
        ? "mapped_satisfied"
        : "mapped_needs_owner_review";
  return {
    commitmentId: commitment.commitmentId,
    status: commitment.status ?? "unknown",
    commitmentText: commitment.commitmentText ?? null,
    evidenceState,
    acceptedEvidenceRefs,
    changedFileRefs,
    validationRefs,
    reviewRefs,
    otherEvidenceRefs,
    remainingWork: boundedUniqueStringValues(commitment.remainingWork ?? [], 20),
  };
}

function closureMissionCommitmentEvidence(
  commitment: ProductSpecPlanningBlockingMissionCommitment,
) {
  const acceptedEvidenceRefs = boundedUniqueStringValues(commitment.acceptedEvidenceRefs ?? [], 40);
  const evidenceRefs = ledgerEvidenceRefs(acceptedEvidenceRefs);
  const missingEvidenceClasses = [
    evidenceRefs.implementationRefs.length === 0 ? "repository_diff" : null,
    evidenceRefs.workflowWiringRefs.length === 0 ? "workflow_wiring" : null,
    evidenceRefs.contractRefs.length === 0 ? "contract" : null,
    evidenceRefs.testRefs.length === 0 ? "test" : null,
    evidenceRefs.documentationRefs.length === 0 ? "docs" : null,
    evidenceRefs.validationRefs.length === 0 ? "validation_output" : null,
    evidenceRefs.liveProofRefs.length === 0 ? "live_proof" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    commitmentId: commitment.commitmentId,
    status: commitment.status ?? "unknown",
    repositoryDiffRefs: evidenceRefs.implementationRefs,
    workflowWiringRefs: evidenceRefs.workflowWiringRefs,
    contractRefs: evidenceRefs.contractRefs,
    testRefs: evidenceRefs.testRefs,
    docsRefs: evidenceRefs.documentationRefs,
    validationOutputRefs: evidenceRefs.validationRefs,
    liveProofRefs: evidenceRefs.liveProofRefs,
    missingEvidenceClasses,
    closureReady: missingEvidenceClasses.length === 0,
  };
}

function ledgerAcceptanceCommitment(commitment: ProductSpecPlanningBlockingMissionCommitment) {
  const status = commitment.status ?? "unknown";
  const acceptedEvidenceRefs = boundedUniqueStringValues(commitment.acceptedEvidenceRefs ?? [], 60);
  const evidenceRefs = ledgerEvidenceRefs(acceptedEvidenceRefs);
  const missingEvidenceClasses = missingRequiredLedgerEvidenceClasses(evidenceRefs);
  const remainingWork = boundedUniqueStringValues(commitment.remainingWork ?? [], 20);
  const commitmentStatusAccepted = status === "satisfied" || status === "accepted";
  const passFailStatus =
    commitmentStatusAccepted && missingEvidenceClasses.length === 0 && remainingWork.length === 0
      ? "pass"
      : "fail";
  return {
    commitmentId: commitment.commitmentId,
    commitmentText: commitment.commitmentText ?? null,
    sourceStatus: status,
    passFailStatus,
    evidenceRefs,
    missingEvidenceClasses,
    remainingWork,
    reasonCodes: boundedUniqueStringValues(
      [
        passFailStatus === "pass"
          ? `product_spec_planning_ledger_commitment_pass:${commitment.commitmentId}`
          : `product_spec_planning_ledger_commitment_fail:${commitment.commitmentId}`,
        ...(commitmentStatusAccepted
          ? []
          : [
              `product_spec_planning_ledger_commitment_status_not_satisfied:${commitment.commitmentId}`,
            ]),
        ...(remainingWork.length === 0
          ? []
          : [
              `product_spec_planning_ledger_commitment_remaining_work_present:${commitment.commitmentId}`,
            ]),
        ...missingEvidenceClasses.map(
          (missing) =>
            `product_spec_planning_ledger_commitment_missing_${missing}:${commitment.commitmentId}`,
        ),
      ],
      30,
    ),
  };
}

export function createProductSpecPlanningProofReviewArtifact(
  input: ProductSpecPlanningProofReviewInput,
) {
  const validationRefs = boundedUniqueStringValues([
    ...input.compileValidationRefs,
    ...(input.validationCommandResult?.validationRef
      ? [input.validationCommandResult.validationRef]
      : []),
    ...input.validationArtifacts.map((artifact) => artifact.uri ?? ""),
  ]);
  const validationRepairEvidence = summarizeProductSpecPlanningValidationRepairEvidence({
    validationRefs,
    artifacts: input.validationArtifacts,
  });
  const rawStorageObserved =
    input.rawStorageObserved === true ||
    input.validationArtifacts.some((artifact) =>
      metadataHasTruthyFlag(artifact, RAW_STORAGE_FLAG_KEYS),
    );
  const workQueueLifecycleMutated =
    input.workQueueLifecycleMutated === true ||
    input.validationArtifacts.some((artifact) =>
      metadataHasTruthyFlag(artifact, ["workQueueLifecycleMutated"]),
    );
  const schedulerReasonCodes: string[] = [];
  if (input.workflowSelected !== "agent_team.product_spec_planning") {
    schedulerReasonCodes.push("product_spec_planning_workflow_not_selected");
  }
  if (input.schedulerNodeOrder[0] !== "planning_orchestrator") {
    schedulerReasonCodes.push("product_spec_planning_orchestrator_not_first");
  }
  if (input.researchRequired === true) {
    if (!input.schedulerNodeOrder.includes("web_research")) {
      schedulerReasonCodes.push("product_spec_planning_required_web_research_missing");
    }
    if (input.researchBriefRefs.length === 0) {
      schedulerReasonCodes.push("product_spec_planning_research_brief_ref_missing");
    }
  }
  if (input.planningCapsuleRefs.length === 0) {
    schedulerReasonCodes.push("product_spec_planning_capsule_ref_missing");
  }
  if (input.closeoutRefs.length === 0) {
    schedulerReasonCodes.push("product_spec_planning_closeout_ref_missing");
  }
  if (rawStorageObserved) {
    schedulerReasonCodes.push("product_spec_planning_raw_storage_observed");
  }
  if (workQueueLifecycleMutated) {
    schedulerReasonCodes.push("product_spec_planning_work_queue_lifecycle_mutated");
  }

  const proposedChildActionsExecution = proofNonExecutionResult(input);
  const closureCommitmentEvidence = input.blockingCommitments.map(closureMissionCommitmentEvidence);
  const ledgerCommitments = input.blockingCommitments.map(ledgerAcceptanceCommitment);
  const allClosureEvidenceRefs = boundedUniqueStringValues(
    [
      ...input.implementationDiffRefs,
      ...input.planningProofRefs,
      ...input.researchBriefRefs,
      ...input.planningCapsuleRefs,
      ...input.humanDecisionRefs,
      ...input.actionGraphProposalRefs,
      ...input.proposedChildActionRefs,
      ...input.compileValidationRefs,
      ...input.closeoutRefs,
      ...(input.validationCommandResult?.validationRef
        ? [input.validationCommandResult.validationRef]
        : []),
      ...(input.validationCommandResult?.command ? [input.validationCommandResult.command] : []),
      ...input.validationArtifacts.map((artifact) => artifact.uri ?? ""),
      ...input.blockingCommitments.flatMap((commitment) => commitment.acceptedEvidenceRefs ?? []),
    ],
    120,
  );
  const allThreeBlockingCommitmentsMapped =
    input.blockingCommitments.length === 3 &&
    closureCommitmentEvidence.every((commitment) => commitment.closureReady);
  const ledgerEvidence = ledgerEvidenceRefs(allClosureEvidenceRefs);
  const ledgerStatus =
    input.blockingCommitments.length === 3 &&
    ledgerCommitments.every((commitment) => commitment.passFailStatus === "pass") &&
    proposedChildActionsExecution.result === "confirmed_not_executed" &&
    input.validationCommandResult?.status === "passed" &&
    !rawStorageObserved &&
    !workQueueLifecycleMutated
      ? "pass"
      : "fail";

  return {
    artifactKind: PRODUCT_SPEC_PLANNING_PROOF_REVIEW_ARTIFACT_KIND,
    artifactVersion: PRODUCT_SPEC_PLANNING_PROOF_REVIEW_ARTIFACT_VERSION,
    runId: input.runId,
    reviewedAt: input.reviewedAt,
    workflowSelected: input.workflowSelected,
    schedulerGraphBehavior: {
      planningOrchestratorFirst: input.schedulerNodeOrder[0] === "planning_orchestrator",
      schedulerNodeOrder: boundedUniqueStringValues(input.schedulerNodeOrder, 20),
      researchRequired: input.researchRequired,
      webResearchCalled: input.schedulerNodeOrder.includes("web_research"),
      researchBriefRefs: boundedUniqueStringValues(input.researchBriefRefs, 20),
      planningCapsuleRefs: boundedUniqueStringValues(input.planningCapsuleRefs, 20),
      humanDecisionRefs: boundedUniqueStringValues(input.humanDecisionRefs, 20),
      actionGraphProposalRefs: boundedUniqueStringValues(input.actionGraphProposalRefs, 20),
      compileValidationRefs: boundedUniqueStringValues(input.compileValidationRefs, 20),
      closeoutRefs: boundedUniqueStringValues(input.closeoutRefs, 20),
      reasonCodes: boundedUniqueStringValues(schedulerReasonCodes, 30),
    },
    missionCommitmentEvidence: input.blockingCommitments.map(missionCommitmentEvidence),
    reviewedImplementationDiffRefs: boundedUniqueStringValues(input.implementationDiffRefs, 30),
    validationRepairEvidence,
    focusedValidationResult: input.validationCommandResult ?? null,
    proposedChildActionsExecution,
    closureValidation: {
      requiredBlockingCommitmentCount: 3,
      observedBlockingCommitmentCount: input.blockingCommitments.length,
      allThreeBlockingCommitmentsMapped,
      proposedChildActionsNotExecutedDuringProof:
        proposedChildActionsExecution.result === "confirmed_not_executed",
      repositoryDiffRefs: allClosureEvidenceRefs.filter(isSourceEvidenceRef),
      workflowWiringRefs: allClosureEvidenceRefs.filter(isWorkflowWiringEvidenceRef),
      contractRefs: allClosureEvidenceRefs.filter(isContractEvidenceRef),
      testRefs: allClosureEvidenceRefs.filter(isTestEvidenceRef),
      docsRefs: allClosureEvidenceRefs.filter(isDocsEvidenceRef),
      validationOutputRefs: allClosureEvidenceRefs.filter(isValidationEvidenceRef),
      liveProofRefs: allClosureEvidenceRefs.filter(isLiveProofEvidenceRef),
      validationCommandStatus: input.validationCommandResult?.status ?? null,
      commitments: closureCommitmentEvidence,
      reasonCodes: boundedUniqueStringValues(
        [
          ...(input.blockingCommitments.length === 3
            ? []
            : ["product_spec_planning_three_blocking_commitments_not_observed"]),
          ...(allThreeBlockingCommitmentsMapped
            ? ["product_spec_planning_all_three_blocking_commitments_mapped"]
            : ["product_spec_planning_closure_evidence_mapping_incomplete"]),
          ...(proposedChildActionsExecution.result === "confirmed_not_executed"
            ? ["product_spec_planning_proposed_children_not_executed_during_proof"]
            : ["product_spec_planning_proposed_child_execution_state_unconfirmed"]),
          ...closureCommitmentEvidence.flatMap((commitment) =>
            commitment.missingEvidenceClasses.map(
              (missing) =>
                `product_spec_planning_commitment_missing_${missing}:${commitment.commitmentId}`,
            ),
          ),
        ],
        60,
      ),
    },
    ledgerAcceptance: {
      artifactKind: "product_spec_planning_ledger_acceptance_validation",
      status: ledgerStatus,
      requiredBlockingCommitmentCount: 3,
      observedBlockingCommitmentCount: input.blockingCommitments.length,
      commitments: ledgerCommitments,
      evidenceRefs: ledgerEvidence,
      validationCommandStatus: input.validationCommandResult?.status ?? null,
      proposedChildActionsExecutionResult: proposedChildActionsExecution.result,
      childActionsExecuted: proposedChildActionsExecution.childActionsExecuted,
      runtimeJobsCreatedForProposedChildren:
        proposedChildActionsExecution.runtimeJobsCreatedForProposedChildren,
      rawStorageObserved,
      workQueueLifecycleMutated,
      workQueueLifecycleMutationAllowed: false as const,
      reasonCodes: boundedUniqueStringValues(
        [
          ledgerStatus === "pass"
            ? "product_spec_planning_ledger_acceptance_pass"
            : "product_spec_planning_ledger_acceptance_fail",
          ...(input.blockingCommitments.length === 3
            ? []
            : ["product_spec_planning_ledger_commitment_count_not_three"]),
          ...(input.validationCommandResult?.status === "passed"
            ? []
            : ["product_spec_planning_ledger_validation_command_not_passed"]),
          ...(proposedChildActionsExecution.result === "confirmed_not_executed"
            ? ["product_spec_planning_ledger_proposed_children_not_executed"]
            : ["product_spec_planning_ledger_proposed_children_execution_unconfirmed"]),
          ...(rawStorageObserved ? ["product_spec_planning_ledger_raw_storage_observed"] : []),
          ...(workQueueLifecycleMutated
            ? ["product_spec_planning_ledger_work_queue_lifecycle_mutated"]
            : []),
          ...ledgerCommitments.flatMap((commitment) => commitment.reasonCodes),
        ],
        80,
      ),
    },
    boundaryFlags: {
      rawStorageObserved,
      workQueueLifecycleMutated,
      workQueueLifecycleMutationAllowed: false as const,
    },
    reasonCodes: boundedUniqueStringValues(
      [
        ...schedulerReasonCodes,
        ...validationRepairEvidence.reasonCodes,
        ...proposedChildActionsExecution.reasonCodes,
        ...(allThreeBlockingCommitmentsMapped
          ? ["product_spec_planning_all_three_blocking_commitments_mapped"]
          : ["product_spec_planning_closure_evidence_mapping_incomplete"]),
      ],
      50,
    ),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawLogsStored: false as const,
    workQueueLifecycleMutationAllowed: false as const,
  };
}

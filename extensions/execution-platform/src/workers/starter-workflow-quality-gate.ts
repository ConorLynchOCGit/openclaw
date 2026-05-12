import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";

export type StarterWorkflowQualityStatus = "passed" | "needs_review" | "blocked" | "failed";

export type StarterWorkflowQualityGateInput = {
  workflowId: string;
  workerAdapterId: string | null;
  expectedWorkerAdapterId: string;
  runtimeJobId: string | null;
  runtimeState: string | null;
  roleRefs: string[];
  modelRefs: string[];
  modelRunRefs: string[];
  artifactRefs: string[];
  sourceRefs: string[];
  citationRefs: string[];
  validationRefs: string[];
  reviewRefs: string[];
  closeoutCapsule: CloseoutCapsule | null;
  workQueueReadbackPresent: boolean;
  workQueueReadbackSummary?: string | null;
  limitations: string[];
  reasonCodes: string[];
  fixtureEvidenceUsed: boolean;
  rawPromptStored: boolean;
  rawResponseStored: boolean;
  rawProviderLogStored: boolean;
  rawToolLogStored: boolean;
  rawResearchPageStored: boolean;
  authorityGranted: boolean;
  controlsApplied: boolean;
  deployPerformed: boolean;
  outboundSendPerformed: boolean;
  dependencyInstallPerformed: boolean;
  modelPromotionPerformed: boolean;
  workQueueLifecycleMutated: boolean;
};

export type StarterWorkflowQualityGateResult = {
  artifactKind: "starter_workflow_quality_gate_result";
  status: StarterWorkflowQualityStatus;
  acceptedForLiveQuality: boolean;
  workflowId: string;
  workerAdapterId: string | null;
  runtimeJobId: string | null;
  reasonCodes: string[];
  qualitySignals: {
    runtimeSucceeded: boolean;
    correctAdapter: boolean;
    fixtureEvidenceRejected: boolean;
    modelBackedEvidencePresent: boolean;
    taskSpecificEvidencePresent: boolean;
    closeoutAccepted: boolean;
    workQueueReadbackPresent: boolean;
    workflowSpecificChecksPassed: boolean;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawResearchPageStored: false;
  workQueueLifecycleMutated: false;
};

const WORKFLOW_ADAPTER_QUALITY_RULES: Record<
  string,
  (input: StarterWorkflowQualityGateInput) => string[]
> = {
  "single_agent.web_research": (input) => {
    const reasons: string[] = [];
    if (input.citationRefs.length === 0 || input.sourceRefs.length === 0) {
      reasons.push("web_research_source_or_citation_refs_missing");
    }
    if (input.rawResearchPageStored) {
      reasons.push("web_research_raw_page_storage_detected");
    }
    return reasons;
  },
  "workflow.research_to_coding_handoff": (input) => {
    const reasons: string[] = [];
    if (!input.artifactRefs.some((ref) => ref.includes("handoff"))) {
      reasons.push("research_to_coding_handoff_refs_missing");
    }
    if (input.reasonCodes.some((reason) => reason.includes("authority_leak"))) {
      reasons.push("research_to_coding_authority_isolation_failed");
    }
    return reasons;
  },
  "workflow.docs_skills": (input) => {
    const reasons: string[] = [];
    if (
      input.reasonCodes.some((reason) => /skill_(install|enable|promotion)_performed/u.test(reason))
    ) {
      reasons.push("docs_skills_side_effect_detected");
    }
    if (input.artifactRefs.length === 0) {
      reasons.push("docs_skills_artifact_refs_missing");
    }
    return reasons;
  },
  "agent_team.qa_test": (input) => {
    const reasons: string[] = [];
    if (input.validationRefs.length === 0) {
      reasons.push("qa_test_validation_refs_missing");
    }
    if (
      input.closeoutCapsule?.structuredSummary.taskSuccess === "satisfied" &&
      input.reviewRefs.length === 0
    ) {
      reasons.push("qa_test_review_refs_missing_for_success");
    }
    return reasons;
  },
  "agent_team.architecture": (input) => {
    const reasons: string[] = [];
    if (input.reasonCodes.includes("coding_team_permission_wrong_workflow")) {
      reasons.push("architecture_permission_model_is_coding_fallback");
    }
    if (input.artifactRefs.length === 0) {
      reasons.push("architecture_spec_artifact_refs_missing");
    }
    return reasons;
  },
};

function hasFixtureMarker(values: string[]): boolean {
  return values.some((value) => /fixture|injected|mock/iu.test(value));
}

function closeoutAccepted(capsule: CloseoutCapsule | null): boolean {
  return (
    capsule?.humanReport.source === "model" &&
    capsule.structuredSummary.taskSuccess === "satisfied" &&
    capsule.humanReport.reportMarkdown.trim().length >= 80 &&
    capsule.humanReport.eli5Progress.trim().length >= 20
  );
}

export function evaluateStarterWorkflowQualityGate(
  input: StarterWorkflowQualityGateInput,
): StarterWorkflowQualityGateResult {
  const reasonCodes: string[] = [];
  const runtimeSucceeded = input.runtimeState === "succeeded";
  const correctAdapter = input.workerAdapterId === input.expectedWorkerAdapterId;
  const fixtureEvidenceRejected =
    !input.fixtureEvidenceUsed &&
    !hasFixtureMarker([
      ...input.modelRefs,
      ...input.modelRunRefs,
      ...input.artifactRefs,
      ...input.reasonCodes,
    ]);
  const modelBackedEvidencePresent =
    input.modelRefs.length > 0 &&
    input.modelRunRefs.length > 0 &&
    !hasFixtureMarker(input.modelRefs);
  const taskSpecificEvidencePresent =
    input.artifactRefs.length > 0 &&
    (input.validationRefs.length > 0 || input.sourceRefs.length > 0 || input.reviewRefs.length > 0);
  const capsuleAccepted = closeoutAccepted(input.closeoutCapsule);
  const workflowSpecificReasons = WORKFLOW_ADAPTER_QUALITY_RULES[input.workflowId]?.(input) ?? [];

  if (!runtimeSucceeded) {
    reasonCodes.push("runtime_job_not_succeeded");
  }
  if (!correctAdapter) {
    reasonCodes.push("worker_adapter_mismatch");
  }
  if (!fixtureEvidenceRejected) {
    reasonCodes.push("fixture_or_injected_evidence_not_accepted_for_live_quality");
  }
  if (!modelBackedEvidencePresent) {
    reasonCodes.push("model_backed_evidence_missing");
  }
  if (!taskSpecificEvidencePresent) {
    reasonCodes.push("task_specific_evidence_refs_missing");
  }
  if (!capsuleAccepted) {
    reasonCodes.push("model_authored_closeout_not_accepted_for_live_quality");
  }
  if (!input.workQueueReadbackPresent) {
    reasonCodes.push("work_queue_readback_missing");
  }
  if (
    input.rawPromptStored ||
    input.rawResponseStored ||
    input.rawProviderLogStored ||
    input.rawToolLogStored ||
    input.rawResearchPageStored
  ) {
    reasonCodes.push("raw_storage_flag_detected");
  }
  if (
    input.authorityGranted ||
    input.controlsApplied ||
    input.deployPerformed ||
    input.outboundSendPerformed ||
    input.dependencyInstallPerformed ||
    input.modelPromotionPerformed ||
    input.workQueueLifecycleMutated
  ) {
    reasonCodes.push("side_effect_or_lifecycle_mutation_detected");
  }
  reasonCodes.push(...workflowSpecificReasons);

  const hardFailure = reasonCodes.some((reason) =>
    [
      "raw_storage_flag_detected",
      "side_effect_or_lifecycle_mutation_detected",
      "web_research_raw_page_storage_detected",
      "research_to_coding_authority_isolation_failed",
    ].includes(reason),
  );
  const acceptedForLiveQuality = reasonCodes.length === 0;
  return {
    artifactKind: "starter_workflow_quality_gate_result",
    status: acceptedForLiveQuality ? "passed" : hardFailure ? "failed" : "needs_review",
    acceptedForLiveQuality,
    workflowId: input.workflowId,
    workerAdapterId: input.workerAdapterId,
    runtimeJobId: input.runtimeJobId,
    reasonCodes: acceptedForLiveQuality
      ? ["starter_workflow_live_quality_gate_passed"]
      : [...new Set(reasonCodes)].slice(0, 40),
    qualitySignals: {
      runtimeSucceeded,
      correctAdapter,
      fixtureEvidenceRejected,
      modelBackedEvidencePresent,
      taskSpecificEvidencePresent,
      closeoutAccepted: capsuleAccepted,
      workQueueReadbackPresent: input.workQueueReadbackPresent,
      workflowSpecificChecksPassed: workflowSpecificReasons.length === 0,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    workQueueLifecycleMutated: false,
  };
}

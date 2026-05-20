import type { JsonValue } from "../runtime-job-repository.ts";

export const ARCHITECTURE_RED_TEAM_GATE_ARTIFACT_TYPE = "execution.architecture_red_team_gate";

export const ARCHITECTURE_RED_TEAM_RISK_LEVELS = ["P0", "P1", "P2", "P3"] as const;

export type ArchitectureRedTeamRiskLevel = (typeof ARCHITECTURE_RED_TEAM_RISK_LEVELS)[number];

export const ARCHITECTURE_RED_TEAM_GATE_LEVELS = [0, 1, 2, 3] as const;

export type ArchitectureRedTeamGateLevel = (typeof ARCHITECTURE_RED_TEAM_GATE_LEVELS)[number];

export type ArchitectureRedTeamStorageFlags = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ArchitectureBoundaryMap = ArchitectureRedTeamStorageFlags & {
  boundaryMapId: string;
  targetSystemRef: string;
  targetProofRef: string | null;
  pathSegments: string[];
  modelRuntimeToolBoundaries: Array<{
    boundaryId: string;
    fromSurface: string;
    toSurface: string;
    modelOwnedResponsibility: string;
    runtimeOwnedResponsibility: string;
    evidenceRef: string;
  }>;
  artifactRefs: string[];
  reasonCodes: string[];
};

export type ArchitectureAssumption = ArchitectureRedTeamStorageFlags & {
  assumptionId: string;
  boundaryId: string;
  riskLevel: ArchitectureRedTeamRiskLevel;
  assumptionSummary: string;
  failureModeSummary: string;
  blastRadiusSummary: string;
  falsifiableQuestionRefs: string[];
  evidenceRefs: string[];
};

export type FalsifiableQuestion = ArchitectureRedTeamStorageFlags & {
  questionId: string;
  assumptionId: string;
  boundaryId: string;
  questionSummary: string;
  expectedEvidenceRefs: string[];
  narrowResearchQueryRefs: string[];
  codeReviewTargetRefs: string[];
};

export type NarrowResearchBrief = ArchitectureRedTeamStorageFlags & {
  briefId: string;
  questionId: string;
  researchQuerySummary: string;
  sourceRefs: string[];
  findingSummary: string;
  applicabilitySummary: string;
  limitations: string[];
};

export type CodeGapMapEntry = ArchitectureRedTeamStorageFlags & {
  gapId: string;
  questionId: string;
  codeTargetRef: string;
  observedBehaviorSummary: string;
  expectedBehaviorSummary: string;
  gapRiskLevel: ArchitectureRedTeamRiskLevel;
  evidenceRefs: string[];
  recommendedActionSummary: string;
};

export type ArchitectureRiskRegisterEntry = ArchitectureRedTeamStorageFlags & {
  riskId: string;
  assumptionId: string;
  questionId: string | null;
  riskLevel: ArchitectureRedTeamRiskLevel;
  riskSummary: string;
  evidenceRefs: string[];
  mitigationSummary: string;
  ownerAcceptanceRefs: string[];
  status: "open" | "accepted_by_owner" | "mitigated" | "deferred_post_proof";
};

export type PreProofBlocker = ArchitectureRedTeamStorageFlags & {
  blockerId: string;
  riskId: string;
  blockerSummary: string;
  requiredActionSummary: string;
  ownerAcceptanceRefs: string[];
  evidenceRefs: string[];
};

export type PostProofHardeningItem = ArchitectureRedTeamStorageFlags & {
  hardeningId: string;
  riskId: string;
  hardeningSummary: string;
  recommendedQueuePosition: "before_proof" | "after_next_proof" | "later";
  evidenceRefs: string[];
};

export type ProofReadinessDecision = ArchitectureRedTeamStorageFlags & {
  decisionId: string;
  targetProofRef: string;
  decision: "ready" | "ready_with_explicit_owner_risk" | "not_ready";
  p0BlockerRefs: string[];
  ownerAcceptanceRefs: string[];
  requiredPreProofActionRefs: string[];
  postProofHardeningRefs: string[];
  decisionSummary: string;
};

export type ArchitectureRedTeamFinalReview = ArchitectureRedTeamStorageFlags & {
  reviewId: string;
  reviewerModelRef: string;
  reviewSummary: string;
  confidence: "low" | "medium" | "high";
  semanticSufficiencyJudgment: "sufficient" | "needs_more_research" | "needs_more_code_review";
  unresolvedQuestionRefs: string[];
  evidenceRefs: string[];
};

export type ArchitectureRedTeamGateRun = ArchitectureRedTeamStorageFlags & {
  artifactKind: "execution_platform.architecture_red_team_gate.v1";
  gateRunId: string;
  gateLevel: ArchitectureRedTeamGateLevel;
  workflowId: "agent_team.architecture_red_team";
  targetSystemRef: string;
  targetProofRef: string | null;
  runtimeJobId: string | null;
  workItemId: string | null;
  boundaryMap: ArchitectureBoundaryMap;
  assumptions: ArchitectureAssumption[];
  falsifiableQuestions: FalsifiableQuestion[];
  researchBriefs: NarrowResearchBrief[];
  codeGapMap: CodeGapMapEntry[];
  riskRegister: ArchitectureRiskRegisterEntry[];
  preProofBlockers: PreProofBlocker[];
  postProofHardeningItems: PostProofHardeningItem[];
  proofReadinessDecision: ProofReadinessDecision;
  finalReview: ArchitectureRedTeamFinalReview;
  artifactRefs: string[];
  reasonCodes: string[];
  createdAt: string;
};

export type ArchitectureRedTeamGateValidation = {
  artifactKind: "architecture_red_team_gate_validation";
  gateRunId: string | null;
  valid: boolean;
  proofReady: boolean;
  reasonCodes: string[];
  p0BlockerCount: number;
  p1RiskCount: number;
  p2RiskCount: number;
  p3RiskCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

export type ArchitectureRedTeamGateSummary = {
  artifactKind: "architecture_red_team_gate_summary";
  gateRunId: string;
  gateLevel: ArchitectureRedTeamGateLevel;
  targetSystemRef: string;
  targetProofRef: string | null;
  boundaryCount: number;
  assumptionCount: number;
  questionCount: number;
  researchBriefCount: number;
  codeGapCount: number;
  p0BlockerCount: number;
  p1RiskCount: number;
  p2RiskCount: number;
  p3RiskCount: number;
  proofReadinessDecision: ProofReadinessDecision["decision"];
  topBlockerSummaries: string[];
  postProofHardeningSummaries: string[];
  finalReviewSummary: string;
  eli5: string;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

const MAX_REASON_CODES = 40;

function hasRawStorageFlag(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === true &&
      [
        "rawPromptStored",
        "rawResponseStored",
        "rawTranscriptStored",
        "rawProviderLogStored",
        "rawToolLogStored",
        "rawCommandLogStored",
        "rawDbRowsStored",
        "secretsStored",
        "rawLogsStored",
      ].includes(key)
    ) {
      return true;
    }
    if (entry && typeof entry === "object" && hasRawStorageFlag(entry)) {
      return true;
    }
  }
  return false;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function countRisks(
  risks: ArchitectureRiskRegisterEntry[],
  riskLevel: ArchitectureRedTeamRiskLevel,
): number {
  return risks.filter((risk) => risk.riskLevel === riskLevel).length;
}

function refsPresent(values: readonly string[] | undefined): boolean {
  return Array.isArray(values) && values.some((value) => nonEmpty(value));
}

export function validateArchitectureRedTeamGateRun(
  run: ArchitectureRedTeamGateRun,
): ArchitectureRedTeamGateValidation {
  const reasonCodes: string[] = [];
  if (hasRawStorageFlag(run)) {
    reasonCodes.push("architecture_red_team_raw_storage_rejected");
  }
  if (run.artifactKind !== "execution_platform.architecture_red_team_gate.v1") {
    reasonCodes.push("architecture_red_team_artifact_kind_invalid");
  }
  if (run.workflowId !== "agent_team.architecture_red_team") {
    reasonCodes.push("architecture_red_team_workflow_id_invalid");
  }
  if (!ARCHITECTURE_RED_TEAM_GATE_LEVELS.includes(run.gateLevel)) {
    reasonCodes.push("architecture_red_team_gate_level_invalid");
  }
  if (!nonEmpty(run.gateRunId)) {
    reasonCodes.push("architecture_red_team_gate_run_id_missing");
  }
  if (!nonEmpty(run.targetSystemRef)) {
    reasonCodes.push("architecture_red_team_target_system_missing");
  }
  if (!nonEmpty(run.boundaryMap?.boundaryMapId)) {
    reasonCodes.push("architecture_red_team_boundary_map_missing");
  }
  if (run.gateLevel >= 1 && run.assumptions.length === 0) {
    reasonCodes.push("architecture_red_team_assumptions_required_for_level_1");
  }
  if (run.gateLevel >= 1 && run.falsifiableQuestions.length === 0) {
    reasonCodes.push("architecture_red_team_questions_required_for_level_1");
  }
  if (run.gateLevel >= 2 && run.boundaryMap.modelRuntimeToolBoundaries.length === 0) {
    reasonCodes.push("architecture_red_team_boundaries_required_for_level_2");
  }
  if (run.gateLevel >= 2 && run.researchBriefs.length === 0) {
    reasonCodes.push("architecture_red_team_research_briefs_required_for_level_2");
  }
  if (run.gateLevel >= 2 && run.codeGapMap.length === 0) {
    reasonCodes.push("architecture_red_team_code_gap_map_required_for_level_2");
  }
  if (run.gateLevel >= 2 && !nonEmpty(run.finalReview.reviewId)) {
    reasonCodes.push("architecture_red_team_final_review_required_for_level_2");
  }
  if (
    run.gateLevel >= 3 &&
    run.preProofBlockers.length === 0 &&
    countRisks(run.riskRegister, "P0") > 0
  ) {
    reasonCodes.push("architecture_red_team_level_3_p0_blockers_must_be_explicit");
  }
  for (const assumption of run.assumptions) {
    if (!ARCHITECTURE_RED_TEAM_RISK_LEVELS.includes(assumption.riskLevel)) {
      reasonCodes.push(`architecture_red_team_assumption_risk_invalid:${assumption.assumptionId}`);
    }
    if (!nonEmpty(assumption.assumptionId) || !nonEmpty(assumption.boundaryId)) {
      reasonCodes.push("architecture_red_team_assumption_shape_invalid");
    }
  }
  for (const question of run.falsifiableQuestions) {
    if (
      !nonEmpty(question.questionId) ||
      !nonEmpty(question.assumptionId) ||
      !nonEmpty(question.boundaryId)
    ) {
      reasonCodes.push("architecture_red_team_question_shape_invalid");
    }
  }
  for (const brief of run.researchBriefs) {
    if (!nonEmpty(brief.briefId) || !nonEmpty(brief.questionId) || !refsPresent(brief.sourceRefs)) {
      reasonCodes.push("architecture_red_team_research_brief_refs_missing");
    }
  }
  for (const gap of run.codeGapMap) {
    if (!nonEmpty(gap.gapId) || !nonEmpty(gap.questionId) || !nonEmpty(gap.codeTargetRef)) {
      reasonCodes.push("architecture_red_team_code_gap_shape_invalid");
    }
    if (!ARCHITECTURE_RED_TEAM_RISK_LEVELS.includes(gap.gapRiskLevel)) {
      reasonCodes.push(`architecture_red_team_code_gap_risk_invalid:${gap.gapId}`);
    }
  }
  const p0Risks = run.riskRegister.filter((risk) => risk.riskLevel === "P0");
  const unresolvedP0Risks = p0Risks.filter(
    (risk) =>
      risk.status === "open" &&
      !refsPresent(risk.ownerAcceptanceRefs) &&
      !run.preProofBlockers.some((blocker) => blocker.riskId === risk.riskId),
  );
  if (unresolvedP0Risks.length > 0) {
    reasonCodes.push("architecture_red_team_p0_risk_without_blocker_or_owner_acceptance");
  }
  const decision = run.proofReadinessDecision;
  if (!nonEmpty(decision.decisionId)) {
    reasonCodes.push("architecture_red_team_proof_decision_missing");
  }
  if (
    p0Risks.length > 0 &&
    decision.decision === "ready" &&
    !refsPresent(decision.ownerAcceptanceRefs)
  ) {
    reasonCodes.push("architecture_red_team_p0_blocks_ready_decision");
  }
  if (
    run.preProofBlockers.length > 0 &&
    decision.decision !== "not_ready" &&
    !refsPresent(decision.ownerAcceptanceRefs)
  ) {
    reasonCodes.push(
      "architecture_red_team_preproof_blockers_require_not_ready_or_owner_acceptance",
    );
  }
  const valid = reasonCodes.length === 0;
  const proofReady =
    valid &&
    (decision.decision === "ready" ||
      (decision.decision === "ready_with_explicit_owner_risk" &&
        refsPresent(decision.ownerAcceptanceRefs)));
  return {
    artifactKind: "architecture_red_team_gate_validation",
    gateRunId: run.gateRunId || null,
    valid,
    proofReady,
    reasonCodes: (valid ? ["architecture_red_team_gate_valid"] : reasonCodes).slice(
      0,
      MAX_REASON_CODES,
    ),
    p0BlockerCount: run.preProofBlockers.length,
    p1RiskCount: countRisks(run.riskRegister, "P1"),
    p2RiskCount: countRisks(run.riskRegister, "P2"),
    p3RiskCount: countRisks(run.riskRegister, "P3"),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function summarizeArchitectureRedTeamGateRun(
  run: ArchitectureRedTeamGateRun,
): ArchitectureRedTeamGateSummary {
  const validation = validateArchitectureRedTeamGateRun(run);
  return {
    artifactKind: "architecture_red_team_gate_summary",
    gateRunId: run.gateRunId,
    gateLevel: run.gateLevel,
    targetSystemRef: run.targetSystemRef,
    targetProofRef: run.targetProofRef,
    boundaryCount: run.boundaryMap.modelRuntimeToolBoundaries.length,
    assumptionCount: run.assumptions.length,
    questionCount: run.falsifiableQuestions.length,
    researchBriefCount: run.researchBriefs.length,
    codeGapCount: run.codeGapMap.length,
    p0BlockerCount: run.preProofBlockers.length,
    p1RiskCount: validation.p1RiskCount,
    p2RiskCount: validation.p2RiskCount,
    p3RiskCount: validation.p3RiskCount,
    proofReadinessDecision: run.proofReadinessDecision.decision,
    topBlockerSummaries: run.preProofBlockers
      .map((blocker) => blocker.blockerSummary)
      .filter(nonEmpty)
      .slice(0, 5),
    postProofHardeningSummaries: run.postProofHardeningItems
      .map((item) => item.hardeningSummary)
      .filter(nonEmpty)
      .slice(0, 8),
    finalReviewSummary: run.finalReview.reviewSummary,
    eli5: "Before a major proof, OpenClaw lists the risky assumptions, asks concrete questions, checks code and research refs, then says whether the proof is ready or still blocked.",
    artifactRefs: run.artifactRefs.slice(0, 20),
    reasonCodes: validation.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  };
}

export function architectureRedTeamGateArtifactMetadata(
  run: ArchitectureRedTeamGateRun,
): JsonValue {
  return run as unknown as JsonValue;
}

export function architectureRedTeamGateSummaryMetadata(
  summary: ArchitectureRedTeamGateSummary,
): JsonValue {
  return summary as unknown as JsonValue;
}

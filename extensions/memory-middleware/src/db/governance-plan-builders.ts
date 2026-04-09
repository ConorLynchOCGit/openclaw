import type {
  CandidatePromotionPlanResult,
  CandidatePromotionPlanTarget,
  CandidateReviewOutcome,
  CandidateSubmissionKind,
  ProcedureStatus,
  SkillCandidateApprovalPlanAcceptedResult,
  SkillCandidateApprovalPlanResult,
  SkillCandidateApprovalPlanTarget,
  SkillCandidateApprovalScope,
  SkillCandidateInstallHandoffResult,
  SkillCandidateInstallHandoffTarget,
  ProcedureValidationPlanResult,
  ProcedureValidationPlanTarget,
  SkillCandidatePlanResult,
  SkillCandidatePlanTarget,
  SkillCandidateProcurementPlanResult,
  SkillCandidateProcurementPlanTarget,
  SkillCandidateSkillVetterHandoffPackage,
  SkillCandidateSkillVetterHandoffResult,
  SkillCandidateSkillVetterHandoffTarget,
  SkillCandidateStatus,
  SkillCandidateVettingResultInput,
} from "./runtime.js";

type CandidatePromotionReviewState = "candidate" | "corrected" | "rejected";

export function buildCandidatePromotionPlan(params: {
  candidateId: string;
  kind: CandidateSubmissionKind;
  reviewState: CandidatePromotionReviewState;
  latestReviewOutcome?: CandidateReviewOutcome;
}): CandidatePromotionPlanResult {
  if (params.reviewState === "rejected" || params.latestReviewOutcome === "rejected") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "rejected",
      latestReviewOutcome: "rejected",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate has a rejected review outcome",
        "rejected candidates are not eligible for next-step promotion planning",
      ],
      requiredGates: [
        "candidate would need to be resubmitted or replaced before future promotion planning",
      ],
    };
  }

  if (params.reviewState === "corrected" || params.latestReviewOutcome === "needs_revision") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "corrected",
      latestReviewOutcome: "needs_revision",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate has a needs-revision review outcome",
        "candidates needing revision are not eligible for promotion planning until reviewed again",
      ],
      requiredGates: [
        "revise the candidate content",
        "record a fresh accepted review outcome before promotion planning",
      ],
    };
  }

  if (params.latestReviewOutcome !== "accepted") {
    return {
      accepted: true,
      status: "ok",
      candidateId: params.candidateId,
      candidateKind: params.kind,
      reviewState: "candidate",
      eligible: false,
      possibleTargets: ["remain_candidate_only"],
      rationale: [
        "candidate does not yet have an accepted review outcome",
        "promotion planning stays advisory-only until a reviewer accepts the candidate",
      ],
      requiredGates: ["record an accepted candidate review before promotion planning"],
    };
  }

  const nextTarget: CandidatePromotionPlanTarget =
    params.kind === "procedure" ? "propose_procedure_draft" : "propose_memory_promotion";
  const requiredGates =
    params.kind === "procedure"
      ? [
          "conversational confirmation is still required",
          "bounded procedure-draft promotion requires an explicit write tool invocation",
          "policy and review checks must pass before any future promotion write",
        ]
      : [
          "conversational confirmation is still required",
          "bounded memory promotion requires an explicit write tool invocation",
          "policy and review checks must pass before any future promotion write",
        ];
  const rationale =
    params.kind === "procedure"
      ? [
          "candidate has an accepted review outcome",
          "procedure candidates can be considered for a future procedure-draft path",
        ]
      : [
          "candidate has an accepted review outcome",
          "this candidate kind can be considered for a future memory-promotion path",
        ];

  return {
    accepted: true,
    status: "ok",
    candidateId: params.candidateId,
    candidateKind: params.kind,
    reviewState: "candidate",
    latestReviewOutcome: "accepted",
    eligible: true,
    possibleTargets: [nextTarget, "remain_candidate_only"],
    rationale,
    requiredGates,
  };
}

export function normalizePromotionReviewState(
  reviewState: string | null | undefined,
): CandidatePromotionReviewState {
  if (reviewState === "candidate" || reviewState === "corrected" || reviewState === "rejected") {
    return reviewState;
  }
  return "candidate";
}

export function buildMemoryPromotionPlanFromTarget(params: {
  candidateId: string;
  kind: CandidateSubmissionKind;
  reviewState: string | null | undefined;
  latestReviewOutcome?: CandidateReviewOutcome;
}): CandidatePromotionPlanResult {
  return buildCandidatePromotionPlan({
    candidateId: params.candidateId,
    kind: params.kind,
    reviewState: normalizePromotionReviewState(params.reviewState),
    ...(params.latestReviewOutcome ? { latestReviewOutcome: params.latestReviewOutcome } : {}),
  });
}

export function buildProcedureValidationPlan(params: {
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  sourceCandidateKind?: CandidateSubmissionKind;
  latestCandidateReviewOutcome?: CandidateReviewOutcome;
  hasPromotedReviewProvenance: boolean;
  hasSourceEventProvenance: boolean;
}): ProcedureValidationPlanResult {
  const remainDraftOnly = (
    rationale: string[],
    requiredGates: string[],
  ): ProcedureValidationPlanResult => ({
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: params.procedureStatus,
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestCandidateReviewOutcome
      ? { latestCandidateReviewOutcome: params.latestCandidateReviewOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_draft_only"],
    rationale,
    requiredGates,
  });

  if (params.procedureStatus !== "draft") {
    return remainDraftOnly(
      [
        `procedure is already in ${params.procedureStatus} state`,
        "only draft procedures are eligible for validated-procedure planning",
      ],
      ["keep this procedure out of validated-procedure planning until a new draft exists"],
    );
  }

  if (!params.sourceCandidateId) {
    return remainDraftOnly(
      [
        "procedure draft is missing candidate source-memory provenance",
        "validated-procedure planning requires a draft linked back to a reviewed procedure candidate",
      ],
      ["recreate or relink the draft through the bounded procedure-promotion path"],
    );
  }

  if (params.sourceCandidateKind !== "procedure") {
    return remainDraftOnly(
      [
        "procedure draft is not backed by a procedure candidate",
        "validated-procedure planning is reserved for bounded procedure-draft artifacts",
      ],
      ["use a reviewed procedure candidate before considering validated-procedure planning"],
    );
  }

  if (params.latestCandidateReviewOutcome !== "accepted") {
    return remainDraftOnly(
      [
        "source procedure candidate does not have an accepted review outcome",
        "validated-procedure planning stays advisory-only until the source candidate is accepted",
      ],
      ["record an accepted candidate review before planning a validated procedure"],
    );
  }

  if (!params.hasPromotedReviewProvenance || !params.hasSourceEventProvenance) {
    return remainDraftOnly(
      [
        "procedure draft is missing required promotion provenance",
        "validated-procedure planning requires both accepted-review and source-event linkage",
      ],
      ["recreate the draft through the bounded procedure-promotion path"],
    );
  }

  const possibleTargets: ProcedureValidationPlanTarget[] = [
    "propose_validated_procedure",
    "remain_draft_only",
  ];

  return {
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: "draft",
    sourceCandidateId: params.sourceCandidateId,
    latestCandidateReviewOutcome: "accepted",
    eligible: true,
    possibleTargets,
    rationale: [
      "procedure draft is backed by an accepted reviewed procedure candidate",
      "draft provenance includes both accepted-review and source-event linkage",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "validated-procedure writes require an explicit write tool invocation",
      "procedure-run evidence, policy checks, and review gates must pass before any future validation write",
    ],
  };
}

export function buildSkillCandidatePlan(params: {
  procedureId: string;
  procedureStatus: ProcedureStatus;
  sourceCandidateId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  hasValidationRun: boolean;
  hasPromotedReviewProvenance: boolean;
  hasSourceEventProvenance: boolean;
}): SkillCandidatePlanResult {
  const remainValidatedProcedureOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidatePlanResult => ({
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: params.procedureStatus,
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_validated_procedure_only"],
    rationale,
    requiredGates,
  });

  if (params.procedureStatus !== "validated") {
    return remainValidatedProcedureOnly(
      [
        `procedure is currently in ${params.procedureStatus} state`,
        "only validated procedures are eligible for skill-candidate planning",
      ],
      ["complete bounded procedure validation before planning a skill candidate"],
    );
  }

  if (!params.sourceCandidateId) {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing source candidate provenance",
        "skill-candidate planning requires a procedure that preserves bounded candidate lineage",
      ],
      ["recreate the validated procedure through the bounded candidate-to-procedure path"],
    );
  }

  if (!params.hasPromotedReviewProvenance || !params.hasSourceEventProvenance) {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing required review or event provenance",
        "skill-candidate planning requires preserved bounded promotion provenance",
      ],
      ["recreate the validated procedure through the bounded promotion and validation path"],
    );
  }

  if (!params.hasValidationRun || params.latestValidationRunOutcome !== "passed") {
    return remainValidatedProcedureOnly(
      [
        "validated procedure is missing a passed validation run",
        "skill-candidate planning stays advisory-only until procedure validation evidence is present",
      ],
      ["record a successful bounded validation run before planning a skill candidate"],
    );
  }

  const possibleTargets: SkillCandidatePlanTarget[] = [
    "propose_skill_candidate",
    "remain_validated_procedure_only",
  ];

  return {
    accepted: true,
    status: "ok",
    procedureId: params.procedureId,
    procedureStatus: "validated",
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "procedure is in validated state",
      "validated procedure preserves bounded candidate provenance and a passed validation run",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "skill-candidate creation requires an explicit write tool invocation",
      "procurement, review, and policy checks must pass before any future skill-candidate write",
    ],
  };
}

export function buildSkillCandidateProcurementPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  name: string;
  summary: string;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
}): SkillCandidateProcurementPlanResult {
  const remainInternalOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidateProcurementPlanResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_internal_skill_candidate_only"],
    rationale,
    requiredGates,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remainInternalOnly(
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "procurement handoff planning is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning procurement workflow for the skill candidate's current lifecycle state"],
    );
  }

  if (!params.sourceProcedureId) {
    return remainInternalOnly(
      [
        "skill candidate is missing source procedure provenance",
        "procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded procedure-to-skill path"],
    );
  }

  if (params.sourceProcedureStatus !== "validated") {
    return remainInternalOnly(
      [
        "source procedure is not in validated state",
        "procurement handoff planning requires a bounded skill candidate backed by a validated procedure",
      ],
      ["validate the source procedure through the bounded validation path first"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing required bounded lineage fields",
        "procurement handoff planning requires preserved candidate, review, event, and validation provenance",
      ],
      ["recreate the skill candidate through the bounded internal promotion path"],
    );
  }

  if (params.latestValidationRunOutcome !== "passed") {
    return remainInternalOnly(
      [
        "skill candidate is missing a passed validation run outcome",
        "procurement handoff planning stays advisory-only until bounded validation evidence is present",
      ],
      ["record a successful bounded procedure validation before procurement handoff planning"],
    );
  }

  const possibleTargets: SkillCandidateProcurementPlanTarget[] = [
    "propose_procurement_handoff",
    "remain_internal_skill_candidate_only",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: "candidate",
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "bounded lineage preserves validated procedure, candidate, review, event, and validation evidence",
    ],
    requiredGates: [
      "conversational confirmation is still required",
      "Skill Vetter must be invoked explicitly outside this advisory slice",
      "minimum vetting outputs must be recorded before lifecycle advancement",
      "installation remains blocked until procurement and policy gates pass",
    ],
    handoff: {
      source: {
        sourceType: "bounded_internal_skill_candidate",
        skillCandidateId: params.skillCandidateId,
        sourceProcedureId: params.sourceProcedureId,
        sourceCandidateId: params.sourceCandidateId,
        sourceEventId: params.sourceEventId,
        validationRunId: params.validationRunId,
      },
      scope: {
        name: params.name,
        summary: params.summary,
        intendedRole: "candidate_reusable_behavior",
        boundaries: [
          "bounded internal skill candidate only",
          "no installation or runtime enablement is implied by this plan",
          "must remain an accelerator and not the canonical memory substrate",
        ],
        overlaps: [
          "candidate reusable behavior distilled from a validated procedure",
          "future external skill evaluation must remain subordinate to repo-native memory architecture",
        ],
      },
      permissionsRisk: {
        currentArtifactRisk: "bounded_internal_record_only",
        installRisk: "external_skill_not_reviewed",
        requiredChecks: [
          "review file, network, secret, and execution expectations during procurement",
          "confirm requested capability is compatible with current policy posture",
          "verify the actual packaged skill before any install decision",
        ],
      },
      suspiciousPatterns: {
        knownConcerns: [
          "no external package has been reviewed yet",
          "Skill Vetter has not been invoked by this planning surface",
        ],
        openQuestions: [
          "determine the packaging or source path for any future external skill candidate",
          "review the actual external implementation for suspicious patterns before installation",
        ],
      },
      operationalFit: {
        roadmapRole: "skill_candidate",
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
        repoNativeLineagePreserved: true,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: [
          "Skill Vetter review has not been completed",
          "minimum vetting outputs are not yet recorded",
          "no installation is allowed in this advisory slice",
        ],
      },
    },
  };
}

export function buildSkillCandidateSkillVetterHandoffPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  procurementRecordPayload?: Record<string, unknown>;
  procurementRecordCreatedAt?: string;
}): SkillCandidateSkillVetterHandoffResult {
  const remainInternalOnly = (
    rationale: string[],
    requiredGates: string[],
  ): SkillCandidateSkillVetterHandoffResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_internal_only"],
    rationale,
    requiredGates,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remainInternalOnly(
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "manual Skill Vetter handoff is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning procurement workflow for the skill candidate's current lifecycle state"],
    );
  }

  if (!params.sourceProcedureId) {
    return remainInternalOnly(
      [
        "skill candidate is missing source procedure provenance",
        "manual Skill Vetter handoff requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded procedure-to-skill path"],
    );
  }

  if (params.sourceProcedureStatus !== "validated") {
    return remainInternalOnly(
      [
        "source procedure is not in validated state",
        "manual Skill Vetter handoff requires a bounded skill candidate backed by a validated procedure",
      ],
      ["validate the source procedure through the bounded validation path first"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing required bounded lineage fields",
        "manual Skill Vetter handoff requires preserved candidate, review, event, and validation provenance",
      ],
      ["recreate the skill candidate through the bounded internal promotion path"],
    );
  }

  if (params.latestValidationRunOutcome !== "passed") {
    return remainInternalOnly(
      [
        "skill candidate is missing a passed validation run outcome",
        "manual Skill Vetter handoff remains blocked until bounded validation evidence is present",
      ],
      ["record a successful bounded procedure validation before Skill Vetter handoff planning"],
    );
  }

  if (
    !params.procurementRecordId ||
    !params.procurementRecordPayload ||
    !params.procurementRecordCreatedAt
  ) {
    return remainInternalOnly(
      [
        "skill candidate is missing an internal procurement record",
        "manual Skill Vetter handoff requires a persisted procurement record before review handoff",
      ],
      ["create a bounded procurement record before preparing manual Skill Vetter handoff"],
    );
  }

  const procurementRecordPayload = params.procurementRecordPayload;
  const handoff = procurementRecordPayload.handoff;
  const recordRequiredGates = procurementRecordPayload.requiredGates;

  if (!isSkillCandidateProcurementHandoff(handoff) || !isStringArray(recordRequiredGates)) {
    return remainInternalOnly(
      [
        "procurement record is missing the structured procurement handoff package",
        "manual Skill Vetter handoff requires a complete procurement record payload before review handoff",
      ],
      ["recreate the bounded procurement record before preparing manual Skill Vetter handoff"],
    );
  }

  const possibleTargets: SkillCandidateSkillVetterHandoffTarget[] = [
    "propose_skill_vetter_handoff",
    "remain_internal_only",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: "candidate",
    procurementRecordId: params.procurementRecordId,
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets,
    rationale: [
      "skill candidate remains in bounded internal candidate state",
      "a procurement record already preserves the structured handoff package for manual vetting",
    ],
    requiredGates: [
      "manual Skill Vetter invocation is still required",
      ...recordRequiredGates,
      "manual Skill Vetter findings must be recorded before lifecycle advancement",
      "installation remains blocked until procurement, vetting, and policy gates pass",
    ],
    handoff: {
      procurementRecord: {
        procurementRecordId: params.procurementRecordId,
        eventName: "skill_candidate.procurement_record",
        recordedAt: params.procurementRecordCreatedAt,
      },
      handoff,
      manualSkillVetterInputs: {
        source: handoff.source,
        scope: handoff.scope,
        permissionsRisk: handoff.permissionsRisk,
        suspiciousPatterns: handoff.suspiciousPatterns,
        operationalFit: handoff.operationalFit,
        approvalRecommendation: handoff.approvalRecommendation,
      },
      manualSteps: [
        "run Skill Vetter manually against the actual external skill artifact or source path",
        "compare Skill Vetter findings against the preserved bounded lineage and procurement record",
        "record minimum vetting outputs before any lifecycle advancement or install decision",
      ],
      installGuardrails: [
        "do not install any skill from this handoff package alone",
        "do not treat this handoff as Skill Vetter output",
        "keep the candidate in internal-only state until manual vetting and approval gates complete",
      ],
    },
  };
}

export function buildSkillCandidateApprovalPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  promotedFromReviewId?: string;
  sourceEventId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  procurementRecordPayload?: Record<string, unknown>;
  procurementRecordCreatedAt?: string;
  vettingResultId?: string;
  vettingResultPayload?: Record<string, unknown>;
}): SkillCandidateApprovalPlanResult {
  const baseInstallGuardrails = [
    "do not install any skill from this planning result alone",
    "keep any later installation as a separate explicit action",
    "do not let the skill candidate replace the canonical memory substrate",
  ];

  const remain = (
    possibleTargets: SkillCandidateApprovalPlanTarget[],
    rationale: string[],
    requiredGates: string[],
    remainingBlockers: string[],
    extra: Partial<SkillCandidateApprovalPlanAcceptedResult> = {},
  ): SkillCandidateApprovalPlanResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.vettingResultId ? { vettingResultRecordId: params.vettingResultId } : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets,
    rationale,
    requiredGates,
    installGuardrails: baseInstallGuardrails,
    remainingBlockers,
    ...extra,
  });

  if (params.skillCandidateStatus !== "candidate") {
    return remain(
      ["remain_internal_only"],
      [
        `skill candidate is already in ${params.skillCandidateStatus} state`,
        "approval planning is reserved for bounded internal candidate-state rows",
      ],
      ["use the owning lifecycle workflow for the skill candidate's current state"],
      [`skill candidate is already in ${params.skillCandidateStatus} state`],
    );
  }

  if (!params.sourceProcedureId || params.sourceProcedureStatus !== "validated") {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing validated procedure provenance",
        "approval planning requires a bounded skill candidate linked to a validated procedure",
      ],
      ["recreate the skill candidate through the bounded validated procedure path"],
      ["validated procedure provenance is incomplete"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.promotedFromReviewId ||
    !params.sourceEventId ||
    !params.validationRunId ||
    params.latestValidationRunOutcome !== "passed"
  ) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing required bounded lineage or passed validation evidence",
        "approval planning requires preserved candidate, review, event, and validation provenance",
      ],
      ["restore bounded lineage and passed validation evidence before approval planning"],
      ["bounded lineage or validation evidence is incomplete"],
    );
  }

  if (
    !params.procurementRecordId ||
    !params.procurementRecordPayload ||
    !params.procurementRecordCreatedAt
  ) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing an internal procurement record",
        "approval planning requires procurement context before any later approval consideration",
      ],
      ["create a bounded procurement record before approval planning"],
      ["internal procurement record is missing"],
    );
  }

  if (!params.vettingResultId || !params.vettingResultPayload) {
    return remain(
      ["remain_blocked"],
      [
        "skill candidate is missing a bounded vetting result",
        "approval planning requires a recorded bounded vetting result before any later approval consideration",
      ],
      ["record a bounded vetting result before approval planning"],
      ["bounded vetting result is missing"],
    );
  }

  const decision = params.vettingResultPayload.decision;
  const result = params.vettingResultPayload.result;
  if (
    !isSkillCandidateVettingDecision(decision) ||
    !isRecord(result) ||
    !isRecord(result.approvalRecommendation) ||
    !isRecord(result.operationalFit)
  ) {
    return remain(
      ["remain_blocked"],
      [
        "bounded vetting result is missing the structured approval recommendation",
        "approval planning requires a complete bounded vetting result payload",
      ],
      ["recreate the bounded vetting result before approval planning"],
      ["bounded vetting result payload is incomplete"],
    );
  }

  const approvalRecommendation = result.approvalRecommendation;
  const operationalFit = result.operationalFit;
  const blockers = isStringArray(approvalRecommendation.blockers)
    ? approvalRecommendation.blockers
    : ["approval recommendation blockers are missing or invalid"];

  const remainingBlockers = [...blockers];
  if (operationalFit.acceleratorOnly !== true) {
    remainingBlockers.push("skill candidate must remain accelerator-only");
  }
  if (operationalFit.canonicalMemorySubstrate !== false) {
    remainingBlockers.push("skill candidate must not become the canonical memory substrate");
  }

  if (decision === "defer") {
    return remain(
      ["remain_internal_only"],
      [
        "bounded vetting result deferred further action",
        "skill candidate should remain internal-only until a later conversational review updates the recommendation",
      ],
      ["perform another explicit conversational review before any approval-state mutation slice"],
      remainingBlockers.length > 0 ? remainingBlockers : ["conversational review remains deferred"],
      { latestVettingDecision: "defer" },
    );
  }

  if (decision === "reject") {
    return remain(
      ["remain_blocked"],
      [
        "bounded vetting result rejected this skill candidate for approval planning",
        "approval or installation planning cannot proceed while the rejection stands",
      ],
      ["do not advance approval or installation while the rejection remains in force"],
      remainingBlockers.length > 0
        ? remainingBlockers
        : ["bounded vetting result rejected this skill candidate"],
      { latestVettingDecision: "reject" },
    );
  }

  if (remainingBlockers.length > 0) {
    return remain(
      ["remain_blocked"],
      [
        "bounded vetting result still carries unresolved blockers",
        "approval planning remains blocked until the recorded blockers are cleared",
      ],
      ["clear the remaining blockers before any approval-state mutation slice"],
      remainingBlockers,
      { latestVettingDecision: decision },
    );
  }

  if (
    decision === "approve_limited" &&
    approvalRecommendation.proposedLifecycleState === "approved_limited"
  ) {
    return {
      accepted: true,
      status: "ok",
      skillCandidateId: params.skillCandidateId,
      skillCandidateStatus: params.skillCandidateStatus,
      procurementRecordId: params.procurementRecordId,
      vettingResultRecordId: params.vettingResultId,
      sourceProcedureId: params.sourceProcedureId,
      sourceCandidateId: params.sourceCandidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_limited",
      eligible: true,
      possibleTargets: ["propose_approved_for_limited_use", "remain_internal_only"],
      rationale: [
        "bounded vetting result supports bounded limited approval planning",
        "installation remains separate and guarded even when limited approval is proposed",
      ],
      requiredGates: [
        "approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: baseInstallGuardrails,
      remainingBlockers: [],
    };
  }

  if (
    decision === "approve_normal" &&
    approvalRecommendation.proposedLifecycleState === "approved_normal" &&
    approvalRecommendation.installRecommendation === "manual_followup_required"
  ) {
    return {
      accepted: true,
      status: "ok",
      skillCandidateId: params.skillCandidateId,
      skillCandidateStatus: params.skillCandidateStatus,
      procurementRecordId: params.procurementRecordId,
      vettingResultRecordId: params.vettingResultId,
      sourceProcedureId: params.sourceProcedureId,
      sourceCandidateId: params.sourceCandidateId,
      latestValidationRunOutcome: "passed",
      latestVettingDecision: "approve_normal",
      eligible: true,
      possibleTargets: ["propose_approved_for_normal_use", "remain_internal_only"],
      rationale: [
        "bounded vetting result supports bounded normal-use approval planning",
        "installation remains a separate guarded action even when normal-use approval is proposed",
      ],
      requiredGates: [
        "approval-state mutation requires an explicit later write slice",
        "installation still requires a separate explicit action and policy confirmation",
      ],
      installGuardrails: baseInstallGuardrails,
      remainingBlockers: [],
    };
  }

  return remain(
    ["remain_blocked"],
    [
      "bounded vetting result does not support a bounded approval target yet",
      "approval planning remains blocked until the recorded recommendation matches a supported bounded target",
    ],
    [
      "record a compatible bounded approval recommendation before any approval-state mutation slice",
    ],
    ["manual vetting recommendation is not aligned to a supported bounded approval target"],
    { latestVettingDecision: decision },
  );
}

export function approvalScopeToPlanningTarget(
  scope: SkillCandidateApprovalScope,
): SkillCandidateApprovalPlanTarget {
  return scope === "limited"
    ? "propose_approved_for_limited_use"
    : "propose_approved_for_normal_use";
}

export function approvalScopeToSkillCandidateStatus(
  scope: SkillCandidateApprovalScope,
): "approved_limited" | "approved_normal" {
  return scope === "limited" ? "approved_limited" : "approved_normal";
}

export function deriveApprovedScope(params: {
  skillCandidateStatus: SkillCandidateStatus;
  approvalRecordPayload?: Record<string, unknown>;
}): SkillCandidateApprovalScope | undefined {
  const fromPayload =
    params.approvalRecordPayload?.approvedScope === "normal"
      ? "normal"
      : params.approvalRecordPayload?.approvedScope === "limited"
        ? "limited"
        : undefined;
  if (fromPayload) {
    return fromPayload;
  }
  if (params.skillCandidateStatus === "approved_normal") {
    return "normal";
  }
  if (params.skillCandidateStatus === "approved_limited") {
    return "limited";
  }
  return undefined;
}

export function buildSkillCandidateInstallHandoffPlan(params: {
  skillCandidateId: string;
  skillCandidateStatus: SkillCandidateStatus;
  sourceProcedureId?: string;
  sourceProcedureStatus?: ProcedureStatus;
  sourceCandidateId?: string;
  validationRunId?: string;
  latestValidationRunOutcome?: "passed" | "failed" | "partial" | "cancelled";
  procurementRecordId?: string;
  vettingResultRecordId?: string;
  approvalRecordId?: string;
  approvalRecordCreatedAt?: string;
  approvalRecordPayload?: Record<string, unknown>;
}): SkillCandidateInstallHandoffResult {
  const approvedScope = deriveApprovedScope({
    skillCandidateStatus: params.skillCandidateStatus,
    approvalRecordPayload: params.approvalRecordPayload,
  });
  const installGuardrails =
    params.approvalRecordPayload && isStringArray(params.approvalRecordPayload.installGuardrails)
      ? params.approvalRecordPayload.installGuardrails
      : [
          "do not install any skill from this handoff alone",
          "keep installation as a separate explicit manual action",
          "do not let the skill candidate replace the canonical memory substrate",
        ];

  const remain = (
    rationale: string[],
    requiredGates: string[],
    remainingBlockers: string[],
  ): SkillCandidateInstallHandoffResult => ({
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    ...(approvedScope ? { approvedScope } : {}),
    ...(params.approvalRecordId ? { approvalRecordId: params.approvalRecordId } : {}),
    ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
    ...(params.vettingResultRecordId
      ? { vettingResultRecordId: params.vettingResultRecordId }
      : {}),
    ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
    ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
    ...(params.latestValidationRunOutcome
      ? { latestValidationRunOutcome: params.latestValidationRunOutcome }
      : {}),
    eligible: false,
    possibleTargets: ["remain_approved_internal_only"],
    rationale,
    requiredGates,
    remainingBlockers,
    installGuardrails,
  });

  if (
    params.skillCandidateStatus !== "approved_limited" &&
    params.skillCandidateStatus !== "approved_normal"
  ) {
    return remain(
      [
        `skill candidate is in ${params.skillCandidateStatus} state`,
        "manual install handoff is reserved for bounded approved skill candidates only",
      ],
      ["record bounded internal approval before any later manual install handoff"],
      ["skill candidate is not in an approved state"],
    );
  }

  if (!params.sourceProcedureId || params.sourceProcedureStatus !== "validated") {
    return remain(
      [
        "skill candidate is missing validated procedure provenance",
        "manual install handoff requires a bounded approved skill candidate linked to a validated procedure",
      ],
      ["restore validated procedure provenance before any manual install handoff"],
      ["validated procedure provenance is incomplete"],
    );
  }

  if (
    !params.sourceCandidateId ||
    !params.validationRunId ||
    params.latestValidationRunOutcome !== "passed"
  ) {
    return remain(
      [
        "skill candidate is missing bounded lineage or passed validation evidence",
        "manual install handoff requires preserved candidate lineage and passed validation evidence",
      ],
      ["restore bounded lineage and validation evidence before any manual install handoff"],
      ["bounded lineage or validation evidence is incomplete"],
    );
  }

  if (!params.procurementRecordId || !params.vettingResultRecordId) {
    return remain(
      [
        "skill candidate is missing procurement or manual vetting records",
        "manual install handoff requires preserved procurement and vetting lineage",
      ],
      ["restore procurement and manual vetting records before any manual install handoff"],
      ["procurement or vetting lineage is incomplete"],
    );
  }

  if (
    !params.approvalRecordId ||
    !params.approvalRecordCreatedAt ||
    !params.approvalRecordPayload
  ) {
    return remain(
      [
        "skill candidate is missing a bounded approval record",
        "manual install handoff requires an internal approval artifact before any separate install step",
      ],
      ["record bounded internal approval before any manual install handoff"],
      ["approval record is missing"],
    );
  }

  if (!approvedScope) {
    return remain(
      [
        "approval scope is missing from the bounded approval record",
        "manual install handoff requires an explicit limited or normal approval scope",
      ],
      [
        "restore a bounded approval record with explicit approval scope before manual install handoff",
      ],
      ["approval scope is missing"],
    );
  }

  const remainingBlockers = isStringArray(params.approvalRecordPayload.remainingBlockers)
    ? params.approvalRecordPayload.remainingBlockers
    : [];
  if (remainingBlockers.length > 0) {
    return remain(
      [
        "bounded approval record still carries unresolved blockers",
        "manual install handoff remains internal-only until the recorded blockers are cleared",
      ],
      ["clear the remaining blockers before any separate manual install action"],
      remainingBlockers,
    );
  }

  const rationale =
    isStringArray(params.approvalRecordPayload.rationale) &&
    params.approvalRecordPayload.rationale.length > 0
      ? params.approvalRecordPayload.rationale
      : [
          "bounded internal approval is recorded",
          "a separate manual install step may now be prepared without automation",
        ];
  const manualSteps = [
    "treat this handoff as preparation only and keep installation as a separate explicit action",
    "verify the target artifact or package against the recorded approval scope and install guardrails",
    "preserve accelerator-only boundaries and do not replace the canonical memory substrate during install review",
  ];

  return {
    accepted: true,
    status: "ok",
    skillCandidateId: params.skillCandidateId,
    skillCandidateStatus: params.skillCandidateStatus,
    approvedScope,
    approvalRecordId: params.approvalRecordId,
    procurementRecordId: params.procurementRecordId,
    vettingResultRecordId: params.vettingResultRecordId,
    sourceProcedureId: params.sourceProcedureId,
    sourceCandidateId: params.sourceCandidateId,
    latestValidationRunOutcome: "passed",
    eligible: true,
    possibleTargets: ["propose_manual_install_handoff", "remain_approved_internal_only"],
    rationale: [
      ...rationale,
      "installation remains a separate explicit manual step even after bounded approval is recorded",
    ],
    requiredGates: [
      "manual installation remains a separate explicit action",
      "respect the recorded install guardrails during any later install review",
    ],
    remainingBlockers: [],
    installGuardrails,
    handoff: {
      approval: {
        approvalRecordId: params.approvalRecordId,
        eventName: "skill_candidate.approval",
        recordedAt: params.approvalRecordCreatedAt,
        approvedScope,
      },
      source: {
        skillCandidateId: params.skillCandidateId,
        ...(params.sourceProcedureId ? { sourceProcedureId: params.sourceProcedureId } : {}),
        ...(params.sourceCandidateId ? { sourceCandidateId: params.sourceCandidateId } : {}),
        ...(params.procurementRecordId ? { procurementRecordId: params.procurementRecordId } : {}),
        ...(params.vettingResultRecordId
          ? { vettingResultRecordId: params.vettingResultRecordId }
          : {}),
        ...(params.validationRunId ? { validationRunId: params.validationRunId } : {}),
      },
      rationale,
      remainingBlockers: [],
      installGuardrails,
      manualSteps,
    },
  };
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSkillCandidateProcurementHandoff(
  value: unknown,
): value is SkillCandidateSkillVetterHandoffPackage["handoff"] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value.source) &&
    isRecord(value.scope) &&
    isRecord(value.permissionsRisk) &&
    isRecord(value.suspiciousPatterns) &&
    isRecord(value.operationalFit) &&
    isRecord(value.approvalRecommendation)
  );
}

export function isSkillCandidateVettingDecision(
  value: unknown,
): value is SkillCandidateVettingResultInput["decision"] {
  return (
    value === "reject" ||
    value === "defer" ||
    value === "approve_limited" ||
    value === "approve_normal"
  );
}

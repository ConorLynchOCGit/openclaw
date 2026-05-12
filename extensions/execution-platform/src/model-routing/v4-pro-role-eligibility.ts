export type V4ProEligibilityRoleId =
  | "orchestrator"
  | "context_scout"
  | "architect_spec_writer"
  | "implementation_engineer"
  | "test_engineer"
  | "security_privacy_reviewer"
  | "result_reviewer"
  | "observability_scribe"
  | "docs_skills_writer"
  | "web_researcher"
  | "rebuild_bailout_engineer";

export type V4ProRoleStatus =
  | "preferred"
  | "eligible"
  | "fallback_only"
  | "shadow_only"
  | "needs_review"
  | "blocked";

export type V4ProRoleGateEvidence = {
  roleId: V4ProEligibilityRoleId;
  qualityPassed: boolean;
  costPassed: boolean;
  latencyPassed: boolean;
  reliabilityPassed: boolean;
  rollbackRef?: string | null;
  evidenceRefs: string[];
  workQueueProjectionRefs?: string[];
  preferred?: boolean;
  fallbackOnly?: boolean;
  shadowOnly?: boolean;
  blockedReasonCodes?: string[];
};

export type V4ProRoleEligibilityDecision = {
  artifactKind: "v4_pro_role_eligibility_decision";
  roleId: V4ProEligibilityRoleId;
  candidateModelId: "deepseek/deepseek-v4-pro";
  baselineModelId: "deepseek/deepseek-v4-flash";
  status: V4ProRoleStatus;
  promoted: boolean;
  fallbackAllowed: boolean;
  reasonCodes: string[];
  evidenceRefs: string[];
  rollbackRef: string | null;
  workQueueProjectionRefs: string[];
  noGlobalWinner: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export type V4ProAllRoleEligibilityProof = {
  artifactKind: "v4_pro_all_role_eligibility_proof";
  candidateModelId: "deepseek/deepseek-v4-pro";
  baselineModelId: "deepseek/deepseek-v4-flash";
  decisions: V4ProRoleEligibilityDecision[];
  everyRoleExplicit: boolean;
  promotedRoles: V4ProEligibilityRoleId[];
  fallbackOnlyRoles: V4ProEligibilityRoleId[];
  needsReviewRoles: V4ProEligibilityRoleId[];
  blockedRoles: V4ProEligibilityRoleId[];
  noGlobalWinner: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export const V4_PRO_ELIGIBILITY_ROLE_IDS: V4ProEligibilityRoleId[] = [
  "orchestrator",
  "context_scout",
  "architect_spec_writer",
  "implementation_engineer",
  "test_engineer",
  "security_privacy_reviewer",
  "result_reviewer",
  "observability_scribe",
  "docs_skills_writer",
  "web_researcher",
  "rebuild_bailout_engineer",
];

function evidenceForRole(
  evidence: readonly V4ProRoleGateEvidence[],
  roleId: V4ProEligibilityRoleId,
): V4ProRoleGateEvidence | null {
  return evidence.find((entry) => entry.roleId === roleId) ?? null;
}

function decideRole(input: {
  roleId: V4ProEligibilityRoleId;
  evidence: V4ProRoleGateEvidence | null;
}): V4ProRoleEligibilityDecision {
  const reasonCodes: string[] = [];
  const evidence = input.evidence;

  if (!evidence) {
    reasonCodes.push("role_eval_evidence_missing");
  } else {
    if (!evidence.qualityPassed) {
      reasonCodes.push("quality_gate_failed");
    }
    if (!evidence.costPassed) {
      reasonCodes.push("cost_gate_failed");
    }
    if (!evidence.latencyPassed) {
      reasonCodes.push("latency_gate_failed");
    }
    if (!evidence.reliabilityPassed) {
      reasonCodes.push("reliability_gate_failed");
    }
    if (!evidence.rollbackRef) {
      reasonCodes.push("rollback_ref_required");
    }
    if (evidence.evidenceRefs.length === 0) {
      reasonCodes.push("role_eval_evidence_missing");
    }
    reasonCodes.push(...(evidence.blockedReasonCodes ?? []));
  }

  const gatesPassed = reasonCodes.length === 0;
  const status: V4ProRoleStatus = !evidence
    ? "needs_review"
    : evidence.blockedReasonCodes && evidence.blockedReasonCodes.length > 0
      ? "blocked"
      : gatesPassed && evidence.preferred
        ? "preferred"
        : gatesPassed && evidence.fallbackOnly
          ? "fallback_only"
          : gatesPassed && evidence.shadowOnly
            ? "shadow_only"
            : gatesPassed
              ? "eligible"
              : "needs_review";

  return {
    artifactKind: "v4_pro_role_eligibility_decision",
    roleId: input.roleId,
    candidateModelId: "deepseek/deepseek-v4-pro",
    baselineModelId: "deepseek/deepseek-v4-flash",
    status,
    promoted: status === "preferred",
    fallbackAllowed: status === "preferred" || status === "eligible" || status === "fallback_only",
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    evidenceRefs: evidence?.evidenceRefs ?? [],
    rollbackRef: evidence?.rollbackRef ?? null,
    workQueueProjectionRefs: evidence?.workQueueProjectionRefs ?? [
      `work-queue://model-routing/v4-pro/${input.roleId}`,
    ],
    noGlobalWinner: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function buildV4ProAllRoleEligibilityProof(
  evidence: readonly V4ProRoleGateEvidence[],
): V4ProAllRoleEligibilityProof {
  const decisions = V4_PRO_ELIGIBILITY_ROLE_IDS.map((roleId) =>
    decideRole({ roleId, evidence: evidenceForRole(evidence, roleId) }),
  );
  return {
    artifactKind: "v4_pro_all_role_eligibility_proof",
    candidateModelId: "deepseek/deepseek-v4-pro",
    baselineModelId: "deepseek/deepseek-v4-flash",
    decisions,
    everyRoleExplicit: decisions.length === V4_PRO_ELIGIBILITY_ROLE_IDS.length,
    promotedRoles: decisions
      .filter((decision) => decision.promoted)
      .map((decision) => decision.roleId),
    fallbackOnlyRoles: decisions
      .filter((decision) => decision.status === "fallback_only")
      .map((decision) => decision.roleId),
    needsReviewRoles: decisions
      .filter((decision) => decision.status === "needs_review")
      .map((decision) => decision.roleId),
    blockedRoles: decisions
      .filter((decision) => decision.status === "blocked")
      .map((decision) => decision.roleId),
    noGlobalWinner: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

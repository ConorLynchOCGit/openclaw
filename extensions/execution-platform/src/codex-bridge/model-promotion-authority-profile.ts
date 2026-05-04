import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type ModelPromotionAuthorityProfile = {
  artifactKind: "codex_bridge_model_promotion_authority_profile";
  profileId: string;
  dryRunOnly: boolean;
  evalEvidenceRequired: true;
  canaryCriteriaRequired: true;
  ownerApprovalRequired: true;
  rollbackPlanRequired: true;
  auditArtifactRequired: true;
  silentPromotionAllowed: false;
  productionPromotionAllowed: false;
};

export type ModelPromotionDecisionArtifact = {
  artifactKind: "codex_bridge_model_promotion_decision";
  profileId: string;
  candidateModelId: string;
  baselineModelId: string;
  evalEvidenceRefs: string[];
  canaryCriteria: string[];
  ownerApproval: string | null;
  rollbackPlan: string | null;
  status: "dry_run_review_recorded" | "refused";
  blockingReasons: string[];
  productionPromotionPerformed: false;
  silentPromotionPerformed: false;
};

export function createModelPromotionAuthorityProfile(
  input: Partial<Pick<ModelPromotionAuthorityProfile, "profileId" | "dryRunOnly">> = {},
): ModelPromotionAuthorityProfile {
  return {
    artifactKind: "codex_bridge_model_promotion_authority_profile",
    profileId: input.profileId ?? "model-promotion-authority-v1",
    dryRunOnly: input.dryRunOnly ?? true,
    evalEvidenceRequired: true,
    canaryCriteriaRequired: true,
    ownerApprovalRequired: true,
    rollbackPlanRequired: true,
    auditArtifactRequired: true,
    silentPromotionAllowed: false,
    productionPromotionAllowed: false,
  };
}

export function validateModelPromotionAuthorityProfile(profile: ModelPromotionAuthorityProfile): {
  valid: boolean;
  blockingReasons: string[];
} {
  const reasons: string[] = [];
  if (
    !profile.evalEvidenceRequired ||
    !profile.canaryCriteriaRequired ||
    !profile.ownerApprovalRequired ||
    !profile.rollbackPlanRequired ||
    !profile.auditArtifactRequired
  ) {
    reasons.push("eval_canary_owner_rollback_and_audit_required");
  }
  if (profile.silentPromotionAllowed) {
    reasons.push("silent_promotion_not_allowed");
  }
  if (profile.productionPromotionAllowed) {
    reasons.push("production_promotion_not_allowed_in_this_profile");
  }
  return { valid: reasons.length === 0, blockingReasons: [...new Set(reasons)] };
}

export async function recordModelPromotionDryRunDecision(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId?: string;
  profile: ModelPromotionAuthorityProfile;
  candidateModelId: string;
  baselineModelId: string;
  evalEvidenceRefs: string[];
  canaryCriteria: string[];
  ownerApproval?: string | null;
  rollbackPlan?: string | null;
}): Promise<ModelPromotionDecisionArtifact> {
  const validation = validateModelPromotionAuthorityProfile(input.profile);
  const reasons = [
    ...validation.blockingReasons,
    ...(input.evalEvidenceRefs.length > 0 ? [] : ["eval_evidence_required"]),
    ...(input.canaryCriteria.length > 0 ? [] : ["canary_criteria_required"]),
    ...(input.ownerApproval ? [] : ["owner_approval_required"]),
    ...(input.rollbackPlan ? [] : ["rollback_plan_required"]),
  ];
  const artifact: ModelPromotionDecisionArtifact = {
    artifactKind: "codex_bridge_model_promotion_decision",
    profileId: input.profile.profileId,
    candidateModelId: input.candidateModelId,
    baselineModelId: input.baselineModelId,
    evalEvidenceRefs: input.evalEvidenceRefs,
    canaryCriteria: input.canaryCriteria,
    ownerApproval: input.ownerApproval ?? null,
    rollbackPlan: input.rollbackPlan ?? null,
    status: reasons.length === 0 ? "dry_run_review_recorded" : "refused",
    blockingReasons: reasons,
    productionPromotionPerformed: false,
    silentPromotionPerformed: false,
  };
  if (input.runtimeJobs && input.runtimeJobId) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "codex_bridge.model_promotion_decision",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/model-promotion/${input.profile.profileId}`,
      contentType: "application/json",
      metadata: artifact as unknown as JsonValue,
    });
  }
  return artifact;
}

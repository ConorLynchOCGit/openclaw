import type { RouterShadowEvalRun } from "./router-shadow-eval.ts";

export const ROUTER_PROMOTION_POLICY_VERSION = "intent-front-door.router-promotion-policy.v1";

export type RouterPromotionDecision = {
  artifactKind: "intent_front_door_router_promotion_decision";
  policyVersion: typeof ROUTER_PROMOTION_POLICY_VERSION;
  candidateStatus: "promoted" | "eligible_shadow" | "blocked" | "needs_review";
  promotionAllowed: boolean;
  reasonCodes: string[];
  approvalRef: string | null;
  rollbackRouterConfigRef: string | null;
  modelPromotionPerformed: false;
  providerCallMade: false;
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export function decideRouterPromotion(input: {
  shadowEval: RouterShadowEvalRun;
  approvalRef?: string | null;
  rollbackRouterConfigRef?: string | null;
  maxSchemaFailures?: number;
  allowPromotion?: boolean;
}): RouterPromotionDecision {
  const reasonCodes: string[] = [];
  if (input.shadowEval.status !== "passed") {
    reasonCodes.push(`shadow_eval_${input.shadowEval.status}`);
  }
  if (input.shadowEval.highRiskFalseAllows > 0) {
    reasonCodes.push("high_risk_false_allow_blocks_promotion");
  }
  if (input.shadowEval.falseAllows > 0) {
    reasonCodes.push("false_allow_blocks_promotion");
  }
  if (input.shadowEval.schemaFailureCount > (input.maxSchemaFailures ?? 0)) {
    reasonCodes.push("schema_failures_above_threshold");
  }
  if (!input.rollbackRouterConfigRef) {
    reasonCodes.push("rollback_router_config_ref_required");
  }
  if (!input.approvalRef) {
    reasonCodes.push("approval_ref_required");
  }
  if (
    input.shadowEval.rawPromptStored ||
    input.shadowEval.rawResponseStored ||
    input.shadowEval.rawProviderLogStored
  ) {
    reasonCodes.push("raw_storage_blocks_promotion");
  }
  const gatesPass = reasonCodes.length === 0;
  const promotionAllowed = gatesPass && input.allowPromotion === true;
  return {
    artifactKind: "intent_front_door_router_promotion_decision",
    policyVersion: ROUTER_PROMOTION_POLICY_VERSION,
    candidateStatus: promotionAllowed ? "promoted" : gatesPass ? "eligible_shadow" : "blocked",
    promotionAllowed,
    reasonCodes: promotionAllowed
      ? ["router_promotion_gates_passed"]
      : gatesPass
        ? ["router_candidate_shadow_eligible_no_promotion_requested"]
        : [...new Set(reasonCodes)],
    approvalRef: input.approvalRef ?? null,
    rollbackRouterConfigRef: input.rollbackRouterConfigRef ?? null,
    modelPromotionPerformed: false,
    providerCallMade: false,
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

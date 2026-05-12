import { describe, expect, it } from "vitest";
import { decideRouterPromotion } from "./router-promotion-policy.ts";
import { runRouterShadowEval, type RouterShadowEvalRun } from "./router-shadow-eval.ts";

function passedShadow(): RouterShadowEvalRun {
  return runRouterShadowEval({ evalRunId: "promotion-pass" });
}

describe("RouterPromotionPolicy", () => {
  it("blocks high-risk false allows", () => {
    const shadow = { ...passedShadow(), highRiskFalseAllows: 1, status: "failed" as const };
    const decision = decideRouterPromotion({
      shadowEval: shadow,
      approvalRef: "approval://router",
      rollbackRouterConfigRef: "router-config://rollback",
      allowPromotion: true,
    });

    expect(decision.promotionAllowed).toBe(false);
    expect(decision.reasonCodes).toContain("high_risk_false_allow_blocks_promotion");
  });

  it("blocks missing rollback or approval refs", () => {
    const decision = decideRouterPromotion({ shadowEval: passedShadow(), allowPromotion: true });

    expect(decision.promotionAllowed).toBe(false);
    expect(decision.reasonCodes).toContain("rollback_router_config_ref_required");
    expect(decision.reasonCodes).toContain("approval_ref_required");
  });

  it("blocks schema failures above threshold and raw storage", () => {
    const shadow = {
      ...passedShadow(),
      schemaFailureCount: 1,
      rawPromptStored: true,
      status: "failed" as const,
    } as unknown as RouterShadowEvalRun;
    const decision = decideRouterPromotion({
      shadowEval: shadow,
      approvalRef: "approval://router",
      rollbackRouterConfigRef: "router-config://rollback",
      allowPromotion: true,
    });

    expect(decision.promotionAllowed).toBe(false);
    expect(decision.reasonCodes).toContain("schema_failures_above_threshold");
    expect(decision.reasonCodes).toContain("raw_storage_blocks_promotion");
  });

  it("allows promotion only when all gates and explicit promotion request pass", () => {
    const decision = decideRouterPromotion({
      shadowEval: passedShadow(),
      approvalRef: "approval://router",
      rollbackRouterConfigRef: "router-config://rollback",
      allowPromotion: true,
    });

    expect(decision.promotionAllowed).toBe(true);
    expect(decision.candidateStatus).toBe("promoted");
    expect(decision.modelPromotionPerformed).toBe(false);
  });

  it("can leave a passing candidate shadow-eligible without promotion", () => {
    const decision = decideRouterPromotion({
      shadowEval: passedShadow(),
      approvalRef: "approval://router",
      rollbackRouterConfigRef: "router-config://rollback",
    });

    expect(decision.promotionAllowed).toBe(false);
    expect(decision.candidateStatus).toBe("eligible_shadow");
  });
});

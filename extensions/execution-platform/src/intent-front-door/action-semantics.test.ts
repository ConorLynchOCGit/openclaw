import { describe, expect, it } from "vitest";
import { enforceActionSemantics } from "./action-semantics.ts";
import { createCanonicalRouterAction } from "./router-schema.ts";

describe("Action semantics enforcement", () => {
  it("keeps do-not-send negation from compiling outbound send work", () => {
    const decision = enforceActionSemantics({
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
    });

    expect(decision).toMatchObject({
      outcome: "actions_allowed",
      allowedRequestedActions: [],
      allowedConditionalActions: [],
      runtimeJobCreated: false,
      authorityGranted: false,
    });
    expect(decision.reasonCodes).toContain("negated_action_not_compilable:outbound_send");
  });

  it("ignores mentioned outbound sends and does not compile send work", () => {
    const decision = enforceActionSemantics({
      mentionedActions: [
        createCanonicalRouterAction("outbound_send", "show outbound send state", 0.9),
      ],
    });

    expect(decision.ignoredMentionedActions).toHaveLength(1);
    expect(decision.allowedRequestedActions).toHaveLength(0);
    expect(decision.reasonCodes).toContain("mentioned_action_display_only:outbound_send");
  });

  it("does not compile deploy-if-policy-permits unless policy proof is satisfied", () => {
    const deploy = createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9);
    expect(
      enforceActionSemantics({
        conditionalActions: [deploy],
      }),
    ).toMatchObject({
      allowedConditionalActions: [],
      outcome: "actions_allowed",
    });
    expect(
      enforceActionSemantics({
        conditionalActions: [deploy],
        conditionalPolicyByAction: { deploy: "satisfied" },
        approvedHighRiskActionCategories: ["deploy"],
      }),
    ).toMatchObject({
      allowedConditionalActions: [deploy],
      outcome: "actions_allowed",
    });
  });

  it("allows requested code edit under allowed workflow policy", () => {
    const codeEdit = createCanonicalRouterAction("code_edit", "bounded code edit", 0.95);
    expect(
      enforceActionSemantics({
        requestedActions: [codeEdit],
        allowedRequestedActionCategories: ["code_edit", "test", "review", "closeout"],
      }),
    ).toMatchObject({
      allowedRequestedActions: [codeEdit],
      outcome: "actions_allowed",
    });
  });

  it("requires authority or approval for requested outbound send", () => {
    const outbound = createCanonicalRouterAction("outbound_send", "send a notice", 0.9);
    expect(
      enforceActionSemantics({
        requestedActions: [outbound],
      }),
    ).toMatchObject({
      blockedActions: [outbound],
      outcome: "approval_required",
    });
    expect(
      enforceActionSemantics({
        requestedActions: [outbound],
        allowedRequestedActionCategories: ["outbound_send"],
        approvedHighRiskActionCategories: ["outbound_send"],
      }),
    ).toMatchObject({
      allowedRequestedActions: [outbound],
      outcome: "actions_allowed",
    });
  });

  it("blocks or clarifies actions present in both requested and negated fields", () => {
    const outbound = createCanonicalRouterAction("outbound_send", "send a notice", 0.9);
    expect(
      enforceActionSemantics({
        requestedActions: [outbound],
        negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
      }),
    ).toMatchObject({
      blockedActions: [outbound],
      outcome: "blocked",
    });
  });

  it("allows non-high-risk requested actions when the model classifies the negation as constraint-scoped", () => {
    const requestedPlan = createCanonicalRouterAction(
      "plan",
      "plan implementation work through the coding executor",
      0.95,
    );
    const negatedPlan = createCanonicalRouterAction(
      "plan",
      "do not route into the target planning workflow as executor",
      0.99,
    );
    const decision = enforceActionSemantics({
      requestedActions: [requestedPlan],
      negatedActions: [negatedPlan],
      routerReasonCodes: ["invalid_negated_action_repaired_to_constraint_scoped_plan_action"],
    });

    expect(decision).toMatchObject({
      outcome: "actions_allowed",
      allowedRequestedActions: [requestedPlan],
      blockedActions: [],
    });
    expect(decision.reasonCodes).toContain("requested_action_negation_constraint_scoped:plan");
    expect(decision.reasonCodes).toContain("negated_action_constraint_scoped:plan");
    expect(decision.reasonCodes).not.toContain("requested_action_conflicts_with_negation:plan");
  });

  it("does not let scoped-negation reason codes bypass high-risk side-effect boundaries", () => {
    const deploy = createCanonicalRouterAction("deploy", "deploy production", 0.9);
    const decision = enforceActionSemantics({
      requestedActions: [deploy],
      negatedActions: [createCanonicalRouterAction("deploy", "do not deploy", 1)],
      routerReasonCodes: ["invalid_negated_action_repaired_to_constraint_scoped_deploy_action"],
      allowedRequestedActionCategories: ["deploy"],
      approvedHighRiskActionCategories: ["deploy"],
    });

    expect(decision).toMatchObject({
      blockedActions: [deploy],
      outcome: "blocked",
    });
    expect(decision.reasonCodes).toContain("requested_action_conflicts_with_negation:deploy");
  });

  it("preserves conflicted side-effect boundaries when safe primary work remains", () => {
    const codeEdit = createCanonicalRouterAction("code_edit", "bounded implementation", 0.95);
    const deploy = createCanonicalRouterAction("deploy", "production release", 0.9);
    const decision = enforceActionSemantics({
      requestedActions: [codeEdit, deploy],
      negatedActions: [createCanonicalRouterAction("deploy", "deployment boundary", 0.99)],
      allowedRequestedActionCategories: ["code_edit", "test", "review", "closeout"],
    });

    expect(decision).toMatchObject({
      outcome: "actions_allowed",
      allowedRequestedActions: [codeEdit],
      blockedActions: [deploy],
    });
    expect(decision.reasonCodes).not.toContain(
      "side_effect_boundary_conflict_suppressed_by_primary_work",
    );
    expect(decision.reasonCodes).toContain("requested_action_conflicts_with_negation:deploy");
  });

  it("does not compile unmet or approval-required conditional actions", () => {
    const modelPromotion = createCanonicalRouterAction(
      "model_promotion",
      "promote if gates pass",
      0.9,
    );
    expect(
      enforceActionSemantics({
        conditionalActions: [modelPromotion],
        conditionalPolicyByAction: { model_promotion: "unmet" },
      }),
    ).toMatchObject({
      allowedConditionalActions: [],
      outcome: "actions_allowed",
    });
    expect(
      enforceActionSemantics({
        conditionalActions: [modelPromotion],
        conditionalPolicyByAction: { model_promotion: "approval_required" },
      }),
    ).toMatchObject({
      blockedActions: [modelPromotion],
      outcome: "approval_required",
    });
  });

  it("blocks negated install/dependency action even when dependency is mentioned elsewhere", () => {
    const install = createCanonicalRouterAction("install_dependency", "install dependency", 0.8);
    expect(
      enforceActionSemantics({
        mentionedActions: [install],
        requestedActions: [install],
        negatedActions: [createCanonicalRouterAction("install_dependency", "do not install", 0.99)],
      }),
    ).toMatchObject({
      blockedActions: [install],
      outcome: "blocked",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });
});

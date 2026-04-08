import { describe, expect, it } from "vitest";
import {
  isExecutableMemoryObjectCorrectionPlan,
  resolveMemoryCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
} from "./memory-correction-engine.js";

describe("resolveMemoryCorrectionPlan", () => {
  it("maps auto-promotion profiles onto a closed correction policy", () => {
    expect(resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1")).toBe(
      "allow_immediate_bounded_correction",
    );
    expect(resolveMemoryCorrectionPromotionPolicy("disabled")).toBe(
      "defer_immediate_bounded_correction",
    );
  });

  it("executes immediate bounded correction for response style when an approved subject target exists", () => {
    const plan = resolveMemoryCorrectionPlan({
      familyId: "response_style",
      trigger: "explicit_correction",
      promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
      activeApprovedSubjectObjectIds: ["memory-approved-1"],
    });
    expect(plan).toEqual({
      status: "execute",
      reason: "bounded correction should immediately supersede an approved subject target",
      executionKind: "approved_memory_object_supersede",
      supersedeTargetIds: ["memory-approved-1"],
    });
    expect(isExecutableMemoryObjectCorrectionPlan(plan)).toBe(true);
  });

  it("holds unmet-need corrections even when a target exists", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "unmet_need",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeApprovedSubjectObjectIds: ["memory-approved-need-1"],
      }),
    ).toEqual({
      status: "hold",
      reason: "family correction policy remains held until a later slice activates it",
      executionKind: "hold",
      supersedeTargetIds: [],
    });
  });

  it("executes recurring-procedure correction through the validated-procedure supersede path", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeValidatedSubjectProcedureIds: ["procedure-1"],
      }),
    ).toEqual({
      status: "execute",
      reason:
        "bounded correction should immediately validate and supersede the active procedure subject",
      executionKind: "validated_procedure_supersede",
      supersedeTargetIds: ["procedure-1"],
    });
  });

  it("allows recurring-procedure correction planning even when no validated target is present yet", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeValidatedSubjectProcedureIds: [],
      }),
    ).toEqual({
      status: "execute",
      reason:
        "bounded correction should immediately validate and supersede the active procedure subject",
      executionKind: "validated_procedure_supersede",
      supersedeTargetIds: [],
    });
  });

  it("executes cluster auto-review supersede for generalized workflow-family conflicts", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "project_rule",
        trigger: "cluster_auto_review",
        conflictingApprovedObjectIds: ["memory-rule-1", "memory-rule-2"],
      }),
    ).toEqual({
      status: "execute",
      reason: "cluster auto-review supersedes older conflicting approved subject targets",
      executionKind: "approved_memory_object_supersede",
      supersedeTargetIds: ["memory-rule-1", "memory-rule-2"],
    });
  });
});

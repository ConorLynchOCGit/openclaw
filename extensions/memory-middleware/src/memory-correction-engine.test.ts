import { describe, expect, it } from "vitest";
import { resolveMemoryCorrectionPlan } from "./memory-correction-engine.js";

describe("resolveMemoryCorrectionPlan", () => {
  it("executes immediate bounded correction for response style when an approved subject target exists", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "response_style",
        trigger: "explicit_correction",
        autoPromotionProfile: "explicit-user-preference-v1",
        activeApprovedSubjectObjectIds: ["memory-approved-1"],
      }),
    ).toEqual({
      status: "execute",
      reason: "bounded correction should immediately supersede an approved subject target",
      supersedeTargetIds: ["memory-approved-1"],
    });
  });

  it("holds unmet-need corrections even when a target exists", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "unmet_need",
        trigger: "explicit_correction",
        autoPromotionProfile: "explicit-user-preference-v1",
        activeApprovedSubjectObjectIds: ["memory-approved-need-1"],
      }),
    ).toEqual({
      status: "hold",
      reason: "family correction policy remains held until a later slice activates it",
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
      supersedeTargetIds: ["memory-rule-1", "memory-rule-2"],
    });
  });
});

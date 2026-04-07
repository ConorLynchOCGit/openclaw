import { describe, expect, it } from "vitest";
import { detectUnmetNeedSemanticDecision } from "./unmet-need-semantic.js";

describe("detectUnmetNeedSemanticDecision", () => {
  it("captures a bounded explicit unmet need from need phrasing", () => {
    expect(
      detectUnmetNeedSemanticDecision(
        "For project Atlas, we need a release evidence template for rollout audits.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_unmet_need",
        captureClass: "unmet_need_recommendation",
        needCategory: "missing_workflow_support",
        projectScope: "Atlas",
        subject: "rollout audits",
        neededCapability: "a release evidence template",
      },
    });
  });

  it("captures a bounded explicit unmet need from missing phrasing", () => {
    expect(
      detectUnmetNeedSemanticDecision(
        "For project Atlas, we're missing a release evidence template for rollout audits because audits still arrive ad hoc.",
      ),
    ).toMatchObject({
      action: "capture",
      confidence: "high",
      match: {
        lessonFamily: "generalized_unmet_need",
        projectScope: "Atlas",
        subject: "rollout audits",
        neededCapability: "a release evidence template",
        rationale: "audits still arrive ad hoc",
      },
    });
  });

  it("ignores blocked procurement-style unmet-need phrasing", () => {
    expect(
      detectUnmetNeedSemanticDecision(
        "For project Atlas, we need to buy a release evidence template for rollout audits.",
      ),
    ).toMatchObject({
      action: "ignore",
    });
  });
});

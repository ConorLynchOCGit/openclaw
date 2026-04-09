import { describe, expect, it } from "vitest";
import {
  resolveCanonicalWorkflowAutoReviewProfile,
  resolveWorkflowSemanticDetectionSource,
} from "./workflow-canonical-policy.js";

describe("workflow canonical policy", () => {
  it("resolves workflow auto-review profiles from canonical capture classes", () => {
    expect(
      resolveCanonicalWorkflowAutoReviewProfile({
        captureClass: "workflow_generalized_guidance",
        template: "workflow_generalized_guidance",
      }),
    ).toMatchObject({
      captureCategory: "workflow_improvement",
      compatibilityCategory: "workflow_improvement",
      lessonFamily: "generalized_workflow_lesson",
      autoReviewProfile: "workflow_generalized_auto_review_v1",
    });

    expect(
      resolveCanonicalWorkflowAutoReviewProfile({
        captureClass: "project_rule_guidance",
        template: "project_rule_guidance",
      }),
    ).toMatchObject({
      captureCategory: "project_rule",
      compatibilityCategory: "project_rule",
      lessonFamily: "generalized_project_rule",
      autoReviewProfile: "project_rule_auto_review_v1",
    });
  });

  it("uses the canonical capture category when selecting semantic detection sources", () => {
    expect(
      resolveWorkflowSemanticDetectionSource({
        detectionSource: "semantic",
        captureClass: "unmet_need_recommendation",
      }),
    ).toBe("unmet_need_semantic_v1");

    expect(
      resolveWorkflowSemanticDetectionSource({
        detectionSource: "deterministic",
        captureClass: "workflow_generalized_guidance",
      }),
    ).toBe("workflow_phrase_induction_v1");
  });
});

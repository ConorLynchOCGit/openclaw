import { describe, expect, it } from "vitest";
import { buildApprovedMemoryRetrievalFeatureSql } from "./retrieval-feature-framework.js";

describe("retrieval-feature-framework", () => {
  it("builds shared approved-memory retrieval clauses for direct-answer and guidance families", () => {
    const sql = buildApprovedMemoryRetrievalFeatureSql({
      expressions: {
        autoCaptureTemplateExpression: "template_expr",
        autoCaptureFactFamilyExpression: "fact_family_expr",
        autoCaptureLessonFamilyExpression: "lesson_family_expr",
        autoCaptureGuidancePatternExpression: "guidance_pattern_expr",
        autoCaptureNormalizedSubjectExpression: "subject_expr",
        autoCaptureNormalizedProjectFactLabelExpression: "fact_label_expr",
        autoCaptureNormalizedProjectScopeExpression: "scope_expr",
        autoCaptureNormalizedRecommendedActionExpression: "recommended_expr",
        autoCaptureNormalizedAvoidActionExpression: "avoid_expr",
        autoCaptureNormalizedNeededCapabilityExpression: "capability_expr",
        autoCaptureNormalizedValueExpression: "value_expr",
      },
      paramRefs: {
        normalizedQueryRef: "$6::text",
        projectMemoryIntentFamilyRef: "$7::text",
        generalizedWorkflowPatternHintRef: "$8::text",
      },
    });

    expect(sql.scoreClauses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("response_style_generalized_guidance"),
        expect.stringContaining("fact_family_expr in ('supported_field', 'generalized_reference')"),
        expect.stringContaining("lesson_family_expr = 'generalized_project_rule'"),
        expect.stringContaining("lesson_family_expr = 'generalized_unmet_need'"),
      ]),
    );
    expect(sql.matchedFieldClauses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("'response_style_value_match'"),
        expect.stringContaining("'project_fact_intent_match'"),
        expect.stringContaining("'generalized_subject_match'"),
        expect.stringContaining("'project_rule_guidance_pattern_match'"),
        expect.stringContaining("'unmet_need_capability_match'"),
      ]),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildApprovedMemoryRetrievalFeatureSql,
  buildReviewableCandidateRetrievalFeatureSql,
  buildValidatedProcedureRetrievalFeatureSql,
} from "./retrieval-feature-framework.js";

describe("retrieval-feature-framework", () => {
  it("builds shared approved-memory retrieval clauses for direct-answer and guidance families", () => {
    const sql = buildApprovedMemoryRetrievalFeatureSql({
      expressions: {
        compatibilityFamilyIdExpression: "family_expr",
        autoCaptureTemplateExpression: "template_expr",
        autoCaptureFactFamilyExpression: "fact_family_expr",
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
        responseStyleNormalizedSubjectHintRef: "$4::text",
        normalizedQueryRef: "$7::text",
        projectMemoryIntentFamilyRef: "$8::text",
        generalizedWorkflowPatternHintRef: "$9::text",
      },
    });

    expect(sql.scoreClauses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("family_expr = 'response_style'"),
        expect.stringContaining("subject_expr = $4::text"),
        expect.stringContaining("family_expr = 'project_fact'"),
        expect.stringContaining("family_expr = 'project_rule'"),
        expect.stringContaining("family_expr = 'unmet_need'"),
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

  it("reuses the same shared retrieval feature composer for reviewable candidates", () => {
    const approvedSql = buildApprovedMemoryRetrievalFeatureSql({
      expressions: {
        compatibilityFamilyIdExpression: "family_expr",
        autoCaptureTemplateExpression: "template_expr",
        autoCaptureFactFamilyExpression: "fact_family_expr",
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
        responseStyleNormalizedSubjectHintRef: "$4::text",
        normalizedQueryRef: "$7::text",
        projectMemoryIntentFamilyRef: "$8::text",
        generalizedWorkflowPatternHintRef: "$9::text",
      },
    });
    const candidateSql = buildReviewableCandidateRetrievalFeatureSql({
      expressions: {
        compatibilityFamilyIdExpression: "family_expr",
        autoCaptureTemplateExpression: "template_expr",
        autoCaptureFactFamilyExpression: "fact_family_expr",
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
        responseStyleNormalizedSubjectHintRef: "$4::text",
        normalizedQueryRef: "$7::text",
        projectMemoryIntentFamilyRef: "$8::text",
        generalizedWorkflowPatternHintRef: "$9::text",
      },
    });

    expect(candidateSql).toEqual(approvedSql);
  });

  it("builds validated-procedure subject clauses from the shared retrieval framework", () => {
    const sql = buildValidatedProcedureRetrievalFeatureSql({
      expressions: {
        procedureSubjectExpression: "procedure_subject_expr",
      },
      paramRefs: {
        normalizedSubjectRef: "$4::text",
      },
    });

    expect(sql.scoreClauses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("procedure_subject_expr = $4::text"),
        expect.stringContaining("procedure_subject_expr like ($4::text || '%')"),
      ]),
    );
    expect(sql.matchedFieldClauses).toEqual([
      "case when $4::text <> '' and procedure_subject_expr = $4::text then 'procedure_subject_match' end",
      "case when $4::text <> '' and procedure_subject_expr like ($4::text || '%') then 'procedure_subject_prefix' end",
    ]);
  });
});
